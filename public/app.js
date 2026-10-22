// App shell: connection, landing, lobby, top bar, side panel, and routing to the draft / race / off-season views.
import { st, $, $$, esc, send, store, now, toast, buildIndex, applyTheme, chip, iconHTML, team, myTeam, remaining, fmtClock, itemLabel, drvName, prnName } from "./core.js";
import { draftView, draftHandlers } from "./draft.js";
import { raceUpdate, raceHandlers, raceActive, raceReset } from "./race.js";
import { offView, offHandlers } from "./off.js";
import { helpHandlers, maybeHelp, renderHelp } from "./help.js";
import { tradeHandlers } from "./trade.js";

const app = $("#app");
app.innerHTML = `<div id="top"></div><div id="body"></div><div id="garage"></div><div id="hostbar"></div><div id="help"></div>`;
const el = { top: $("#top"), body: $("#body"), garage: $("#garage"), host: $("#hostbar") };

const params = new URLSearchParams(location.search);
st.watch = location.pathname === "/screen";
document.body.classList.toggle("screenmode", st.watch);
st.token = store("token") || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
store("token", st.token);
st.room = (params.get("room") || "").toUpperCase() || null;

// ---------- connection ----------
let retry = 0, intent = null;
function connect(first) {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  st.ws = ws;
  ws.onopen = () => {
    retry = 0;
    if (first) intent = first;
    if (intent) ws.send(JSON.stringify({ token: st.token, ...intent }));
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === "hello") {
      st.cat = m.catalog; st.liv = m.liveries; st.off = m.now - Date.now(); buildIndex();
      st.room = m.room; store("room", m.room);
      if (!st.watch) intent = { t: "join", room: m.room, name: store("name") || "Player" };
      history.replaceState(null, "", (st.watch ? "/screen" : "/") + "?room=" + m.room);
    } else if (m.t === "state") {
      const first = !st.S, prevSeq = st.S && st.S.reveal ? st.S.reveal.seq : null;
      st.S = m.s; st.off = m.s.now - Date.now();
      { const nt = m.s.speed && m.s.speed.note; if (nt && nt.id !== st.ui.paceNoteId) { if (st.ui.paceNoteId !== undefined) toast(nt.text); st.ui.paceNoteId = nt.id; } else if (st.ui.paceNoteId === undefined) st.ui.paceNoteId = 0; }
      const R = m.s.reveal;
      if (R && R.kind === "finish" && R.seq !== st.ui.finSeq) {
        st.ui.finSeq = R.seq;
        st.ui.holdUntil = first ? 0 : Date.now() + 9000 * (m.s.settings.pace || 1);
        if (!first) setTimeout(() => st.S && render(), 9100 * (m.s.settings.pace || 1));
      }
      render();
    } else if (m.t === "error") {
      toast(m.msg);
      if (!st.S) { store("room", null); landing(); }
    }
  };
  ws.onclose = () => { if (!intent) return; retry++; setTimeout(() => connect(), Math.min(4000, 400 * retry)); };
}
const nameVal = () => ($("#nm")?.value || "").trim() || store("name") || "Player";
function landing() {
  st.S = null;
  el.top.innerHTML = ""; el.garage.innerHTML = ""; el.host.innerHTML = "";
  const saved = store("room");
  el.body.innerHTML = `<div class="landing">
    <div><div class="logo" style="margin-bottom:10px"><b>●</b> Driver Draft</div>
    <div class="hero">Draft the drivers.<br>Build the car.<br>Win the season.</div>
    <p class="mute mt">A game for a room full of laptops. Everyone drafts, everyone watches the same race.</p></div>
    <div class="card box"><h3>Your name</h3><input id="nm" maxlength="24" placeholder="Name" value="${esc(store("name") || "")}"></div>
    <div class="grid2">
      <div class="card box"><h3>Host a game</h3><p class="small mute">Start a room and share the code.</p><button class="btn pri big" data-act="create">Create game</button></div>
      <div class="card box"><h3>Join a game</h3><input class="big" id="jc" maxlength="4" placeholder="CODE" value="${esc(st.room || "")}"><button class="btn pri" data-act="join">Join</button></div>
    </div>
    <div class="card row wrap"><div class="grow"><b>Big-screen view</b><div class="small mute">For the projector. Shows the draft and the race, no controls.</div></div><input id="wc" maxlength="4" placeholder="CODE" style="width:90px;text-transform:uppercase;text-align:center"><button class="btn" data-act="watch">Watch</button></div>
    ${saved && !st.watch ? `<div class="card row"><div class="grow">Rejoin room <span class="code">${esc(saved)}</span></div><button class="btn pri" data-act="rejoin">Rejoin</button></div>` : ""}
  </div>`;
}

