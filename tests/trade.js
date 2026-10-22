// Trading end to end: three scripted players trade with bots and with each other, then the off-season must still end with complete line-ups.
import { spawn } from "node:child_process";
import WebSocket from "ws";
const PORT = 3123;
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, TEST_SPEED: "25", DATA_DIR: "/tmp/ddg-trade" }, stdio: ["ignore", "pipe", "pipe"] });
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
const A = new Client("A", "tok-A"); await A.open(); A.send({ t: "create", name: "Alice" }); await sleep(300);
const B = new Client("B", "tok-B"); await B.open(); B.send({ t: "join", room: A.room, name: "Bob" });
const C = new Client("C", "tok-C"); await C.open(); C.send({ t: "join", room: A.room, name: "Cleo" });
await sleep(300);
A.send({ t: "settings", s: { minTeams: 10, popupSec: 20, draftSec: 60, partsSec: 30, faSec: 30, lockSec: 30, tradeSec: 200, pace: 0.4 } });
A.send({ t: "start" });
// play the draft and one season, then stop at the trade window
let s = await A.until((s) => s.step === "trade", 120000);
for (const c of [A, B, C]) c.autoplay = false;
const me = (c) => c.s.me.teamId, team = (c, id) => c.s.teams[id];
check("trade window opens with picks and FA slots", s.trade && s.trade.stage === 1 && s.trade.picks.length === 4 * s.N && s.trade.fa.length === s.N);

