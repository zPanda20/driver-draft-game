// Season calendar: 18 of 30 tracks, fixed windows for the classics, a rotating finale, and tag minimums.
import { shuffle } from "./rng.js";

export function makeCalendar(tracks, rng, prevFinaleId = null) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const finales = tracks.filter((t) => t.finale && t.id !== prevFinaleId);
    const finale = finales[Math.floor(rng() * finales.length)];
    const cal = new Array(18).fill(null);
    cal[17] = finale;
    const used = new Set([finale.id]);
    const fixed = tracks.filter((t) => t.always && t.id !== finale.id)
      .sort((a, b) => (a.late - a.early) - (b.late - b.early));
    let ok = true;
    for (const t of fixed) {
      const free = [];
      for (let r = t.early; r <= t.late; r++) if (!cal[r - 1]) free.push(r);
      if (!free.length) { ok = false; break; }
      cal[free[Math.floor(rng() * free.length)] - 1] = t;
      used.add(t.id);
    }
    if (!ok) continue;
    const rest = shuffle(tracks.filter((t) => !used.has(t.id)), rng);
    let k = 0;
    for (let r = 0; r < 18; r++) if (!cal[r]) cal[r] = rest[k++];
    const cnt = (f) => cal.filter(f).length;
    if (cnt((t) => t.street) >= 2 && cnt((t) => t.power) >= 2 && cnt((t) => t.down) >= 2 && cnt((t) => t.highrain) >= 2) return cal;
  }
  throw new Error("could not build a calendar");
}
