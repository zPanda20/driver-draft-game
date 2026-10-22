import { loadData } from "../engine/data.js";
import { createGame, draft, playSeason, offseason } from "../engine/season.js";
export { loadData, createGame, draft, playSeason, offseason };
export const D = loadData();

// Mean season points for one team over `seasons` replays of the same field (same seeds each time you call it).
export function meanPoints(game, teamId, seasons, { decisions = "play" } = {}) {
  let sum = 0, titles = 0;
  const save = game.seasonNo, savePrev = game.prevFinale;
  game.seasonNo = 1000; game.prevFinale = null;
  for (let k = 0; k < seasons; k++) {
    const s = playSeason(game, { decisions });
    sum += game.teams[teamId].pts;
    if (s.champion.id === teamId) titles++;
  }
  game.seasonNo = save; game.prevFinale = savePrev;
  for (const t of game.teams) t.titles = 0;
  return { pts: sum / seasons, titles: titles / seasons };
}
export const fmt = (x, d = 1) => (typeof x === "number" ? x.toFixed(d) : String(x));
export function table(rows, headers) {
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join("  ");
  console.log(line(headers)); console.log(w.map((x) => "-".repeat(x)).join("  "));
  for (const r of rows) console.log(line(r));
}