// ---------- actions ----------
const A = {
  create() { store("name", nameVal()); intent = { t: "create", name: nameVal() }; if (!st.ws || st.ws.readyState > 1) connect(); else st.ws.send(JSON.stringify({ token: st.token, ...intent })); },
  join() { const c = ($("#jc")?.value || "").toUpperCase(); if (c.length < 4) return toast("Enter the 4-letter code."); store("name", nameVal()); intent = { t: "join", room: c, name: nameVal() }; if (!st.ws || st.ws.readyState > 1) connect(); else st.ws.send(JSON.stringify({ token: st.token, ...intent })); },
  rejoin() { intent = { t: "join", room: store("room"), name: store("name") || "Player" }; if (!st.ws || st.ws.readyState > 1) connect(); else st.ws.send(JSON.stringify({ token: st.token, ...intent })); },
  watch() { const c = ($("#wc")?.value || "").toUpperCase() || st.room; if (!c || c.length < 4) return toast("Enter the 4-letter code."); intent = { t: "watch", room: c }; if (!st.ws || st.ws.readyState > 1) connect(); else st.ws.send(JSON.stringify({ token: st.token, ...intent })); },
  livery(a) { send({ t: "livery", slug: a.slug }); },
  start() { send({ t: "start" }); },
  pause() { send({ t: "pause" }); }, resume() { send({ t: "resume" }); }, skip() { send({ t: "skip" }); }, cont() { send({ t: "continue" }); },
  copy() { navigator.clipboard?.writeText(`${location.origin}/?room=${st.S.room}`); toast("Link copied"); },
  leave() { store("room", null); intent = null; st.ws?.close(); landing(); history.replaceState(null, "", "/"); },
  stTab(a) { st.ui.stTab = a.tab === "drivers" ? "drivers" : "teams"; render(); },
  chatSend() { const i = $("#chatin"); if (i && i.value.trim()) { send({ t: "chat", text: i.value }); i.value = ""; } },
};
Object.assign(A, draftHandlers, raceHandlers, offHandlers, helpHandlers, tradeHandlers);

app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const f = A[b.dataset.act]; if (f) { e.preventDefault(); f({ ...b.dataset }, b); }
});
app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "teamname") send({ t: "teamName", name: t.value });
  if (t.dataset.set) { const s = {}; s[t.dataset.set] = t.type === "checkbox" ? t.checked : (isNaN(+t.value) ? t.value : +t.value); send({ t: "settings", s }); }
  if (t.dataset.change && A[t.dataset.change]) A[t.dataset.change]({ ...t.dataset, value: t.type === "checkbox" ? t.checked : t.value }, t);
});
app.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "chatin") A.chatSend(); if (e.key === "Enter" && e.target.id === "jc") A.join(); });
app.addEventListener("input", (e) => { if (e.target.id === "filter") { st.ui.q = e.target.value; render(); const f = $("#filter"); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } } });

// ---------- rendering ----------
const PHASE = {
  lobby: () => "Lobby", "draft.pick": (S) => `First draft · round ${S.draft?.round}/7`, "draft.reveal": (S) => `First draft · round ${S.draft?.round}/7 results`, "draft.done": () => "Line-ups set",
  "season.intro": (S) => `Season ${S.seasonNo}`, "season.end": (S) => `Season ${S.seasonNo} complete`,
  trade: () => "Off-season · trade window", trade2: () => "Off-season · final trades", parts: () => "Off-season · parts re-draft", "parts.turn": () => "Off-season · parts re-draft", fa: () => "Off-season · free agency", "fa.turn": () => "Off-season · free agency", lock: () => "Off-season · lock-in", "offseason.done": () => "New line-ups",
};
function phaseLabel(S) {
  if (S.step.startsWith("race.")) return `Season ${S.seasonNo} · race ${S.race.round + 1}/18`;
  return (PHASE[S.step] || (() => S.step))(S);
}

