// A server restart should bring a room back at its last checkpoint (end of the season) with players able to rejoin.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import WebSocket from "ws";
const DIR = "/tmp/ddg-e2e", PORT = 3555;
const code = readdirSync(DIR + "/rooms")[0].replace(".json", "");
const srv = spawn("node", ["server/index.js"], { env: { ...process.env, PORT, DATA_DIR: DIR }, stdio: ["ignore", "pipe", "pipe"] });
srv.stdout.on("data", (d) => process.stdout.write("[srv] " + d));
await new Promise((r) => setTimeout(r, 1200));
const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
let n = 0;
ws.on("open", () => ws.send(JSON.stringify({ t: "join", room: code, token: "tok-host", name: "Host" })));
ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.t === "error") { console.log("ERROR", m.msg); process.exit(1); }
  if (m.t !== "state") return;
  const s = m.s; n++;
  if (n === 1) {
    console.log(`restored: step=${s.step} season=${s.seasonNo} teams=${s.teams.length} history=${s.history.length} host=${s.host} me.team=${s.me?.teamId} champion=${s.reveal?.champion}`);
    ws.send(JSON.stringify({ t: "continue", token: "tok-host" }));
  }
  if (s.step === "trade" || s.step === "parts" || s.step === "parts.turn") { console.log("moved on to", s.step); srv.kill(); process.exit(0); }
});
setTimeout(() => { console.log("TIMEOUT"); srv.kill(); process.exit(2); }, 15000);
