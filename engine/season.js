// A whole game: set-up, first draft, seasons of 18 races with pop-up decisions, and the off-season.
import { makeRng, clamp, shuffle } from "./rng.js";
import { withParams } from "./params.js";
import { raceSteps, zeroMods, addEffect } from "./race.js";
import { makeCalendar } from "./calendar.js";
import { pointsTable } from "./pool.js";
import { buildItems } from "./value.js";
import { makePool, runFirstDraft, runPartsRedraft, runFreeAgency } from "./draft.js";
import { ARCHETYPES, DEFAULT_MIX, pickArchetypes, decides } from "./bots.js";
import { PRE, MID } from "./decisions.js";

// Smaller games use a stratified slice of the driver and principal lists (every k-th by rating, best and worst included),
// so the drafted field keeps the same spread of quality as a 30-team game. Left-out people are marked unavailable.
function stratifiedKeep(list, key, M) {
  const order = list.map((x, i) => i).sort((a, b) => list[b][key] - list[a][key]);
  const keep = new Set();
  if (M >= order.length) return new Set(order);
  for (let j = 0; j < M; j++) keep.add(order[Math.round((j * (order.length - 1)) / (M - 1))]);
  return keep;
}
function limitPool(D, items, N) {
  const kd = stratifiedKeep(D.drivers, "overall", Math.min(D.drivers.length, Math.round(3 * N)));
  const kp = stratifiedKeep(D.principals, "overall", Math.min(D.principals.length, Math.round((D.principals.length * N) / 30)));
  items.drivers.forEach((it) => { if (!kd.has(it.ref)) { it.taken = true; it.owner = -1; } });
  items.principals.forEach((it) => { if (!kp.has(it.ref)) { it.taken = true; it.owner = -1; } });
}

// Smaller rooms draft only the best drivers, so the spread between drivers shrinks while part bonuses stay the same.
// Part strength is scaled by the square of that shrinkage (never below 0.3, never above 1), measured from the driver list.
export function roomFactor(D, N) {
  const ov = D.drivers.map((d) => d.overall).sort((a, b) => b - a);
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const ratio = sd(ov.slice(0, 2 * N)) / sd(ov.slice(0, 60));
  return Math.max(0.3, Math.min(1, ratio * ratio));
}

export function createGame({ D, N = 30, seed = 1, mix = DEFAULT_MIX, archetypes = null, params = {}, randomness = "normal", redraft = "straight", valCfg = {}, draftResolve = "lottery", catchUp = 1, stratify = false, partFactor = null }) {
  if (partFactor == null) partFactor = roomFactor(D, N);
  const P0 = withParams(params);
  const P = withParams({ ...params, bonusScale: P0.bonusScale * partFactor });
  const items = buildItems(D, P, N, { ...valCfg, partFactor });
  if (stratify) limitPool(D, items, N);
  const r = makeRng(seed, "setup");
  const arche = archetypes || pickArchetypes(N, mix, r);
  const teams = arche.map((bot, i) => ({
    id: i, name: `Team ${i + 1}`, bot, autopilot: !!ARCHETYPES[bot].autopilot,
    drivers: [], principal: null, parts: {}, partIds: {}, pickValue: 0, pref: null,
    pts: 0, wins: 0, pos: new Array(2 * N + 1).fill(0), titles: 0, lastPre: null, lastMid: null,
  }));
  const itemById = new Map();
  for (const it of [...items.drivers, ...items.principals, ...items.parts]) itemById.set(it.id, it);
  const game = { itemById, D, P, N, seed, randomness, redraft, draftResolve, catchUp, teams, items, pool: makePool(items), seasonNo: 0, prevFinale: null, history: [], dec: [] };
  game.draftRng = makeRng(seed, "draft");
  return game;
}

export function draft(game) { return runFirstDraft(game, game.draftRng, game.D); }

// Success chance shown on a pop-up card: base odds plus the principal bonus for the tagged stat.
export function successChance(opt, princ, P, track) {
  if (opt.byRain) return clamp(track.rain, 0.02, 0.98);
  const bonus = clamp((princ[opt.stat] - 75) * P.decisions.bonusPerPoint, -P.decisions.bonusCap, P.decisions.bonusCap) / 100;
  return clamp(opt.p / 100 + bonus, 0.05, 0.95);
}

function eligible(pool, phase, track, ctx, last) {
  return pool.filter((o) => {
    if (o.id === last) return false;
    if (o.cond === "rainHigh" && track.rain < 0.3) return false;
    if (o.cond === "rain" && !ctx.rain) return false;
    if (o.cond === "sc" && !ctx.sc) return false;
    return true;
  });
}

