// Stand-in players for the simulator. Each archetype values items a little differently and answers pop-ups differently.
import { gauss } from "./rng.js";

export const ARCHETYPES = {
  balanced:     { bias: { driver: 1, part: 1, principal: 1 }, noise: 1.2, decide: "odds55" },
  driverFan:    { bias: { driver: 1.35, part: 0.8, principal: 0.9 }, noise: 1.5, decide: "always" },
  partsFan:     { bias: { driver: 0.8, part: 1.35, principal: 1 }, noise: 1.5, decide: "odds55" },
  rankFollower: { naive: true, bias: { driver: 1, part: 1, principal: 1 }, noise: 1.0, decide: "random" },
  chaotic:      { bias: { driver: 1, part: 1, principal: 1 }, noise: 5, decide: "random" },
  holder:       { bias: { driver: 1, part: 1, principal: 1 }, noise: 1.2, decide: "never" },
  gamblerAlways:{ bias: { driver: 1, part: 1, principal: 1 }, noise: 1.2, decide: "always" },
  gamblerRandom:{ bias: { driver: 1, part: 1, principal: 1 }, noise: 1.2, decide: "random" },
  sandbagger:   { bias: { driver: 1, part: 1, principal: 1 }, noise: 1.2, decide: "odds55", sandbag: true },
};
export const DEFAULT_MIX = { balanced: 0.30, driverFan: 0.20, partsFan: 0.20, rankFollower: 0.20, chaotic: 0.10 };

export function pickArchetypes(N, mix, r) {
  const names = Object.keys(mix), out = [];
  for (let i = 0; i < N; i++) {
    let u = r(), acc = 0, pick = names[names.length - 1];
    for (const k of names) { acc += mix[k]; if (u < acc) { pick = k; break; } }
    out.push(pick);
  }
  return out;
}

// What this player thinks an item is worth.
export function perceived(team, item, D, r) {
  const A = ARCHETYPES[team.bot];
  let v;
  if (A.naive) {
    if (item.kind === "driver") v = (D.drivers[item.ref].overall - 65) * 0.45;
    else if (item.kind === "principal") v = (D.principals[item.ref].overall - 65) * 0.25;
    else v = (item.bonus - 10) * 0.3;
  } else v = item.base * A.bias[item.kind];
  return v + gauss(r) * A.noise;
}

export function decides(team, pSucc, r) {
  const how = ARCHETYPES[team.bot].decide;
  if (how === "always") return true;
  if (how === "never") return false;
  if (how === "odds55") return pSucc >= 0.55;
  return r() < 0.5;
}
// Teams a lobby fills in when fewer than 10 players join: auto-drafted, never gamble.
ARCHETYPES.autopilot = { bias: { driver: 1, part: 1, principal: 1 }, noise: 1.5, decide: "never", autopilot: true };
