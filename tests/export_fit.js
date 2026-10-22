// Export one row per team-season: ranks of its items and the points it scored. fit_values.py turns this into pick values.
import { writeFileSync } from "node:fs";
import { D, createGame, draft, playSeason } from "./lib.js";
const G = +process.argv[2] || 3000, N = 30;
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const draftResolve = process.argv[5] || "lottery";
const dRank = new Array(D.drivers.length), pRank = new Array(D.principals.length);
D.drivers.map((d, i) => i).sort((a, b) => D.drivers[b].overall - D.drivers[a].overall).forEach((i, k) => (dRank[i] = k + 1));
D.principals.map((d, i) => i).sort((a, b) => D.principals[b].overall - D.principals[a].overall).forEach((i, k) => (pRank[i] = k + 1));
const rows = ["d1,d2,pr,aero,engine,susp,cool,pts,champ"];
for (let g = 0; g < G; g++) {
  const game = createGame({ D, N, seed: 20000 + g, params, draftResolve });
  draft(game);
  const s = playSeason(game);
  for (const t of game.teams) rows.push([dRank[t.drivers[0]], dRank[t.drivers[1]], pRank[t.principal], t.parts.aero, t.parts.engine, t.parts.susp, t.parts.cool, t.pts, s.champion.id === t.id ? 1 : 0].join(","));
}
writeFileSync(process.argv[3] || "/tmp/fit.csv", rows.join("\n"));
