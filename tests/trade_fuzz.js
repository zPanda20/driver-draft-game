// Trade fuzz: three players fire random offers, answers and confirmations through two seasons of trade windows. Invariants must hold.
import { spawn } from "node:child_process";
import WebSocket from "ws";
const PORT = 3127;
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "25", DATA_DIR: "/tmp/ddg-fuzz" }, stdio: ["ignore", "pipe", "pipe"] });
srv.stderr.on("data", (d) => process.stdout.write("[srv-err] " + d));
await new Promise((r) => setTimeout(r, 1200));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); if (!ok) fails++; };

class Client {
  constructor(name, tok) { this.name = name; this.token = tok; this.s = null; this.cat = null; this.autoplay = true; }
  open() { return new Promise((res) => { this.ws = new WebSocket(`ws://localhost:${PORT}/ws`); this.ws.on("open", res); this.ws.on("message", (d) => this.onMsg(JSON.parse(d))); }); }
  send(m) { this.ws.send(JSON.stringify({ token: this.token, ...m })); }
  onMsg(m) { if (m.t === "hello") { this.cat = m.catalog; this.room = m.room; } if (m.t === "state") { this.s = m.s; if (this.autoplay) this.react(); } }
  react() {
    const s = this.s, me = s.me; if (!me) return;
    const k = `${s.step}/${s.draft?.round}/${s.parts?.idx}/${s.fa?.idx}`;
    if (this.last === k) return; this.last = k;
    if (s.step === "draft.pick") {
      const needs = me.needs, free = (a) => a.filter((x) => !s.taken[x.id]), cands = [];
      if (needs.driver > 0) cands.push(...free(this.cat.drivers).sort((a, b) => b.overall - a.overall).slice(0, 5));
      if (needs.principal > 0) cands.push(...free(this.cat.principals).sort((a, b) => b.overall - a.overall).slice(0, 3));
      for (const sl of needs.slots) cands.push(...free(this.cat.parts.filter((p) => p.slot === sl)).sort((a, b) => b.bonus - a.bonus).slice(0, 2));
      this.send({ t: "pick", pri: cands[0].id, alt: cands[cands.length - 1].id }); setTimeout(() => this.send({ t: "lock" }), 20);
    }
    if (s.step === "race.pre" || s.step === "race.mid") if (me.popup && me.popup.took === null) this.send({ t: "popup", take: false });
    if (s.step === "parts.turn" && s.parts.team === me.teamId) { const free = this.cat.parts.filter((p) => !s.taken[p.id] && me.needs.slots.includes(p.slot)).sort((a, b) => b.bonus - a.bonus); this.send({ t: "partPick", id: free[0].id }); }
    if (s.step === "fa.turn" && me.faTurn) { const d = this.cat.drivers.filter((x) => !s.taken[x.id]).sort((a, b) => b.overall - a.overall)[0], p = this.cat.principals.filter((x) => !s.taken[x.id]).sort((a, b) => b.overall - a.overall)[0]; this.send({ t: "faClaim", driver: d.id, principal: p.id }); }
    if (s.step === "lock" && me.keep && !me.keep.confirmed) {
      const ds = me.keep.drivers.slice().sort((a, b) => this.cat.drivers[b].overall - this.cat.drivers[a].overall).slice(0, 2);
      const pr = me.keep.principals.slice().sort((a, b) => this.cat.principals[b].overall - this.cat.principals[a].overall)[0];
      this.send({ t: "keep", drivers: ds, principal: pr, confirm: true });
    }
  }
  async until(fn, ms = 60000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (this.s && fn(this.s)) return this.s; await sleep(40); } throw new Error("timeout waiting (" + this.name + ") at " + this.s?.step); }
}

