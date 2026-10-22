// The window that opens the first draft: your team, your name and the seven empty boxes you are about to fill.
// It stays up for the 5-second "draft.intro" step the server runs before round 1, then the draft timer starts.
import { st, $, esc, iconHTML, myTeam, remaining } from "./core.js";

const BOXES = [["Driver 1", "Driver 2"], ["Team principal"], ["Aero", "Engine"], ["Suspension", "Cooling"]];
let shownKey = "", tick = null;

function html(S) {
  const t = myTeam(), you = (S.players || []).find((p) => p.you);
  const slug = t && t.livery;
  const rows = BOXES.map((r) => `<div class="irow">${r.map((k) => `<div class="islot"><div class="ibox"></div><span class="ilab">${k}</span></div>`).join("")}</div>`).join("");
  return `<div class="introback"><div class="introcard" role="dialog" aria-label="Your team" style="--wall:url(/liveries/${esc(slug || "")}/wallpaper-dark.png)">
    <div class="ihead">${iconHTML(slug, 72)}<div class="iname"><div class="itag">Your team</div><div class="itn">${esc(t ? t.name : "")}</div><div class="itp">Player: ${esc(you ? you.name : "")}</div></div></div>
    <div class="islots">${rows}</div>
    <div class="ifoot"><span class="ibtn">Draft starts in <b id="introsec">5</b></span></div>
    <div class="ibar"><i style="animation-duration:${Math.max(0.1, (remaining() == null ? 5000 : remaining()) / 1000)}s"></i></div></div></div>`;
}

// Called after every render: show the window while the server is in its intro step, and take it away afterwards.
export function renderIntro(S) {
  const old = $("#intro");
  const on = S && S.step === "draft.intro" && S.me && !st.watch && myTeam();
  if (!on) { if (old) old.remove(); shownKey = ""; if (tick) { clearInterval(tick); tick = null; } return; }
  const key = `${S.deadline}|${S.paused ? 1 : 0}|${S.me.teamId}`;   // do not rebuild (and restart the bar) while it is already up
  if (old && key === shownKey) return;
  shownKey = key;
  const box = old || Object.assign(document.createElement("div"), { id: "intro" });
  box.innerHTML = html(S); if (!old) document.body.appendChild(box);
  box.classList.toggle("paused", !!S.paused);
  if (tick) clearInterval(tick);
  tick = setInterval(() => {
    const n = $("#introsec"), r = remaining(); if (!n || r == null) return;
    n.textContent = Math.max(1, Math.ceil(r / 1000));
  }, 200);
}
