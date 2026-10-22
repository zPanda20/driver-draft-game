// The race screen: track card, pop-up decisions, and the shared animated timing tower.
import { st, $, esc, send, iconHTML, chip, team, lastName, drvName, toast, themeOf, drvPic, trkPic } from "./core.js";

let sumClosed = -1; // the round whose summary the player has dismissed
let RS = null; // persistent race-screen state: rows, last seen reveal, timers
const RH = 30;

export const raceActive = () => !!RS && !!$("#raceRoot");
export function raceReset() { if (RS) RS.timers.forEach(clearTimeout); RS = null; }

export const raceHandlers = {
  popupYes() { send({ t: "popup", take: true }); },
  popupNo() { send({ t: "popup", take: false }); },
  speedVote(a) { send({ t: "speedVote", dir: a.dir }); },
  speedSet(a) { send({ t: "pace", pace: +a.value }); },
  sumClose() { sumClosed = st.S.race.round; const e = $("#rSum"); if (e) e.innerHTML = ""; },
  jump(a) { const r = $(`#cr${a.car}`), s = $("#tscroll"); if (r && s) s.scrollTo({ top: Math.max(0, r.offsetTop - 80), behavior: "smooth" }); },
};

function trackOf(id) { return st.cat.tracks.find((t) => t.id === id); }
const tag = (c, l) => (c ? `<span class="pill">${l}</span>` : "");

// A tiny Start · Half · Finish rail, so the race has a visible shape.
function rail(S) {
  const at = S.step === "race.finish" ? 2 : S.step === "race.half" || S.step === "race.mid" ? 1 : 0;
  return `<span class="rail" title="Race progress">${["Start", "Half", "Finish"].map((l, i) => `<i class="${i < at ? "done" : i === at ? "now" : ""}">${l}</i>`).join("")}</span>`;
}

function header(S) {
  const t = trackOf(S.race.track), R = S.reveal;
  const rain = Math.round(t.rain * 100);
  const wet = R && (R.kind === "half" || R.kind === "finish") && R.round === S.race.round ? R.rain : null;
  const ov = t.ovt >= 8 ? "very hard" : t.ovt >= 6 ? "hard" : t.ovt >= 4 ? "medium" : "easy";
  return `<div class="rhead">${trkPic(t, 54)}<div><div class="phase">Round ${S.race.round + 1} of 18 · ${esc(t.region)} ${rail(S)}</div><div class="rtitle">${esc(t.name)}</div></div>
    <div class="tags">${tag(t.street, "Street")}${tag(t.power, "Power")}${tag(t.down, "Downforce")}${tag(t.highrain, "Wet-prone")}<span class="pill">${esc(t.type)}</span><span class="pill">Overtaking: ${ov}</span></div>
    <div class="grow"></div>
    <div class="col gap4" style="align-items:flex-end"><span class="small mute">Chance of rain ${rain}%</span><div class="rainbar"><i style="width:${rain}%"></i></div></div>
    ${wet != null ? `<div class="wx">${wet ? "🌧 Wet race" : "☀ Dry race"}</div>` : ""}</div>`;
}

const resultCard = (g) => {
  const pill = `<span class="pill">${g.phase === "pre" ? "Pre-race call" : "Mid-race call"}</span>`;
  if (g.outcome === null || g.outcome === undefined) return `<div class="popup done pend"><div class="row">${pill}<b>${esc(g.name)}</b><div class="grow"></div><span class="verdict">⏳ Weather decides, result at lights out</span></div></div>`;
  return `<div class="popup done ${g.outcome ? "won" : "lost"}"><div class="row">${pill}<b>${esc(g.name)}</b><div class="grow"></div><span class="verdict">${g.outcome ? "✅ It paid off!" : "❌ It backfired"}</span></div></div>`;
};

