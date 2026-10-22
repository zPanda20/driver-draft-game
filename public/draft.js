// First draft screens: choosing, locking, and the round results.
import { st, esc, send, chip, iconHTML, itemLabel, drvName, prnName, team, toast, SLOTNAME, drvPic, prnPic } from "./core.js";
import { poolView, groupOf } from "./pool.js";

export function lineup(t) {
  const d = t.drivers.map((r) => `${drvPic(r, 18, "inl", true)}${esc(drvName(r).split(" ").slice(-1)[0])}`).join(" ") || "—";
  const parts = ["aero", "engine", "susp", "cool"].map((s) => (t.parts[s] ? `<span class="tier t${st.idx[t.parts[s]].bonus}">${SLOTNAME[s][0]}+${st.idx[t.parts[s]].bonus}</span>` : `<span class="mute">${SLOTNAME[s][0]}–</span>`)).join(" ");
  return { d, p: t.principal != null ? `${prnPic(t.principal, 18, "inl", true)}${esc(prnName(t.principal).split(" ").slice(-1)[0])}` : "—", parts };
}

let prevLine = {};
export function teamBoard(S, { locked = [], mark = true } = {}) {
  const me = S.me && S.me.teamId;
  const cards = S.teams.map((t) => {
    const l = lineup(t), sig = JSON.stringify([t.drivers, t.principal, t.parts]);
    const isNew = mark && prevLine[t.id] && prevLine[t.id] !== sig;
    prevLine[t.id] = sig;
    return `<div class="tcard ${t.id === me ? "me" : ""} ${locked.includes(t.id) ? "done" : ""} ${isNew ? "new" : ""}">${locked.includes(t.id) ? `<span class="tick">✓</span>` : ""}${chip(t, 24)}
      <div class="ln"><span>Drivers</span><b>${l.d}</b></div><div class="ln"><span>Principal</span><b>${l.p}</b></div><div class="ln"><span>Parts</span><b>${l.parts}</b></div>${t.human ? "" : `<span class="tiny mute">autopilot</span>`}</div>`;
  }).join("");
  return `<div class="tboard">${cards}</div>`;
}

function pickCard(kind, id) {
  const lbl = kind === "pri" ? "Priority pick" : "Alternate";
  if (!id) return `<div class="pickcard ${kind}"><div class="what">${lbl}</div><div class="mute small">${kind === "pri" ? "Press “1st” on the item you want most." : "Optional: press “Alt” on a back-up."}</div></div>`;
  const it = st.idx[id];
  let sub = "";
  if (it.kind === "driver") sub = `OVR ${it.overall.toFixed(1)} · ${esc(it.series)}`;
  else if (it.kind === "principal") sub = `OVR ${it.overall.toFixed(1)}`;
  else sub = `+${it.bonus} bonus`;
  return `<div class="pickcard ${kind}"><div class="what">${lbl}</div><div class="b" style="font-size:18px">${esc(itemLabel(id))}</div><div class="small mute">${sub}</div></div>`;
}

export function draftView(S, h) {
  if (S.step === "draft.intro") return { main: `<div class="card"><div class="phase">First draft</div><div class="rtitle">Get ready</div><p class="small mute mt">The draft starts in a few seconds. Seven picks each: two drivers, a team principal and four car parts.</p></div><div class="card"></div>${h.teamsList(S)}`, side: h.chatCard(S) };
  if (S.step === "draft.reveal") return reveal(S, h);
  if (S.step === "draft.done") return { main: lineupsScreen(S, "First draft complete"), side: h.standingsCard(S) + h.chatCard(S) };
  const me = S.me, d = S.draft;
  const lockedN = d.locked.length, humans = d.humans.length;
  const howOpen = st.ui.pickHow != null ? st.ui.pickHow : d.round === 1; // the explanation is open in round 1, then folds away
  const how = `<p class="small mute pbhow">Pick one item this round. Your <b>priority</b> goes into a draw if other teams want it too; teams that have drafted less value so far are slightly favoured. If you lose, your <b>alternate</b> is tried. If both are lost you get the best leftover of the type you asked for.</p>`;
  const left = `<span class="small mute">Still needed: ${me && me.needs.driver ? me.needs.driver + " driver" + (me.needs.driver > 1 ? "s" : "") + ", " : ""}${me && me.needs.principal ? "principal, " : ""}${me && me.needs.slots.length ? me.needs.slots.map((s) => SLOTNAME[s].toLowerCase()).join(", ") : ""}</span>`;
  const head = (mid, right) => `<div class="pbtop"><div><div class="phase">Round ${d.round} of 7</div><div class="rtitle sm">${me ? "Make your pick" : "Teams are choosing"}</div></div><div class="pbhint">${mid || ""}</div><span class="pill ${lockedN === humans ? "good" : ""}">${lockedN}/${humans} locked in</span>${right || ""}</div>`;
  const howBtn = me ? `<button class="linkbtn" data-act="pickHow">${howOpen ? "Hide help" : "How picks work"}</button>` : "";
  if (!me) return { main: `<div class="card pickbar">${head()}</div><div class="card"><h3>Teams</h3>${teamBoard(S, { locked: d.locked })}</div>`, side: h.chatCard(S) };
  const pk = me.pick || {}, locked = !!pk.locked;
  const hint = locked ? `<span class="locked-note">✓ Locked in. Waiting for the others.</span>` : pk.pri && pk.alt ? `<span class="lockhint">Both picks set. Press Lock in.</span>` : pk.pri ? `<span class="lockhint soft">Add a backup pick, then lock in.</span>` : left;
  const btn = locked ? `<button class="btn" data-act="unlock">Change my pick</button>` : `<button class="btn pri big ${pk.pri && pk.alt ? "lockready" : ""}" data-act="lock" ${pk.pri ? "" : "disabled"}>${pk.pri && pk.alt ? "🔒 LOCK IN NOW" : "Lock in"}</button>`;
  const bar = `<div class="card pickbar">${head(hint, howBtn)}${howOpen ? how : ""}
    <div class="pbmid">${pickCard("pri", pk.pri)}${pickCard("alt", pk.alt)}<div class="pbbtn">${btn}</div></div></div>`;
  const pool = poolView(S, { mode: "draft", sel: pk, canAct: !locked, title: "Pool", fit: true });
  return { main: bar + pool, side: h.teamsList(S).replace('class="card"', 'class="card" data-keep="tl"') + h.chatCard(S) };
}

