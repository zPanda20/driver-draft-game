// Re-draft order: straight reverse standings vs snake. Eight seasons per game.
import { D, createGame, draft, playSeason, offseason, table, fmt } from "./lib.js";
const G = +process.argv[2] || 200, SEAS = 8, N = +process.argv[3] || 30;
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};
function spearman(a, b) {
  const n = a.length, ra = rk(a), rb = rk(b);
  const ma = (n + 1) / 2; let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  return num / Math.sqrt(da * db);
}
function rk(a) { const o = a.map((v, i) => i).sort((x, y) => a[y] - a[x]); const r = new Array(a.length); o.forEach((i, k) => (r[i] = k + 1)); return r; }
const rows = [];
for (const mode of ["straight", "snake", "none"]) {
  let rep = 0, repN = 0, corr = 0, corrN = 0, distinct = 0, fromBottom = 0, titles = 0, tops = {};
  for (let g = 0; g < G; g++) {
    const game = createGame({ D, N, seed: 3000 + g, params, redraft: mode === "snake" ? "snake" : "straight" });
    draft(game);
    let prev = null; const champs = new Set();
    for (let s = 0; s < SEAS; s++) {
      const res = playSeason(game);
      champs.add(res.champion.id);
      if (prev) {
        if (res.champion.id === prev.champion.id) rep++; repN++;
        const pa = game.teams.map((t) => prevPts[t.id]), pb = game.teams.map((t) => t.pts);
        corr += spearman(pa, pb); corrN++;
        const prevRank = rk(pa); if (prevRank[res.champion.id] > N / 2) fromBottom++; titles++;
      }
      var prevPts = game.teams.map((t) => t.pts);
      prev = res;
      if (mode === "none") {
        // parts re-drafted in random order (no catch-up), drivers and principals unchanged
        const shuffled = res.standings.slice().reverse().sort(() => Math.random() - 0.5);
        offseason(game, shuffled);
      } else offseason(game, res.standings);
    }
    distinct += champs.size;
  }
  rows.push([mode, fmt(100 * rep / repN, 0) + "%", fmt(corr / corrN, 2), fmt(distinct / G, 1), fmt(100 * fromBottom / titles, 0) + "%"]);
}
console.log(`${G} games x ${SEAS} seasons, N=${N}`);
table(rows, ["Re-draft order", "Champion repeats", "Rank correlation yr to yr", "Different champions in 8 seasons", "Titles from bottom half"]);