function popup(S) {
  const me = S.me; if (!me) return { html: "", result: false };
  const lines = (a) => (a.length ? a.map((x) => `<div>${esc(x)}</div>`).join("") : `<div class="mute">No change</div>`);
  const p = me.popup;
  if (p && (S.step === "race.pre" || S.step === "race.mid")) {
    if (p.took === true) return { html: resultCard(p), result: true };
    if (p.took === false) return { html: `<div class="popup done"><div class="row"><span class="pill">${p.phase === "pre" ? "Pre-race call" : "Mid-race call"}</span><b>${esc(p.name)}</b><div class="grow"></div><span class="small">You held course.</span></div></div>`, result: false };
    const bonus = p.base != null ? Math.round(p.pS * 100 - p.base) : 0;
    const statName = { strategy: "Strategy", mentality: "Mentality", mechanical: "Mechanical" }[p.stat];
    return { result: false, html: `<div class="popup">
    <div class="row"><span class="pill acc">${p.phase === "pre" ? "Pre-race call" : "Mid-race call"}</span><div class="grow"></div><span class="small mute">Your principal's ${statName} ${p.statVal}${bonus ? ` · ${bonus > 0 ? "+" : ""}${bonus}%` : ""}</span></div>
    <h2 class="mt">${esc(p.name)}</h2>
    ${p.text ? `<p class="small mute">${esc(p.text)}</p>` : ""}
    <div class="row mt"><div class="odds">${Math.round(p.pS * 100)}%</div><div class="small mute">${p.byRain ? "pays off only if it rains here" : "chance it works"}</div></div>
    <div class="eff"><div><b class="w">If it works</b>${lines(p.win)}</div><div><b class="l">If it doesn't</b>${lines(p.lose)}</div></div>
    <div class="acts"><button class="btn good" data-act="popupYes">Take the gamble</button><button class="btn" data-act="popupNo">Hold course</button></div></div>` };
  }
  if (me.gambles && (S.step === "race.half" || S.step === "race.finish")) return { html: me.gambles.map((g) => resultCard(g)).join(""), result: true };
  return { html: "", result: false };
}

// ---------- tower ----------
function buildRows(S) {
  const tw = $("#tower"); tw.innerHTML = ""; RS.rows = new Map();
  const n = S.teams.length * 2;
  tw.style.height = n * RH + "px";
  for (let ci = 0; ci < n; ci++) {
    const t = S.teams[ci >> 1], l = st.livBy[t.livery];
    const r = document.createElement("div");
    r.className = "cr hide" + (S.me && S.me.teamId === t.id ? " me" : ""); r.id = "cr" + ci;
    r.style.setProperty("--cb", l ? themeOf(l).acc : "#888"); r.style.top = ci * RH + "px";
    r.innerHTML = `<span class="pos"></span>${iconHTML(t.livery, 20)}<span class="dn">${esc(lastName(drvName(t.drivers[ci & 1])))}<small>${esc(t.name)}</small></span><span class="rt"></span>`;
    tw.appendChild(r); RS.rows.set(ci, r);
  }
}
function place(order, opts = {}) {
  const { grid, dnf, why, pts, N, out } = opts;
  const shown = new Set(order);
  order.forEach((ci, i) => {
    const r = RS.rows.get(ci); r.classList.remove("hide", "out"); r.style.top = i * RH + "px";
    r.querySelector(".pos").textContent = i + 1;
    let rt = "";
    if (grid && opts.delta) { const d = grid.indexOf(ci) - i; if (d > 0) rt += `<span class="up">▲${d}</span>`; else if (d < 0) rt += `<span class="dn2">▼${-d}</span>`; }
    if (pts && pts[ci]) rt += `<span class="pt">+${pts[ci]}</span>`;
    if (opts.label) rt += opts.label(ci, i);
    r.querySelector(".rt").innerHTML = rt;
  });
  let k = order.length;
  for (const ci of (out || [])) {
    const r = RS.rows.get(ci); r.classList.remove("hide"); r.classList.add("out"); r.style.top = k * RH + "px";
    r.querySelector(".pos").textContent = "–";
    const w = why && why[ci];
    r.querySelector(".rt").innerHTML = `<span class="dn2">${w === "crash" ? "💥 crash" : w === "failure" ? "🔧 failure" : "✖ out"}</span>`;
    k++;
  }
  for (const [ci, r] of RS.rows) if (!shown.has(ci) && !(out || []).includes(ci)) r.classList.add("hide");
  RS.cur = { order, out: out || [] };
  mycars(opts);
}
function mycars(opts = {}) {
  const S = st.S, me = S.me && S.me.teamId, box = $("#rMine"); if (!box || me == null || !RS.cur) return;
  const html = [me * 2, me * 2 + 1].map((ci) => {
    const i = RS.cur.order.indexOf(ci), outp = RS.cur.out.includes(ci);
    const t = S.teams[me];
    return `<div class="mycar" data-act="jump" data-car="${ci}" style="cursor:pointer"><div class="big">${i >= 0 ? "P" + (i + 1) : outp ? "OUT" : "–"}</div>${drvPic(t.drivers[ci & 1], 38)}<div><b>${esc(lastName(drvName(t.drivers[ci & 1])))}</b><div class="small mute">${esc(opts.caption || "")}</div></div></div>`;
  }).join("");
  box.innerHTML = html;
}

