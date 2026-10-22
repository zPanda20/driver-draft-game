// Trade windows: build an offer, answer offers, see what has moved.
import { st, esc, send, chip, iconHTML, team, drvName, prnName, toast } from "./core.js";

const T = () => st.ui.tr || (st.ui.tr = { to: null, give: [], get: [] });
const principalsOf = (t) => [t.principal, t.principal2, ...(t.spare || [])].filter((x) => x != null);

// ---------- labels ----------
export function assetLabel(S, id) {
  const tr = S.trade;
  if (id.startsWith("rp:")) { const i = +id.slice(3), p = tr && tr.picks[i]; if (!p) return "Parts pick"; return `Parts pick R${p.r} #${(i % S.N) + 1}`; }
  if (id.startsWith("fa:")) { const i = +id.slice(3); return `Free-agency pick #${i + 1}`; }
  if (id.startsWith("d:")) return drvName(+id.slice(2));
  if (id.startsWith("p:")) return prnName(+id.slice(2));
  return id;
}
function assetSub(S, id) {
  const tr = S.trade;
  if (id.startsWith("rp:")) { const i = +id.slice(3), p = tr.picks[i]; return `about a +${tr.est[i]} part${p.o !== p.w ? " · from " + esc(S.teams[p.o].name) : ""}`; }
  if (id.startsWith("fa:")) { const i = +id.slice(3), p = tr.fa[i]; return `${i === 0 ? "first choice" : "choice " + (i + 1)} of the free agents${p.o !== p.w ? " · from " + esc(S.teams[p.o].name) : ""}`; }
  if (id.startsWith("d:")) return `OVR ${st.cat.drivers[+id.slice(2)].overall.toFixed(1)}`;
  if (id.startsWith("p:")) return `OVR ${st.cat.principals[+id.slice(2)].overall.toFixed(1)}`;
  return "";
}
// Everything a team can put on the table right now, grouped.
function holdings(S, tid) {
  const t = S.teams[tid], tr = S.trade, out = [];
  for (const d of t.drivers) out.push({ id: `d:${d}`, g: "Drivers" });
  for (const p of principalsOf(t)) out.push({ id: `p:${p}`, g: "Principals" });
  if (tr.stage === 1) {
    tr.picks.forEach((p, i) => { if (p.w === tid) out.push({ id: `rp:${i}`, g: "Parts re-draft picks" }); });
    tr.fa.forEach((p, i) => { if (p.w === tid) out.push({ id: `fa:${i}`, g: "Free-agency picks" }); });
  }
  return out;
}
export const tradeList = (S, ids) => ids.map((id) => `<b>${esc(assetLabel(S, id))}</b>`).join(", ");

function assetGrid(S, tid, side) {
  const sel = T()[side], rows = holdings(S, tid);
  if (!rows.length) return `<p class="small mute">Nothing to trade.</p>`;
  const groups = [...new Set(rows.map((r) => r.g))];
  return groups.map((gname) => `<div class="agroup"><div class="tiny mute">${gname}</div>${rows.filter((r) => r.g === gname).map((r) => `<button class="asset ${sel.includes(r.id) ? "on" : ""}" data-act="trTog" data-side="${side}" data-id="${r.id}"><span class="al">${esc(assetLabel(S, r.id))}</span><span class="as">${assetSub(S, r.id)}</span></button>`).join("")}</div>`).join("");
}

const STATUS = { open: ["waiting", "warn"], accepted: ["accepted", "good"], declined: ["declined", "bad"], cancelled: ["withdrawn", ""], void: ["void", ""] };

function offersToMe(S) {
  const me = S.me.teamId, list = S.trade.offers.filter((o) => o.to === me && o.status === "open");
  if (!list.length) return "";
  return `<div class="card offer-in"><h3>Offers for you</h3>${list.map((o) => `<div class="offer">
    <div class="row wrap gap6">${chip(S.teams[o.from], 22, "", true)}<span class="small mute">offers</span></div>
    <div class="small">You get ${tradeList(S, o.give)}</div><div class="small">You give ${tradeList(S, o.get)}</div>
    <div class="row mt gap6"><button class="btn sm good" data-act="trAnswer" data-id="${o.id}" data-yes="1">Accept</button><button class="btn sm bad" data-act="trAnswer" data-id="${o.id}" data-yes="0">Decline</button></div></div>`).join("")}</div>`;
}
function myOffers(S) {
  const me = S.me.teamId, list = S.trade.offers.filter((o) => o.from === me);
  if (!list.length) return "";
  return `<div class="card"><h3>Your offers</h3>${list.map((o) => { const [lbl, cls] = STATUS[o.status] || ["", ""]; return `<div class="offer sent">
    <div class="row wrap gap6">${chip(S.teams[o.to], 20, "", true)}<span class="pill ${cls}">${lbl}</span>${o.note && o.status !== "open" ? `<span class="small mute">${esc(o.note)}</span>` : ""}<div class="grow"></div>${o.status === "open" ? `<button class="btn sm" data-act="trCancel" data-id="${o.id}">Withdraw</button>` : ""}</div>
    <div class="small mute">You give ${tradeList(S, o.give)} · you get ${tradeList(S, o.get)}</div></div>`; }).join("")}</div>`;
}

