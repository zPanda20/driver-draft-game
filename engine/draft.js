// First draft (7 simultaneous rounds with priority and alternate picks), the parts re-draft, and free agency.
import { shuffle } from "./rng.js";
import { perceived, ARCHETYPES } from "./bots.js";
import { SLOTS } from "./race.js";

export function needsOf(team) {
  return { driver: 2 - team.drivers.length, principal: team.principal == null ? 1 : 0, slots: SLOTS.filter((s) => team.partIds[s] == null) };
}
const kindNeeded = (n, it) => (it.kind === "driver" ? n.driver > 0 : it.kind === "principal" ? n.principal > 0 : n.slots.includes(it.slot));

// The few best items still free in each kind (enough for any sensible choice).
function candidates(pool, n, K = 7, KP = 4) {
  const out = [];
  if (n.driver > 0) out.push(...pool.drivers.filter((x) => !x.taken).slice(0, K));
  if (n.principal > 0) out.push(...pool.principals.filter((x) => !x.taken).slice(0, K));
  for (const s of n.slots) out.push(...pool.parts[s].filter((x) => !x.taken).slice(0, KP));
  return out;
}

export function award(team, item, game) {
  item.taken = true; item.owner = team.id;
  if (item.kind === "driver") team.drivers.push(item.ref);
  else if (item.kind === "principal") team.principal = item.ref;
  else { team.partIds[item.slot] = item.id; team.parts[item.slot] = item.bonus; }
  team.pickValue += item.base;
}

export function makePool(items) {
  const by = (a) => a.slice().sort((x, y) => y.base - x.base || y.strength - x.strength);
  const pool = { drivers: by(items.drivers), principals: by(items.principals), parts: {} };
  for (const s of SLOTS) pool.parts[s] = items.parts.filter((p) => p.slot === s).sort((x, y) => y.bonus - x.bonus);
  return pool;
}

// ---- First draft: seven simultaneous rounds. Stepwise API for live games; runFirstDraft() drives it with bots. ----

export function beginDraftRound(game, round, r) {
  const { teams } = game;
  const order = round === 1 ? shuffle(teams, r) : teams.slice().sort((a, b) => a.pickValue - b.pickValue || r() - 0.5);
  if (round === 1) order.forEach((t, k) => (t.r1pos = k + 1));
  game.draftRound = { round, order, picks: new Map() };
  return game.draftRound;
}

// What a stand-in (bot) would choose: a priority pick and an alternate.
export function botPicks(game, t, round, r) {
  const { pool, D } = game;
  const n = needsOf(t), cands = candidates(pool, n), A = ARCHETYPES[t.bot];
  let pri, alt;
  if (A.sandbag && round === 1) {
    const low = cands.filter((c) => c.kind === "part").sort((a, b) => a.base - b.base)[0] || cands[cands.length - 1];
    pri = low; alt = cands.filter((c) => c !== low).sort((a, b) => a.base - b.base)[0];
  } else {
    const sc = cands.map((c) => [perceived(t, c, D, r), c]).sort((a, b) => b[0] - a[0]);
    pri = sc[0][1]; alt = sc[1] ? sc[1][1] : null;
  }
  return { pri, alt, n };
}

// Check a human's choice against what the team still needs and what is still free.
export function validPick(game, t, itemId) {
  const it = game.itemById.get(itemId);
  if (!it || it.taken || !kindNeeded(needsOf(t), it)) return null;
  return it;
}

export function resolveDraftRound(game, r) {
  const { teams } = game, { round, order, picks } = game.draftRound;
  const log = [];
  for (const t of order) if (!picks.has(t)) picks.set(t, { pri: null, alt: null, n: needsOf(t) });
  const got = new Map(), via = new Map(), taken = new Set();
  const tryTake = (t, it, how) => { if (it && !taken.has(it) && !it.taken && !got.has(t)) { taken.add(it); got.set(t, it); via.set(t, how); return true; } return false; };
  if (game.draftResolve === "lottery") {
    // Each contested item goes to a weighted draw among the players who want it. Weight falls with value already drafted.
    const draw = (kind) => {
      const byItem = new Map();
      for (const t of order) { const it = picks.get(t)[kind]; if (!it || taken.has(it) || it.taken || got.has(t)) continue; (byItem.get(it) || byItem.set(it, []).get(it)).push(t); }
      for (const [it, ts] of byItem) {
        const w = ts.map((t) => 1 / (1 + (game.catchUp ?? 1) * t.pickValue / 100));
        let u = r() * w.reduce((a, b) => a + b, 0), k = 0;
        for (; k < ts.length - 1; k++) { u -= w[k]; if (u <= 0) break; }
        taken.add(it); got.set(ts[k], it); via.set(ts[k], kind);
      }
    };
    draw("pri"); draw("alt");
  } else {
    for (const t of order) tryTake(t, picks.get(t).pri, "pri");
    for (const t of order) tryTake(t, picks.get(t).alt, "alt");
  }
  // Both failed (or no pick): best remaining item of the kind they wanted, then any item they still need.
  const fbOrder = game.draftResolve === "lottery" ? shuffle(order, r) : order;
  for (const t of fbOrder) {
    if (got.has(t)) continue;
    const { pri, n } = picks.get(t);
    const free = (it) => !it.taken && !taken.has(it) && kindNeeded(n, it);
    const all = candidates(game.pool, n, 1000, 1000).filter(free);
    const sameKind = pri ? all.filter((it) => it.kind === pri.kind) : [];
    const pickFrom = sameKind.length ? sameKind : all;
    const best = pickFrom.sort((a, b) => b.base - a.base)[0];
    taken.add(best); got.set(t, best); via.set(t, pri ? "fallback" : "auto");
    log.push({ round, team: t.id, fallback: true });
  }
  const results = [];
  for (const [t, it] of got) { award(t, it, game); results.push({ team: t.id, item: it, via: via.get(t), asked: picks.get(t).pri }); }
  game.draftRound.results = results;
  return { log, results };
}