function viaText(r, wanted) {
  const asked = r.asked ? itemLabel(r.asked) : null;
  const rivals = r.asked ? wanted.filter((w) => w.pri === r.asked).length : 0;
  if (r.via === "pri") return rivals > 1 ? `Won the draw (${rivals} teams wanted it)` : "Got their priority pick";
  if (r.via === "alt") return `Lost the draw for ${asked}; alternate came through`;
  if (r.via === "auto") return "No pick made: auto-drafted";
  return `Lost out on ${asked}; best leftover`;
}

function reveal(S, h) {
  const R = S.reveal, me = S.me && S.me.teamId;
  const mine = R.results.find((r) => r.team === me);
  const sorted = R.results.slice().sort((a, b) => (a.team === me ? -1 : b.team === me ? 1 : a.team - b.team));
  const card = (r) => {
    const t = team(r.team), it = st.idx[r.item];
    const k = it.kind === "part" ? SLOTNAME[it.slot] : it.kind;
    return `<div class="res ${r.team === me ? "me" : ""}">${iconHTML(t.livery, 30)}<div class="t"><div class="a">${esc(t.name)} · ${esc(viaText(r, R.wanted))}</div><div class="b2">${esc(itemLabel(r.item))}</div></div></div>`;
  };
  const head = `<div class="card"><div class="phase">Round ${R.round} of 7 · results</div>${mine ? `<div class="rtitle mt">You got ${esc(itemLabel(mine.item))}</div><p class="mute">${esc(viaText(mine, R.wanted))}</p>` : `<div class="rtitle mt">Round ${R.round} results</div>`}</div>`;
  return { main: head + `<div class="card"><h3>Everyone's pick</h3><div class="rgrid">${sorted.map(card).join("")}</div></div>`, side: h.teamsList(S) + h.chatCard(S) };
}

export function lineupsScreen(S, title) {
  return `<div class="card"><div class="phase">${esc(title)}</div><div class="rtitle">Line-ups for the season</div></div><div class="card"><h3>All teams</h3>${teamBoard(S, { mark: false })}</div>`;
}

export const draftHandlers = {
  pickHow() { const open = st.ui.pickHow != null ? st.ui.pickHow : (st.S.draft && st.S.draft.round === 1); st.ui.pickHow = !open; st.render(); },
  tab(a) { st.ui.tab = a.tab; st.render(); },
  sort(a) { st.ui.sort[a.kind] = a.k; st.render(); },
  hideTaken(a) { st.ui.hide = !!a.value; st.render(); },
  setPick(a) {
    const me = st.S.me; if (!me || !me.pick && false) return;
    const cur = me.pick || {}; if (cur.locked) return toast("Unlock to change your pick.");
    let { pri, alt } = cur; const id = a.id, grp = groupOf(id);
    const same = (x) => x && (x === id || (grp && groupOf(x) === grp));
    if (a.slot === "pri") { if (same(pri)) pri = null; else { pri = id; if (same(alt)) alt = null; } }
    else { if (same(alt)) alt = null; else { alt = id; if (same(pri)) pri = null; } }
    if (!pri && alt) { pri = alt; alt = null; }
    send({ t: "pick", pri, alt });
  },
  lock() { send({ t: "lock", on: true }); },
  unlock() { send({ t: "lock", on: false }); },
};
