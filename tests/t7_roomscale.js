// Small rooms: sweep the part-strength factor and see who wins titles. Target: ~75-80% of titles to teams holding a top-third driver, parts-first not dominant.
import { D, createGame, draft, playSeason, table, fmt } from "./lib.js";
const G = +process.argv[2] || 800;
const Ns = (process.argv[3] || "10,16,20").split(",").map(Number);
const Fs = (process.argv[4] || "0.25,0.4,0.6,0.8,1").split(",").map(Number);
const sorted = D.drivers.map((d, i) => i).sort((a, b) => D.drivers[b].overall - D.drivers[a].overall);
const ov = new Array(90); sorted.forEach((i, k) => (ov[i] = k + 1));
const rows = [];
for (const N of Ns) for (const f of Fs) {
  const cut = Math.max(3, Math.round(N / 3));
  let star = 0, starTeams = 0, pf = 0, pfTeams = 0, df = 0, dfTeams = 0, eliteT = 0, gap = 0;
  for (let g = 0; g < G; g++) {
    const game = createGame({ D, N, seed: 9000 + g, partFactor: f });
    draft(game);
    const s = playSeason(game);
    for (const t of game.teams) { const b = Math.min(...t.drivers.map((i) => ov[i])) <= cut; if (b) starTeams++; if (t.bot === "partsFan") pfTeams++; if (t.bot === "driverFan") dfTeams++; }
    const c = s.champion;
    if (Math.min(...c.drivers.map((i) => ov[i])) <= cut) star++;
    if (c.bot === "partsFan") pf++; if (c.bot === "driverFan") df++;
    gap += s.standings[0].pts - s.standings[1].pts;
  }
  rows.push([N, f, fmt(100 * star / G, 0) + "%", fmt(starTeams / G, 1), fmt(100 * pf / G / (pfTeams / G / N), 0) + "%", fmt(100 * df / G / (dfTeams / G / N), 0) + "%", fmt(gap / G, 0)]);
}
table(rows, ["Teams", "Part factor", "Titles to top-third drivers", "Such teams", "Parts-first, vs fair share", "Driver-first, vs fair share", "Margin pts"]);
