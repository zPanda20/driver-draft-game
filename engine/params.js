// Every tunable number in one place. The balance tests change these, never the code.
export const DEFAULT_PARAMS = {
  bonusScale: 0.9,          // how much of a part's +10..+50 bonus reaches the car rating
  carBase: 50,            // car part rating = carBase + bonus (+10..+50)
  driverShare: 0.6,       // a car's speed is 60% driver, 40% car
  peak: { base: 0.20, perMent: 0.0125, perCons: 0.0015, min: 0.08, max: 0.80 }, // chance of a peak-form race
  noise: { qual: 3.0, race: 4.2 },       // random term, in rating points (race = total over both halves)
  consNoise: 0.4,         // low-Consistency drivers get a wider random term (0 turns this off)
  qualCarSens: 0.004,     // how much a track's Aero weight shifts the car share of qualifying
  slotMult: { engine: 1, susp: 1, cool: 1.6 }, // importance of each part in race pace, on top of the track weights
  aeroRaceShare: 0.0,     // spec: Aero is qualifying only. Raise to give Aero a share of race pace.
  rainSuspBoost: 15,      // extra Suspension weight in the rain
  wetWeight: 0.35,
  rain: { noise: 1.3, crash: 1.5, sc: 1.4 },
  strat: { k: 0.10, scK: 0.04 },         // principal Strategy: per point above 75, scaled by tyre wear / safety cars
  grid: { range: 10, craftRelief: 0.012, engineRelief: 0.004 }, // grid inertia, scaled by track overtaking difficulty
  incidents: { crash: 0.028, fail: 0.022, pit: 0.12, pitLoss: 3.0, safetyRef: 75, coolBase: 1.8, coolSlope: 0.03, mechSlope: 0.012, pitSlope: 0.015 },
  scCompress: 0.4,        // a safety car shrinks the gaps by this fraction
  randomness: { low: 0.6, normal: 1.0, high: 1.5 },
  decisions: { scale: 0.5, popup: 0.5, bonusPerPoint: 0.5, bonusCap: 12 }, // spec: +0.5 pts per stat point over 75, capped at 12
};
export function withParams(over = {}) {
  const deep = (a, b) => {
    const o = Array.isArray(a) ? a.slice() : { ...a };
    for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? deep(a[k] || {}, b[k]) : b[k];
    return o;
  };
  return deep(DEFAULT_PARAMS, over);
}
