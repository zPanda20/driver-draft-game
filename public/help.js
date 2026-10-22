// "How to play" pop-up: shown once after a player picks their team, and again from the ? button in the top bar.
import { st, $, store } from "./core.js";

// The host can change the timers, so the text reads them from the room's settings (with the usual values as a fallback).
const cfg = (k, d) => { const v = st.S && st.S.settings && st.S.settings[k]; return v > 0 ? v : d; };
const mins = (s) => (s < 60 ? `${s} seconds` : s % 60 === 0 ? `${s / 60} minute${s === 60 ? "" : "s"}` : s % 30 === 0 ? `${Math.floor(s / 60)}½ minutes` : `${Math.round((s / 6)) / 10} minutes`);
const pages = () => [
  { tab: "Welcome", html: `<h2>Welcome to Driver Draft</h2>
    <p>You run a racing team. You build it, race it for 18 races, then improve it and race again. The team with the most points after 18 races wins the title.</p>
    <p>The game has three parts.</p>
    <ol class="hl"><li><b>The draft:</b> build your team.</li><li><b>The season:</b> race.</li><li><b>The off-season:</b> trade, re-draft your parts and sign free agents.</li></ol>
    <p><b>Stepping away?</b> If three choices in a row run out of time without you, you go <b>idle</b>. You stay in the game, but the room stops waiting for you and your timers get short. Click anything to come back.</p>` },
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
    <p>After race 18 the champions are crowned. Then the off-season begins. This is where you fix your team before the next season. It has five steps, in this order:</p>
    <ol class="hl">
      <li><b>Trade window.</b> Swap with other teams. About ${mins(cfg("tradeSec", 150))}. It ends early when everyone presses "I'm done trading".</li>
      <li><b>Parts re-draft.</b> All parts go back in the pool. Four rounds, one part per team per round. ${cfg("partsSec", 12)} seconds a pick.</li>
      <li><b>Free agency.</b> Each team may sign one free driver and one free principal. ${cfg("faSec", 25)} seconds each.</li>
      <li><b>Final trades.</b> A short window to swap drivers and principals. Half as long as the first one.</li>
      <li><b>Cut.</b> Keep two drivers and one principal. Everyone else leaves.</li>
    </ol>
    <p><b>What you keep:</b> your drivers and your principal.<br><b>What you lose:</b> all four car parts. Every team starts the re-draft with an empty car.</p>
    <p><b>Who goes first?</b> The weakest team of last season picks first, in the re-draft and in free agency. The champion goes last. That gives losing teams a way back.</p>
    <p>The next tabs explain each step. Autopilot teams, and players who are away, are handled by the game.</p>` },
  { tab: "Trades", html: `<h2>Trades: wheel and deal</h2>
    <p>Trading is how clever players win the off-season. You can trade in two windows: before the parts re-draft, and again after free agency.</p>
    <p><b>What you can trade</b></p>
    <ul class="hl">
      <li><b>Drivers and principals.</b> You can hold more than you need and sell the extra.</li>
      <li><b>Parts re-draft picks.</b> A pick is your place in line. An early pick can take the Elite part. A late pick gets leftovers. They show as "Parts pick R1 #3": round 1, third in line.</li>
      <li><b>Free-agency picks.</b> Your place in line to sign a free driver and principal. Only in the first window.</li>
    </ul>
    <p><b>How to make a trade</b></p>
    <ol class="hl">
      <li>Choose a team.</li>
      <li>Tick what you give. Tick what you want from them.</li>
      <li>Press Send offer.</li>
      <li>They accept or decline. If they accept, you get a "Confirm your deal" card. Press Confirm.</li>
    </ol>
    <p><b>Both sides must say yes.</b> Nothing moves until they accept and you confirm. You can withdraw an offer before it is accepted.</p>
    <p><b>Autopilot teams</b> answer after a second or two. They judge by value. "Close. Sweeten the deal." means add a little more. They never start offers, so you have to ask.</p>
    <p><b>Limits.</b> Up to 6 things per side. Up to 4 offers waiting at once. If something in an offer is traded away, the offer is cancelled. Final trades only allow drivers and principals, because the picks are used up.</p>` },
  { tab: "Re-draft", html: `<h2>The parts re-draft</h2>
    <p>Every team's parts go back in one pool. Then teams take parts, one at a time, until every car is full again.</p>
    <ol class="hl">
      <li><b>Four rounds.</b> In each round, every team takes one part.</li>
      <li><b>The order.</b> Weakest team of last season first, champion last. The same order repeats every round. If the host chose "Snake", rounds 2 and 4 run backwards.</li>
      <li><b>Four slots.</b> Aero, Engine, Suspension, Cooling. You fill each slot once. So each pick also decides which slot you fill next.</li>
      <li><b>Grades.</b> Elite +50, Strong +30, Solid +20, Basic +10. There is only <b>one Elite part for each slot</b>. Every slot has one part for each team plus a few spares, so most parts are Basic or Solid.</li>
    </ol>
    <p><b>On your turn:</b> open the slot you want, then press Take on a grade. You have ${cfg("partsSec", 12)} seconds, shown by the clock at the top right.</p>
    <p><b>On the screen you will see:</b> a line telling you what is happening, <b>Your car</b> with the four slots, the <b>Pick order</b> for all four rounds, and the pool.</p>
    <p><b>Not sure what to take?</b> Press the star ★ next to parts you like. That makes your queue. On your turn the game takes the first starred part that is still there and fits an empty slot. If the clock runs out, the game takes the best part you can still use. You can also tick "Pick for me automatically".</p>
    <p><b>If you traded picks.</b> Fewer picks means fewer choices. The game fills your last slots from the leftovers at the end, weakest team first. If you hold more than four picks, the extra ones are skipped once your car is full.</p>` },
  { tab: "Free agents", html: `<h2>Free agents and the cut</h2>
    <p><b>Free agency.</b> Any driver or principal who is not on a team is a free agent. Each team may sign <b>one driver and one principal</b>. Weakest team first. You have ${cfg("faSec", 25)} seconds. If time runs out, the game signs the best free ones for you. You may skip.</p>
    <p><b>Final trades.</b> A short window after free agency. You may now hold extra drivers and principals. Swap them with other teams, or fill a gap. Only drivers and principals.</p>
    <p><b>The cut.</b> Keep <b>two drivers and one principal</b>. Pick them, then press Confirm. Everyone else leaves your team and goes back to the pool. If you do nothing, the game keeps your best. A team that is short gets the best of what is left.</p>
    <p>When everyone is set, the new season starts with a fresh calendar of 18 races.</p>` },
];

const H = (st.ui.help = { open: false, page: 0 });

export function renderHelp() {
  const el = $("#help"); if (!el) return;
  if (!H.open) { el.innerHTML = ""; return; }
  const last = H.page === pages().length - 1;
  el.innerHTML = `<div class="helpback"><div class="helpcard" role="dialog" aria-label="How to play">
    <div class="helphead"><div class="helptabs">${pages().map((p, i) => `<button class="${i === H.page ? "on" : ""}" data-act="helpGo" data-p="${i}">${p.tab}</button>`).join("")}</div><button class="helpx" data-act="helpClose" aria-label="Close">✕</button></div>
    <div class="helpbody">${pages()[H.page].html}</div>
    <div class="helpnav"><button class="btn" data-act="helpBack" ${H.page ? "" : "disabled"}>Back</button><div class="grow"></div><button class="btn pri" data-act="${last ? "helpClose" : "helpNext"}">${last ? "Got it" : "Next"}</button></div></div></div>`;
}

export const helpHandlers = {
  help() { H.open = true; H.page = 0; renderHelp(); },
  helpClose() { H.open = false; renderHelp(); },
  helpGo(a) { H.page = Math.max(0, Math.min(pages().length - 1, +a.p || 0)); renderHelp(); },
  helpNext() { H.page = Math.min(pages().length - 1, H.page + 1); renderHelp(); },
  helpBack() { H.page = Math.max(0, H.page - 1); renderHelp(); },
};

// Open once per browser: when the player has picked a team (livery), or as soon as the game starts.
export function maybeHelp(S) {
  if (st.watch || !S || H.open || S.step === "draft.intro") return;
  if (store("help") === "1") return;
  const me = (S.players || []).find((p) => p.you);
  const hasTeam = S.step !== "lobby" || (me && me.livery);
  if (!hasTeam) return;
  store("help", "1"); H.open = true; H.page = 0; renderHelp();
}

document.addEventListener("click", (e) => { if (H.open && e.target.classList && e.target.classList.contains("helpback")) { H.open = false; renderHelp(); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && H.open) { H.open = false; renderHelp(); } });
