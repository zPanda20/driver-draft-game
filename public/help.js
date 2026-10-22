// "How to play" pop-up: shown once after a player picks their team, and again from the ? button in the top bar.
import { st, $, store } from "./core.js";

const PAGES = [
  { tab: "Welcome", html: `<h2>Welcome to Driver Draft</h2>
    <p>You run a racing team. You build it, race it for 18 races, then improve it and race again. The team with the most points after 18 races wins the title.</p>
    <p>The game has three parts.</p>
    <ol class="hl"><li><b>The draft:</b> build your team.</li><li><b>The season:</b> race.</li><li><b>The off-season:</b> improve.</li></ol>` },
  { tab: "1 Draft", html: `<h2>1. The draft: build your team</h2>
    <p>You need seven things: two drivers, four car parts (aero, engine, suspension, cooling) and one team principal, who is your team's boss.</p>
    <p>The draft has seven rounds. Everyone picks at once. In each round, choose one thing you want and one backup.</p>
    <p>If two players want the same thing, a draw decides. The team with weaker picks so far gets better odds.</p>
    <p>If you lose the draw, you get your backup. If that has gone, you get the best one left of the same kind.</p>
    <p>Lock in your picks before the timer ends. If you do not, the computer picks for you.</p>
    <p>Parts come in four grades: Elite (+50), Strong (+30), Solid (+20) and Basic (+10).</p>` },
  { tab: "2 Season", html: `<h2>2. The season: race</h2>
    <p>A season has 18 races. Every player sees the same race at the same moment.</p>
    <p>Before the start and again at half distance, you may get a call. A call is a gamble. You see the odds, and what you gain or lose. Take it or hold course. If you do not answer in time, you hold course. You see at once if it worked. A weather bet shows its result when the race starts.</p>
    <p>Your principal's skill changes your odds.</p>
    <p>Both your drivers score points. The higher they finish, the more you get. The size of the room sets how many places score.</p>
    <p>After race 18, the team with the most points wins the title. More wins break a tie.</p>` },
  { tab: "3 Off-season", html: `<h2>3. The off-season: improve</h2>
    <p>You keep your drivers and your principal. Your parts go back. Then:</p>
    <ul class="hl">
      <li><b>Trades.</b> Swap with any team, even autopilot teams. Offer drivers, principals, parts picks and free-agency picks. A pick is a place in line. An early pick gets a better part. Give picks away and you take leftovers.</li>
      <li><b>Parts.</b> There are four rounds. Each team picks one part per round. The weakest team picks first. Star the parts you want, in order, or switch on auto.</li>
      <li><b>Free drivers and principals.</b> Each free-agency pick claims one free driver and one free principal. The weakest team goes first.</li>
      <li><b>Final trades.</b> A short window. Sell the driver or principal you do not need.</li>
      <li><b>Cut.</b> Keep two drivers and one principal. If you do nothing, the game keeps the best. A team that is short gets the best of what is left.</li>
    </ul>
    <p>Then the next season starts.</p>` },
];

const H = (st.ui.help = { open: false, page: 0 });

export function renderHelp() {
  const el = $("#help"); if (!el) return;
  if (!H.open) { el.innerHTML = ""; return; }
  const last = H.page === PAGES.length - 1;
  el.innerHTML = `<div class="helpback"><div class="helpcard" role="dialog" aria-label="How to play">
    <div class="helptabs">${PAGES.map((p, i) => `<button class="${i === H.page ? "on" : ""}" data-act="helpGo" data-p="${i}">${p.tab}</button>`).join("")}<button class="x" data-act="helpClose" aria-label="Close">✕</button></div>
    <div class="helpbody">${PAGES[H.page].html}</div>
    <div class="helpnav"><button class="btn" data-act="helpBack" ${H.page ? "" : "disabled"}>Back</button><div class="grow"></div><button class="btn pri" data-act="${last ? "helpClose" : "helpNext"}">${last ? "Got it" : "Next"}</button></div></div></div>`;
}

export const helpHandlers = {
  help() { H.open = true; H.page = 0; renderHelp(); },
  helpClose() { H.open = false; renderHelp(); },
  helpGo(a) { H.page = Math.max(0, Math.min(PAGES.length - 1, +a.p || 0)); renderHelp(); },
  helpNext() { H.page = Math.min(PAGES.length - 1, H.page + 1); renderHelp(); },
  helpBack() { H.page = Math.max(0, H.page - 1); renderHelp(); },
};

// Open once per browser: when the player has picked a team (livery), or as soon as the game starts.
export function maybeHelp(S) {
  if (st.watch || !S || H.open) return;
  if (store("help") === "1") return;
  const me = (S.players || []).find((p) => p.you);
  const hasTeam = S.step !== "lobby" || (me && me.livery);
  if (!hasTeam) return;
  store("help", "1"); H.open = true; H.page = 0; renderHelp();
}

document.addEventListener("click", (e) => { if (H.open && e.target.classList && e.target.classList.contains("helpback")) { H.open = false; renderHelp(); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && H.open) { H.open = false; renderHelp(); } });
