// Plain-language text for pop-up cards and the static catalogue sent to every browser.

const word = (v) => { const a = Math.abs(v); return a < 0.8 ? "slight" : a < 2 ? "solid" : a < 3.5 ? "strong" : "huge"; };

const LABEL = { q: "Qualifying", p: "Race pace", p1: "Early pace", p2: "Late pace", crash: "Crash risk", fail: "Failure risk", grid: "Grid", pit: "Pit-error risk" };

// One effect object -> short lines like "Strong boost to race pace".
export function describeEffect(eff, scale) {
  if (!eff) return [];
  const lines = [];
  const one = (e, prefix = "") => {
    for (const [k, v] of Object.entries(e)) {
      if (!v) continue;
      if (k === "lead" || k === "other") continue;
      if (k === "grid") { lines.push(`${prefix}${v > 0 ? "Start " + v + " places lower" : "Start " + -v + " places higher"}`); continue; }
      if (k === "crash" || k === "fail" || k === "pit") { lines.push(`${prefix}${LABEL[k]} ${v > 0 ? "up" : "down"} ${Math.round(Math.abs(v) * 100)}%`); continue; }
      const eff = v * scale;
      lines.push(`${prefix}${word(eff)} ${eff > 0 ? "boost" : "loss"}: ${LABEL[k].toLowerCase()}`);
    }
  };
  if (eff.lead || eff.other) { one(eff.lead || {}, "Lead car: "); one(eff.other || {}, "Other car: "); }
  else one(eff);
  return lines;
}

export function describeOption(opt, scale) {
  const out = { id: opt.id, name: opt.name, stat: opt.stat, text: opt.text || "" };
  if (opt.byRain) {
    out.byRain = true;
    out.win = describeEffect(opt.rainWin, scale);
    out.lose = describeEffect(opt.dryLose, scale);
  } else {
    out.win = describeEffect(opt.win, scale);
    out.lose = describeEffect(opt.lose, scale);
  }
  return out;
}

import { PRE, MID } from "../engine/decisions.js";
import { slugOf, driverPics, principalPics, trackPics } from "./pics.js";

export function buildCatalog(game) {
  const { D, items } = game;
  return {
    drivers: D.drivers.map((d, i) => ({ id: `d:${i}`, i, name: d.name, pic: driverPics().get(slugOf(d.name)) || null, series: d.series, group: d.group, rank: d.rank, overall: d.overall, peak: d.peak, career: d.career, cons: d.cons, safety: d.safety, legacy: d.legacy })),
    principals: D.principals.map((p, i) => ({ id: `p:${i}`, i, name: p.name, pic: principalPics().get(slugOf(p.name)) || null, group: p.group, era: p.era, rank: p.rank, overall: p.overall, strategy: p.strategy, mentality: p.mentality, mechanical: p.mechanical })),
    parts: items.parts.map((p) => ({ id: p.id, slot: p.slot, bonus: p.bonus })),
    options: Object.fromEntries([...PRE, ...MID].map((o) => [o.id, o.name])),
    tracks: D.tracks.map((t) => ({ id: t.id, name: t.name, pic: trackPics().get(slugOf(t.name)) || null, region: t.region, type: t.type, rain: t.rain, sc: t.sc, ovt: t.ovt, wear: t.wear, street: t.street, power: t.power, down: t.down, highrain: t.highrain, w: t.w, c: t.c })),
  };
}
