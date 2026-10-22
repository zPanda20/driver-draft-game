import { writeFileSync } from "node:fs";
import { D, createGame, draft, playSeason } from "./lib.js";
const G = +process.argv[2] || 1500, N = 30;
const rows = ["game,team,bot,dval,pval,cval,pts,champ"];
for (let g = 0; g < G; g++) {
  const game = createGame({ D, N, seed: 11000 + g });
  draft(game);
  const s = playSeason(game);
  for (const t of game.teams) {
    const dv = t.drivers.reduce((a, i) => a + game.items.drivers[i].base, 0);
    const pv = game.items.principals[t.principal].base;
    const cv = Object.values(t.partIds).reduce((a, id) => a + game.items.parts.find((p) => p.id === id).base, 0);
    rows.push([g, t.id, t.bot, dv.toFixed(1), pv.toFixed(1), cv.toFixed(1), t.pts, s.champion.id === t.id ? 1 : 0].join(","));
  }
}
writeFileSync(process.argv[3] || "/tmp/rows.csv", rows.join("\n"));
