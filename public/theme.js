// ---------- team colours that stay readable ----------
// A livery can be near-black (BMW, JPS) or deep navy (Red Bull, Subaru). Used raw as a button fill, a border or text on the dark
// interface, those vanish. themeOf() keeps the team's own colour when it shows up and otherwise lifts it (same hue, lighter) until it
// does; --ink (text on an accent fill) is whichever of near-black or white reads better on that fill.
const SURFACE = "#1a2130"; // the lightest panel colour in the interface
const rgb = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const hex = (a) => "#" + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const sat = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; return mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); };
// same hue and saturation, lightness raised a step at a time until it reaches `want` contrast on the panel
function lift(h, want = 4.5) {
  const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let H = 0; if (d) H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H = ((H * 60) + 360) % 360;
  const S = Math.max(sat(h), 0.0), toRgb = (L) => { const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = L - c / 2; const [a, bb, cc] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x]; return hex([(a + m) * 255, (bb + m) * 255, (cc + m) * 255]); };
  let L = (mx + mn) / 2, out = hex([r * 255, g * 255, b * 255]);
  for (let i = 0; i < 60 && contrast(out, SURFACE) < want; i++) { L = Math.min(0.92, L + 0.015); out = toRgb(L); }
  return out;
}
const show = (h) => contrast(h, SURFACE) >= 4.5;
const far = (a, b) => rgb(a).reduce((s, v, i) => s + Math.abs(v - rgb(b)[i]), 0) > 90;
const themes = new Map();
export function themeOf(l) {
  if (themes.has(l.slug)) return themes.get(l.slug);
  const cols = [l.body, l.second, l.accent, ...(l.colors || [])].filter(Boolean);
  let acc;
  if (show(l.body)) acc = l.body;
  else if (sat(l.body) >= 0.3) acc = lift(l.body);                                   // a dark colour with a hue: lighter version of itself
  else acc = cols.slice(1).find((c) => show(c) && sat(c) >= 0.3) || cols.slice(1).find(show) || lift(l.second); // black or grey body: next colour that shows
  const cand = [...new Set([l.accent, l.second, ...cols.slice(3)])].filter((c) => c && far(c, acc));
  const acc2 = cand.find((c) => show(c) && sat(c) >= 0.3) || (cand.find((c) => sat(c) >= 0.3) && lift(cand.find((c) => sat(c) >= 0.3))) || cand.find(show) || lift(l.accent);
  const ink = (c) => (contrast("#0b0e14", c) >= contrast("#ffffff", c) ? "#0b0e14" : "#ffffff");
  const th = { acc, acc2, ink: ink(acc), ink2: ink(acc2) };
  themes.set(l.slug, th); return th;
}
