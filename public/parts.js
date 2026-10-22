// The parts re-draft screen: what is going on, whose turn it is, what you still need, and what everyone has taken.
import { st, esc, chip, iconHTML, itemLabel, SLOTNAME, SLOTS, TIER, tierCls, store } from "./core.js";
import { poolView } from "./pool.js";
import { teamBoard } from "./draft.js";

const ABBR = { aero: "A", engine: "E", susp: "S", cool: "C" };
const partOf = (id) => st.idx[id];
const team = (S, id) => S.teams[id];

// Show the explainer until the player hides it; the choice is remembered in this browser.
const howOpen = () => (st.ui.partsHow == null ? (st.ui.partsHow = store("partsHow") !== "0") : st.ui.partsHow);

function how(S) {
  const snake = S.parts.snake, n = S.teams.length;
  const open = howOpen();
  const body = `<ol class="steps">
      <li><b>Every car starts empty.</b> All parts from last season are back in one pool. You keep your drivers and principal, but not your parts.</li>
      <li><b>Four rounds, one part each.</b> In every round each team takes one part. The weakest team of last season picks first and the champion picks last${snake ? ". In rounds 2 and 4 the order flips" : ""}.</li>
      <li><b>Four slots to fill.</b> Aero, Engine, Suspension, Cooling. You fill each slot once, so each pick also decides which slot you fill next.</li>
      <li><b>Grades matter.</b> Elite is +50, Strong +30, Solid +20, Basic +10. There is only <b>one Elite part per slot</b> and there are ${n} parts per slot, one for each team. Take the Elite early or someone else will.</li>
      <li><b>Short of time?</b> Star ★ parts to build a queue. On your turn we take the first starred part that is still there and fits an empty slot. If the clock runs out we take the best part you can use.</li>
    </ol>`;
  return `<div class="card how"><div class="row"><h3>How the parts re-draft works</h3><div class="grow"></div><button class="btn sm" data-act="partsHow">${open ? "Hide" : "Show"}</button></div>${open ? body : ""}</div>`;
}

// "Your car": the four slots, filled or empty.
function car(S) {
  const me = S.me; if (!me) return "";
  const t = team(S, me.teamId), turn = S.step === "parts.turn" && S.parts.team === me.teamId;
  const tiles = SLOTS.map((s) => {
    const id = t.parts && t.parts[s], it = id && partOf(id);
    if (it) return `<div class="cslot full"><div class="k">${SLOTNAME[s]}</div><div class="v ${tierCls(it.bonus)}">+${it.bonus}</div><div class="g">${TIER[it.bonus]}</div></div>`;
    return `<div class="cslot ${turn ? "need now" : "need"}"><div class="k">${SLOTNAME[s]}</div><div class="v">–</div><div class="g">${turn ? "pick one" : "empty"}</div></div>`;
  }).join("");
  const left = me.needs.slots.map((s) => SLOTNAME[s]);
  return `<div class="card"><h3>Your car</h3><div class="car4">${tiles}</div>
    <p class="small mute mt">${left.length ? `Still to fill: <b>${left.join(", ")}</b>.` : `<b>Your car is complete.</b> Nothing more to pick.`}</p></div>`;
}

// One row per round, every team's place in line, who has taken what.
function board(S) {
  const P = S.parts, me = S.me && S.me.teamId, live = S.step === "parts.turn";
  const rounds = [1, 2, 3, 4];
  const rows = rounds.map((r) => {
    const cells = P.turns.map((x, i) => ({ x, i })).filter(({ x }) => x.r === r).map(({ x, i }) => {
      const t = team(S, x.t), it = x.p && partOf(x.p);
      const now = live && i === P.idx, done = !!x.p, skip = !!x.s;
      const cls = ["pk", now ? "now" : "", done ? "done" : "", skip ? "skip" : "", x.t === me ? "me" : ""].join(" ");
      const label = it ? `<span class="pl ${tierCls(it.bonus)}">${ABBR[it.slot]}+${it.bonus}</span>` : now ? `<span class="pl">picking</span>` : skip ? `<span class="pl">full</span>` : `<span class="pl mute">#${i + 1}</span>`;
      const traded = x.o !== x.t ? `<span class="tr" title="Pick traded from ${esc(team(S, x.o).name)}">⇄</span>` : "";
      return `<div class="${cls}" title="${esc(t.name)}${x.o !== x.t ? " (pick from " + esc(team(S, x.o).name) + ")" : ""}">${iconHTML(t.livery, 26)}${traded}${label}${x.t === me ? `<span class="you">YOU</span>` : ""}</div>`;
    }).join("");
    const rev = P.snake && r % 2 === 0;
    return `<div class="pkround ${P.round === r ? "cur" : ""}"><div class="pkh"><b>Round ${r}</b><span class="tiny mute">${rev ? "reverse order" : "weakest first"}</span></div><div class="pkrow">${cells}</div></div>`;
  }).join("");
  return `<div class="card"><h3>Pick order</h3><div class="pkboard" data-keep="pkboard">${rows}</div>
    <p class="tiny mute mt">A = Aero, E = Engine, S = Suspension, C = Cooling. ⇄ marks a pick that was traded. Your picks are outlined.</p></div>`;
}