// Turn one decision outcome into per-car modifiers for a team's two cars (carIdx = [a, b]).
export function applyOutcome(mods, carIdx, eff, phase, leadFirst, k = 1) {
  if (!eff) return;
  if (eff.lead || eff.other) {
    addEffect(mods[carIdx[leadFirst ? 0 : 1]], eff.lead, phase, k);
    addEffect(mods[carIdx[leadFirst ? 1 : 0]], eff.other, phase, k);
  } else for (const ci of carIdx) addEffect(mods[ci], eff, phase, k);
}

// ---- Stepwise season, used by the live server. playSeason() below drives the same steps with bots. ----

export function startSeason(game, { decisions = true } = {}) {
  const { D, N, teams } = game;
  game.seasonNo++;
  const sNo = game.seasonNo;
  const cal = makeCalendar(D.tracks, makeRng(game.seed, "cal", sNo), game.prevFinale);
  game.prevFinale = cal[17].id;
  for (const t of teams) { t.pts = 0; t.wins = 0; t.pos.fill(0); t.lastPre = null; t.lastMid = null; t.races = []; }
  game.cal = cal;
  game.season = { no: sNo, table: pointsTable(N), decisions, round: -1, dnfs: 0, starts: 0, raceLog: [], results: [] };
  game.cars = [];
  for (const t of teams) for (const s of [0, 1]) game.cars.push({ team: t, d: D.drivers[t.drivers[s]], parts: t.parts, princ: D.principals[t.principal], teamCars: [t.id * 2, t.id * 2 + 1] });
  // Per-driver championship: one entry per car this season.
  game.season.dstat = game.cars.map((c, ci) => ({ car: ci, team: c.team.id, ref: c.team.drivers[ci & 1], pts: 0, wins: 0, pos: new Array(2 * N + 1).fill(0) }));
  return cal;
}

// Which teams get a pop-up this moment, and which option. Rolls are drawn now so replays stay identical.
function popups(game, phase, track, ctx, dr, lastKey, force = false) {
  const { P, D, teams } = game, out = new Map();
  if (!game.season.decisions) return out;
  for (const t of teams) {
    if (t.autopilot) continue;
    const draw = dr();
    if (!(force && phase === "pre") && draw >= P.decisions.popup) continue;
    const elig = eligible(phase === "pre" ? PRE : MID, phase, track, ctx, t[lastKey]);
    const opt = elig[Math.floor(dr() * elig.length)];
    const pS = successChance(opt, D.principals[t.principal], P, track);
    const roll = dr();
    t[lastKey] = opt.id;
    out.set(t.id, { team: t.id, opt, pS, roll, took: null });
  }
  return out;
}

export function prepareRace(game, round) {
  const { P, D } = game, S = game.season;
  S.round = round;
  const track = game.cal[round];
  const dr = makeRng(game.seed, "dec", S.no, round);
  const race = { round, track, rr: makeRng(game.seed, "race", S.no, round), dr, botRng: makeRng(game.seed, "bot", S.no, round), stage: "pre", rec: [], info: null, res: null };
  race.pre = popups(game, "pre", track, { rain: false, sc: false }, dr, "lastPre", round === 0); // the first race always offers every human team a pre-race call
  game.race = race;
  return race;
}

// Bots decide with their style; human teams that did not answer hold course.
export function autoAnswer(game, phase, { humansHold = true } = {}) {
  const set = phase === "pre" ? game.race.pre : game.race.mid;
  for (const [id, pu] of set) {
    if (pu.took !== null) continue;
    const t = game.teams[id];
    pu.took = t.human ? (humansHold ? false : decides(t, pu.pS, game.race.botRng)) : decides(t, pu.pS, game.race.botRng);
  }
}
export function answer(game, phase, teamId, take) {
  const pu = (phase === "pre" ? game.race.pre : game.race.mid).get(teamId);
  if (!pu || pu.took !== null) return false;
  pu.took = !!take; return true;
}