function renderTop() {
  const S = st.S;
  const mt = myTeam(); const bslug = mt && mt.livery ? mt.livery : (S.players && (S.players.find((q) => q.you) || {}).livery);
  const bn = bslug && !st.watch ? ` style="--banner:url(/liveries/${esc(bslug)}/banner.png)"` : "";
  el.top.innerHTML = `<div class="top"${bn}><span class="logo"><b>●</b> Driver Draft</span><span class="code" title="Room code">${esc(S.room)}</span><span class="phase">${esc(phaseLabel(S))}</span>${S.paused ? `<span class="paused">PAUSED</span>` : ""}<span class="timer" id="timer"></span>${st.watch ? "" : `<button class="helpbtn" data-act="help" title="How to play" aria-label="How to play">?</button>`}</div>`;
  tick();
}
function tick() {
  const t = $("#timer"); if (!t || !st.S) return;
  const r = remaining();
  if (r == null || ["season.end", "lobby"].includes(st.S.step)) { t.textContent = ""; return; }
  t.textContent = fmtClock(r); t.classList.toggle("low", r < 6000 && r > 0);
}
setInterval(tick, 250);

function standingsCard(S, limit = 99) {
  if (!S.teams || (!S.history.length && S.phase === "draft")) return "";
  const me = S.me?.teamId;
  const last = S.reveal?.kind === "finish" ? S.reveal.points : null;
  const tab = st.ui.stTab === "drivers" ? "drivers" : "teams";
  // While the race animation plays, hold the standings back so the result is not spoiled.
  const hold = S.step === "race.finish" && Date.now() < (st.ui.holdUntil || 0);
  let rows;
  if (tab === "teams") {
    const gain = (id) => (last ? (last[id * 2] || 0) + (last[id * 2 + 1] || 0) : 0);
    let order = S.standings, pts = (id) => S.teams[id].pts;
    if (hold) { pts = (id) => S.teams[id].pts - gain(id); order = S.standings.slice().sort((a, b) => pts(b) - pts(a)); }
    rows = order.slice(0, limit).map((id, i) => {
      const t = S.teams[id], d = hold ? 0 : gain(id);
      return `<div class="r ${id === me ? "me" : ""}"><span class="p">${i + 1}</span>${chip(t, 20, "", true)}<span class="dl">${d ? "+" + d : ""}</span><span class="pts">${pts(id)}</span></div>`;
    }).join("");
  } else {
    const gain = (r) => (last ? last[r.car] || 0 : 0);
    let list = S.driverStandings || [], pts = (r) => r.pts;
    if (hold) { pts = (r) => r.pts - gain(r); list = list.slice().sort((a, b) => pts(b) - pts(a) || b.wins - a.wins || a.car - b.car); }
    rows = list.map((r, i) => {
      const t = S.teams[r.team], d = hold ? 0 : gain(r);
      return `<div class="r ${r.team === me ? "me" : ""}"><span class="p">${i + 1}</span><span class="tchip">${iconHTML(t.livery, 20)}<span class="n">${esc(drvName(r.ref))} <span class="own">${esc(t.name)}</span></span></span><span class="dl">${d ? "+" + d : ""}</span><span class="pts">${pts(r)}</span></div>`;
    }).join("") || `<div class="mute small" style="padding:8px">No races yet.</div>`;
  }
  return `<div class="card"><div class="sttabs"><h3>Standings</h3><div class="grow"></div><button class="${tab === "teams" ? "on" : ""}" data-act="stTab" data-tab="teams">Teams</button><button class="${tab === "drivers" ? "on" : ""}" data-act="stTab" data-tab="drivers">Drivers</button></div><div class="st ${tab === "drivers" ? "scrolly" : ""}" data-keep="stlist">${rows}</div></div>`;
}
function chatCard(S) {
  if (st.watch) return "";
  return `<div class="card chat"><h3>Chat</h3><div class="log" id="chatlog">${S.chat.map((c) => `<div><b>${esc(c.name)}</b> ${esc(c.text)}</div>`).join("") || `<span class="mute small">Say something to the room.</span>`}</div><div class="row"><input id="chatin" class="grow" maxlength="160" placeholder="Message"><button class="btn sm" data-act="chatSend">Send</button></div></div>`;
}

function garage(S) {
  const me = S.me; if (!me) return "";
  const t = team(me.teamId); if (!t) return "";
  const cell = (k, v, need) => `<div class="g ${v ? "" : need ? "need empty" : "empty"}"><span class="k">${k}</span><span>${v ? esc(v) : "—"}</span></div>`;
  const parts = ["aero", "engine", "susp", "cool"].map((s) => cell({ aero: "Aero", engine: "Engine", susp: "Suspension", cool: "Cooling" }[s], t.parts[s] ? itemLabel(t.parts[s]).replace(/^\S+ /, "") : null, me.needs.slots.includes(s)));
  return `<div class="garage" data-keep="garage">${cell("Driver 1", t.drivers[0] != null ? drvName(t.drivers[0]) : null, me.needs.driver > 0)}${cell("Driver 2", t.drivers[1] != null ? drvName(t.drivers[1]) : null, me.needs.driver > 1)}${cell("Principal", t.principal != null ? prnName(t.principal) : null, me.needs.principal > 0)}${parts.join("")}</div>`;
}

