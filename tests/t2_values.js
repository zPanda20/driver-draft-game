// How much is each kind of upgrade worth in season points? Same field, same random numbers, one team changed.
import { D, createGame, draft, meanPoints, table, fmt } from "./lib.js";
import { SLOTS } from "../engine/race.js";

const G = +process.argv[2] || 40, S = +process.argv[3] || 40, N = 30;
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const driverRanks = [1, 5, 10, 20, 30, 45, 60, 75];
const byRank = (rk) => D.drivers.findIndex((d) => d.rank === rk);
const princByRank = (rk) => D.principals.findIndex((p) => p.rank === rk);

const acc = {};
const add = (k, v) => { (acc[k] ||= []).push(v); };
for (let g = 0; g < G; g++) {
  const game = createGame({ D, N, seed: 500 + g, params, archetypes: Array(N).fill("balanced") });
  draft(game);
  // subject: a middle team by season-1 points
  const base = [];
  for (const t of game.teams) base.push(t.id);
  const first = meanPoints(game, 0, 1); // warm
  const pts = game.teams.map((t) => t.pts);
  const order = game.teams.map((t) => t.id).sort((a, b) => pts[a] - pts[b]);
  const sid = order[Math.floor(N / 2)];
  const sub = game.teams[sid];
  const orig = { drivers: sub.drivers.slice(), principal: sub.principal, parts: { ...sub.parts } };
  const reset = () => { sub.drivers = orig.drivers.slice(); sub.principal = orig.principal; sub.parts = { ...orig.parts }; };
  const run = () => meanPoints(game, sid, S).pts;
  const b = run(); add("baseline", b);
  // Replace both drivers with the same-rank driver pair? Use one driver swapped, the other kept.
  for (const rk of driverRanks) { reset(); sub.drivers = [byRank(rk), orig.drivers[1]]; add(`driver rank ${rk}`, run() - b); }
  for (const s of SLOTS) for (const bonus of [10, 20, 30, 50]) { reset(); sub.parts = { ...orig.parts, [s]: bonus }; add(`${s} +${bonus}`, run()); }
  for (const rk of [1, 5, 10, 20, 30, 40]) { reset(); sub.principal = princByRank(rk); add(`principal rank ${rk}`, run() - b); }
  reset();
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`Subject: a mid-table team in a 30-team field; ${G} fields x ${S} seasons per variant.`);
console.log("Baseline mean season points:", fmt(mean(acc.baseline)));
// parts: convert absolute to delta vs the subject's own original bonus is messy, so report vs a +10 version of the same slot
const rows = [];
for (const rk of driverRanks) { const k = `driver rank ${rk}`; const dd = D.drivers[byRank(rk)]; rows.push([k, dd.name, fmt(mean(acc[k]))]); }
console.log("\nOne driver swapped in (replaces the team's first driver), change in season points:");
table(rows, ["Variant", "Driver", "Δ points"]);
console.log("\nOne part set to a tier (absolute mean season points; compare within a slot):");
const prow = SLOTS.map((s) => [s, ...[10, 20, 30, 50].map((b) => fmt(mean(acc[`${s} +${b}`])))]);
table(prow, ["Slot", "+10", "+20", "+30", "+50"]);
console.log("\nPart value of going +10 to +50, in season points:");
table(SLOTS.map((s) => [s, fmt(mean(acc[`${s} +50`]) - mean(acc[`${s} +10`]))]), ["Slot", "Δ points"]);
console.log("\nPrincipal swapped in, change in season points:");
table([1, 5, 10, 20, 30, 40].map((rk) => [`rank ${rk}`, D.principals[princByRank(rk)].name, fmt(mean(acc[`principal rank ${rk}`]))]), ["Variant", "Principal", "Δ points"]);
