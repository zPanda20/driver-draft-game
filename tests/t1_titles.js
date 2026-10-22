// Who wins titles? By driver quality, part quality, bot type and draft position, across lobby sizes.
import { D, createGame, draft, playSeason, offseason, table, fmt } from "./lib.js";
const G = +process.argv[2] || 1000;
const N = +process.argv[3] || 30;
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const draftResolve = process.argv[5] || "lottery", catchUp = +process.argv[6] || 1;
const rankOf = D.drivers.map((d) => d.rank);
const sortedIdx = D.drivers.map((d, i) => i).sort((a, b) => D.drivers[b].overall - D.drivers[a].overall);
const ovRank = new Array(D.drivers.length); sortedIdx.forEach((i, k) => (ovRank[i] = k + 1));
const best = (t) => Math.min(...t.drivers.map((i) => ovRank[i]));
const buckets = [["top 5", 1, 5], ["6-10", 6, 10], ["11-20", 11, 20], ["21-30", 21, 30], ["31-45", 31, 45], ["46+", 46, 99]];
const bOf = (rk) => buckets.find((b) => rk >= b[1] && rk <= b[2])[0];
const cnt = {}, tit = {}, arch = {}, archT = {}, posC = {}, posT = {}, eliteC = {}, eliteT = {};
let two = 0;
for (let g = 0; g < G; g++) {
  const game = createGame({ D, N, seed: 7000 + g, params, draftResolve, catchUp });
  draft(game);
  for (const t of game.teams) t.round1 = 0;
  const s = playSeason(game);
  for (const t of game.teams) {
    const b = bOf(best(t)); cnt[b] = (cnt[b] || 0) + 1;
    arch[t.bot] = (arch[t.bot] || 0) + 1;
    const e = Object.values(t.parts).filter((x) => x >= 30).length; eliteC[e] = (eliteC[e] || 0) + 1;
  }
  const c = s.champion;
  for (const t of game.teams) { const q = Math.min(3, Math.floor(((t.r1pos - 1) / N) * 4)); posC[q] = (posC[q] || 0) + 1; }
  { const q = Math.min(3, Math.floor(((c.r1pos - 1) / N) * 4)); posT[q] = (posT[q] || 0) + 1; }
  tit[bOf(best(c))] = (tit[bOf(best(c))] || 0) + 1;
  archT[c.bot] = (archT[c.bot] || 0) + 1;
  const e = Object.values(c.parts).filter((x) => x >= 30).length; eliteT[e] = (eliteT[e] || 0) + 1;
  if (c.drivers.every((i) => ovRank[i] <= 10)) two++;
}
console.log(`${G} games, N=${N}, season 1 after the first draft`);
const top10 = ["top 5", "6-10"].reduce((a, b) => a + (tit[b] || 0), 0), top10Teams = ["top 5", "6-10"].reduce((a, b) => a + (cnt[b] || 0), 0);
console.log(`Teams holding a top-10 driver win ${(100 * top10 / G).toFixed(0)}% of titles; each such team wins 1 season in ${(top10Teams / top10).toFixed(1)}`);
table(buckets.map(([n]) => [n, fmt((cnt[n] || 0) / G, 1), fmt(100 * (tit[n] || 0) / G, 0) + "%", fmt(100 * (tit[n] || 0) / (cnt[n] || 1), 1) + "%"]), ["Best driver on team", "Teams/season", "Share of titles", "Per team"]);
console.log("");
table(Object.keys(arch).map((a) => [a, fmt(arch[a] / G, 1), fmt(100 * (archT[a] || 0) / G, 0) + "%", fmt(100 * (archT[a] || 0) / arch[a], 1) + "%"]), ["Bot type", "Teams/season", "Share of titles", "Per team"]);
console.log("");
table(Object.keys(eliteC).sort().map((e) => [e, fmt(eliteC[e] / G, 1), fmt(100 * (eliteT[e] || 0) / G, 0) + "%", fmt(100 * (eliteT[e] || 0) / eliteC[e], 1) + "%"]), ["Parts at +30 or better", "Teams/season", "Share of titles", "Per team"]);
console.log("");
table([0, 1, 2, 3].map((q) => [["1st quarter (picks first)", "2nd quarter", "3rd quarter", "4th quarter"][q], fmt(100 * (posT[q] || 0) / G, 0) + "%", fmt(100 * (posT[q] || 0) / (posC[q] || 1), 1) + "%"]), ["Round-1 draft position", "Share of titles", "Per team"]);