// Weather, qualifying and the first half. Returns the half-time picture; mid-race pop-ups are now set up.
export function runFirstHalf(game) {
  const { D, P } = game, race = game.race, cars = game.cars;
  const pre = (rain) => {
    const mods = cars.map(() => zeroMods());
    for (const [id, pu] of race.pre) {
      if (!pu.took) { race.rec.push({ phase: "pre", team: id, opt: pu.opt.id, took: false }); continue; }
      const opt = pu.opt, t = game.teams[id];
      const win = opt.byRain ? rain : pu.roll < pu.pS;
      let eff = opt.byRain ? (rain ? opt.rainWin : opt.dryLose) : (win ? opt.win : opt.lose);
      if (opt.byRain && rain) { const k = 1 + (D.principals[t.principal][opt.stat] - 75) * 0.02; eff = Object.fromEntries(Object.entries(eff).map(([a, b]) => [a, b * k])); }
      applyOutcome(mods, [id * 2, id * 2 + 1], eff, "pre", true, P.decisions.scale);
      race.rec.push({ phase: "pre", team: id, opt: opt.id, took: true, win, pS: pu.pS });
    }
    return mods;
  };
  race.gen = raceSteps({ cars, track: race.track, P, rng: race.rr, randomness: game.randomness, meanAero: D.meanAero, preMods: pre });
  const s = race.gen.next();
  race.info = s.value;
  race.stage = "mid";
  race.mid = popups(game, "mid", race.track, { rain: race.info.rain, sc: race.info.sc }, race.dr, "lastMid");
  return race.info;
}

export function runSecondHalf(game) {
  const { P, N } = game, race = game.race, S = game.season, cars = game.cars, info = race.info;
  const mods = cars.map(() => zeroMods());
  for (const [id, pu] of race.mid) {
    if (!pu.took) { race.rec.push({ phase: "mid", team: id, opt: pu.opt.id, took: false }); continue; }
    const win = pu.roll < pu.pS, ids = [id * 2, id * 2 + 1];
    const posOf = (ci) => { const k = info.order.indexOf(ci); return k < 0 ? 999 : k; };
    applyOutcome(mods, ids, win ? pu.opt.win : pu.opt.lose, "mid", posOf(ids[0]) <= posOf(ids[1]), P.decisions.scale);
    race.rec.push({ phase: "mid", team: id, opt: pu.opt.id, took: true, win, pS: pu.pS });
  }
  const s = race.gen.next(mods);
  const res = s.value;
  res.order.forEach((ci, k) => {
    const t = cars[ci].team;
    if (k < S.table.length) t.pts += S.table[k];
    t.pos[k + 1]++;
    if (k === 0) t.wins++;
    const ds = S.dstat[ci];
    if (k < S.table.length) ds.pts += S.table[k];
    ds.pos[k + 1]++;
    if (k === 0) ds.wins++;
  });
  for (let ci = 0; ci < cars.length; ci++) { S.starts++; if (res.dnf[ci]) S.dnfs++; }
  race.res = res; race.stage = "done";
  S.raceLog.push({ round: race.round, track: race.track.name, res, rec: race.rec, cars });
  return res;
}

export function driverStandingsOf(game) {
  const rows = (game.season && game.season.dstat) || [];
  return rows.slice().sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.wins !== a.wins) return b.wins - a.wins;
    for (let k = 2; k < a.pos.length; k++) if (b.pos[k] !== a.pos[k]) return b.pos[k] - a.pos[k];
    return a.car - b.car;
  }).map((r) => ({ car: r.car, team: r.team, ref: r.ref, pts: r.pts, wins: r.wins }));
}

export function standingsOf(game) {
  const cmp = (a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.wins !== a.wins) return b.wins - a.wins;
    for (let k = 2; k < a.pos.length; k++) if (b.pos[k] !== a.pos[k]) return b.pos[k] - a.pos[k];
    return a.id - b.id;
  };
  return game.teams.slice().sort(cmp);
}

export function finishSeason(game) {
  const S = game.season;
  const standings = standingsOf(game);
  standings[0].titles++;
  const dstandings = driverStandingsOf(game), dtop = dstandings.slice(0, 3);
  game.history.push({ season: S.no, order: standings.map((t) => t.id), pts: standings.map((t) => t.pts), champion: standings[0].id,
    dchamp: dtop[0] ? { ref: dtop[0].ref, team: dtop[0].team, pts: dtop[0].pts, wins: dtop[0].wins } : null, dtop });
  return { season: S.no, standings, dstandings, champion: standings[0], calendar: game.cal, dnfRate: S.dnfs / S.starts, raceLog: S.raceLog };
}

export function playSeason(game, { decisions = "play", collect = false } = {}) {
  startSeason(game, { decisions: decisions === "play" });
  for (let round = 0; round < 18; round++) {
    prepareRace(game, round);
    autoAnswer(game, "pre", { humansHold: false });
    runFirstHalf(game);
    autoAnswer(game, "mid", { humansHold: false });
    runSecondHalf(game);
  }
  return finishSeason(game);
}

export function offseason(game, standings) {
  const worstFirst = standings.slice().reverse();
  runPartsRedraft(game, worstFirst, makeRng(game.seed, "redraft", game.seasonNo), game.D, { snake: game.redraft === "snake" });
  runFreeAgency(game, worstFirst, makeRng(game.seed, "fa", game.seasonNo), game.D);
}
