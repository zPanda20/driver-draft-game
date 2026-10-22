// End-to-end: start the real server, connect scripted players over WebSocket, play a full season plus off-season.
import { spawn } from "node:child_process";
import WebSocket from "ws";
const PORT = 3111;
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "60", DATA_DIR: "/tmp/ddg-e2e" }, stdio: ["ignore", "pipe", "pipe"] });
srv.stdout.on("data", (d) => process.stdout.write("[srv] " + d)); srv.stderr.on("data", (d) => process.stdout.write("[srv-err] " + d));
await new Promise((r) => setTimeout(r, 1200));
const SEASONS = +process.argv[2] || 2, PLAYERS = +process.argv[3] || 3;

class Client {
  constructor(name, tok) { this.name = name; this.token = tok; this.cat = null; this.s = null; this.log = []; }
  open() { return new Promise((res) => { this.ws = new WebSocket(`ws://localhost:${PORT}/ws`); this.ws.on("open", res); this.ws.on("message", (d) => this.onMsg(JSON.parse(d))); }); }
  send(m) { this.ws.send(JSON.stringify({ token: this.token, ...m })); }
  onMsg(m) {
    if (m.t === "hello") { this.cat = m.catalog; this.room = m.room; }
    if (m.t === "error") console.log(this.name, "ERROR", m.msg);
    if (m.t === "state") { this.s = m.s; this.react(); }
  }
  react() {
    const s = this.s, me = s.me; if (!me) return;
    const k = `${s.phase}/${s.step}/${s.draft?.round}/${s.parts?.idx}/${s.fa?.idx}/${s.race?.round}`;
    if (this.last === k && !(s.step === "race.pre" || s.step === "race.mid")) return;
    this.last = k;
    if (s.step === "draft.pick") {
      const needs = me.needs;
      const free = (a) => a.filter((x) => !s.taken[x.id]);
      const cands = [];
      if (needs.driver > 0) cands.push(...free(this.cat.drivers).sort((a, b) => b.overall - a.overall).slice(0, 5));
      if (needs.principal > 0) cands.push(...free(this.cat.principals).sort((a, b) => b.overall - a.overall).slice(0, 3));
      for (const sl of needs.slots) cands.push(...free(this.cat.parts.filter((p) => p.slot === sl)).sort((a, b) => b.bonus - a.bonus).slice(0, 2));
      const pri = cands[Math.floor(Math.random() * Math.min(cands.length, 4))], alt = cands[cands.length - 1];
      this.send({ t: "pick", pri: pri.id, alt: alt.id });
      setTimeout(() => this.send({ t: "lock" }), 20);
    }
    if ((s.step === "race.pre" || s.step === "race.mid") && me.popup && me.popup.took === null) this.send({ t: "popup", take: Math.random() < 0.6 });
    if (s.step === "parts.turn" && s.parts.team === me.teamId) {
      const free = this.cat.parts.filter((p) => !s.taken[p.id] && me.needs.slots.includes(p.slot)).sort((a, b) => b.bonus - a.bonus);
      this.send({ t: "partPick", id: free[0].id });
    }
    if (s.step === "fa.turn" && me.faTurn) {
      const d = this.cat.drivers.filter((x) => !s.taken[x.id]).sort((a, b) => b.overall - a.overall)[0];
      const p = this.cat.principals.filter((x) => !s.taken[x.id]).sort((a, b) => b.overall - a.overall)[0];
      this.send({ t: "faClaim", driver: d.id, principal: p.id });
    }
    if (s.step === "lock" && me.keep && !me.keep.confirmed) {
      const ds = me.keep.drivers.slice().sort((a, b) => this.cat.drivers[b].overall - this.cat.drivers[a].overall).slice(0, 2);
      const pr = me.keep.principals.slice().sort((a, b) => this.cat.principals[b].overall - this.cat.principals[a].overall)[0];
      this.send({ t: "keep", drivers: ds, principal: pr, confirm: true });
    }
  }
}
const host = new Client("host", "tok-host"); await host.open(); host.send({ t: "create", name: "Host" });
await new Promise((r) => setTimeout(r, 300));
const clients = [host];
for (let i = 1; i < PLAYERS; i++) { const c = new Client("p" + i, "tok-" + i); await c.open(); c.send({ t: "join", room: host.room, name: "P" + i }); clients.push(c); }
await new Promise((r) => setTimeout(r, 300));
host.send({ t: "settings", s: { minTeams: 10, popupSec: 20, draftSec: 60, partsSec: 30, faSec: 30, lockSec: 30, pace: 0.4 } });
clients[1].send({ t: "livery", slug: "castrol" });
host.send({ t: "start" });
let seasonsDone = 0, lastStep = "", t0 = Date.now(), seenSteps = new Set();
const iv = setInterval(() => {
  const s = host.s; if (!s) return;
  const stp = s.phase + "/" + s.step;
  if (stp !== lastStep) { lastStep = stp; seenSteps.add(stp); }
  if (s.step === "season.end" && !host.endHandled) { host.endHandled = true; seasonsDone++; const top = s.standings.slice(0, 3).map((id) => `${s.teams[id].name}:${s.teams[id].pts}`); console.log(`season ${s.seasonNo} done in ${((Date.now() - t0) / 1000).toFixed(0)}s; top: ${top.join(", ")}`); if (seasonsDone >= SEASONS) finish(); else host.send({ t: "continue" }); }
  if (s.step !== "season.end") host.endHandled = false;
}, 150);
function finish() {
  clearInterval(iv);
  console.log("steps seen:", [...seenSteps].join(" | "));
  const s = host.s; console.log("teams", s.teams.length, "history", s.history.length, "humans", s.teams.filter((t) => t.human).length);
  // sanity: every team has 2 drivers, a principal, 4 parts
  const bad = s.teams.filter((t) => t.drivers.length !== 2 || t.principal == null || Object.keys(t.parts).length !== 4);
  console.log("teams with incomplete line-ups:", bad.length);
  srv.kill(); process.exit(bad.length ? 1 : 0);
}
setTimeout(() => { console.log("TIMEOUT at", lastStep, host.s?.race?.round); srv.kill(); process.exit(2); }, 180000);
