// The things players draft, the points table, and the single pick-value number per item.
import { SLOTS } from "./race.js";

// N items per slot in four tiers; at N=30 that is 1 / 7 / 10 / 12.
export function tierCounts(N) {
  const base = [1, 7, 10, 12];
  const raw = base.map((b) => (b * N) / 30);
  const out = raw.map(Math.floor);
  let rem = N - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rem <= 0) break; out[i]++; rem--; }
  if (out[0] < 1) { out[0] = 1; const j = out.indexOf(Math.max(...out)); out[j]--; }
  return out;
}
export const TIER_BONUS = [50, 30, 20, 10];

// Points for finishing places. Small rooms use real series tables, big rooms use our scaled 50-point table:
//   12 teams or fewer: F1 (25-18-15-12-10-8-6-4-2-1, top 10 score)
//   13 to 15 teams:    MotoGP (25-20-16-13-11-10-9-8-7-6-5-4-3-2-1, top 15 score)
//   16 or more teams:  scaled 50-point table, top N score (agreed table at N=30, interpolated below)
export const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const MOTOGP_POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const TABLE30 = [50, 46, 43, 40, 37, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1, 1];
export function pointsFormat(N) { return N <= 12 ? "F1" : N <= 15 ? "MotoGP" : "Scaled 50"; }
export function pointsTable(N) {
  if (N <= 12) return F1_POINTS.slice();
  if (N <= 15) return MOTOGP_POINTS.slice();
  if (N === 30) return TABLE30.slice();
  const out = [];
  for (let p = 1; p <= N; p++) {
    const x = (p - 1) * (29 / (N - 1));
    const lo = Math.floor(x), hi = Math.min(29, lo + 1);
    const v = TABLE30[lo] + (TABLE30[hi] - TABLE30[lo]) * (x - lo);
    out.push(Math.max(1, Math.round(v)));
  }
  return out;
}

// A few spare parts per slot on top of one per team, so the last pickers still have a choice.
// The Elite part stays at exactly 1; the spares are spread over Strong / Solid / Basic in the usual 7 : 10 : 12 mix.
export const spareParts = (N) => Math.max(2, Math.round(N * 0.15));
export function partCounts(N) {
  const out = tierCounts(N), extra = spareParts(N), w = [0, 7, 10, 12], tot = 29;
  const raw = w.map((x) => (x * extra) / tot), add = raw.map(Math.floor);
  let rem = extra - add.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).filter(([, i]) => i > 0).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rem <= 0) break; add[i]++; rem--; }
  return out.map((c, i) => c + add[i]);
}

export function buildPartItems(N) {
  const counts = partCounts(N), items = [];
  for (const slot of SLOTS) {
    let k = 0;
    counts.forEach((c, t) => { for (let j = 0; j < c; j++) items.push({ id: `${slot}:${TIER_BONUS[t]}#${k++}`, kind: "part", slot, bonus: TIER_BONUS[t] }); });
  }
  return items;
}
