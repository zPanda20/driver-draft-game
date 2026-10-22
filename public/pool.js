// The browsable pool of drivers, principals and parts, used by the draft, the re-draft and free agency.
import { st, esc, stat, SLOTNAME, SLOTS, TIER, tierCls, chip, drvPic, prnPic } from "./core.js";

export const TABS = [["drivers", "Drivers"], ["principals", "Principals"], ["aero", "Aero"], ["engine", "Engine"], ["susp", "Suspension"], ["cool", "Cooling"]];

const SORTS = {
  drivers: { rank: (d) => d.rank, overall: (d) => -d.overall, pace: (d) => -d.career.pace, race: (d) => -d.career.race, craft: (d) => -d.career.craft, wet: (d) => -d.career.wet, tyre: (d) => -d.career.tyre, cons: (d) => -d.cons, safety: (d) => -d.safety, name: (d) => d.name },
  principals: { rank: (p) => p.rank, overall: (p) => -p.overall, strategy: (p) => -p.strategy, mentality: (p) => -p.mentality, mechanical: (p) => -p.mechanical, name: (p) => p.name },
};

// Owners are team numbers and team 0 is a real owner, so never test S.taken[id] for truthiness.
export const isTaken = (S, id) => S.taken[id] != null;
export function freeParts(S, slot, bonus) { return st.cat.parts.filter((p) => p.slot === slot && p.bonus === bonus && !isTaken(S, p.id)); }
export const groupOf = (id) => { const p = st.idx[id]; return p && p.kind === "part" ? `${p.slot}:${p.bonus}` : null; };

function pair(c, p) { return c === p ? `${stat(c)}` : `${stat(c)}<small class="mute">/${Math.round(p)}</small>`; }

// ---- how good is what is left? (drives the tab glow and the "best" labels) ----
const median = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
let baseCache = null;
function baselines() {
  if (baseCache && baseCache.cat === st.cat) return baseCache;
  const o = (l) => ({ top: Math.max(...l.map((x) => x.overall)), med: median(l.map((x) => x.overall)) });
  const c = { cat: st.cat, drivers: o(st.cat.drivers), principals: o(st.cat.principals), parts: {} };
  for (const k of SLOTS) { const b = st.cat.parts.filter((p) => p.slot === k).map((p) => p.bonus); c.parts[k] = { top: Math.max(...b), med: median(b) }; }
  return (baseCache = c);
}
// need: how many of this kind the player still needs. txt: the best one left. hot: 0..1, how far the best one left has fallen from the best there was (1 = down to a typical one).
function tabInfo(S, k) {
  const nd = S.me.needs, B = baselines();
  const need = k === "drivers" ? nd.driver : k === "principals" ? nd.principal : nd.slots.includes(k) ? 1 : 0;
  let best = null, base, txt;
  if (k === "drivers" || k === "principals") {
    const av = (k === "drivers" ? st.cat.drivers : st.cat.principals).filter((x) => !isTaken(S, x.id));
    best = av.length ? Math.max(...av.map((x) => x.overall)) : null; base = B[k]; txt = best == null ? "none left" : `best ${best.toFixed(1)}`;
  } else {
    best = [50, 30, 20, 10].find((x) => freeParts(S, k, x).length) || null; base = B.parts[k]; txt = best == null ? "none left" : `best +${best}`;
  }
  const hot = best == null ? 1 : Math.max(0, Math.min(1, (base.top - best) / Math.max(1e-6, base.top - base.med)));
  return { need, txt, hot };
}

