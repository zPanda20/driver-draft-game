// Measures what each item is worth in season points and writes data/pickvalues.json.
// Replacement level (value 0): driver outside the 2N drafted, principal outside the N drafted, a +10 part.
import { writeFileSync } from "node:fs";
import { D, createGame, draft, meanPoints, fmt } from "./lib.js";
import { SLOTS } from "../engine/race.js";

const G = +process.argv[2] || 40, S = +process.argv[3] || 40, N = 30;
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const dRanks = [1, 3, 6, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90];
const pRanks = [1, 3, 6, 10, 15, 20, 25, 30, 35, 44];
const dSorted = D.drivers.map((d, i) => i).sort((a, b) => D.drivers[b].overall - D.drivers[a].overall);
const pSorted = D.principals.map((d, i) => i).sort((a, b) => D.principals[b].overall - D.principals[a].overall);
const dIdx = (rk) => dSorted[rk - 1];
const pIdx = (rk) => pSorted[rk - 1];
const acc = {};
const add = (k, v) => { (acc[k] ||= []).push(v); };
for (let g = 0; g < G; g++) {
  const game = createGame({ D, N, seed: 900 + g, params, archetypes: Array(N).fill("balanced") });
  draft(game);
  const pts = game.teams.map((t, i) => (meanPoints(game, i, 1), t.pts));
  const order = game.teams.map((t) => t.id).sort((a, b) => pts[a] - pts[b]);
  const sid = order[Math.floor(N / 2)], sub = game.teams[sid];
  const orig = { drivers: sub.drivers.slice(), principal: sub.principal, parts: { ...sub.parts } };
  const reset = () => { sub.drivers = orig.drivers.slice(); sub.principal = orig.principal; sub.parts = { ...orig.parts }; };
  const run = () => meanPoints(game, sid, S).pts;
  for (const rk of dRanks) { reset(); sub.drivers = [dIdx(rk), orig.drivers[1]]; add(`d${rk}`, run()); }
  for (const rk of pRanks) { reset(); sub.principal = pIdx(rk); add(`p${rk}`, run()); }
  for (const s of SLOTS) for (const b of [10, 20, 30, 50]) { reset(); sub.parts = { ...orig.parts, [s]: b }; add(`${s}${b}`, run()); }
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const m = Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, mean(v)]));
// Replacement levels
const dRep = (m.d60 + m.d75 + m.d90) / 3, pRep = (m.p35 + m.p44) / 2;
const best = m.d1 - dRep;
const scale = 100 / best; // best driver over replacement = 100 pick-value points
// Values should fall as rank gets worse. Pool-adjacent-violators removes the measurement noise.
function pav(ys) {
  const blocks = ys.map((y) => ({ sum: y, n: 1 }));
  for (let i = 0; i < blocks.length - 1; ) {
    if (blocks[i].sum / blocks[i].n < blocks[i + 1].sum / blocks[i + 1].n) { blocks[i].sum += blocks[i + 1].sum; blocks[i].n += blocks[i + 1].n; blocks.splice(i + 1, 1); if (i > 0) i--; } else i++;
  }
  return blocks.flatMap((b) => Array(b.n).fill(b.sum / b.n));
}
const smooth = (pairs) => { const ys = pav(pairs.map((p) => p[1])); return pairs.map((p, i) => [p[0], ys[i]]); };
const out = { scale, drivers: smooth(dRanks.map((rk) => [rk, Math.max(0, (m[`d${rk}`] - dRep) * scale)])), principals: smooth(pRanks.map((rk) => [rk, Math.max(0, (m[`p${rk}`] - pRep) * scale)])), parts: {} };
for (const s of SLOTS) { const base = m[`${s}10`]; out.parts[s] = { 10: 0, 20: (m[`${s}20`] - base) * scale, 30: (m[`${s}30`] - base) * scale, 50: (m[`${s}50`] - base) * scale }; }
writeFileSync(new URL("../data/pickvalues.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("Pick values (best driver over replacement = 100):");
console.log("drivers by Overall rank:", out.drivers.map(([r, v]) => `${r}:${fmt(v, 0)}`).join("  "));
console.log("principals by rank:", out.principals.map(([r, v]) => `${r}:${fmt(v, 0)}`).join("  "));
for (const s of SLOTS) console.log(s.padEnd(7), Object.entries(out.parts[s]).map(([b, v]) => `+${b}:${fmt(v, 0)}`).join("  "));