function builder(S) {
  const me = S.me.teamId, u = T(), tr = S.trade;
  // drop anything that has moved since it was ticked
  const mine = new Set(holdings(S, me).map((r) => r.id)), theirs = u.to != null ? new Set(holdings(S, u.to).map((r) => r.id)) : new Set();
  u.give = u.give.filter((id) => mine.has(id)); u.get = u.get.filter((id) => theirs.has(id));
  const teams = S.teams.filter((t) => t.id !== me).map((t) => {
    const away = t.human && !t.connected, auto = !t.human;
    return `<button class="partner ${u.to === t.id ? "on" : ""}" data-act="trPick" data-id="${t.id}" ${away ? "disabled" : ""}>${iconHTML(t.livery, 26)}<span class="pn">${esc(t.name)}</span><span class="tiny mute">${auto ? "autopilot" : away ? "offline" : esc(t.owner || "")}</span></button>`;
  }).join("");
  const target = u.to != null ? S.teams[u.to] : null;
  const ready = u.give.length && u.get.length;
  return `<div class="card"><h3>Make an offer</h3>
    <div class="tiny mute">1. Choose a team</div><div class="partners">${teams}</div>
    ${target ? `<div class="two mt"><div><div class="small b">You give</div>${assetGrid(S, me, "give")}</div><div><div class="small b">${esc(target.name)} gives</div>${assetGrid(S, u.to, "get")}</div></div>
      <div class="row mt wrap"><span class="small mute grow">${ready ? `You give ${tradeList(S, u.give)} and get ${tradeList(S, u.get)}.` : "2. Tick what you give and what you want."}</span><button class="btn pri" data-act="trSend" ${ready ? "" : "disabled"}>Send offer</button></div>
      ${!target.human ? `<p class="tiny mute mt">${esc(target.name)} is on autopilot and answers at once.</p>` : ""}` : ""}</div>`;
}

export function tradeView(S, h) {
  const tr = S.trade, me = S.me;
  const n = tr.note; if (n) { const key = `${tr.stage}:${n.id}`; if (st.ui.trNoteKey !== key) { st.ui.trNoteKey = key; toast(n.text); } }
  if (me) { // a ping when a new offer arrives
    const seen = st.ui.trSeen || (st.ui.trSeen = new Set());
    for (const o of tr.offers) if (o.to === me.teamId && o.status === "open" && !seen.has(o.id)) { seen.add(o.id); toast(`Offer from ${S.teams[o.from].name}`); }
  }
  const act = tr.active.length, done = tr.done.filter((id) => tr.active.includes(id)).length, mineDone = me && tr.done.includes(me.teamId);
  const intro = tr.stage === 1
    ? `Swap drivers, principals, parts re-draft picks and free-agency picks. A pick is a place in line: an early one lets you take a better part. Give picks away and you fill your last slots from the leftovers.`
    : `Free agency is done. Swap drivers and principals. You keep two drivers and one principal. Anyone still short gets the best of what is left.`;
  const head = `<div class="card"><div class="row wrap"><div><div class="phase">${tr.stage === 1 ? "Trade window" : "Final trades"}</div><div class="rtitle">${me ? "Make a deal" : "Teams are trading"}</div></div><div class="grow"></div>
    <span class="pill ${done === act ? "good" : ""}">${done}/${act} done</span>${me ? `<button class="btn ${mineDone ? "" : "pri"}" data-act="trDone" data-on="${mineDone ? 0 : 1}">${mineDone ? "Keep trading" : "I'm done trading"}</button>` : ""}</div>
    <p class="small mute mt">${intro}</p></div>`;
  if (!me) return { main: head + `<div class="card"><h3>Latest trades</h3>${tradeLog(S)}</div>`, side: h.chatCard(S) };
  return { main: head + offersToMe(S) + builder(S) + myOffers(S), side: `<div class="card"><h3>Latest trades</h3>${tradeLog(S)}</div>` + h.standingsCard(S) + h.chatCard(S) };
}

export function tradeLog(S) {
  const rows = S.feed.filter((f) => f.kind === "trade").slice(-12).reverse().map((f) => `<div>${chip(S.teams[f.from], 16)} gave ${tradeList(S, f.give)}<br><span class="mute small">to</span> ${chip(S.teams[f.to], 16)} for ${tradeList(S, f.get)}</div>`).join("");
  return `<div class="feed" data-keep="trlog">${rows || `<span class="mute small">No trades yet.</span>`}</div>`;
}

export const tradeHandlers = {
  trPick(a) { const u = T(), id = +a.id; if (u.to !== id) { u.to = id; u.get = []; } st.render(); },
  trTog(a) { const u = T(), l = u[a.side], i = l.indexOf(a.id); if (i >= 0) l.splice(i, 1); else if (l.length < st.S.trade.max) l.push(a.id); st.render(); },
  trSend() { const u = T(); if (u.to == null || !u.give.length || !u.get.length) return; send({ t: "tradeOffer", to: u.to, give: u.give, get: u.get }); u.give = []; u.get = []; st.render(); },
  trAnswer(a) { send({ t: "tradeRespond", id: +a.id, accept: a.yes === "1" }); },
  trCancel(a) { send({ t: "tradeCancel", id: +a.id }); },
  trDone(a) { send({ t: "tradeDone", on: a.on === "1" }); },
};