// ---- driver strengths: one word for what stands out about a driver, compared with the field ----
const SKEYS = ["pace", "race", "craft", "wet", "tyre", "cons", "safety"];
const sval = (d, k) => (k === "cons" || k === "safety" ? d[k] : d.career[k]);
let fieldCache = null;
function field() {
  if (fieldCache && fieldCache.cat === st.cat) return fieldCache;
  const F = { cat: st.cat, m: {}, sd: {} };
  for (const k of SKEYS) { const v = st.cat.drivers.map((d) => sval(d, k)), m = v.reduce((a, b) => a + b, 0) / v.length; F.m[k] = m; F.sd[k] = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; }
  return (fieldCache = F);
}
const STAG = { pace: "Qualifier", race: "Racer", craft: "Fighter", wet: "Rainmaster", tyre: "Tyre-wise", cons: "Consistent", safety: "Clean" };
export function strengthTag(d) {
  const F = field(), z = SKEYS.map((k) => (sval(d, k) - F.m[k]) / F.sd[k]), mz = z.reduce((a, b) => a + b, 0) / z.length;
  let bi = 0; z.forEach((v, i) => { if (v > z[bi]) bi = i; });
  return z[bi] >= 0.6 || z[bi] - mz >= 0.45 ? STAG[SKEYS[bi]] : "All-rounder";
}
const SLABEL = { pace: "Qualifying", race: "Race pace", craft: "Racecraft", wet: "Wet weather", tyre: "Tyre care", cons: "Consistency", safety: "Safety" };
const CHIPS = [["overall", "Best overall"], ["wet", "Wet specialists"], ["cons", "Most consistent"], ["safety", "Safest"]];
const MORE = [["pace", "Qualifying pace"], ["race", "Race pace"], ["craft", "Racecraft"], ["tyre", "Tyre care"], ["name", "Name A to Z"], ["rank", "Overall rank"]];

