// A player who lets three choice windows run out goes idle; the room then stops waiting for them; any click brings them back.
import { Room } from "../server/room.js";
import { loadData } from "../engine/data.js";
import { readFileSync } from "node:fs";
import { validPick } from "../engine/draft.js";
process.env.TEST_SPEED = "50";
const D = loadData(), liveries = JSON.parse(readFileSync("data/liveries.json", "utf8"));
const room = new Room({ code: "TEST", D, liveries: liveries.liveries || liveries, hostToken: "a", onChange: () => {}, onSave: () => {} });
room.addPlayer("a", "Active"); room.addPlayer("b", "Sleepy");
room.setLivery("a", (liveries.liveries || liveries)[0].slug); room.setLivery("b", (liveries.liveries || liveries)[1].slug);
let fail = 0; const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fail++; };
room.start("a", 7);
const pa = room.players.get("a"), pb = room.players.get("b");
const anyPick = (name) => { const g = room.game, t = g.teams[room.players.get(name).teamId]; const all = [...g.items.drivers, ...g.items.principals, ...g.items.parts]; return all.find((x) => !x.taken && validPick(g, t, x.id)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await sleep(15); return f(); };

// Three draft rounds: "a" picks and locks, "b" does nothing.
for (let round = 1; round <= 3; round++) {
  await until(() => room.step === "draft.pick" && room.draftRound === round);
  const t = room.game.teams[pa.teamId];
  const it = room.game.pool ? null : null;
  const pick = anyPick("a");
  room.touch(pa); room.submitPick("a", pick.id, null); room.lockPick("a", true);
  await until(() => room.step === "draft.reveal");
  ok(true, `round ${round} resolved (Sleepy missed: ${pb.missed || 0})`);
}
ok(pb.idle === true, "Sleepy is idle after 3 missed rounds");
ok(!pa.idle, "Active is not idle");

// Round 4: Active locks quickly, the room must not wait the full timer for Sleepy.
await until(() => room.step === "draft.pick" && room.draftRound === 4);
const t0 = Date.now(), full = room.dur;
const pick = anyPick("a");
room.touch(pa); room.submitPick("a", pick.id, null); room.lockPick("a", true);
console.log("dbg", room.waitingOn().map((p)=>p.name+":"+p.idle), !!room.shortened, room.pending&&1, Math.round(room.deadline-Date.now()));
await until(() => room.step === "draft.reveal", 6000);
const took = Date.now() - t0;
ok(room.step === "draft.reveal", `round 4 resolved without waiting for the idle player (${took} ms, full timer ${Math.round(full)} ms)`);
ok(took < full / 2, "...well inside the normal timer");

// Round 5: Sleepy clicks something (wake) and gets the full time back.
await until(() => room.step === "draft.pick" && room.draftRound === 5);
room.wake(pb);
ok(pb.idle === false && pb.missed === 0, "a click brings Sleepy back online");
const pick2 = anyPick("a");
room.touch(pa); room.submitPick("a", pick2.id, null); room.lockPick("a", true);
await sleep(200);
ok(room.step === "draft.pick", "the round waits for the player who is back");
room.touch(pb); room.submitPick("b", anyPick("b").id, null); room.lockPick("b", true);
await until(() => room.step === "draft.reveal");
ok(room.step === "draft.reveal", "round resolves once both have locked");
room.clearTimer();
console.log(fail ? `${fail} FAILED` : "idle: all good");
process.exit(fail ? 1 : 0);