const sleep = (fn, ms) => { const h = setTimeout(fn, ms); RS.timers.push(h); };
const allCars = (S) => [...Array(S.teams.length * 2).keys()];

function animateHalf(S, R, animate) {
  const k = S.settings.pace || 1, n = S.teams.length * 2;
  const grid = R.grid, ord = R.order, out = grid.filter((c) => !ord.includes(c));
  const banner = $("#rBanner");
  banner.innerHTML = `<div class="banner">${R.rain ? "🌧 Rain at the start" : "☀ Dry start"} <span class="mute small">Starting grid</span></div>`;
  const finalHalf = () => { place(ord, { grid, delta: true, out, caption: "At half distance" }); banner.innerHTML = `<div class="banner">½ Half distance${R.sc ? ` <span class="banner sc" style="border:0;padding:0">🚨 Safety car</span>` : ""}${out.length ? ` <span class="mute small">${out.length} retired</span>` : ""}</div>`; };
  if (!animate) { finalHalf(); return; }
  for (const r of RS.rows.values()) r.classList.add("hide");
  RS.cur = { order: [], out: [] };
  // Cars outside the top 18 appear at once; the front of the grid is revealed from the back forward.
  const SHOW = 18, rev = grid.slice().reverse();
  const lowCars = rev.filter((ci) => grid.indexOf(ci) >= SHOW), topCars = rev.filter((ci) => grid.indexOf(ci) < SHOW);
  const reveal = (ci) => {
    const i = grid.indexOf(ci), r = RS.rows.get(ci);
    r.classList.remove("hide"); r.style.top = i * RH + "px"; r.querySelector(".pos").textContent = i + 1; r.querySelector(".rt").innerHTML = "";
    RS.cur = { order: grid.filter((c) => !RS.rows.get(c).classList.contains("hide")), out: [] }; mycars({ caption: "Starting grid" });
  };
  lowCars.forEach((ci, j) => sleep(() => reveal(ci), 400 + j * 12));
  const t0 = 600 + lowCars.length * 12, step = (4600 * k) / Math.max(1, topCars.length);
  topCars.forEach((ci, j) => sleep(() => reveal(ci), t0 + j * step));
  sleep(() => { place(grid, { caption: "Starting grid" }); }, t0 + topCars.length * step);
  sleep(finalHalf, 8200 * k);
}

