// Season intro and end, the off-season parts re-draft, free agency, and the lock-in.
import { st, $, esc, send, chip, iconHTML, team, itemLabel, drvName, prnName, toast, SLOTNAME, drvPic } from "./core.js";
import { poolView, groupOf } from "./pool.js";
import { teamBoard, lineupsScreen } from "./draft.js";
import { tradeView, tradeList } from "./trade.js";
import { partsView, partsHandlers } from "./parts.js";

function trackOf(id) { return st.cat.tracks.find((t) => t.id === id); }

function calendar(S) {
  return `<div class="rgrid">${S.calendar.map((id, i) => { const t = trackOf(id); return `<div class="res"><b style="width:26px;color:var(--mute)">${i + 1}</b><div class="t"><div class="b2">${esc(t.name)}</div><div class="a">${esc(t.region)} · ${esc(t.type)}${t.street ? " · street" : ""}${t.highrain ? " · wet-prone" : ""}</div></div></div>`; }).join("")}</div>`;
}

function feedBox(S, kinds) {
  const rows = S.feed.filter((f) => kinds.includes(f.kind)).slice(-14).reverse().map((f) => {
    const t = team(f.team != null ? f.team : f.from);
    if (f.kind === "part") return `<div>${chip(t, 16)} took <b>${esc(itemLabel(f.item))}</b></div>`;
    if (f.kind === "trade") return `<div>${chip(t, 16)} traded ${tradeList(S, f.give)} to ${chip(team(f.to), 16)} for ${tradeList(S, f.get)}</div>`;
    if (f.kind === "claim") return `<div>${chip(t, 16)} signed ${f.driver ? `<b>${esc(itemLabel(f.driver))}</b>` : "no driver"}${f.principal ? ` and <b>${esc(itemLabel(f.principal))}</b>` : ""}</div>`;
    return "";
  }).join("");
  return `<div class="card"><h3>Latest</h3><div class="feed" data-keep="feed">${rows || `<span class="mute small">Nothing yet.</span>`}</div></div>`;
}

function history(S) {
  if (!S.history.length) return "";
  const rows = S.history.slice().reverse().map((h) => {
    const w = S.teams[h.order[0]], r = S.teams[h.order[1]], dc = h.dchamp, dt = dc && S.teams[dc.team];
    return `<tr><td class="l">Season ${h.season}</td><td class="l">${chip(w, 18, "", true)}<div class="tiny mute">2nd: ${esc(r.name)} · ${h.pts[1]}</div></td><td>${h.pts[0]}</td>
      <td class="l">${dc ? `<b>${esc(drvName(dc.ref))}</b><div class="tiny mute">${esc(dt.name)}${dt.owner ? " (" + esc(dt.owner) + ")" : ""}</div>` : `<span class="mute">–</span>`}</td><td>${dc ? dc.pts : ""}</td></tr>`;
  }).join("");
  // Drivers' titles so far, most first.
  const tally = new Map();
  for (const h of S.history) if (h.dchamp) tally.set(h.dchamp.ref, (tally.get(h.dchamp.ref) || 0) + 1);
  const titles = [...tally].sort((a, b) => b[1] - a[1]).map(([ref, n]) => `${esc(drvName(ref))}${n > 1 ? " ×" + n : ""}`).join(" · ");
  return `<div class="card hist"><h3>Champions, season by season</h3><div class="scroller" data-keep="hist"><table class="tbl"><thead><tr><th class="l">Season</th><th class="l">Teams' champion</th><th>Pts</th><th class="l">Drivers' champion</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table></div>${titles ? `<p class="small mute mt">Drivers' titles: ${titles}</p>` : ""}</div>`;
}