const rnd = (n) => Math.floor(Math.random() * n), pick = (a) => a[rnd(a.length)];
const A = new Client("A", "tok-A"); await A.open(); A.send({ t: "create", name: "Alice" }); await sleep(300);
const B = new Client("B", "tok-B"); await B.open(); B.send({ t: "join", room: A.room, name: "Bob" });
const C = new Client("C", "tok-C"); await C.open(); C.send({ t: "join", room: A.room, name: "Cleo" });
await sleep(300);
A.send({ t: "settings", s: { minTeams: 12, popupSec: 20, draftSec: 60, partsSec: 30, faSec: 30, lockSec: 30, tradeSec: 300, pace: 0.4 } });
A.send({ t: "start" });
const players = [A, B, C];
function mineAssets(c, tid) {
  const s = c.s, t = s.teams[tid], tr = s.trade, out = [];
  t.drivers.forEach((d) => out.push(`d:${d}`));
  [t.principal, t.principal2, ...(t.spare || [])].filter((x) => x != null).forEach((p) => out.push(`p:${p}`));
  if (tr.stage === 1) { tr.picks.forEach((p, i) => p.w === tid && out.push(`rp:${i}`)); tr.fa.forEach((p, i) => p.w === tid && out.push(`fa:${i}`)); }
  return out;
}
function chaos(c) {
  const s = c.s; if (!s || !s.trade || !s.me || !(s.step === "trade" || s.step === "trade2")) return;
  const me = s.me.teamId, r = rnd(10);
  if (r < 4) {
    const to = pick(s.teams.filter((t) => t.id !== me && (!t.human || t.connected)).map((t) => t.id)), mine = mineAssets(c, me), theirs = mineAssets(c, to);
    if (!mine.length || !theirs.length) return;
    const take = (a) => a.slice().sort(() => Math.random() - 0.5).slice(0, 1 + rnd(3));
    c.send({ t: "tradeOffer", to, give: take(mine), get: take(theirs) });
  } else if (r < 7) { const o = s.trade.offers.find((x) => x.to === me && x.status === "open"); if (o) c.send({ t: "tradeRespond", id: o.id, accept: Math.random() < 0.7 }); }
  else if (r < 9) { const o = s.trade.offers.find((x) => x.from === me && x.status === "agreed"); if (o) c.send({ t: "tradeConfirm", id: o.id }); }
  else { const o = s.trade.offers.find((x) => x.from === me && x.status === "open"); if (o && Math.random() < 0.3) c.send({ t: "tradeCancel", id: o.id }); }
}
const chaosTimer = setInterval(() => players.forEach(chaos), 70);
let seasons = 0, windows = 0, last = "";
const bad = [];
function invariants(s, where) {
  const owners = new Set();
  const dup = (k) => { if (owners.has(k)) bad.push(where + " duplicate " + k); owners.add(k); };
  for (const t of s.teams) { t.drivers.forEach((d) => dup("d" + d)); [t.principal, t.principal2, ...(t.spare || [])].filter((x) => x != null).forEach((p) => dup("p" + p)); }
  if (s.trade) { const own = new Map(); s.trade.picks.forEach((p, i) => { if (!s.teams[p.w]) bad.push(where + " pick with no owner " + i); }); s.trade.fa.forEach((p, i) => { if (!s.teams[p.w]) bad.push(where + " FA slot with no owner " + i); }); }
}
const iv = setInterval(() => {
  const s = A.s; if (!s) return;
  if (s.step !== last) { last = s.step; if (s.step === "trade" || s.step === "trade2") windows++; if (s.step === "season.end") { seasons++; if (seasons < 3) A.send({ t: "continue" }); } }
  if (s.trade && (s.step === "trade" || s.step === "trade2")) invariants(s, s.step);
  if (s.step === "offseason.done") {
    const wrong = s.teams.filter((t) => t.drivers.length !== 2 || t.principal == null || Object.keys(t.parts).length !== 4);
    if (wrong.length) bad.push("incomplete lineups: " + wrong.map((t) => t.name).join(","));
    invariants(s, "done");
  }
}, 80);
const t0 = Date.now();
while (Date.now() - t0 < 280000 && !(windows >= 4 && A.s.step === "offseason.done")) await sleep(300);
clearInterval(chaosTimer); clearInterval(iv);
check("two seasons with trade windows finished", windows >= 4, `seasons ${seasons} windows ${windows}`);
check("no invariant broke", bad.length === 0, bad.slice(0, 5).join(" | "));
srv.kill(); console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