function animateFinish(S, R, animate) {
  const k = S.settings.pace || 1, N = S.teams.length;
  const ord = R.order.filter((c) => !R.dnf[c]), out = R.order.filter((c) => R.dnf[c]);
  const half = R.half && R.half.length ? R.half : ord;
  const banner = $("#rBanner");
  const final = () => {
    place(ord, { grid: R.grid, delta: true, pts: R.points, out, why: R.why, caption: "Final classification" });
    const w = R.order[0], t = S.teams[w >> 1];
    banner.innerHTML = `<div class="banner">🏁 ${esc(lastName(drvName(t.drivers[w & 1])))} wins for ${esc(t.name)}</div>`;
    extras(S, R); showSummary(S, R);
  };
  if (!animate) { final(); return; }
  banner.innerHTML = `<div class="banner">🏁 Chequered flag</div>`;
  $("#rExtra").innerHTML = "";
  const hOut = R.grid.filter((c) => !half.includes(c));
  place(half, { grid: R.grid, delta: true, out: hOut, caption: "Half distance" });
  sleep(() => place(ord, { grid: R.grid, delta: true, out, why: R.why, caption: "Final classification" }), 1400 * k);
  sleep(() => { place(ord, { grid: R.grid, delta: true, pts: R.points, out, why: R.why, caption: "Final classification" }); }, 5200 * k);
  sleep(final, 8800 * k);
}

function extras(S, R) {
  const name = (ci) => { const t = S.teams[ci >> 1]; return `${esc(lastName(drvName(t.drivers[ci & 1])))} (${esc(t.name)})`; };
  const ev = [];
  for (const e of R.events) {
    if (e.type === "crash") ev.push(`💥 ${name(e.car)} crashed out (${e.half === 1 ? "first" : "second"} half)`);
    else if (e.type === "failure") ev.push(`🔧 ${name(e.car)} retired with a failure (${e.half === 1 ? "first" : "second"} half)`);
    else if (e.type === "pit") ev.push(`⏱ ${name(e.car)} lost time with a pit-stop error`);
    else if (e.type === "safety-car") ev.push(`🚨 Safety car in the ${e.half === 1 ? "first" : "second"} half`);
  }
  for (const m of R.movers.slice(0, 4)) ev.push(`📈 ${name(m.car)} went from P${m.from} to P${m.to}`);
  const dec = R.rec.map((r) => {
    const t = S.teams[r.team], nm = st.cat.options[r.opt] || r.opt;
    return `<div>${r.win ? "✅" : "❌"} ${esc(t.name)}: ${esc(nm)} ${r.win ? "paid off" : "backfired"}</div>`;
  });
  $("#rExtra").innerHTML = `<div class="grid2"><div class="card"><h3>Race report</h3><div class="ticker">${ev.map((x) => `<div>${x}</div>`).join("") || "<div class='mute'>A clean race.</div>"}</div></div>
    <div class="card"><h3>Gambles</h3><div class="ticker">${dec.join("") || "<div class='mute'>Nobody took a gamble.</div>"}</div></div></div>`;
}

