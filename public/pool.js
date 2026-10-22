// The browsable pool of drivers, principals and parts, used by the draft, the re-draft and free agency.
import { st, esc, stat, SLOTNAME, SLOTS, TIER, tierCls, chip, drvPic } from "./core.js";

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

// opts.mode: "draft" | "parts" | "fa" | "browse".  opts.sel: { pri, alt } item ids (draft).  opts.canAct: boolean
export function poolView(S, opts) {
  const me = S.me, needs = me ? me.needs : null;
  const tab = st.ui.tab;
  const tabs = TABS.filter(([k]) => (opts.tabs ? opts.tabs.includes(k) : true));
  if (!tabs.find(([k]) => k === tab)) st.ui.tab = tabs[0][0];
  const cur = st.ui.tab;
  const need = (k) => {
    if (!needs) return 0;
    if (k === "drivers") return needs.driver; if (k === "principals") return needs.principal;
    return needs.slots.includes(k) ? 1 : 0;
  };
  // In the parts re-draft each slot tab shows the best grade still in the pool, so you can see at a glance where the Elite part is.
  const best = (k) => { const b = [50, 30, 20, 10].find((x) => freeParts(S, k, x).length); return b ? `best +${b}` : "none left"; };
  const head = `<div class="row wrap"><div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === cur ? "on" : ""}" data-act="tab" data-tab="${k}">${l}${needs ? `<span class="k">${need(k) ? (k === "drivers" || k === "principals" ? "need " + need(k) : opts.mode === "parts" ? best(k) : "need") : "✓"}</span>` : ""}</button>`).join("")}</div>
    <div class="grow"></div>${cur === "drivers" || cur === "principals" ? `<input id="filter" placeholder="Search" value="${esc(st.ui.q)}" style="width:150px">` : ""}
    ${cur === "drivers" || cur === "principals" ? `<label class="small mute row gap6"><input type="checkbox" data-change="hideTaken" ${st.ui.hide ? "checked" : ""}> hide taken</label>` : ""}</div>`;
  let body = "";
  if (cur === "drivers" || cur === "principals") body = personTable(S, cur, opts);
  else body = partTable(S, cur, opts);
  return `<div class="card"><h3>${opts.title || "Pool"}</h3>${head}${opts.hint ? `<p class="small mute mt">${opts.hint}</p>` : ""}<div class="scroller mt" data-keep="pool">${body}</div></div>`;
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
    return `<td><button class="btn sm ${mine === "pri" ? "pri" : ""}" data-act="setPick" data-slot="pri" data-id="${it.id}">1st</button> <button class="btn sm ${mine === "alt" ? "pri" : ""}" data-act="setPick" data-slot="alt" data-id="${it.id}">Alt</button></td>`;
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
    return `<table class="tbl"><thead><tr>${th("rank", "#", "l")}${th("name", "Driver", "l")}${th("overall", "OVR")}${th("pace", "Pace")}${th("race", "Race")}${th("craft", "Craft")}${th("wet", "Wet")}${th("tyre", "Tyre")}${th("cons", "Cons")}${th("safety", "Safe")}<th></th></tr></thead><tbody>${rows.map((d) => {
      const sel = opts.sel || {}; const cls = sel.pri === d.id ? "pri" : sel.alt === d.id ? "alt" : "";
      return `<tr class="it ${cls} ${isTaken(S, d.id) ? "gone" : ""}"><td class="mute">${d.rank}</td><td class="l">${drvPic(d.i, 30, "inl")}<b>${esc(d.name)}</b> <span class="tiny mute">${esc(d.series)}</span>${S.taken[d.id] != null ? " " + owner(d.id) : ""}</td><td class="ovr">${d.overall.toFixed(1)}</td><td>${pair(d.career.pace, d.peak.pace)}</td><td>${pair(d.career.race, d.peak.race)}</td><td>${pair(d.career.craft, d.peak.craft)}</td><td>${pair(d.career.wet, d.peak.wet)}</td><td>${pair(d.career.tyre, d.peak.tyre)}</td><td>${stat(d.cons)}</td><td>${stat(d.safety)}</td>${actionCells(S, d, opts)}</tr>`;
    }).join("")}</tbody></table>`;
  }
  return `<table class="tbl"><thead><tr>${th("rank", "#", "l")}${th("name", "Principal", "l")}${th("overall", "OVR")}${th("strategy", "Strategy")}${th("mentality", "Mentality")}${th("mechanical", "Mechanical")}<th></th></tr></thead><tbody>${rows.map((p) => {
    const sel = opts.sel || {}; const cls = sel.pri === p.id ? "pri" : sel.alt === p.id ? "alt" : "";
    return `<tr class="it ${cls} ${isTaken(S, p.id) ? "gone" : ""}"><td class="mute">${p.rank}</td><td class="l"><b>${esc(p.name)}</b> <span class="tiny mute">${esc(p.era || p.group || "")}</span>${S.taken[p.id] != null ? " " + owner(p.id) : ""}</td><td class="ovr">${p.overall.toFixed(1)}</td><td>${stat(p.strategy)}</td><td>${stat(p.mentality)}</td><td>${stat(p.mechanical)}</td>${actionCells(S, p, opts)}</tr>`;
  }).join("")}</tbody></table>`;
}

function partTable(S, slot, opts) {
  const me = S.me, ownSlot = me && !me.needs.slots.includes(slot);
  const wish = (me && me.wish) || [];
  const sel = opts.sel || {};
  const rows = [50, 30, 20, 10].map((b) => {
    const free = freeParts(S, slot, b), total = st.cat.parts.filter((p) => p.slot === slot && p.bonus === b).length;
    const key = `${slot}:${b}`, selP = groupOf(sel.pri) === key, selA = groupOf(sel.alt) === key;
    let act = "";
    if (!free.length) act = `<span class="mute small">gone</span>`;
    else if (ownSlot) act = `<span class="mute small">slot filled</span>`;
    else if (opts.mode === "draft" && opts.canAct) act = `<button class="btn sm ${selP ? "pri" : ""}" data-act="setPick" data-slot="pri" data-id="${free[0].id}">1st</button> <button class="btn sm ${selA ? "pri" : ""}" data-act="setPick" data-slot="alt" data-id="${free[0].id}">Alt</button>`;
    else if (opts.mode === "parts" && opts.canAct) act = `<button class="btn sm pri" data-act="partTake" data-id="${free[0].id}">Take</button>`;
    const star = me && !ownSlot && free.length && opts.mode !== "draft" ? `<span class="queue ${wish.includes(key) ? "on" : ""}" title="Queue: auto-pick this on my turn" data-act="wish" data-key="${key}">★</span>` : "";
    return `<tr class="it ${selP ? "pri" : selA ? "alt" : ""} ${free.length ? "" : "gone"}"><td class="l"><span class="tier ${tierCls(b)}">+${b}</span> ${TIER[b]}</td><td>${SLOTNAME[slot]} +${b}</td><td>${free.length} of ${total} left</td><td>${star}${act}</td></tr>`;
  }).join("");
  return `<table class="tbl"><thead><tr><th class="l">Tier</th><th>Part</th><th>Available</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="small mute mt">A part adds its bonus to your car in that area. Identical parts are interchangeable.</p>`;
}
