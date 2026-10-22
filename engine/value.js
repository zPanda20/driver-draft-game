// One number per item: how much it adds to a team's strength over the weakest item that still gets drafted.
// "Strength" is in rating points summed over the team's two cars, so drivers, parts and principals compare directly.
import { driverRaceComposite } from "./race.js";
import { SLOTS } from "./race.js";
import { buildPartItems } from "./pool.js";

export function buildItems(D, P, N, valCfg = {}) {
  const T = D.tracks, ds = P.driverShare;
  const peakShare = 0.4;
  const meanWear = T.reduce((a, t) => a + t.wear, 0) / T.length;
  // average normalised weight of each slot in race pace
  const w = { aero: 0, engine: 0, susp: 0, cool: 0 };
  for (const t of T) { const s = t.c.engine + t.c.susp + t.c.cool; w.engine += t.c.engine / s; w.susp += t.c.susp / s; w.cool += t.c.cool / s; }
  for (const k of ["engine", "susp", "cool"]) w[k] /= T.length;
  const aeroV = valCfg.aero ?? 0.10, coolFail = valCfg.coolFail ?? 0.05;
  const slotW = { aero: aeroV, engine: (1 - aeroV - coolFail) * w.engine, susp: (1 - aeroV - coolFail) * w.susp, cool: (1 - aeroV - coolFail) * w.cool + coolFail };
  const sw = slotW.aero + slotW.engine + slotW.susp + slotW.cool;
  for (const k of SLOTS) slotW[k] /= sw;

  const dComp = D.drivers.map((d) => {
    let s = 0, gap = 0;
    for (const t of T) for (const wet of [false, true]) {
      const pr = wet ? t.rain : 1 - t.rain;
      const pk = driverRaceComposite(d.peak, t, wet, P), cr = driverRaceComposite(d.career, t, wet, P);
      s += pr * (peakShare * pk + (1 - peakShare) * cr); gap += pr * (pk - cr);
    }
    return { race: s / T.length, gap: gap / T.length, pace: peakShare * d.peak.pace + (1 - peakShare) * d.career.pace };
  });
  const meanGap = dComp.reduce((a, x) => a + x.gap, 0) / dComp.length;
  const drivers = D.drivers.map((d, i) => ({ id: `d:${i}`, kind: "driver", ref: i, strength: ds * (0.9 * dComp[i].race + 0.1 * dComp[i].pace) }));
  const principals = D.principals.map((p, i) => ({
    id: `p:${i}`, kind: "principal", ref: i,
    strength: 2 * ds * P.peak.perMent * (p.mentality - 50) * meanGap + 2 * (p.strategy - 75) * P.strat.k * (0.5 + meanWear / 10) + 2 * (p.mechanical - 75) * 0.02,
  }));
  const parts = buildPartItems(N);
  for (const it of parts) it.strength = 2 * (1 - ds) * slotW[it.slot] * it.bonus; // a part lifts both of the team's cars
  const nth = (arr, k) => arr.map((x) => x.strength).sort((a, b) => b - a)[Math.min(k, arr.length) - 1];
  const rep = { driver: nth(drivers, 2 * N + 1), principal: nth(principals, N + 1) };
  for (const it of drivers) it.base = Math.max(0, it.strength - rep.driver);
  for (const it of principals) it.base = Math.max(0, it.strength - rep.principal);
  for (const it of parts) it.base = Math.max(0, it.strength - 2 * (1 - ds) * slotW[it.slot] * 10);
  // If a calibration file exists, pick value comes from measured season points (best driver = 100).
  if (D.pick) {
    const interp = (tab, x) => {
      if (x <= tab[0][0]) return tab[0][1];
      for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
      return tab[tab.length - 1][1];
    };
    const rankOf = (arr, key) => { const o = arr.map((x, i) => i).sort((a, b) => arr[b][key] - arr[a][key]); const r = new Array(arr.length); o.forEach((i, k) => (r[i] = k + 1)); return r; };
    const dr = rankOf(D.drivers, "overall"), pr = rankOf(D.principals, "overall");
    for (const it of drivers) it.base = interp(D.pick.drivers, dr[it.ref]);
    for (const it of principals) it.base = interp(D.pick.principals, pr[it.ref]);
    for (const it of parts) it.base = D.pick.parts[it.slot][it.bonus] * (valCfg.partFactor ?? 1);
  }
  return { drivers, principals, parts, slotW, meanGap, rep };
}