export function runFirstDraft(game, r, D, opts = {}) {
  const log = [];
  for (let round = 1; round <= 7; round++) {
    const dr = beginDraftRound(game, round, r);
    for (const t of dr.order) dr.picks.set(t, botPicks(game, t, round, r));
    log.push(...resolveDraftRound(game, r).log);
  }
  return log;
}

// ---- Off-season parts re-draft: parts return to the pool, then 4 rounds of N picks in reverse-standings order.
// snake=true reverses rounds 2 and 4. Stepwise for live games; runPartsRedraft() drives it with bots. ----

export function beginPartsRedraft(game, standingsWorstFirst, r, { snake = false } = {}) {
  const { teams, items } = game;
  for (const t of teams) { t.parts = {}; t.partIds = {}; }
  for (const p of items.parts) { p.taken = false; p.owner = null; }
  game.pool = makePool(items);
  for (const t of teams) if (!t.pref) t.pref = r() < 0.5 ? "best" : shuffle(SLOTS, r);
  const turns = [];
  for (let round = 0; round < 4; round++) {
    const order = snake && round % 2 === 1 ? standingsWorstFirst.slice().reverse() : standingsWorstFirst;
    for (const t of order) turns.push({ round: round + 1, team: t.id });
  }
  game.rd = { turns, idx: 0, picks: [] };
  return game.rd;
}

export function botPartChoice(game, t, r) {
  const { pool, D } = game, n = needsOf(t);
  if (!n.slots.length) return null;
  if (t.pref === "best") {
    const cands = n.slots.flatMap((s) => pool.parts[s].filter((x) => !x.taken).slice(0, 3));
    return cands.map((c) => [perceived(t, c, D, r), c]).sort((a, b) => b[0] - a[0])[0][1];
  }
  const slot = t.pref.find((s) => n.slots.includes(s));
  return pool.parts[slot].find((x) => !x.taken);
}

export function takePart(game, t, it) {
  award(t, it, game);
  game.rd.picks.push({ team: t.id, item: it });
}

export function runPartsRedraft(game, standingsWorstFirst, r, D, { snake = false } = {}) {
  beginPartsRedraft(game, standingsWorstFirst, r, { snake });
  for (const turn of game.rd.turns) {
    const t = game.teams[turn.team];
    const choice = botPartChoice(game, t, r);
    if (choice) takePart(game, t, choice);
  }
}

// ---- Free agency: one driver claim and one principal claim each, worst team first. Extras are cut at lock-in. ----

export function freeAgents(game) {
  return { drivers: game.pool.drivers.filter((x) => !x.taken), principals: game.pool.principals.filter((x) => !x.taken) };
}

export function claimFA(game, t, driverItem, principalItem) {
  if (driverItem && !driverItem.taken) { driverItem.taken = true; driverItem.owner = t.id; t.drivers.push(driverItem.ref); t.claimedDriver = driverItem.ref; }
  if (principalItem && !principalItem.taken) { principalItem.taken = true; principalItem.owner = t.id; t.principal2 = principalItem.ref; }
}

export function botClaim(game, t) {
  const fa = freeAgents(game);
  claimFA(game, t, fa.drivers[0], fa.principals[0]);
}

// keep: Map(teamId -> { drivers: [two driver refs], principal: ref }); anything missing defaults to the best by Overall.
export function lockIn(game, keep = new Map()) {
  const { D, teams } = game;
  for (const t of teams) {
    const k = keep.get(t.id);
    t.drivers.sort((a, b) => D.drivers[b].overall - D.drivers[a].overall);
    let stay = t.drivers.slice(0, 2);
    if (k && k.drivers && k.drivers.length === 2 && k.drivers.every((x) => t.drivers.includes(x)) && k.drivers[0] !== k.drivers[1]) stay = k.drivers;
    for (const ref of t.drivers.filter((x) => !stay.includes(x))) { const it = game.items.drivers[ref]; it.taken = false; it.owner = null; }
    t.drivers = stay;
    if (t.principal2 != null) {
      const a = t.principal, b = t.principal2;
      let keepP = D.principals[a].overall >= D.principals[b].overall ? a : b;
      if (k && (k.principal === a || k.principal === b)) keepP = k.principal;
      const drop = keepP === a ? b : a;
      t.principal = keepP; t.principal2 = null;
      const it = game.items.principals[drop]; it.taken = false; it.owner = null;
    }
    t.claimedDriver = null;
  }
  game.pool = makePool(game.items);
}

export function runFreeAgency(game, standingsWorstFirst, r, D) {
  for (const t of standingsWorstFirst) botClaim(game, t);
  lockIn(game);
}