// ---------- end-of-race summary pop-up ----------
const ord = (n) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
function summary(S, R) {
  const fin = R.order.filter((c) => !R.dnf[c]);
  if (!fin.length) return "";
  const drv = (ci) => S.teams[ci >> 1].drivers[ci & 1];
  const w = fin[0], wt = S.teams[w >> 1];
  const podium = [1, 0, 2].filter((i) => fin[i] != null).map((i) => {
    const ci = fin[i], t = S.teams[ci >> 1];
    return `<div class="pod p${i + 1} ${S.me && S.me.teamId === t.id ? "me" : ""}">${drvPic(drv(ci), i === 0 ? 54 : 44)}<b>${esc(lastName(drvName(drv(ci))))}</b><small>${iconHTML(t.livery, 16)} ${esc(t.name)}</small><div class="step">P${i + 1}</div></div>`;
  }).join("");
  const banner = `<div class="winner" style="--wb:url(/liveries/${esc(wt.livery)}/banner.png)"><div class="wk">Race winner</div><div class="wn">${esc(wt.name)}</div><div class="wd">${esc(drvName(drv(w)))}${wt.owner ? ` · driven by ${esc(wt.owner)}'s team` : " · autopilot"}</div></div>`;
  let mine = "";
  const me = S.me && S.me.teamId;
  if (me != null) {
    const half = R.half && R.half.length ? R.half : null;
    const cars = [me * 2, me * 2 + 1].map((ci) => {
      const pos = fin.indexOf(ci) + 1, gp = R.grid.indexOf(ci) + 1, why = R.dnf[ci] ? R.why[ci] : null;
      const hp = half ? half.indexOf(ci) + 1 : 0, pts = R.points[ci] || 0;
      const notes = [];
      if (why) notes.push(why === "crash" ? "💥 Crashed out" : why === "failure" ? "🔧 Retired with a failure" : "✖ Retired");
      for (const e of R.events) if (e.car === ci && e.type === "pit") notes.push("⏱ Pit-stop error");
      const mv = R.movers.find((m) => m.car === ci); if (mv && !why) notes.push(`📈 Climbed from P${mv.from} to P${mv.to}`);
      const d = why ? 0 : gp - pos;
      const dl = why ? "" : d > 0 ? `<span class="up">▲${d}</span>` : d < 0 ? `<span class="dn2">▼${-d}</span>` : `<span class="mute">–</span>`;
      return `<div class="mc"><div class="mp">${why ? "OUT" : "P" + pos}</div>${drvPic(drv(ci), 40)}<div class="mi"><b>${esc(drvName(drv(ci)))}</b><div class="small mute">Started P${gp}${why ? "" : ` · finished P${pos}`} ${dl}${hp && !why ? ` · P${hp} at half` : ""}</div>${notes.length ? `<div class="small">${notes.join(" · ")}</div>` : ""}</div><div class="mpts">${pts ? "+" + pts : "0"}<small>pts</small></div></div>`;
    }).join("");
    const gain = (t) => (R.points[t * 2] || 0) + (R.points[t * 2 + 1] || 0);
    const rankOf = (f) => { const l = S.teams.map((t) => ({ id: t.id, v: f(t) })).sort((a, b) => b.v - a.v || a.id - b.id); return l.findIndex((x) => x.id === me) + 1; };
    const now = rankOf((t) => t.pts), was = rankOf((t) => t.pts - gain(t.id)), g = gain(me);
    const mv = was - now;
    mine = `<div class="sumine"><h4>Your race</h4>${cars}<div class="mtot"><b>+${g} points</b> this race · ${ord(now)} in the championship ${mv > 0 ? `<span class="up">▲${mv}</span>` : mv < 0 ? `<span class="dn2">▼${-mv}</span>` : `<span class="mute">(no change)</span>`}</div></div>`;
  }
  return `<div class="sumback"><div class="sumcard" role="dialog" aria-label="Race summary"><div class="sumhead"><span class="phase">Round ${R.round + 1} · ${esc(R.track.name || trackOf(R.track).name)}</span></div>
    ${banner}<div class="podium">${podium}</div>${mine}
    <div class="sumact"><span class="small mute">The next race starts shortly.</span><button class="btn pri" data-act="sumClose">Continue</button></div></div></div>`;
}
function showSummary(S, R) {
  const el = $("#rSum"); if (!el) return;
  if (sumClosed === R.round) { el.innerHTML = ""; return; }
  if (!el.innerHTML) el.innerHTML = summary(S, R);
}

const SPEED_NAME = ["Relaxed", "Normal", "Fast", "Turbo"];
function speedBar(S) {
  const sp = S.speed; if (!sp || !S.me) return "";
  const lvl = sp.levels.indexOf(sp.pace);
  const vb = (dir, label, n) => `<button class="btn sm ${sp.mine === dir ? "voted" : ""}" data-act="speedVote" data-dir="${dir}" ${(dir === "up" ? lvl >= sp.levels.length - 1 : lvl <= 0) ? "disabled" : ""}>${label} <span class="vc">${n}/${sp.need}</span></button>`;
  const host = S.host ? `<select class="sm" data-change="speedSet">${sp.levels.map((p, i) => `<option value="${p}" ${p === sp.pace ? "selected" : ""}>${SPEED_NAME[i]}</option>`).join("")}</select>` : "";
  return `<div class="speedbar"><span class="small mute">Race speed</span><b>${SPEED_NAME[lvl]}</b><span class="small mute hide-s">Vote:</span>${vb("down", "⏪ Slower", sp.votes.down)}${vb("up", "Faster ⏩", sp.votes.up)}${host}</div>`;
}