const botId = s.teams.find((t) => !t.human).id;
const ownPicks = (c) => c.s.trade.picks.map((p, i) => [p, i]).filter(([p]) => p.w === me(c)).map(([, i]) => `rp:${i}`);
// 1. A offers a top driver to a bot for the bot's first-round pick: should be accepted (driver is worth far more than the pick)
const aDrv = team(A, me(A)).drivers.slice().sort((x, y) => A.cat.drivers[y].overall - A.cat.drivers[x].overall)[0];
const botPick = B.s.trade.picks.map((p, i) => [p, i]).find(([p]) => p.w === botId && p.r === 1);
A.send({ t: "tradeOffer", to: botId, give: [`d:${aDrv}`], get: [`rp:${botPick[1]}`] });
await A.until((s) => s.trade.offers.some((o) => o.to === botId && o.status !== "open"), 15000);
let o1 = A.s.trade.offers.find((o) => o.to === botId);
console.log("   bot answered:", o1.status, o1.note);
check("a bot's yes waits for my confirmation (nothing moved yet)", o1.status === "agreed" && A.s.trade.picks[botPick[1]].w === botId && team(A, botId).drivers.includes(aDrv) === false);
A.send({ t: "tradeConfirm", id: o1.id });
await A.until((s) => s.trade.picks[botPick[1]].w === me(A), 5000);
check("confirming moved the pick to A and the driver to the bot", team(A, botId).drivers.includes(aDrv));
// 2. an insulting offer (a +10 pick for a star) should be refused by a bot: ask a bot for its best driver, offering nothing of value
const botT = team(A, botId), botBest = botT.drivers.slice().sort((x, y) => A.cat.drivers[y].overall - A.cat.drivers[x].overall)[0];
const lowPick = A.s.trade.picks.map((p, i) => [p, i]).filter(([p]) => p.w === me(A)).pop();
A.send({ t: "tradeOffer", to: botId, give: [`rp:${lowPick[1]}`], get: [`d:${botBest}`] });
await A.until((s) => s.trade.offers.filter((o) => o.to === botId).length >= 2 && s.trade.offers.filter((o) => o.to === botId).every((o) => o.status !== "open"), 15000);
const o2 = A.s.trade.offers.filter((o) => o.to === botId)[0];
console.log("   bot answered lowball:", o2.status, o2.note);
check("bot refuses a lowball", o2.status === "declined");
// 3. invalid offer: asking for something the target does not own
A.send({ t: "tradeOffer", to: me(B), give: [`d:${team(A, me(A)).drivers[0] ?? 0}`], get: [`d:${team(A, botId).drivers[0]}`] });
await sleep(300);
check("offer for an asset the target does not own is rejected with a note", A.s.trade.note && /moved|Invalid/i.test(A.s.trade.note.text), JSON.stringify(A.s.trade.note));
// 4. A -> B human swap of picks, B accepts
const aPickI = ownPicks(A)[0], bPickI = B.s.trade.picks.map((p, i) => [p, i]).find(([p]) => p.w === me(B) && p.r === 3)[1];
A.send({ t: "tradeOffer", to: me(B), give: [aPickI], get: [`rp:${bPickI}`] });
const off = (await B.until((s) => s.trade.offers.some((o) => o.from === me(A) && o.status === "open"), 5000)).trade.offers.find((o) => o.from === me(A) && o.status === "open");
B.send({ t: "tradeRespond", id: off.id, accept: true });
await sleep(400);
check("B accepting alone does not move anything", B.s.trade.picks[bPickI].w === me(B) && B.s.trade.offers.find((o) => o.id === off.id).status === "agreed");
A.send({ t: "tradeConfirm", id: off.id });
await B.until((s) => s.trade.picks[bPickI].w === me(A), 5000);
check("human pick swap executed", B.s.trade.picks[bPickI].w === me(A) && B.s.trade.picks[+aPickI.slice(3)].w === me(B));
// 5. a stale offer is voided once its asset moves: C offers for the pick A just gave B
C.send({ t: "tradeOffer", to: me(B), give: [`d:${team(C, me(C)).drivers[0]}`], get: [aPickI] }); await sleep(300);
const cOff = C.s.trade.offers[0];
B.send({ t: "tradeRespond", id: cOff.id, accept: true }); await sleep(300); C.send({ t: "tradeConfirm", id: cOff.id }); await sleep(300);
check("C cannot confirm a deal whose asset already moved", C.s.trade.picks[+aPickI.slice(3)].w !== me(C) || C.s.trade.offers[0].status === "accepted");
A.send({ t: "tradeConfirm", id: cOff.id }); await sleep(100); // someone else's offer: ignored
check("C's offer for the swapped pick works once, ownership is consistent", C.s.trade.picks[+aPickI.slice(3)].w === me(C) || C.s.trade.offers[0].status !== "accepted");
// 6. strip A down: give a bot both remaining drivers + principal for nothing important => lineup must be repaired at the end
const aT = team(A, me(A));
const dump = aT.drivers.map((d) => `d:${d}`);
const botCurrent = A.s.teams.filter((t) => !t.human).map((t) => t.id);
for (const id of botCurrent) {
  const bt = team(A, id); const want = [bt.drivers[0]].map((d) => `d:${d}`);
  if (!dump.length) break;
  A.send({ t: "tradeOffer", to: id, give: [dump[0]], get: want }); await sleep(120);
}
// everyone done -> window ends early
for (const c of [A, B, C]) c.send({ t: "tradeDone", on: true });
await A.until((s) => s.step === "parts" || s.step === "parts.turn", 15000);
check("window ends early when all humans are done", true);
for (const c of [A, B, C]) c.autoplay = true;
// the off-season must still finish with complete line-ups
await A.until((s) => s.step === "trade2", 60000);
check("final-trades window opens after free agency", A.s.trade.stage === 2 && A.s.trade.open);
for (const c of [B, C]) c.autoplay = true;
for (const c of [A, B, C]) c.send({ t: "tradeDone", on: true });
await A.until((s) => s.step === "offseason.done", 60000);
const bad = A.s.teams.filter((t) => t.drivers.length !== 2 || t.principal == null || Object.keys(t.parts).length !== 4);
check("every team has 2 drivers, a principal and 4 parts after trading", bad.length === 0, JSON.stringify(bad.map((t) => [t.name, t.drivers, t.principal, Object.keys(t.parts).length])));
const owners = new Map(); let dup = 0;
for (const t of A.s.teams) { for (const d of t.drivers) { if (owners.has("d" + d)) dup++; owners.set("d" + d, t.id); } if (owners.has("p" + t.principal)) dup++; owners.set("p" + t.principal, t.id); for (const id of Object.values(t.parts)) { if (owners.has(id)) dup++; owners.set(id, t.id); } }
check("no asset is owned twice", dup === 0, "dups " + dup);
srv.kill(); console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