function queue(S) {
  const me = S.me; if (!me) return "";
  const pills = me.wish.map((k, i) => { const [s, b] = k.split(":"); return `<span class="pill warn qpill" data-act="wish" data-key="${k}" title="Remove">${i + 1}. ★ ${SLOTNAME[s]} +${b} ✕</span>`; }).join("");
  return `<div class="card"><h3>Your queue</h3>
    <p class="small mute">Press ★ next to a part in the pool to queue it. On your turn we take the first queued part that is still there and fits an empty slot.</p>
    <div class="row wrap mt">${pills || `<span class="small mute">Nothing queued. You will pick by hand.</span>`}</div>
    <label class="row gap6 mt small"><input type="checkbox" data-change="autoPick" ${me.auto ? "checked" : ""}> Pick for me automatically (queue first, then the best part I can use)</label></div>`;
}

// What to expect, in words, for this player right now.
function status(S) {
  const P = S.parts, me = S.me; if (!me) return "";
  const mine = P.turns.map((x, i) => ({ x, i })).filter(({ x }) => x.t === me.teamId && !x.s);
  const next = mine.find(({ x, i }) => !x.p && i >= P.idx);
  if (S.step === "parts.turn" && P.team === me.teamId) return `It is your pick. Take one part from the pool below. The clock is at the top right. If it runs out we take the best part you can use.`;
  if (!me.needs.slots.length) return `Your car is complete. Watch the others pick.`;
  if (!mine.length) return `You hold no picks in this re-draft, so the leftover parts will be handed out to you at the end.`;
  if (!next) return `You have used all your picks. Any empty slot is filled from the leftovers at the end.`;
  const ahead = P.turns.slice(Math.max(P.idx, 0), next.i).filter((x) => !x.s && !x.p).length;
  return `You pick in round ${next.x.r}${ahead ? `, after ${ahead} other pick${ahead === 1 ? "" : "s"}` : ", next"}. Star ★ parts to queue them while you wait.`;
}

export function partsView(S, h, feedBox) {
  const p = S.parts, me = S.me, myTurn = S.step === "parts.turn" && me && p.team === me.teamId;
  const cur = p.team != null ? S.teams[p.team] : null;
  const done = p.turns.filter((x) => x.p || x.s).length, total = p.turns.length;
  const head = `<div class="card"><div class="row wrap"><div><div class="phase">Parts re-draft · round ${p.round || Math.min(4, Math.ceil((p.idx + 1) / S.teams.length))} of 4 · pick ${Math.min(p.idx + 1, p.total)} of ${p.total}</div>
      <div class="rtitle">${myTurn ? "Your pick" : cur ? chip(cur, 30) + " is picking" : "The parts go back in the pool"}</div></div><div class="grow"></div>
      ${p.upNext.length ? `<div class="col gap4"><span class="tiny mute">Up next</span><div class="row gap6 wrap">${p.upNext.map((id) => iconHTML(S.teams[id].livery, 24)).join("")}</div></div>` : ""}</div>
      <div class="pbar mt"><i style="width:${Math.round((100 * done) / Math.max(1, total))}%"></i></div>
      ${me ? `<p class="statusline ${myTurn ? "now" : ""}">${status(S)}</p>` : `<p class="small mute mt">Every team takes four parts, one per round. The weakest team picks first.</p>`}</div>`;
  // On your turn, open the slot tab where the best part is still on offer (and that you still need).
  if (myTurn && st.ui.partsTabFor !== p.idx) {
    st.ui.partsTabFor = p.idx;
    const bestIn = (k) => [50, 30, 20, 10].find((b) => st.cat.parts.some((x) => x.slot === k && x.bonus === b && S.taken[x.id] == null)) || 0;
    const pick = me.needs.slots.slice().sort((a, b) => bestIn(b) - bestIn(a))[0];
    if (pick) st.ui.tab = pick;
  }
  const hint = !me ? "" : myTurn ? "Press <b>Take</b> on the part you want. Each row is one grade. Identical parts are interchangeable." : "It is not your turn. Star ★ a part to add it to your queue.";
  const pool = poolView(S, { mode: "parts", canAct: myTurn, tabs: SLOTS, title: myTurn ? "Take a part" : "Parts pool", hint });
  if (!me) return { main: head + board(S) + `<div class="card"><h3>Teams</h3>${teamBoard(S)}</div>`, side: feedBox(S, ["part", "trade"]) + h.chatCard(S) };
  return { main: head + (myTurn ? car(S) + pool + board(S) + queue(S) + how(S) : how(S) + car(S) + board(S) + queue(S) + pool), side: feedBox(S, ["part", "trade"]) + h.standingsCard(S) + h.chatCard(S) };
}

export const partsHandlers = {
  partsHow() { st.ui.partsHow = !howOpen(); store("partsHow", st.ui.partsHow ? "1" : "0"); st.render(); },
};
