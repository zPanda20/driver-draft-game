// One race, in two halves. Pure function of its inputs plus the random draws, so a race can be replayed.
import { clamp } from "./rng.js";

export const SLOTS = ["aero", "engine", "susp", "cool"];

const g2 = (u1, u2) => Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2);

export function pPeak(P, mentality, cons) {
  return clamp(P.peak.base + (mentality - 50) * P.peak.perMent + (cons - 65) * P.peak.perCons, P.peak.min, P.peak.max);
}

// Driver side of race pace: Race Pace, Racecraft and Tyre Mgmt at the track's weights. Wet Weather joins in the rain.
export function driverRaceComposite(a, track, rain, P) {
  const w = track.w;
  const dry = (w.race * a.race + w.craft * a.craft + w.tyre * a.tyre) / (w.race + w.craft + w.tyre);
  return rain ? (1 - P.wetWeight) * dry + P.wetWeight * a.wet : dry;
}

// Car side of race pace: Engine, Suspension, Cooling at the track's weights (Aero only if aeroRaceShare > 0).
export function carRaceComposite(parts, track, rain, P) {
  const c = track.c;
  const wE = c.engine * P.slotMult.engine, wS = (c.susp + (rain ? P.rainSuspBoost : 0)) * P.slotMult.susp, wC = c.cool * P.slotMult.cool;
  const wA = P.aeroRaceShare > 0 ? (P.aeroRaceShare / (1 - P.aeroRaceShare)) * (wE + wS + wC) : 0;
  const sum = wE + wS + wC + wA;
  const v = (b) => P.carBase + P.bonusScale * b;
  return (wE * v(parts.engine) + wS * v(parts.susp) + wC * v(parts.cool) + wA * v(parts.aero)) / sum;
}

// Qualifying: driver Pace plus the car's Aero. A track with more Aero weight leans a bit more on the car.
export function qualScore(a, parts, track, P, meanAero) {
  const cs = clamp(1 - P.driverShare + P.qualCarSens * (track.c.aero - meanAero), 0.25, 0.55);
  return (1 - cs) * a.pace + cs * (P.carBase + P.bonusScale * parts.aero);
}

// All the random numbers a car needs for one race, drawn in a fixed order so that
// replaying a race with different decisions keeps everything else identical.
export function drawCar(r) {
  const u = [];
  for (let i = 0; i < 16; i++) u.push(r());
  return {
    peak: u[0], qn: g2(u[1], u[2]), n1: g2(u[3], u[4]), n2: g2(u[5], u[6]),
    cr1: u[7], cr2: u[8], fl1: u[9], fl2: u[10], pit: u[11], pitHalf: u[12], t1: u[13], t2: u[14],
  };
}

const ZERO = () => ({ q: 0, p1: 0, p2: 0, crash1: 0, crash2: 0, fail1: 0, fail2: 0, pit: 0, grid: 0 });
export const zeroMods = ZERO;

// Add one decision outcome's effect to a car's modifiers.
export function addEffect(m, eff, phase, k = 1) {
  if (!eff) return m;
  // k scales the pace and qualifying numbers, so the whole pool can be turned up or down at once
  eff = { ...eff, q: (eff.q || 0) * k, p: (eff.p || 0) * k, p1: (eff.p1 || 0) * k, p2: (eff.p2 || 0) * k };
  if (phase === "pre") {
    m.q += eff.q || 0;
    m.p1 += (eff.p || 0) + (eff.p1 || 0);
    m.p2 += (eff.p || 0) + (eff.p2 || 0);
    m.crash1 += eff.crash || 0; m.crash2 += eff.crash || 0;
    m.fail1 += eff.fail || 0; m.fail2 += eff.fail || 0;
    m.pit += eff.pit || 0;
    m.grid += eff.grid || 0;
  } else {
    m.p2 += eff.p2 || eff.p || 0;
    m.crash2 += eff.crash || 0;
    m.fail2 += eff.fail || 0;
  }
  return m;
}

// cars: [{ team, d, parts, princ }]; preMods[i]: modifiers; midHook(info) -> array of modifiers for half two.
// Runs a whole race in one go. Interactive games drive raceSteps() directly so players can answer mid-race pop-ups.
export function simulateRace(args) {
  const g = raceSteps(args);
  let s = g.next();
  while (!s.done) s = g.next(args.midHook ? args.midHook(s.value) : null);
  return s.value;
}

