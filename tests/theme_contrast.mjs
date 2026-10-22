// Every livery must give readable buttons and accent text on the dark interface (run: node tests/theme_contrast.mjs).
import { themeOf, contrast } from "../public/theme.js";
import fs from "fs";
const L = JSON.parse(fs.readFileSync(new URL("../data/liveries.json", import.meta.url)));
const PANEL = "#1a2130";
let bad = 0;
for (const l of L) {
  const t = themeOf(l);
  const checks = [["accent on panel", contrast(t.acc, PANEL)], ["text on accent fill", contrast(t.ink, t.acc)], ["accent2 on panel", contrast(t.acc2, PANEL)], ["text on accent2 fill", contrast(t.ink2, t.acc2)]];
  for (const [what, c] of checks) if (c < 4.5) { bad++; console.log("FAIL", l.slug, what, c.toFixed(2)); }
}
console.log(bad ? `${bad} problems` : `PASS all ${L.length} liveries readable`);
process.exit(bad ? 1 : 0);