// opts.mode: "draft" | "parts" | "fa" | "browse".  opts.sel: { pri, alt } item ids (draft).  opts.canAct: boolean
export function poolView(S, opts) {
  const me = S.me, needs = me ? me.needs : null;
  const tab = st.ui.tab;
  const tabs = TABS.filter(([k]) => (opts.tabs ? opts.tabs.includes(k) : true));
  if (!tabs.find(([k]) => k === tab)) st.ui.tab = tabs[0][0];
  const cur = st.ui.tab;
  const people = cur === "drivers" || cur === "principals";
  const sortKey = st.ui.sort.drivers;
  const chips = cur === "drivers" ? `<div class="chips">${CHIPS.map(([k, l]) => `<button class="chip ${sortKey === k ? "on" : ""}" data-act="sort" data-kind="drivers" data-k="${k}">${l}</button>`).join("")}<select class="chipsel ${MORE.some(([k]) => k === sortKey) ? "on" : ""}" data-change="sortMore" aria-label="More ways to sort"><option value="">More sorts…</option>${MORE.map(([k, l]) => `<option value="${k}" ${sortKey === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>` : "";
  const tools = people ? `<input id="filter" placeholder="Search" value="${esc(st.ui.q)}" style="width:130px"><label class="small mute row gap6"><input type="checkbox" data-change="hideTaken" ${st.ui.hide ? "checked" : ""}> hide taken</label>` : "";
  // Tabs: a tab you still need something from glows, harder the worse what is left (draft and re-draft); a tab you have filled goes quiet but stays clickable.
  const live = needs && (opts.mode === "draft" || opts.mode === "parts");
  const tabsRow = `<div class="tabs">${tabs.map(([k, l]) => {
    if (!needs) return `<button class="tab ${k === cur ? "on" : ""}" data-act="tab" data-tab="${k}"><b>${l}</b></button>`;
    const t = tabInfo(S, k), isP = k === "drivers" || k === "principals";
    if (!live) return `<button class="tab ${k === cur ? "on" : ""}" data-act="tab" data-tab="${k}"><b>${l}</b><small>${t.need ? (isP ? "need " + t.need : "need") : "✓"}</small></button>`;
    const glow = t.need ? ` glow${t.hot >= 0.6 ? " hot" : ""}` : " done", g = t.need ? `--gb:${Math.round(55 + t.hot * 45)}%;--gs:${(6 + t.hot * 12).toFixed(1)}px;--ga:${Math.round(35 + t.hot * 50)}%` : "";
    const sub = t.need ? `${isP ? "need " + t.need + " · " : "need · "}${t.txt}` : `✓ ${isP ? "full" : "filled"}`;
    return `<button class="tab ${k === cur ? "on" : ""}${glow}" style="${g}" data-act="tab" data-tab="${k}"><b>${l}</b><small>${sub}</small></button>`;
  }).join("")}</div>`;
  let body = "";
  if (cur === "drivers" || cur === "principals") body = personTable(S, cur, opts);
  else body = partTable(S, cur, opts);
  return `<div class="card poolcard"><div class="row poolhead"><h3>${opts.title || "Pool"}</h3>${chips}<div class="grow"></div>${tools}</div>${tabsRow}${opts.hint ? `<p class="small mute mt">${opts.hint}</p>` : ""}<div class="scroller mt" data-keep="pool"${opts.fit ? " data-fit" : ""}>${body}</div></div>`;
}

function actionCells(S, it, opts) {
  const isDriver = it.id[0] === "d"; // catalogue rows carry no `kind`
  const taken = isTaken(S, it.id);
  if (opts.mode === "draft") {
    const sel = opts.sel || {};
    const mine = sel.pri === it.id ? "pri" : sel.alt === it.id ? "alt" : "";
    if (taken || !opts.canAct) return `<td></td>`;
    const nd = S.me && S.me.needs;
    if (nd && !(isDriver ? nd.driver : nd.principal)) return `<td><span class="mute small">${isDriver ? "drivers full" : "principal set"}</span></td>`;
    return `<td><button class="btn sm ${mine === "pri" ? "pri" : ""}" data-act="setPick" data-slot="pri" data-id="${it.id}">Pick</button> <button class="btn sm ${mine === "alt" ? "pri" : ""}" data-act="setPick" data-slot="alt" data-id="${it.id}">Backup</button></td>`;
  }
  if (opts.mode === "fa") {
    if (taken || !opts.canAct) return `<td></td>`;
    const on = (isDriver ? st.ui.faD : st.ui.faP) === it.id;
    return `<td><button class="btn sm ${on ? "pri" : ""}" data-act="faSel" data-id="${it.id}">${on ? "Selected" : "Select"}</button></td>`;
  }
  return `<td></td>`;
}

function personTable(S, kind, opts) {
  const list = kind === "drivers" ? st.cat.drivers : st.cat.principals;
  const sortKey = st.ui.sort[kind], f = SORTS[kind][sortKey] || SORTS[kind].overall;
  const q = st.ui.q.trim().toLowerCase();
  let rows = list.filter((x) => (!st.ui.hide || !isTaken(S, x.id)) && (!q || x.name.toLowerCase().includes(q)));
  rows = rows.slice().sort((a, b) => { const A = f(a), B = f(b); return A < B ? -1 : A > B ? 1 : a.rank - b.rank; });
  const th = (k, l, cls = "") => `<th class="${cls}" data-act="sort" data-kind="${kind}" data-k="${k}">${l}${sortKey === k ? " ▾" : ""}</th>`;
  const owner = (id) => { const t = S.taken[id]; return t == null ? "" : chip(S.teams[t], 16); };
  if (kind === "drivers") {
    return `<table class="tbl"><thead><tr>${th("rank", "#", "l")}${th("name", "Driver", "l")}<th class="l nosort">Strength</th>${th("overall", "OVR")}<th></th></tr></thead><tbody>${rows.map((d) => {
      const sel = opts.sel || {}; const cls = sel.pri === d.id ? "pri" : sel.alt === d.id ? "alt" : "";
      const open = st.ui.open === d.id;
      const more = open ? `<tr class="more"><td colspan="5"><div class="sgrid">${SKEYS.map((k) => `<div class="sc"><span class="tiny mute">${SLABEL[k]}</span>${stat(sval(d, k))}${k === "cons" || k === "safety" ? "" : `<span class="tiny mute">peak ${Math.round(d.peak[k])}</span>`}</div>`).join("")}</div></td></tr>` : "";
      return `<tr class="it ${cls} ${isTaken(S, d.id) ? "gone" : ""} ${open ? "open" : ""}" data-act="rowOpen" data-id="${d.id}" title="Tap for the full stats"><td class="mute">${d.rank}</td><td class="l">${drvPic(d.i, 30, "inl")}<b>${esc(d.name)}</b> <span class="tiny mute">${esc(d.series)}</span>${S.taken[d.id] != null ? " " + owner(d.id) : ""}</td><td class="l"><span class="stag">${strengthTag(d)}</span>${SKEYS.includes(sortKey) ? ` <span class="tiny mute">${SLABEL[sortKey]} ${Math.round(sval(d, sortKey))}</span>` : ""}</td><td class="ovr">${d.overall.toFixed(1)}</td>${actionCells(S, d, opts)}</tr>${more}`;
    }).join("")}</tbody></table>`;
  }
  return `<table class="tbl"><thead><tr>${th("rank", "#", "l")}${th("name", "Principal", "l")}${th("overall", "OVR")}${th("strategy", "Strategy")}${th("mentality", "Mentality")}${th("mechanical", "Mechanical")}<th></th></tr></thead><tbody>${rows.map((p) => {
    const sel = opts.sel || {}; const cls = sel.pri === p.id ? "pri" : sel.alt === p.id ? "alt" : "";
    return `<tr class="it ${cls} ${isTaken(S, p.id) ? "gone" : ""}"><td class="mute">${p.rank}</td><td class="l">${prnPic(p.i, 30, "inl")}<b>${esc(p.name)}</b> <span class="tiny mute">${esc(p.era || p.group || "")}</span>${S.taken[p.id] != null ? " " + owner(p.id) : ""}</td><td class="ovr">${p.overall.toFixed(1)}</td><td>${stat(p.strategy)}</td><td>${stat(p.mentality)}</td><td>${stat(p.mechanical)}</td>${actionCells(S, p, opts)}</tr>`;
  }).join("")}</tbody></table>`;
}

function partTable(S, slot, opts) {
  const me = S.me, ownSlot = me && !me.needs.slots.includes(slot);
  const wish = (me && me.wish) || [];
  const sel = opts.sel || {};
  const gone = [];
  const rows = [50, 30, 20, 10].map((b) => {
    const free = freeParts(S, slot, b), total = st.cat.parts.filter((p) => p.slot === slot && p.bonus === b).length;
    if (!free.length) { gone.push(`+${b} ${TIER[b]}`); return ""; } // sold-out grades are not listed; a line under the table says which are gone
    const key = `${slot}:${b}`, selP = groupOf(sel.pri) === key, selA = groupOf(sel.alt) === key;
    let act = "";
    if (ownSlot) act = `<span class="mute small">slot filled</span>`;
    else if (opts.mode === "draft" && opts.canAct) act = `<button class="btn sm ${selP ? "pri" : ""}" data-act="setPick" data-slot="pri" data-id="${free[0].id}">Pick</button> <button class="btn sm ${selA ? "pri" : ""}" data-act="setPick" data-slot="alt" data-id="${free[0].id}">Backup</button>`;
    else if (opts.mode === "parts" && opts.canAct) act = `<button class="btn sm pri" data-act="partTake" data-id="${free[0].id}">Take</button>`;
    const star = me && !ownSlot && opts.mode !== "draft" ? `<span class="queue ${wish.includes(key) ? "on" : ""}" title="Queue: auto-pick this on my turn" data-act="wish" data-key="${key}">★</span>` : "";
    return `<tr class="it ${selP ? "pri" : selA ? "alt" : ""}"><td class="l"><span class="tier ${tierCls(b)}">+${b}</span> ${TIER[b]}</td><td>${SLOTNAME[slot]} +${b}</td><td>${free.length} of ${total} left</td><td>${star}${act}</td></tr>`;
  }).join("");
  const table = rows ? `<table class="tbl"><thead><tr><th class="l">Tier</th><th>Part</th><th>Available</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="small mute">Every ${SLOTNAME[slot].toLowerCase()} part has been taken.</p>`;
  return `${table}
    ${gone.length && rows ? `<p class="tiny mute mt">Sold out: ${gone.join(", ")}.</p>` : ""}
    <p class="small mute mt">A part adds its bonus to your car in that area. Identical parts are interchangeable.</p>`;
}
