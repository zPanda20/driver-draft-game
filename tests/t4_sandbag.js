// Can a player take a junk pick to jump the queue? Team 0 plays sandbagger vs honest on the same seeds.
import { D, createGame, draft, playSeason, table, fmt } from "./lib.js";
const G = +process.argv[2] || 1500, N = +process.argv[3] || 30;
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const acc = { honest: { pts: 0, titles: 0, val: 0 }, sandbag: { pts: 0, titles: 0, val: 0 } };
const ovSorted = D.drivers.map((d, i) => i).sort((a, b) => D.drivers[b].overall - D.drivers[a].overall);
for (const mode of ["honest", "sandbag"]) {
  for (let g = 0; g < G; g++) {
    const arche = Array(N).fill("balanced"); if (mode === "sandbag") arche[0] = "sandbagger";
    const game = createGame({ D, N, seed: 4000 + g, params, archetypes: arche });
    draft(game);
    const t0 = game.teams[0];
    acc[mode].val += t0.pickValue;
    const s = playSeason(game);
    acc[mode].pts += t0.pts; if (s.champion.id === 0) acc[mode].titles++;
  }
}
console.log(`${G} drafts per row, seat 0 only, N=${N}`);
table(Object.entries(acc).map(([k, a]) => [k, fmt(a.val / G, 1), fmt(a.pts / G, 1), fmt(100 * a.titles / G, 1) + "%"]), ["Seat 0 plays", "Total pick value kept", "Mean season points", "Title chance"]);
