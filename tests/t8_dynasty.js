// How likely is a dynasty? Over 10-season games: back-to-back titles, three-in-a-row, most titles by one team.
import { D, createGame, draft, playSeason, offseason, table, fmt } from "./lib.js";
const G = +process.argv[2] || 300, SEAS = 10, N = +process.argv[3] || 30;
const rows = [];
for (const mode of ["straight", "snake", "none"]) {
  let b2b = 0, pairs = 0, streak3 = 0, streak2 = 0, maxT = 0, over4 = 0, champsDistinct = 0, rankStar = 0, starN = 0;
  for (let g = 0; g < G; g++) {
    const game = createGame({ D, N, seed: 5000 + g, redraft: mode === "snake" ? "snake" : "straight" });
    draft(game);
    const seq = [];
    for (let s = 0; s < SEAS; s++) {
      const res = playSeason(game); seq.push(res.champion.id);
      if (mode === "none") offseason(game, res.standings.slice().reverse().sort(() => Math.random() - 0.5)); else offseason(game, res.standings);
    }
    const cnt = {}; seq.forEach((x) => (cnt[x] = (cnt[x] || 0) + 1));
    for (let i = 1; i < SEAS; i++) { pairs++; if (seq[i] === seq[i - 1]) b2b++; }
    let run = 1, best = 1; for (let i = 1; i < SEAS; i++) { run = seq[i] === seq[i - 1] ? run + 1 : 1; best = Math.max(best, run); }
    if (best >= 2) streak2++; if (best >= 3) streak3++;
    const m = Math.max(...Object.values(cnt)); maxT += m; if (m >= 4) over4++;
    champsDistinct += Object.keys(cnt).length;
  }
  rows.push([mode, fmt(100 * b2b / pairs, 0) + "%", fmt(100 * streak2 / G, 0) + "%", fmt(100 * streak3 / G, 0) + "%", fmt(maxT / G, 1), fmt(100 * over4 / G, 0) + "%", fmt(champsDistinct / G, 1)]);
}
console.log(`${G} games x ${SEAS} seasons, N=${N}`);
table(rows, ["Re-draft", "Any season repeats", "Games with a back-to-back", "Games with a three-peat", "Most titles by one team", "Games where one team wins 4+", "Different champions"]);
