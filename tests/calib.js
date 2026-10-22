// First diagnostics: does the race model give plausible dominance, DNFs and title odds?
import { loadData } from "../engine/data.js";
import { createGame, draft, playSeason } from "../engine/season.js";

const D = loadData();
const games = +process.argv[2] || 400;
const N = +process.argv[3] || 30;
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};

const byRank = D.drivers.map((d) => d.rank);
const bucketOf = (rk) => (rk <= 10 ? "top10" : rk <= 20 ? "11-20" : rk <= 30 ? "21-30" : rk <= 45 ? "31-45" : "46+");
const buckets = ["top10", "11-20", "21-30", "31-45", "46+"];
const teamSeasons = Object.fromEntries(buckets.map((b) => [b, 0]));
const titles = Object.fromEntries(buckets.map((b) => [b, 0]));
let dnf = 0, rain = 0, sc = 0, races = 0, fastestWins = 0, top3speedWins = 0, ptsGap = 0, topShare = 0;
const winnerRankHist = new Array(11).fill(0);

for (let g = 0; g < games; g++) {
  const game = createGame({ D, N, seed: 1000 + g, params });
  draft(game);
  const s = playSeason(game, { collect: true });
  dnf += s.dnfRate;
  const bestRank = (t) => Math.min(...t.drivers.map((i) => byRank[i]));
  for (const t of game.teams) { const b = bucketOf(bestRank(t)); teamSeasons[b]++; }
  titles[bucketOf(bestRank(s.champion))]++;
  ptsGap += (s.standings[0].pts - s.standings[1].pts);
  const tot = s.standings.reduce((a, t) => a + t.pts, 0);
  topShare += s.standings[0].pts / (tot / N);
  for (const rl of s.raceLog) {
    races++;
    if (rl.res.rain) rain++;
    if (rl.res.sc[0] || rl.res.sc[1]) sc++;
    const win = rl.res.order[0];
    const rk = rl.res.speed.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const pos = rk.indexOf(win);
    if (pos === 0) fastestWins++;
    if (pos < 3) top3speedWins++;
    winnerRankHist[Math.min(10, Math.floor(pos / 2))]++;
  }
}
console.log(`games ${games}, N ${N}`);
console.log(`DNF rate ${(100 * dnf / games).toFixed(1)}%  rain races ${(100 * rain / races).toFixed(0)}%  safety-car races ${(100 * sc / races).toFixed(0)}%`);
console.log(`fastest car wins ${(100 * fastestWins / races).toFixed(0)}%, a top-3 car wins ${(100 * top3speedWins / races).toFixed(0)}%`);
console.log("winner's speed rank (pairs of cars, 1-2, 3-4, ...):", winnerRankHist.slice(0, 10).map((x) => (100 * x / races).toFixed(0)).join(" "));
console.log(`champion margin over 2nd ${(ptsGap / games).toFixed(0)} pts; champion points = ${(topShare / games).toFixed(2)} x average team`);
for (const b of buckets) console.log(`${b.padEnd(6)} teams ${teamSeasons[b] / games / 1 | 0}/season  titles ${(100 * titles[b] / games).toFixed(0)}%  per team ${(100 * titles[b] / teamSeasons[b]).toFixed(1)}%`);