export function raceUpdate(S, mw) {
  if (!RS || !$("#raceRoot")) {
    if (RS) RS.timers.forEach(clearTimeout);
    RS = { rows: new Map(), timers: [], seq: null, round: -1, step: "", cur: null, boot: true };
    mw.innerHTML = `<div id="raceRoot" class="col"><div class="card" id="rHead"></div><div class="rline"><div id="rBanner"></div><div id="rSpeed"></div></div>
      <div class="card"><div id="rMine" class="mycars"></div><div class="tscroll mt" id="tscroll" data-keep="tower" data-fit><div class="tower" id="tower"></div></div></div><div id="rExtra"></div><div id="rPopup"></div><div id="rSum"></div></div>`;
    buildRows(S);
  }
  const R = S.reveal, round = S.race.round;
  $("#rHead").innerHTML = header(S);
  { const sh = speedBar(S); if (RS.speedHTML !== sh) { RS.speedHTML = sh; $("#rSpeed").innerHTML = sh; } }
  { // gamble card: only touch the DOM when it changes; result cards fade out after a few seconds
    const pp = popup(S), el = $("#rPopup"), key = S.step + "|" + pp.html;
    if (RS.popKey !== key) {
      RS.popKey = key; RS.popHidden = false; clearTimeout(RS.popTimer);
      el.innerHTML = pp.html ? `<div class="popstack">${pp.html}</div>` : "";
      if (pp.result && (S.step === "race.half" || S.step === "race.finish")) { const r = RS; RS.popTimer = setTimeout(() => { r.popHidden = true; el.innerHTML = ""; }, 9000); }
    } else if (RS.popHidden) el.innerHTML = "";
  }
  const fresh = RS.seq !== (R && R.seq);
  if (RS.round !== round) {
    RS.timers.forEach(clearTimeout); RS.timers = [];
    RS.round = round; RS.seq = null; RS.cur = null;
    for (const r of RS.rows.values()) r.classList.add("hide");
    $("#rExtra").innerHTML = ""; $("#rMine").innerHTML = ""; $("#rSum").innerHTML = "";
  }
  const step = S.step;
  const isNew = R && RS.seq !== R.seq;
  if (step === "race.pre") {
    $("#rBanner").innerHTML = `<div class="banner">📋 Pre-race briefing <span class="small mute">${S.race.humanPopups ? S.race.humanPopups + " team" + (S.race.humanPopups > 1 ? "s have" : " has") + " a call to make" : "No calls this race"}</span></div>`;
  } else if (step === "race.half" && R && R.kind === "half" && R.round === round) {
    if (isNew) { RS.timers.forEach(clearTimeout); RS.timers = []; animateHalf(S, R, !RS.boot); RS.seq = R.seq; }
  } else if (step === "race.mid") {
    if (R && R.kind === "half" && R.round === round && (!RS.cur || RS.seq !== R.seq)) { animateHalf(S, R, false); RS.seq = R.seq; }
    $("#rBanner").innerHTML = `<div class="banner">½ Half distance <span class="small mute">${S.race.humanPopups ? "Mid-race calls open" : ""}</span></div>`;
  } else if (step === "race.finish" && R && R.kind === "finish" && R.round === round) {
    if (isNew) { RS.timers.forEach(clearTimeout); RS.timers = []; animateFinish(S, R, !RS.boot); RS.seq = R.seq; }
  }
  if (step !== "race.finish") $("#rSum").innerHTML = "";
  RS.boot = false;
}