function seasonEnd(S, h) {
  const R = S.reveal, champ = S.teams[R.champion], me = S.me && S.me.teamId;
  const ds = (R.dstandings && R.dstandings.length ? R.dstandings : S.driverStandings) || [];
  const dc = ds[0], dt = dc && S.teams[dc.team];
  const tab = st.ui.fsTab === "drivers" ? "drivers" : "teams";
  const dchamp = dc ? `<div class="card champ dch"><div class="tr">🏅</div><div class="phase">Season ${R.season} drivers' champion</div><h2>${drvPic(dc.ref, 96, "big")}<br>${esc(drvName(dc.ref))}</h2><p class="mute">${esc(dt.name)}${dt.owner ? ` (${esc(dt.owner)})` : ""} · ${dc.pts} points · ${dc.wins} wins</p></div>` : "";
  const trows = R.standings.map((s, i) => { const t = S.teams[s.id]; return `<tr class="${s.id === me ? "pri" : ""}"><td class="l mute">${i + 1}</td><td class="l">${chip(t, 22, "", true)}</td><td>${s.wins}</td><td class="ovr">${s.pts}</td></tr>`; }).join("");
  const drows = ds.map((r, i) => { const t = S.teams[r.team]; return `<tr class="${r.team === me ? "pri" : ""}"><td class="l mute">${i + 1}</td><td class="l">${drvPic(r.ref, 24, "inl")}<b>${esc(drvName(r.ref))}</b> <span class="tiny mute">${esc(t.name)}</span></td><td>${r.wins}</td><td class="ovr">${r.pts}</td></tr>`; }).join("");
  const table = tab === "teams"
    ? `<table class="tbl"><thead><tr><th class="l">#</th><th class="l">Team</th><th>Wins</th><th>Pts</th></tr></thead><tbody>${trows}</tbody></table>`
    : `<table class="tbl"><thead><tr><th class="l">#</th><th class="l">Driver</th><th>Wins</th><th>Pts</th></tr></thead><tbody>${drows || `<tr><td colspan="4" class="mute">No driver data.</td></tr>`}</tbody></table>`;
  return `<div class="champrow"><div class="card champ"><div class="tr">🏆</div><div class="phase">Season ${R.season} teams' champions</div><h2>${iconHTML(champ.livery, 56)}<br>${esc(champ.name)}${champ.owner ? ` <span class="own">(${esc(champ.owner)})</span>` : ""}</h2><p class="mute">${R.standings[0].pts} points · ${R.standings[0].wins} wins</p></div>
    ${dchamp}</div>
    <div class="card"><div class="sttabs"><h3>Final standings</h3><div class="grow"></div><button class="${tab === "teams" ? "on" : ""}" data-act="fsTab" data-tab="teams">Teams</button><button class="${tab === "drivers" ? "on" : ""}" data-act="fsTab" data-tab="drivers">Drivers</button></div><div class="scroller" data-keep="fs">${table}</div></div>${history(S)}
    ${S.host ? "" : `<p class="small mute c">Waiting for the host to start the off-season…</p>`}`;
}

function faView(S, h) {
  const f = S.fa, me = S.me, myTurn = S.step === "fa.turn" && me && me.faTurn;
  const cur = f.team != null ? S.teams[f.team] : null;
  const dn = st.ui.faD ? itemLabel(st.ui.faD) : null, pn = st.ui.faP ? itemLabel(st.ui.faP) : null;
  const head = `<div class="card"><div class="row wrap"><div><div class="phase">Free agency · team ${Math.min(f.idx + 1, f.total)} of ${f.total}</div>
    <div class="rtitle">${myTurn ? "Your claim" : cur ? chip(cur, 30) + " is signing" : "Free agency"}</div></div><div class="grow"></div>
    ${f.upNext.length ? `<div class="col gap4"><span class="tiny mute">Up next</span><div class="row gap6 wrap">${f.upNext.map((id) => iconHTML(S.teams[id].livery, 24)).join("")}</div></div>` : ""}</div>
    <p class="small mute mt">Worst team first, each team may sign one free-agent driver and one free-agent principal. Afterwards you keep your best two drivers and one principal; the rest go back.</p>
    ${myTurn ? `<div class="row mt wrap"><span class="pill">${dn ? "Driver: " + esc(dn) : "No driver selected"}</span><span class="pill">${pn ? "Principal: " + esc(pn) : "No principal selected"}</span><div class="grow"></div><button class="btn pri big" data-act="faClaim">Sign them</button><button class="btn" data-act="faSkip">Skip</button></div>` : ""}</div>`;
  if (!me) return { main: head, side: feedBox(S, ["claim", "trade"]) + h.chatCard(S) };
  const pool = poolView(S, { mode: "fa", canAct: myTurn, tabs: ["drivers", "principals"], title: "Free agents" });
  return { main: head + pool, side: feedBox(S, ["claim", "trade"]) + h.standingsCard(S) + h.chatCard(S) };
}

