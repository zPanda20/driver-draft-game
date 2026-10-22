// Decision balance. (A) what each option does to finishing places, (B) what decisions do to seasons and titles.
import { D, createGame, draft, playSeason, table, fmt } from "./lib.js";
import { simulateRace, zeroMods } from "../engine/race.js";
import { makeCalendar } from "../engine/calendar.js";
import { applyOutcome, successChance } from "../engine/season.js";
import { PRE, MID } from "../engine/decisions.js";
import { makeRng } from "../engine/rng.js";
import { pointsTable } from "../engine/pool.js";

const F = +process.argv[2] || 12, SEEDS = 3, N = 30, table30 = pointsTable(N);
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

// ---- A: per-option effect on the subject team's two cars (average finishing place; positive = better)
const fields = [];
for (let f = 0; f < F; f++) { const g = createGame({ D, N, seed: 31000 + f, params }); draft(g); fields.push(g); }
const effects = {}; // key -> { winPlaces:[], losePlaces:[], winPts:[], losePts:[] }
function cars(game) { const c = []; for (const t of game.teams) for (const s of [0, 1]) c.push({ team: t, d: D.drivers[t.drivers[s]], parts: t.parts, princ: D.principals[t.principal] }); return c; }
for (const game of fields) {
  const cs = cars(game);
  // Subject: the 15th team by raw speed estimate (draft value).
  const sid = game.teams.map((t) => [t.id, t.pickValue]).sort((a, b) => a[1] - b[1])[N / 2][0];
  const ids = [sid * 2, sid * 2 + 1];
  for (const track of D.tracks) for (let sd_ = 0; sd_ < SEEDS; sd_++) {
    const seedKey = [game.seed, track.id, sd_];
    const run = (pre, mid) => simulateRace({ cars: cs, track, P: game.P, rng: makeRng(...seedKey), meanAero: D.meanAero, preMods: pre, midHook: mid });
    const base = run(null, null);
    const avgPlace = (r) => mean(ids.map((i) => r.finish[i])), pts = (r) => ids.reduce((a, i) => a + (r.finish[i] <= N ? table30[r.finish[i] - 1] : 0), 0);
    const b0 = avgPlace(base), p0 = pts(base);
    const test = (opt, phase) => {
      if (opt.cond === "rainHigh" && track.rain < 0.3) return;
      if (opt.cond === "rain" && !base.rain) return;
      if (opt.cond === "sc" && !base.sc[0]) return;
      const outcomes = opt.byRain ? [["win", base.rain ? opt.rainWin : opt.dryLose]] : [["win", opt.win], ["lose", opt.lose]];
      for (const [name, eff] of outcomes) {
        const mk = () => cs.map(() => zeroMods());
        let r;
        if (phase === "pre") r = run(() => { const m = mk(); applyOutcome(m, ids, eff, "pre", true, game.P.decisions.scale); return m; }, null);
        else r = run(null, () => { const m = mk(); applyOutcome(m, ids, eff, "mid", true, game.P.decisions.scale); return m; });
        const e = (effects[opt.id] ||= { phase, opt, win: [], lose: [], winP: [], loseP: [] });
        e[name].push(b0 - avgPlace(r)); e[name + "P"].push(pts(r) - p0);
      }
    };
    for (const o of PRE) test(o, "pre");
    for (const o of MID) test(o, "mid");
  }
}
const rows = [];
for (const e of Object.values(effects)) {
  const o = e.opt;
  const w = mean(e.win), l = e.lose.length ? mean(e.lose) : w;
  const pWin = (pr) => o.byRain ? null : Math.min(0.95, Math.max(0.05, o.p / 100 + Math.max(-0.12, Math.min(0.12, (pr - 75) * 0.005))));
  const ev = (pr) => (o.byRain ? w : pWin(pr) * w + (1 - pWin(pr)) * l);
  const evPts = (pr) => (o.byRain ? mean(e.winP) : pWin(pr) * mean(e.winP) + (1 - pWin(pr)) * (e.loseP.length ? mean(e.loseP) : 0));
  rows.push([e.phase, o.name, o.stat, o.byRain ? "rain" : o.p + "%", fmt(w), e.lose.length ? fmt(l) : "-", fmt(ev(75), 2), fmt(ev(60), 2), fmt(ev(95), 2), fmt(evPts(75), 1), fmt(sd(e.win.concat(e.lose)), 1)]);
}
console.log(`A. Effect of each option on the team's two cars, average places gained (+ is better). ${F} fields x 30 tracks x ${SEEDS} seeds.`);
console.log("   EV columns use the card odds at principal stat 75 / 60 / 95. Points are season-scale points per race.");
table(rows, ["When", "Option", "Stat", "Odds", "If win", "If lose", "EV @75", "EV @60", "EV @95", "EV pts", "Swing sd"]);

// ---- B: decisions on vs off, same seeds
const GB = +process.argv[3] || 300;
let flips = 0, absShift = 0, shiftN = 0, topGain = 0;
const byType = {};
for (let g = 0; g < GB; g++) {
  const arche = []; for (let i = 0; i < N; i++) arche.push(["holder", "balanced", "gamblerAlways"][i % 3]);
  const gm1 = createGame({ D, N, seed: 41000 + g, params, archetypes: arche }); draft(gm1);
  const gm2 = createGame({ D, N, seed: 41000 + g, params, archetypes: arche }); draft(gm2);
  const on = playSeason(gm1, { decisions: "play" }), off = playSeason(gm2, { decisions: "off" });
  if (on.champion.id !== off.champion.id) flips++;
  const rOff = new Map(off.standings.map((t, k) => [t.id, k + 1])), rOn = new Map(on.standings.map((t, k) => [t.id, k + 1]));
  for (const t of gm1.teams) { absShift += Math.abs(rOff.get(t.id) - rOn.get(t.id)); shiftN++; (byType[t.bot] ||= []).push(t.pts - gm2.teams[t.id].pts); }
}
console.log(`\nB. Same ${GB} seasons with decisions on vs off (everyone holds course).`);
console.log(`   Champion changes in ${fmt(100 * flips / GB, 0)}% of seasons; a team moves ${fmt(absShift / shiftN, 1)} places in the standings on average.`);
table(Object.entries(byType).map(([k, v]) => [k, fmt(mean(v), 1), fmt(sd(v), 1)]), ["Decision style", "Mean points vs holding", "Sd"]);
console.log(`\nC. Pop-ups: each player averages ${fmt(2 * 0.5, 1)} per race (50% pre, 50% mid); about ${N * 0.5} players see each of the two pop-up moments in a ${N}-player room.`);
