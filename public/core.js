// Shared state and helpers for every screen.
import { themeOf } from "./theme.js";
export { themeOf, contrast, lum } from "./theme.js";
export const st = { S: null, cat: null, liv: [], livBy: {}, idx: {}, token: "", watch: false, room: null, off: 0, ui: { tab: "drivers", partTab: "aero", sort: { drivers: "overall", principals: "overall" }, hide: true, q: "" }, ws: null, render: () => {} };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const SLOTNAME = { aero: "Aero", engine: "Engine", susp: "Suspension", cool: "Cooling" };
export const SLOTS = ["aero", "engine", "susp", "cool"];
export const TIER = { 50: "Elite", 30: "Strong", 20: "Solid", 10: "Basic" };

export function store(k, v) { try { if (v === undefined) return localStorage.getItem("ddg." + k); if (v === null) localStorage.removeItem("ddg." + k); else localStorage.setItem("ddg." + k, v); } catch (e) { return null; } }
export function send(m) { const w = st.ws; if (w && w.readyState === 1) w.send(JSON.stringify({ token: st.token, ...m })); }
export const now = () => Date.now() + st.off;
export function toast(msg) { const t = $("#toast"); if (!t) return; const d = document.createElement("div"); d.textContent = msg; t.appendChild(d); setTimeout(() => d.remove(), 3500); }

export function buildIndex() {
  st.idx = {};
  for (const d of st.cat.drivers) st.idx[d.id] = { ...d, kind: "driver" };
  for (const p of st.cat.principals) st.idx[p.id] = { ...p, kind: "principal" };
  for (const p of st.cat.parts) st.idx[p.id] = { ...p, kind: "part" };
  st.livBy = Object.fromEntries(st.liv.map((l) => [l.slug, l]));
}
export const team = (id) => st.S && st.S.teams ? st.S.teams[id] : null;
export const live = (t) => (t && st.livBy[t.livery]) || null;
export const myTeam = () => (st.S && st.S.me ? team(st.S.me.teamId) : null);

export function itemLabel(id) {
  const it = st.idx[id]; if (!it) return "—";
  if (it.kind === "part") return `${SLOTNAME[it.slot]} +${it.bonus}`;
  return it.name;
}
// A driver's photo in a round frame; drivers without a photo get their initials. size is in px.
function personPic(list, folder, ref, size, cls, photoOnly) { // photoOnly: draw nothing when there is no photo (for tiny spots)
  const d = ref == null ? null : list[ref]; if (!d || (photoOnly && !d.pic)) return "";
  const w = d.name.split(/\s+/).filter(Boolean), ini = ((w[0] || "")[0] || "") + (w.length > 1 ? w[w.length - 1][0] : "");
  return `<span class="dpic ${d.pic ? "" : "none"} ${cls}" style="--s:${size}px">${d.pic ? `<img src="/${folder}/${esc(d.pic)}" alt="" loading="lazy">` : `<b>${esc(ini.toUpperCase())}</b>`}</span>`;
}
export const drvPic = (ref, size = 32, cls = "", photoOnly = false) => personPic(st.cat.drivers, "drivers", ref, size, cls, photoOnly);
export const prnPic = (ref, size = 32, cls = "", photoOnly = false) => personPic(st.cat.principals, "principals", ref, size, cls, photoOnly);
// A track outline, painted in the player's livery colour (the PNG is only a mask). `small` uses the thicker line made for tiny sizes.
export function trkPic(t, h = 60, small = false) {
  if (!t || !t.pic) return "";
  const f = small ? t.pic.replace(/\.png$/, "-s.png") : t.pic;
  return `<span class="trk" style="--h:${h}px;--m:url(/tracks/${esc(f)})" role="img" aria-label="${esc(t.name)} outline"></span>`;
}
export const drvName = (ref) => (ref == null ? "—" : st.cat.drivers[ref].name);
export const prnName = (ref) => (ref == null ? "—" : st.cat.principals[ref].name);
export const lastName = (n) => { const p = String(n).split(" "); return p.length > 1 ? p.slice(1).join(" ") : n; };

export function iconHTML(slug, size = 28) {
  const l = st.livBy[slug];
  const c = l ? `--b:${l.body};--a:${l.accent};--sec:${l.second}` : "";
  return `<span class="ico" style="--s:${size}px;${c}">${slug ? `<img src="/liveries/${esc(slug)}/icon.png" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>`;
}
export function chip(t, size = 24, extra = "", owner = false) {
  if (!t) return "";
  const who = owner && t.owner ? ` <span class="own">(${esc(t.owner)})</span>` : "";
  return `<span class="tchip ${extra}">${iconHTML(t.livery, size)}<span class="n">${esc(t.name)}${who}</span></span>`;
}
export function statCls(v) { return v >= 90 ? "s9" : v >= 85 ? "s8" : v >= 80 ? "s7" : v >= 75 ? "s6" : v >= 70 ? "s5" : "s4"; }
export const stat = (v) => `<span class="stat ${statCls(v)}">${Math.round(v)}</span>`;
export const tierCls = (b) => `t${b}`;


export function applyTheme() {
  const t = myTeam(); let l = live(t) || null;
  if (!l && st.S && st.S.players) { const y = st.S.players.find((p) => p.you); if (y && y.livery) l = st.livBy[y.livery]; }
  const r = document.documentElement.style;
  const th = l ? themeOf(l) : { acc: "#ff8000", acc2: "#47c7fc", ink: "#0b0e14" };
  r.setProperty("--acc", th.acc); r.setProperty("--acc2", th.acc2); r.setProperty("--ink", th.ink);
  const bg = $("#bg"); if (!bg) return;
  const slug = l ? l.slug : null;
  if (bg.dataset.slug === String(slug)) return;
  bg.dataset.slug = String(slug); bg.style.backgroundImage = "";
  if (slug) { const img = new Image(); img.onload = () => { if (bg.dataset.slug === slug) bg.style.backgroundImage = `url(/liveries/${slug}/wallpaper-dark.png)`; }; img.src = `/liveries/${slug}/wallpaper-dark.png`; }
}

export function remaining() {
  const S = st.S; if (!S || S.paused || !S.deadline) return null;
  return Math.max(0, S.deadline - now());
}
export function fmtClock(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : String(s); }