function lockView(S, h) {
  const me = S.me, k = me && me.keep;
  const head = `<div class="card"><div class="phase">Lock-in</div><div class="rtitle">Choose who stays</div></div>`;
  if (!k) return { main: head + `<div class="card">${me ? "Your line-up is already set." : "Teams are choosing who to keep."} Waiting for ${S.lock.teams.length - S.lock.confirmed.length} team${S.lock.teams.length - S.lock.confirmed.length === 1 ? "" : "s"}…</div>`, side: h.chatCard(S) };
  if (!st.ui.keepD) { st.ui.keepD = (k.choice && k.choice.drivers) || k.drivers.slice().sort((a, b) => st.cat.drivers[b].overall - st.cat.drivers[a].overall).slice(0, 2); }
  if (st.ui.keepP == null) st.ui.keepP = (k.choice && k.choice.principal) ?? k.principals.slice().sort((a, b) => st.cat.principals[b].overall - st.cat.principals[a].overall)[0];
  const dcards = k.drivers.map((r) => { const d = st.cat.drivers[r], on = st.ui.keepD.includes(r); return `<button class="liv ${on ? "sel" : ""}" data-act="keepD" data-ref="${r}">${drvPic(r, 56)}<b>${esc(d.name)}</b><span class="small mute">OVR ${d.overall.toFixed(1)}</span></button>`; }).join("");
  const pcards = k.principals.map((r) => { const p = st.cat.principals[r], on = st.ui.keepP === r; return `<button class="liv ${on ? "sel" : ""}" data-act="keepP" data-ref="${r}"><b>${esc(p.name)}</b><span class="small mute">OVR ${p.overall.toFixed(1)}</span></button>`; }).join("");
  return { main: head + `<div class="card"><h3>Keep two drivers</h3><div class="livgrid">${dcards}</div></div>${pcards ? `<div class="card"><h3>Keep one principal</h3><div class="livgrid">${pcards}</div></div>` : ""}
    <div class="card row">${k.confirmed ? `<span class="locked-note">✓ Confirmed</span><div class="grow"></div><button class="btn" data-act="keepEdit">Change</button>` : `<span class="small mute">${st.ui.keepD.length === 2 ? "" : "Pick exactly two drivers."}</span><div class="grow"></div><button class="btn pri big" data-act="keepOk" ${st.ui.keepD.length === 2 ? "" : "disabled"}>Confirm</button>`}</div>`, side: h.chatCard(S) };
}

export function offView(S, h) {
  const step = S.step;
  if (step === "season.intro") return { main: `<div class="card"><div class="phase">New season</div><div class="rtitle">Season ${S.seasonNo}: the calendar</div>${S.points ? `<p class="small mute mt">Points: ${S.points.format} format. ${S.points.table.length} scoring places (${S.points.table.slice(0, 5).join(", ")}, …, ${S.points.table[S.points.table.length - 1]})</p>` : ""}</div><div class="card"><h3>18 races</h3>${calendar(S)}</div>`, side: h.teamsList(S) + h.chatCard(S) };
  if (step === "season.end") return { main: seasonEnd(S, h), side: h.chatCard(S) };
  if (step === "trade" || step === "trade2") return tradeView(S, h);
  if (step === "parts" || step === "parts.turn") return partsView(S, h, feedBox);
  if (step === "fa" || step === "fa.turn") return faView(S, h);
  if (step === "lock") return lockView(S, h);
  if (step === "offseason.done") { st.ui.keepD = null; st.ui.keepP = null; st.ui.faD = null; st.ui.faP = null; return { main: lineupsScreen(S, `Ready for season ${S.seasonNo + 1}`), side: h.standingsCard(S) + h.chatCard(S) }; }
  return { main: `<div class="card">…</div>`, side: "" };
}

export const offHandlers = {
  ...partsHandlers,
  fsTab(a) { st.ui.fsTab = a.tab === "drivers" ? "drivers" : "teams"; st.render(); },
  wish(a) {
    const me = st.S.me; if (!me) return;
    const key = a.key, set = me.wish.includes(key) ? me.wish.filter((k) => k !== key) : [...me.wish, key];
    send({ t: "wish", list: set });
  },
  partTake(a) { send({ t: "partPick", id: a.id }); },
  autoPick(a) { send({ t: "auto", on: !!a.value }); },
  faSel(a) { const it = st.idx[a.id]; if (it.kind === "driver") st.ui.faD = st.ui.faD === a.id ? null : a.id; else st.ui.faP = st.ui.faP === a.id ? null : a.id; st.render(); },
  faClaim() { send({ t: "faClaim", driver: st.ui.faD, principal: st.ui.faP }); st.ui.faD = st.ui.faP = null; },
  faSkip() { send({ t: "faClaim", driver: null, principal: null }); st.ui.faD = st.ui.faP = null; },
  keepD(a) { const r = +a.ref, cur = st.ui.keepD || []; st.ui.keepD = cur.includes(r) ? cur.filter((x) => x !== r) : cur.length >= 2 ? [cur[1], r] : [...cur, r]; send({ t: "keep", drivers: st.ui.keepD, principal: st.ui.keepP, confirm: false }); st.render(); },
  keepP(a) { st.ui.keepP = +a.ref; send({ t: "keep", drivers: st.ui.keepD, principal: st.ui.keepP, confirm: false }); st.render(); },
  keepOk() { send({ t: "keep", drivers: st.ui.keepD, principal: st.ui.keepP, confirm: true }); },
  keepEdit() { send({ t: "keep", drivers: st.ui.keepD, principal: st.ui.keepP, confirm: false }); },
};