// Generator: yields the half-time picture once, receives the mid-race modifiers, and returns the result.
export function* raceSteps({ cars, track, P, rng, randomness = "normal", meanAero = 28, preMods }) {
  const n = cars.length;
  const RS = P.randomness[randomness];
  const draws = cars.map(() => drawCar(rng));
  const rainU = rng(), sc1U = rng(), sc2U = rng();
  const rain = rainU < track.rain;
  const pScRace = clamp(track.sc * (rain ? P.rain.sc : 1) * RS, 0, 0.95);
  const pScHalf = 1 - Math.sqrt(1 - pScRace);
  const sc = [sc1U < pScHalf, sc2U < pScHalf];
  const events = [];
  if (typeof preMods === "function") preMods = preMods(rain); // pre-race pop-ups resolve once the weather is known

  const S = cars.map((c, i) => {
    const u = draws[i], d = c.d, M = c.princ.mentality;
    const peak = u.peak < pPeak(P, M, d.cons);
    const a = peak ? d.peak : d.career;
    const rd = driverRaceComposite(a, track, rain, P);
    const rc = carRaceComposite(c.parts, track, rain, P);
    const speed = P.driverShare * rd + (1 - P.driverShare) * rc;
    const strat = (c.princ.strategy - 75) * P.strat.k * (0.5 + track.wear / 10);
    const consMult = clamp(1 + P.consNoise * (80 - d.cons) / 100, 0.8, 1.6);
    const mods = preMods && preMods[i] ? { ...zeroMods(), ...preMods[i] } : zeroMods();
    const q = qualScore(a, c.parts, track, P, meanAero) + mods.q + u.qn * P.noise.qual * RS * (rain ? P.rain.noise : 1);
    return { i, a, peak, speed, strat, consMult, mods, q, alive: true, dnf: 0, tDnf: 0 };
  });

  // Grid: best qualifier first, then apply grid penalties.
  const byQ = S.slice().sort((x, y) => y.q - x.q);
  const key = byQ.map((s, r) => ({ s, k: r + s.mods.grid + 0.001 * r }));
  key.sort((x, y) => x.k - y.k);
  const gridOrder = key.map((x) => x.s.i);
  const grid = new Array(n);
  gridOrder.forEach((ci, r) => (grid[ci] = r + 1));
  const mid = (n - 1) / 2;

  const sigmaHalf = (s) => (P.noise.race * RS * (rain ? P.rain.noise : 1) * s.consMult) / Math.SQRT2;
  const crashP = (s, c, extra) => {
    const sf = clamp((100 - c.d.safety) / (100 - P.incidents.safetyRef), 0.2, 2.5);
    return clamp(P.incidents.crash * track.crash * sf * RS * (rain ? P.rain.crash : 1) * (1 + extra), 0, 0.6);
  };
  const failP = (s, c, extra) => {
    const coolF = clamp(P.incidents.coolBase - P.incidents.coolSlope * c.parts.cool, 0.3, 2);
    const mechF = clamp(1 - P.incidents.mechSlope * (c.princ.mechanical - 75), 0.5, 1.6);
    return clamp(P.incidents.fail * track.mech * coolF * mechF * RS * (1 + extra), 0, 0.6);
  };

  // Pit-stop errors: at most one per car per race, placed in one half.
  for (const s of S) {
    const c = cars[s.i], u = draws[s.i];
    const pitF = clamp(1 - P.incidents.pitSlope * (c.princ.mechanical - 75), 0.4, 1.8);
    const p = clamp(P.incidents.pit * pitF * RS * (1 + s.mods.pit), 0, 0.6);
    s.pitHalf = u.pit < p ? (u.pitHalf < 0.5 ? 1 : 2) : 0;
  }

  // First half.
  const perf1 = new Array(n);
  for (const s of S) {
    const c = cars[s.i], u = draws[s.i];
    const posNorm = (mid - (grid[s.i] - 1)) / (mid || 1);
    let gridEff = P.grid.range * (track.ovt / 10) * posNorm;
    if (posNorm < 0) gridEff *= clamp(1 - P.grid.craftRelief * (s.a.craft - 75) - P.grid.engineRelief * (c.parts.engine - 20), 0.5, 1.4);
    let p = s.speed + s.strat + s.mods.p1 + gridEff * 2 + u.n1 * sigmaHalf(s);
    if (sc[0]) p += (c.princ.strategy - 75) * P.strat.scK;
    if (s.pitHalf === 1) { p -= 2 * P.incidents.pitLoss; events.push({ half: 1, type: "pit", car: s.i }); }
    perf1[s.i] = p;
    if (u.cr1 < crashP(s, c, s.mods.crash1)) { s.alive = false; s.dnf = 1; s.tDnf = u.t1; s.why = "crash"; events.push({ half: 1, type: "crash", car: s.i }); }
    else if (u.fl1 < failP(s, c, s.mods.fail1)) { s.alive = false; s.dnf = 1; s.tDnf = u.t1; s.why = "failure"; events.push({ half: 1, type: "failure", car: s.i }); }
  }
  if (sc[0]) events.push({ half: 1, type: "safety-car" });
  const running1 = S.filter((s) => s.alive);
  const mean1 = running1.reduce((a, s) => a + perf1[s.i], 0) / running1.length;
  const s1 = perf1.map((p) => (sc[0] ? mean1 + (1 - P.scCompress) * (p - mean1) : p));

  // Mid-race decisions see the order after half one.
  const orderAfter1 = running1.map((s) => s.i).sort((x, y) => s1[y] - s1[x]);
  const mid2 = yield { order: orderAfter1, sc: sc[0], rain, cars, grid };

  // Second half.
  const perf2 = new Array(n), tot = new Array(n);
  for (const s of S) {
    const c = cars[s.i], u = draws[s.i];
    const m2 = mid2 && mid2[s.i] ? mid2[s.i] : null;
    const p2m = s.mods.p2 + (m2 ? m2.p2 : 0);
    let p = s.speed + s.strat + p2m + u.n2 * sigmaHalf(s);
    if (sc[1]) p += (c.princ.strategy - 75) * P.strat.scK;
    if (s.pitHalf === 2) { p -= 2 * P.incidents.pitLoss; events.push({ half: 2, type: "pit", car: s.i }); }
    perf2[s.i] = p;
    if (s.alive) {
      const crashX = s.mods.crash2 + (m2 ? m2.crash2 : 0), failX = s.mods.fail2 + (m2 ? m2.fail2 : 0);
      if (u.cr2 < crashP(s, c, crashX)) { s.alive = false; s.dnf = 2; s.tDnf = u.t2; s.why = "crash"; events.push({ half: 2, type: "crash", car: s.i }); }
      else if (u.fl2 < failP(s, c, failX)) { s.alive = false; s.dnf = 2; s.tDnf = u.t2; s.why = "failure"; events.push({ half: 2, type: "failure", car: s.i }); }
    }
    tot[s.i] = 0.5 * s1[s.i] + 0.5 * p;
  }
  if (sc[1]) events.push({ half: 2, type: "safety-car" });
  const running2 = S.filter((s) => s.alive);
  if (sc[1] && running2.length) {
    const m = running2.reduce((a, s) => a + tot[s.i], 0) / running2.length;
    for (const s of S) tot[s.i] = m + (1 - P.scCompress) * (tot[s.i] - m);
  }

  // Final order: finishers by score, then second-half retirements (later is better), then first-half ones.
  const fin = running2.map((s) => s.i).sort((x, y) => tot[y] - tot[x]);
  const d2 = S.filter((s) => s.dnf === 2).sort((x, y) => y.tDnf - x.tDnf).map((s) => s.i);
  const d1 = S.filter((s) => s.dnf === 1).sort((x, y) => y.tDnf - x.tDnf).map((s) => s.i);
  const order = [...fin, ...d2, ...d1];
  const finish = new Array(n);
  order.forEach((ci, r) => (finish[ci] = r + 1));
  const movers = S.filter((s) => s.alive && Math.abs(finish[s.i] - grid[s.i]) > 5).map((s) => ({ car: s.i, from: grid[s.i], to: finish[s.i] }));
  return {
    order, finish, grid, gridOrder, rain, sc,
    dnf: S.map((s) => s.dnf), why: S.map((s) => s.why || null),
    events, movers, peak: S.map((s) => s.peak), speed: S.map((s) => s.speed),
  };
}
