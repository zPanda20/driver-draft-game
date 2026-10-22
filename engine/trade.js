// Off-season trading. Pure rules: who owns what, what a swap does, and how autopilot teams value an offer.
//
// Asset ids:  d:<ref> driver · p:<ref> principal · rp:<i> parts re-draft pick (turn i) · fa:<i> free-agency pick (slot i)
// ctx = { g: game, turns: g.rd.turns, fa: [{ orig, team }] }   (turns[i].team and fa[i].team are the current owners)
import { principalsOf, setPrincipals } from "./draft.js";
import { ARCHETYPES } from "./bots.js";
import { gauss } from "./rng.js";

export const MAX_SIDE = 6;

export function kindOf(id) {
  if (typeof id !== "string") return null;
  if (id.startsWith("rp:")) return "pick";
  if (id.startsWith("fa:")) return "fa";
  if (id.startsWith("d:")) return "driver";
  if (id.startsWith("p:")) return "principal";
  return null;
}
const num = (id) => +id.slice(id.indexOf(":") + 1);

export function ownerOf(ctx, id) {
  const { g } = ctx, k = kindOf(id), n = num(id);
  if (!Number.isInteger(n) || n < 0) return null;
  if (k === "driver") { const t = g.teams.find((x) => x.drivers.includes(n)); return t ? t.id : null; }
  if (k === "principal") { const t = g.teams.find((x) => principalsOf(x).includes(n)); return t ? t.id : null; }
  if (k === "pick") return ctx.turns[n] ? ctx.turns[n].team : null;
  if (k === "fa") return ctx.fa[n] ? ctx.fa[n].team : null;
  return null;
}

function transfer(ctx, id, toId) {
  const { g } = ctx, k = kindOf(id), n = num(id), from = g.teams[ownerOf(ctx, id)], to = g.teams[toId];
  if (k === "driver") { from.drivers = from.drivers.filter((x) => x !== n); to.drivers.push(n); g.items.drivers[n].owner = toId; }
  else if (k === "principal") { setPrincipals(from, principalsOf(from).filter((x) => x !== n)); setPrincipals(to, [...principalsOf(to), n]); g.items.principals[n].owner = toId; }
  else if (k === "pick") ctx.turns[n].team = toId;
  else if (k === "fa") ctx.fa[n].team = toId;
}

// stage 1 = before the parts re-draft (everything tradeable); stage 2 = after free agency (drivers and principals only)
export function validateOffer(ctx, stage, fromId, toId, give, get) {
  if (fromId === toId) return "Pick another team.";
  if (!Array.isArray(give) || !Array.isArray(get) || !give.length || !get.length) return "Both sides need at least one asset.";
  if (give.length > MAX_SIDE || get.length > MAX_SIDE) return `At most ${MAX_SIDE} assets a side.`;
  const seen = new Set();
  for (const [list, owner] of [[give, fromId], [get, toId]]) for (const id of list) {
    const k = kindOf(id);
    if (!k || seen.has(id)) return "Invalid asset.";
    seen.add(id);
    if (stage === 2 && (k === "pick" || k === "fa")) return "Picks are used up. Only drivers and principals now.";
    if (ownerOf(ctx, id) !== owner) return "That asset has already moved.";
  }
  return null;
}

// Swap everything in one go. Returns the executed trade record.
export function executeOffer(ctx, offer) {
  for (const id of offer.give) transfer(ctx, id, offer.to);
  for (const id of offer.get) transfer(ctx, id, offer.from);
  return { from: offer.from, to: offer.to, give: offer.give.slice(), get: offer.get.slice() };
}

// ---------- what things are worth (for autopilot answers and for pick hints) ----------

// Best part bonus you could expect at each turn: the i-th best part overall (slot limits ignored).
export function pickEstimates(g, n) {
  const sorted = g.items.parts.map((p) => p.bonus).sort((a, b) => b - a);
  return Array.from({ length: n }, (_, i) => sorted[i] ?? 10);
}

// Value of each pick and free-agency slot in the same "points" the draft uses (best driver = 100).
export function valuer(g, turns, faSlots) {
  const parts = g.items.parts.map((p) => p.base).sort((a, b) => b - a);
  const fd = g.items.drivers.filter((x) => !x.taken).map((x) => x.base).sort((a, b) => b - a);
  const fp = g.items.principals.filter((x) => !x.taken).map((x) => x.base).sort((a, b) => b - a);
  return {
    pick: turns.map((_, i) => parts[i] ?? 0),
    fa: faSlots.map((_, i) => (fd[i] ?? 0) + 0.6 * (fp[i] ?? 0)),
  };
}

const DRV_W = [1, 1, 0.3, 0.08], PRN_W = [1, 0.15];
const weighted = (vals, w, tail) => vals.sort((a, b) => b - a).reduce((s, v, i) => s + v * (w[i] ?? tail), 0);

export function holdingsOf(ctx, tid) {
  const t = ctx.g.teams[tid];
  return {
    drivers: t.drivers.slice(), principals: principalsOf(t),
    picks: ctx.turns.map((x, i) => (x.team === tid ? i : -1)).filter((i) => i >= 0),
    fas: ctx.fa.map((x, i) => (x.team === tid ? i : -1)).filter((i) => i >= 0),
  };
}

// How much a team's holdings are worth to it: two good drivers, one good principal, four good picks, one good free-agency slot.
// Spare depth is worth a little (it can be sold or cut), extra picks only a little (they can deny others).
const soft = (x) => 1 + (x - 1) * 0.5; // an autopilot team's taste only half-bends its prices, so there is no easy flip between bots
export function holdingsValue(ctx, vc, h, A) {
  const { g } = ctx, b = { driver: soft(A.bias.driver), principal: soft(A.bias.principal), part: soft(A.bias.part) };
  return weighted(h.drivers.map((r) => g.items.drivers[r].base * b.driver), DRV_W, 0.02)
    + weighted(h.principals.map((r) => g.items.principals[r].base * b.principal), PRN_W, 0.02)
    + weighted(h.picks.map((i) => vc.pick[i] * b.part), [1, 1, 1, 1], 0.3)
    + weighted(h.fas.map((i) => vc.fa[i]), [1], 0.3);
}

// An autopilot team's verdict on an offer made to it. `recv` = assets it would get, `lose` = assets it would give up.
export function botVerdict(ctx, vc, tid, recv, lose, r) {
  const t = ctx.g.teams[tid], A = ARCHETYPES[t.human ? "balanced" : t.bot] || ARCHETYPES.balanced;
  const before = holdingsOf(ctx, tid), after = {
    drivers: before.drivers.filter((x) => !lose.includes(`d:${x}`)), principals: before.principals.filter((x) => !lose.includes(`p:${x}`)),
    picks: before.picks.filter((x) => !lose.includes(`rp:${x}`)), fas: before.fas.filter((x) => !lose.includes(`fa:${x}`)),
  };
  const bv = holdingsValue(ctx, vc, before, A), lv = holdingsValue(ctx, vc, after, A);
  for (const id of recv) {
    const k = kindOf(id), n = num(id);
    if (k === "driver") after.drivers.push(n); else if (k === "principal") after.principals.push(n); else if (k === "pick") after.picks.push(n); else if (k === "fa") after.fas.push(n);
  }
  const delta = holdingsValue(ctx, vc, after, A) - bv + gauss(r) * Math.min(A.noise, 3) * 0.6;
  const need = 2.5 + 0.12 * Math.max(0, bv - lv); // it wants a real margin over what it gives up
  return { accept: delta >= need, close: delta >= need - 7, delta };
}