function hostBar(S) {
  if (!S.host || S.step === "lobby") return "";
  const cont = S.step === "season.end" ? `<button class="btn pri" data-act="cont">Start off-season</button>` : "";
  return `<div class="hostbar">${cont}<button class="btn sm" data-act="${S.paused ? "resume" : "pause"}">${S.paused ? "▶ Resume" : "⏸ Pause"}</button><button class="btn sm" data-act="skip">Skip ⏭</button></div>`;
}

function lobby(S) {
  const you = S.players.find((p) => p.you);
  const taken = new Map(S.players.filter((p) => p.livery).map((p) => [p.livery, p]));
  const humans = S.players.length, fill = Math.max(0, S.settings.minTeams - humans);
  const livs = st.liv.map((l) => {
    const owner = taken.get(l.slug), sel = you && you.livery === l.slug;
    return `<button class="liv ${sel ? "sel" : ""} ${owner && !sel ? "taken" : ""}" data-act="livery" data-slug="${l.slug}" style="background:linear-gradient(160deg,${l.bgd},var(--panel2) 70%)">
      <div class="row">${iconHTML(l.slug, 36)}<div class="nm">${esc(l.name)}</div></div>
      <div class="sw">${l.colors.map((c) => `<i style="background:${c}"></i>`).join("")}</div>
      <div class="tag">${owner && !sel ? "Taken by " + esc(owner.name) : esc(l.tagline || " ")}</div></button>`;
  }).join("");
  const s = S.settings, hostOnly = S.host ? "" : "disabled";
  const sel = (k, opts) => `<select data-set="${k}" ${hostOnly}>${opts.map(([v, l]) => `<option value="${v}" ${String(s[k]) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const main = `<div class="card"><div class="row wrap"><div><h3>Room code</h3><div class="hero" style="font-size:54px;letter-spacing:.2em">${esc(S.room)}</div></div><div class="grow"></div>
      <div class="col" style="align-items:flex-end"><button class="btn" data-act="copy">Copy join link</button><span class="small mute">or open <b>/screen</b> on the projector</span></div></div></div>
    <div class="card"><h3>Your team</h3>
      <div class="row wrap"><span class="mute small">Pick a livery. It sets your colours and a default team name, which you can change.</span></div>
      <div class="row mt"><input id="teamname" class="grow" maxlength="28" placeholder="Team name" value="${esc(you?.teamName || "")}"></div></div>
    <div class="card"><h3>Livery</h3><div class="livgrid">${livs}</div></div>`;
  const side = `<div class="card"><h3>Players (${humans})</h3><div class="plist">${S.players.map((p) => `<div class="pl"><span class="dot ${p.connected ? "on" : ""}"></span>${p.livery ? iconHTML(p.livery, 26) : `<span class="ico" style="--s:26px"></span>`}<div class="grow"><b>${esc(p.name)}</b>${p.host ? ` <span class="pill acc">host</span>` : ""}<div class="small mute">${esc(p.teamName || "no livery yet")}</div></div></div>`).join("")}</div>
      ${fill ? `<p class="small mute mt">${fill} autopilot team${fill > 1 ? "s" : ""} will fill the grid up to ${s.minTeams}. They draft for themselves and never gamble.</p>` : ""}</div>
    <div class="card"><h3>Game settings ${S.host ? "" : `<span class="tiny">(host only)</span>`}</h3><div class="set">
      <span class="small">Minimum teams</span>${sel("minTeams", [10, 12, 14, 16, 18, 20, 24, 30].map((n) => [n, n]))}
      <span class="small">Show pace</span>${sel("pace", [[1.4, "Relaxed"], [1, "Normal"], [0.7, "Fast"], [0.5, "Turbo"]])}
      <span class="small">Draft timer</span>${sel("draftSec", [[30, "30 s"], [45, "45 s"], [60, "60 s"], [90, "90 s"]])}
      <span class="small">Pop-up timer</span>${sel("popupSec", [[10, "10 s"], [15, "15 s"], [20, "20 s"], [30, "30 s"]])}
      <span class="small">Parts re-draft turn</span>${sel("partsSec", [[8, "8 s"], [12, "12 s"], [20, "20 s"], [30, "30 s"]])}
      <span class="small">Off-season trading</span><label><input type="checkbox" data-set="trading" ${s.trading !== false ? "checked" : ""} ${hostOnly}> on</label>
      <span class="small">Trade window</span>${sel("tradeSec", [[90, "90 s"], [150, "2½ min"], [240, "4 min"], [360, "6 min"]])}
      <span class="small">Re-draft order</span>${sel("redraft", [["straight", "Worst picks first"], ["snake", "Snake"]])}
      <span class="small">Pop-up decisions</span><label><input type="checkbox" data-set="decisions" ${s.decisions ? "checked" : ""} ${hostOnly}> on</label></div>
      ${S.host ? `<button class="btn pri big mt2" style="width:100%" data-act="start">Start game</button>` : `<p class="small mute mt">Waiting for the host to start.</p>`}</div>
    ${chatCard(S)}`;
  return { main, side };
}

function teamsList(S) {
  if (!S.teams) return "";
  return `<div class="card"><h3>Teams</h3><div class="st">${S.teams.map((t) => `<div class="r ${S.me?.teamId === t.id ? "me" : ""}" style="grid-template-columns:1fr auto">${chip(t, 20)}<span class="tiny mute">${t.human ? (t.connected ? "" : "offline") : "auto"}</span></div>`).join("")}</div></div>`;
}

let lastKey = "";
function render() {
  const S = st.S; if (!S) return;
  applyTheme();
  renderTop();
  maybeHelp(S);
  const isRace = S.phase === "season" && S.step.startsWith("race.");
  let main = "", side = "", full = false;
  if (S.step === "lobby") ({ main, side } = lobby(S));
  else if (S.phase === "draft" || (S.phase === "season" && S.step === "season.intro" && false)) ({ main, side } = draftView(S, { standingsCard, chatCard, teamsList }));
  else if (isRace) { side = standingsCard(S) + chatCard(S); }
  else if (S.step === "season.intro" || S.step === "season.end" || S.phase === "offseason" || S.step === "draft.done") ({ main, side } = offView(S, { standingsCard, chatCard, teamsList }));
  else { main = `<div class="card">Loading…</div>`; }

  const body = el.body;
  const key = isRace ? "race" : "other";
  if (!$(".page", body)) body.innerHTML = `<div class="page"><div class="main" id="mainwrap"></div><div class="side" id="sidewrap"></div></div>`;
  const page = $(".page", body);
  page.classList.toggle("full", st.watch && S.step.startsWith("draft") && false);
  const mw = $("#mainwrap"), sw = $("#sidewrap");
  const keepScroll = $$("[data-keep]").map((n) => [n.dataset.keep, n.scrollTop, n.scrollLeft]);
  const typed = $$("input[id], textarea[id]").filter((n) => n.type !== "checkbox" && n.type !== "radio").map((n) => [n.id, n.value]);
  const fo = document.activeElement && document.activeElement.id;
  const fsel = fo && document.activeElement.selectionStart != null ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  if (isRace) {
    if (!raceActive()) { mw.innerHTML = ""; }
    raceUpdate(S, mw);
  } else {
    if (raceActive()) raceReset();
    mw.innerHTML = main;
  }
  sw.innerHTML = side;
  el.garage.innerHTML = st.watch ? "" : garage(S);
  el.host.innerHTML = hostBar(S);
  for (const [k, top, left] of keepScroll) { const n = $(`[data-keep="${k}"]`); if (n) { n.scrollTop = top; n.scrollLeft = left; } }
  for (const [id, val] of typed) { const n = document.getElementById(id); if (n && n.value !== val) n.value = val; } // what you are typing stays put
  if (fo && $("#" + fo)) { const n = $("#" + fo); if (document.activeElement !== n) { n.focus(); if (fsel && n.setSelectionRange) try { n.setSelectionRange(fsel[0], fsel[1]); } catch (e) {} } }
  const log = $("#chatlog"); if (log) log.scrollTop = log.scrollHeight;
  lastKey = key;
}
st.render = render;
window.__st = st;

// ---------- boot ----------
if (st.watch && st.room) { intent = { t: "watch", room: st.room }; connect(); }
else if (st.room && store("name")) { intent = { t: "join", room: st.room, name: store("name") }; connect(); }
else landing();
if (st.watch && !st.room) landing();
