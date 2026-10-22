import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
export function loadData() {
  const here = dirname(fileURLToPath(import.meta.url));
  const D = JSON.parse(readFileSync(join(here, "..", "data", "data.json"), "utf8"));
  try { D.pick = JSON.parse(readFileSync(join(here, "..", "data", "pickvalues.json"), "utf8")); } catch (e) { D.pick = null; }
  D.meanAero = D.tracks.reduce((a, t) => a + t.c.aero, 0) / D.tracks.length;
  return D;
}
