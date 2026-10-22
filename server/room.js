// One game room: lobby, draft, season, off-season. The server is the referee; browsers only send choices.
import { makeRng, shuffle } from "../engine/rng.js";
import { createGame, startSeason, prepareRace, autoAnswer, answer, runFirstHalf, runSecondHalf, finishSeason, standingsOf, driverStandingsOf } from "../engine/season.js";
import { makePool, beginDraftRound, botPicks, validPick, resolveDraftRound, beginPartsRedraft, botPartChoice, bestPartFor, takePart, freeAgents, claimFA, botClaim, lockIn, needsOf, fillMissingParts, ensureLineups, principalsOf } from "../engine/draft.js";
import { tradingMethods } from "./trading.js";
import { describeOption } from "./describe.js";
import { pointsTable, pointsFormat } from "../engine/pool.js";

export const PACES = [1.4, 1, 0.7, 0.5]; // seconds-multiplier per speed level: Relaxed, Normal, Fast, Turbo
const DEFAULTS = { minTeams: 10, pace: 1, draftSec: 45, popupSec: 15, partsSec: 12, faSec: 25, lockSec: 30, tradeSec: 150, trading: true, redraft: "straight", decisions: true };
const KEEP_FEED = 40;
const IDLE_MS = 6000; // how long the room waits for idle players once nobody else is left to act

export class Room {
  constructor({ code, D, liveries, hostToken, onChange, onSave }) {
    this.code = code; this.D = D; this.liveries = liveries; this.liveryBySlug = new Map(liveries.map((l) => [l.slug, l]));
    this.hostToken = hostToken; this.onChange = onChange; this.onSave = onSave || (() => {});
    this.created = Date.now();
    this.players = new Map();          // token -> player
    this.settings = { ...DEFAULTS };
    this.phase = "lobby"; this.step = "lobby";
    this.game = null; this.paused = false;
    this.deadline = null; this.timer = null; this.remaining = null; this.pending = null; this.dur = null;
    this.reveal = null; this.revealSeq = 0; this.feed = []; this.chat = [];
    this.humanPicks = new Map(); this.raceIdx = -1; this.turnIdx = 0; this.lastStandings = null;
    this.keepChoices = new Map(); this.keepConfirmed = new Set(); this.faPicks = new Map();
  }

  // ---------- timing ----------
  after(ms, fn, real = false) { this.afterRaw(real && process.env.REAL_RACE ? ms : ms / (+process.env.TEST_SPEED || 1), fn); }
  afterRaw(ms, fn) {
    this.clearTimer(); this.shortened = null;
    this.pending = fn; this.remaining = ms; this.dur = ms;
    if (this.paused) { this.deadline = null; return; }
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => this.fire(), ms);
  }
  fire() { const fn = this.pending; this.clearTimer(); if (fn) fn(); }
  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.pending = null; this.deadline = null; }
  skip() { if (this.pending) { this.skipping = true; this.fire(); this.skipping = false; } }
  // After a server restart a restored room waits for someone to connect, then carries on from its checkpoint.
  kick() {
    if (!this.restored) return; this.restored = false;
    if (this.step === "season.end") this.after(60000, () => this.startOffseason());
    else if (this.step === "draft.done") this.after(15000, () => this.beginSeason());
    this.changed();
  }
  pause() { if (this.paused) return; this.paused = true; if (this.timer) { clearTimeout(this.timer); this.timer = null; this.remaining = Math.max(0, this.deadline - Date.now()); this.deadline = null; } this.changed(); }
  resume() {
    if (!this.paused) return; this.paused = false;
    if (this.pending) { this.deadline = Date.now() + this.remaining; this.timer = setTimeout(() => this.fire(), this.remaining); }
    this.changed();
  }
  changed() { this.settle(); this.onChange(this); }
  p(ms) { return ms * this.settings.pace; }

  // ---------- idle players ----------
  // A player who lets three choice windows run out without touching anything goes idle. They still count as online, but the
  // room does not wait for them: when only idle players are left to act, the running timer is cut short. Any click brings them back.
  humanFor(id, noAuto) { const p = this.playerOfTeam(id); return p && p.connected && !(noAuto && p.auto) ? p : null; }
  // The players the current step is waiting on (connected, and still to make their choice).
  waitingOn() {
    if (!this.game || this.paused) return [];
    const g = this.game, out = [], add = (p) => { if (p) out.push(p); };
    switch (this.step) {
      case "draft.pick": for (const t of this.humanTeams()) { const hp = this.humanPicks.get(t.id); if (!(hp && hp.locked)) add(this.humanFor(t.id)); } break;
      case "race.pre": case "race.mid": {
        const set = this.step === "race.pre" ? g.race.pre : g.race.mid;
        for (const pu of set.values()) if (g.teams[pu.team].human && pu.took === null) add(this.humanFor(pu.team));
        break;
      }
      case "parts.turn": { const turn = g.rd.turns[this.turnIdx]; if (turn) add(this.humanFor(turn.team, true)); break; }
      case "fa.turn": add(this.humanFor(this.faTurns[this.faIdx], true)); break;
      case "lock": for (const id of this.lockHumans || []) if (!this.keepConfirmed.has(id)) add(this.humanFor(id)); break;
      case "trade": case "trade2": if (this.trade) for (const t of this.tradeActive()) if (!this.trade.done.has(t.id)) add(this.playerOfTeam(t.id)); break;
    }
    return out;
  }
  openWindow() { for (const p of this.players.values()) p.acted = false; this.skipping = false; }
  // Called as a choice window ends by running out of time: whoever was waited on and did nothing misses it.
  closeWindow() {
    if (this.skipping) return;
    for (const p of this.waitingOn()) if (!p.acted) { p.missed = (p.missed || 0) + 1; if (p.missed >= 3) p.idle = true; }
  }
  touch(p) { p.acted = true; p.missed = 0; }
  wake(p) {
    if (!p || !p.idle) return;
    p.idle = false; p.missed = 0;
    if (this.shortened) { const s = this.shortened; this.afterRaw(Math.max(s.left, 8000 / (+process.env.TEST_SPEED || 1)), s.fn); }
  }
  shorten(ms) {
    if (!this.pending || this.paused || this.shortened || !this.deadline) return;
    ms = ms / (+process.env.TEST_SPEED || 1);
    const left = this.deadline - Date.now(); if (left <= ms) return;
    const fn = this.pending; this.afterRaw(ms, fn); this.shortened = { fn, left };
  }
  settle() { if (this.shortened || !this.pending || this.paused) return; const w = this.waitingOn(); if (w.length && w.every((p) => p.idle)) this.shorten(IDLE_MS); }

  // ---------- people ----------
  humanTeams() { return this.game ? this.game.teams.filter((t) => t.human) : []; }
  playerOfTeam(id) { for (const p of this.players.values()) if (p.teamId === id) return p; return null; }
  isHost(token) { return token === this.hostToken; }
  connectedCount() { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }

  addPlayer(token, name) {
    let p = this.players.get(token);
    if (p) { p.connected = true; if (name && this.phase === "lobby") p.name = name; return p; }
    if (this.phase !== "lobby") return null;
    if (this.players.size >= 30) return null;
    p = { token, name: String(name || "Player").slice(0, 24), teamName: "", livery: null, teamId: null, connected: true, auto: false, wish: [] };
    this.players.set(token, p);
    return p;
  }

  setLivery(token, slug) {
    const p = this.players.get(token); if (!p || this.phase !== "lobby") return;
    if (!this.liveryBySlug.has(slug)) return;
    for (const q of this.players.values()) if (q !== p && q.livery === slug) return;
    p.livery = slug;
    if (!p.teamName || this.liveries.some((l) => l.name === p.teamName)) p.teamName = this.liveryBySlug.get(slug).name;
  }
  setTeamName(token, name) {
    const p = this.players.get(token); if (!p) return;
    name = String(name || "").trim().slice(0, 28); if (!name) return;
    p.teamName = name;
    if (this.game && p.teamId != null) this.game.teams[p.teamId].name = name;
  }
  setSettings(token, s) {
    if (!this.isHost(token) || this.phase !== "lobby") return;
    const num = (k, lo, hi) => { if (s[k] != null && isFinite(+s[k])) this.settings[k] = Math.max(lo, Math.min(hi, +s[k])); };
    if (s.pace != null) this.settings.pace = this.nearestPace(+s.pace);
    num("minTeams", 10, 30); num("draftSec", 15, 120); num("popupSec", 8, 40); num("partsSec", 5, 40); num("faSec", 10, 60); num("lockSec", 10, 90); num("tradeSec", 30, 600);
    if (s.redraft === "straight" || s.redraft === "snake") this.settings.redraft = s.redraft;
    if (typeof s.decisions === "boolean") this.settings.decisions = s.decisions;
    if (typeof s.trading === "boolean") this.settings.trading = s.trading;
  }
  nearestPace(v) { return PACES.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), PACES[1]); }
  // Host sets the speed directly, at any time after the lobby.
  setPace(token, v) {
    if (!this.isHost(token) || !isFinite(+v)) return;
    this.applyPace(this.nearestPace(+v), "The host set the speed");
  }
  applyPace(pace, who) {
    if (pace === this.settings.pace) return;
    this.settings.pace = pace; this.speedVotes = new Map();
    const names = { 1.4: "Relaxed", 1: "Normal", 0.7: "Fast", 0.5: "Turbo" };
    this.paceNote = { id: (this.paceNote ? this.paceNote.id : 0) + 1, text: `${who}: speed is now ${names[pace]}` };
    this.changed();
  }
  voteSpeed(token, dir) {
    const p = this.players.get(token); if (!p || p.teamId == null || this.phase === "lobby") return;
    if (dir !== "up" && dir !== "down") return;
    if (!this.speedVotes) this.speedVotes = new Map();
    if (this.speedVotes.get(token) === dir) this.speedVotes.delete(token); else this.speedVotes.set(token, dir);
    const humans = [...this.players.values()].filter((q) => q.teamId != null && q.connected);
    const need = Math.floor(humans.length / 2) + 1, tally = { up: 0, down: 0 };
    for (const [tk, d] of this.speedVotes) { const q = this.players.get(tk); if (q && q.connected) tally[d]++; }
    const i = PACES.indexOf(this.settings.pace);
    if (tally.up >= need && i < PACES.length - 1) return this.applyPace(PACES[i + 1], "The room voted");
    if (tally.down >= need && i > 0) return this.applyPace(PACES[i - 1], "The room voted");
    this.changed();
  }
  addChat(token, text) {
    const p = this.players.get(token); text = String(text || "").trim().slice(0, 160); if (!p || !text) return;
    this.chat.push({ t: Date.now(), name: p.name, team: p.teamId, text });
    if (this.chat.length > 60) this.chat.shift();
  }

  // ---------- start ----------
  start(token, seed = Math.floor(Math.random() * 1e9)) {
    if (!this.isHost(token) || this.phase !== "lobby" || !this.players.size) return;
    const humans = [...this.players.values()];
    const N = Math.min(30, Math.max(this.settings.minTeams, humans.length));
    const arche = [...humans.map(() => "balanced"), ...new Array(N - humans.length).fill("autopilot")];
    const rr = makeRng(seed, "room");
    const order = shuffle(arche.map((a, i) => i), rr); // slot positions
    const game = createGame({ D: this.D, N, seed, archetypes: shuffle(arche, rr), draftResolve: "lottery", redraft: this.settings.redraft });
    const used = new Set(humans.map((h) => h.livery).filter(Boolean));
    const freeL = shuffle(this.liveries.map((l) => l.slug).filter((s) => !used.has(s)), rr);
    const hs = shuffle(humans, rr);
    let hi = 0;
    for (const t of game.teams) {
      if (t.bot === "balanced") {
        const p = hs[hi++]; t.human = true; p.teamId = t.id;
        if (!p.livery) p.livery = freeL.shift();
        t.livery = p.livery; t.name = p.teamName || this.liveryBySlug.get(p.livery).name;
      } else {
        t.human = false; t.livery = freeL.shift(); t.name = this.liveryBySlug.get(t.livery).name;
      }
    }
    this.game = game; this.seed = seed;
    this.startDraft();
  }

  // ---------- draft ----------
  startDraft() {
    this.phase = "draft"; this.draftRound = 0; this.rng = makeRng(this.seed, "live");
    // Players first see their own team and the seven empty boxes for five seconds; the round-1 timer starts after that.
    this.step = "draft.intro";
    this.after(5000, () => this.nextDraftRound());
    this.changed();
  }
  nextDraftRound() {
    const g = this.game;
    this.draftRound++;
    const dr = beginDraftRound(g, this.draftRound, g.draftRng);
    this.humanPicks = new Map();
    for (const t of dr.order) if (!t.human) dr.picks.set(t, botPicks(g, t, this.draftRound, g.draftRng));
    this.step = "draft.pick"; this.openWindow();
    // Round 1 is longest, rounds 2-3 normal, rounds 4-7 half the timer plus 10 s (fewer choices left, but not rushed).
    const sec = this.draftRound === 1 ? 1.6 * this.settings.draftSec : this.draftRound <= 3 ? this.settings.draftSec : 0.5 * this.settings.draftSec + 10;
    this.after(Math.max(15, sec) * 1000, () => this.resolveDraft());
    this.changed();
  }
  submitPick(token, pri, alt) {
    const p = this.players.get(token); if (!p || this.step !== "draft.pick" || p.teamId == null) return;
    const t = this.game.teams[p.teamId], cur = this.humanPicks.get(t.id);
    if (cur && cur.locked) return;
    const a = pri ? this.copyOf(t, validPick(this.game, t, pri)) : null;
    const b = alt && alt !== pri ? this.copyOf(t, validPick(this.game, t, alt)) : null;
    if (pri && !a) return;
    this.humanPicks.set(t.id, { pri: a ? a.id : null, alt: b ? b.id : null, locked: false });
    this.changed();
  }
  // Identical parts are interchangeable: hand each player a random free copy so they do not collide for no reason.
  copyOf(t, it) {
    if (!it || it.kind !== "part") return it;
    const free = this.game.items.parts.filter((x) => !x.taken && x.slot === it.slot && x.bonus === it.bonus);
    return free[Math.floor(this.rng() * free.length)] || it;
  }
  lockPick(token, on = true) {
    const p = this.players.get(token); if (!p || this.step !== "draft.pick" || p.teamId == null) return;
    const hp = this.humanPicks.get(p.teamId); if (!hp || !hp.pri) return;
    hp.locked = on; this.changed();
    if (on && this.allLocked()) this.after(1200, () => this.resolveDraft());
  }
  allLocked() {
    for (const t of this.humanTeams()) {
      const p = this.playerOfTeam(t.id);
      if (!p || !p.connected) continue;
      const hp = this.humanPicks.get(t.id);
      if (!hp || !hp.locked) return false;
    }
    return true;
  }
  resolveDraft() {
    this.closeWindow();
    const g = this.game, dr = g.draftRound;
    const wanted = [];
    for (const t of this.humanTeams()) {
      const hp = this.humanPicks.get(t.id);
      const pri = hp && hp.pri ? g.itemById.get(hp.pri) : null;
      if (pri && validPick(g, t, pri.id)) {
        const alt = hp.alt ? g.itemById.get(hp.alt) : null;
        dr.picks.set(t, { pri, alt: alt && !alt.taken ? alt : null, n: needsOf(t) });
      } else dr.picks.set(t, botPicks(g, t, this.draftRound, g.draftRng));
    }
    for (const [t, pk] of dr.picks) wanted.push({ team: t.id, pri: pk.pri ? pk.pri.id : null, alt: pk.alt ? pk.alt.id : null });
    const { results } = resolveDraftRound(g, g.draftRng);
    this.setReveal({ kind: "draft", round: this.draftRound, wanted, results: results.map((r) => ({ team: r.team, item: r.item.id, via: r.via, asked: r.asked ? r.asked.id : null })) });
    for (const r of results) this.pushFeed({ kind: "draft", team: r.team, item: r.item.id, round: this.draftRound });
    this.step = "draft.reveal";
    const last = this.draftRound >= 7;
    this.after(this.p(last ? 9000 : 8000), () => (last ? this.draftDone() : this.nextDraftRound()));
    this.changed();
  }
  draftDone() {
    this.step = "draft.done";
    this.save("preseason");
    this.after(this.p(12000), () => this.beginSeason());
    this.changed();
  }

  // ---------- season ----------
  beginSeason() {
    const g = this.game;
    this.trade = null;
    startSeason(g, { decisions: this.settings.decisions });
    this.phase = "season"; this.raceIdx = -1; this.step = "season.intro";
    this.setReveal({ kind: "intro", season: g.season.no });
    this.after(this.p(9000), () => this.nextRace());
    this.changed();
  }
  nextRace() {
    const g = this.game;
    this.raceIdx++;
    if (this.raceIdx >= 18) return this.endSeason();
    prepareRace(g, this.raceIdx);
    this.step = "race.pre"; this.openWindow();
    this.popupHumans = [...g.race.pre.keys()].filter((id) => g.teams[id].human);
    this.reveal = this.reveal && this.reveal.kind === "finish" ? { ...this.reveal, stale: true } : this.reveal;
    this.after(this.popupHumans.length ? this.settings.popupSec * 1000 : this.p(5500), () => this.firstHalf());
    this.changed();
  }
  respondPopup(token, take) {
    const p = this.players.get(token); if (!p || p.teamId == null) return;
    const phase = this.step === "race.pre" ? "pre" : this.step === "race.mid" ? "mid" : null; if (!phase) return;
    if (!answer(this.game, phase, p.teamId, take)) return;
    this.changed();
    const set = phase === "pre" ? this.game.race.pre : this.game.race.mid;
    const open = [...set.values()].some((pu) => this.game.teams[pu.team].human && pu.took === null && this.playerOfTeam(pu.team)?.connected);
    if (!open) this.after(2600, () => (phase === "pre" ? this.firstHalf() : this.finishRace()));
  }
  firstHalf() {
    this.closeWindow();
    const g = this.game;
    autoAnswer(g, "pre");
    const info = runFirstHalf(g);
    const race = g.race;
    this.setReveal({
      kind: "half", round: race.round, track: race.track.id, rain: info.rain, sc: info.sc,
      grid: info.grid.map((g1, ci) => [ci, g1]).sort((a, b) => a[1] - b[1]).map((x) => x[0]),
      order: info.order,
    });
    this.step = "race.half";
    this.after(this.p(15000), () => this.startMid(), true);
    this.changed();
  }
  startMid() {
    this.step = "race.mid"; this.openWindow();
    const g = this.game;
    this.popupHumans = [...g.race.mid.keys()].filter((id) => g.teams[id].human);
    this.after(this.popupHumans.length ? this.settings.popupSec * 1000 : this.p(2500), () => this.finishRace());
    this.changed();
  }
  finishRace() {
    this.closeWindow();
    const g = this.game;
    autoAnswer(g, "mid");
    const res = runSecondHalf(g), race = g.race, N = g.N, table = g.season.table;
    const points = res.order.map((ci, k) => (k < table.length ? table[k] : 0));
    const ptsByCar = new Array(res.order.length); res.order.forEach((ci, k) => (ptsByCar[ci] = points[k]));
    this.setReveal({
      kind: "finish", round: race.round, track: race.track.id, rain: res.rain, sc: res.sc,
      grid: res.gridOrder, order: res.order, dnf: res.dnf, why: res.why, events: res.events, movers: res.movers,
      points: ptsByCar, rec: race.rec.filter((r) => r.took).map((r) => ({ phase: r.phase, team: r.team, opt: r.opt, win: r.win })),
      half: this.reveal && this.reveal.kind === "half" ? this.reveal.order : null,
    });
    this.step = "race.finish";
    this.after(this.p(22000), () => this.nextRace(), true); // the summary pop-up closes itself; the next race starts behind it
    this.changed();
  }
  endSeason() {
    const g = this.game, out = finishSeason(g);
    this.lastStandings = out.standings;
    this.step = "season.end";
    this.setReveal({ kind: "season", season: out.season, standings: out.standings.map((t) => ({ id: t.id, pts: t.pts, wins: t.wins })), champion: out.champion.id, dstandings: out.dstandings.map((r) => ({ ref: r.ref, team: r.team, pts: r.pts, wins: r.wins })) });
    this.save("seasonEnd");
    this.after(120000, () => this.startOffseason());
    this.changed();
  }
  continueGame(token) {
    if (!this.isHost(token)) return;
    if (this.step === "season.end") this.startOffseason();
    else this.skip();
  }

  // ---------- off-season ----------
  startOffseason() {
    const g = this.game;
    this.phase = "offseason";
    const worstFirst = (this.lastStandings || standingsOf(g)).slice().reverse();
    this.worstFirst = worstFirst;
    beginPartsRedraft(g, worstFirst, makeRng(g.seed, "redraft", g.seasonNo), { snake: this.settings.redraft === "snake" });
    this.faSlots = worstFirst.map((t) => ({ orig: t.id, team: t.id })); // free-agency order; slots can be traded too
    this.trade = null; this.turnIdx = 0;
    if (this.tradeEnabled()) return this.startTrade(1);
    this.step = "parts";
    this.setReveal({ kind: "offseason", season: g.seasonNo });
    this.after(this.p(5000), () => this.partsTurn());
    this.changed();
  }
  wishPick(t, p) {
    const g = this.game, n = needsOf(t);
    for (const key of p.wish) {
      const [slot, bonus] = String(key).split(":");
      if (!n.slots.includes(slot)) continue;
      const it = g.items.parts.find((x) => !x.taken && x.slot === slot && x.bonus === +bonus);
      if (it) return it;
    }
    return null;
  }
  // One place that records a re-draft pick: on the team, on the turn (so every screen can show who took what) and in the feed.
  takeTurn(turn, t, it) {
    takePart(this.game, t, it); turn.pick = it.id;
    this.pushFeed({ kind: "part", team: t.id, item: it.id, round: turn.round });
  }
  partsTurn() {
    const g = this.game, rd = g.rd;
    while (this.turnIdx < rd.turns.length) {
      const turn = rd.turns[this.turnIdx], t = g.teams[turn.team];
      const p = this.playerOfTeam(t.id);
      if (!needsOf(t).slots.length) { turn.skip = true; this.turnIdx++; continue; } // a team holding more picks than it has slots to fill passes
      if (!t.human || !p || !p.connected || p.auto) {
        // automatic turn: bots, absent players, or players on auto
        const it = (p && this.wishPick(t, p)) || (t.human ? bestPartFor(g, t) : botPartChoice(g, t, g.draftRng));
        if (it) this.takeTurn(turn, t, it);
        this.turnIdx++;
        this.step = "parts"; this.changed();
        return void this.after(t.human ? 500 : 130, () => this.partsTurn());
      }
      const w = this.wishPick(t, p);
      if (w) { this.takeTurn(turn, t, w); this.turnIdx++; this.changed(); return void this.after(400, () => this.partsTurn()); }
      this.step = "parts.turn"; this.openWindow();
      this.after(this.settings.partsSec * 1000, () => this.partsTimeout());
      return this.changed();
    }
    // Teams that traded picks away fill their last slots from whatever is left, worst team first.
    for (const r of fillMissingParts(g, this.worstFirst)) this.pushFeed({ kind: "part", team: r.team, item: r.item.id, round: 5 });
    this.startFA();
  }
  partsTimeout() {
    this.closeWindow();
    const g = this.game, turn = g.rd.turns[this.turnIdx], t = g.teams[turn.team];
    const it = t.human ? bestPartFor(g, t) : botPartChoice(g, t, g.draftRng);
    if (it) this.takeTurn(turn, t, it);
    this.turnIdx++; this.partsTurn();
  }
  pickPart(token, itemId) {
    const p = this.players.get(token); if (!p || this.step !== "parts.turn") return;
    const g = this.game, turn = g.rd.turns[this.turnIdx];
    if (!turn || turn.team !== p.teamId) return;
    const t = g.teams[turn.team], it = g.itemById.get(itemId), n = needsOf(t);
    if (!it || it.kind !== "part" || it.taken || !n.slots.includes(it.slot)) return;
    this.takeTurn(turn, t, it);
    this.turnIdx++; this.partsTurn();
  }
  setWish(token, list) {
    const p = this.players.get(token); if (!p) return;
    p.wish = (Array.isArray(list) ? list : []).filter((x) => typeof x === "string").slice(0, 30);
    if (this.step === "parts.turn" && this.game.rd.turns[this.turnIdx]?.team === p.teamId && p.wish.length) {
      const w = this.wishPick(this.game.teams[p.teamId], p);
      if (w) this.pickPart(token, w.id);
    }
    this.changed();
  }
  setAuto(token, on) { const p = this.players.get(token); if (!p) return; p.auto = !!on; this.changed(); if (on && this.step === "parts.turn" && this.game.rd.turns[this.turnIdx]?.team === p.teamId) this.skip(); }

  startFA() {
    this.faIdx = 0; this.step = "fa";
    this.faTurns = this.faSlots.map((x) => x.team);
    this.changed();
    this.after(this.p(2000), () => this.faTurn());
  }
  faTurn() {
    const g = this.game;
    while (this.faIdx < this.faTurns.length) {
      const t = g.teams[this.faTurns[this.faIdx]], p = this.playerOfTeam(t.id);
      if (!t.human || !p || !p.connected || p.auto) {
        botClaim(g, t); this.pushClaim(t); this.faIdx++; this.changed();
        return void this.after(t.human ? 400 : 110, () => this.faTurn());
      }
      this.step = "fa.turn"; this.openWindow();
      this.after(this.settings.faSec * 1000, () => this.faTimeout());
      return this.changed();
    }
    if (this.tradeEnabled()) return this.startTrade(2);
    this.startLock();
  }
  pushClaim(t) {
    this.pushFeed({ kind: "claim", team: t.id, driver: t.claimedDriver != null ? `d:${t.claimedDriver}` : null, principal: t.principal2 != null ? `p:${t.principal2}` : null });
  }
  faTimeout() { this.closeWindow(); const g = this.game, t = g.teams[this.faTurns[this.faIdx]]; botClaim(g, t); this.pushClaim(t); this.faIdx++; this.faTurn(); }
  faClaim(token, driverId, principalId) {
    const p = this.players.get(token); if (!p || this.step !== "fa.turn") return;
    const g = this.game, t = g.teams[this.faTurns[this.faIdx]]; if (t.id !== p.teamId) return;
    const d = driverId ? g.itemById.get(driverId) : null, pr = principalId ? g.itemById.get(principalId) : null;
    claimFA(g, t, d && d.kind === "driver" && !d.taken ? d : null, pr && pr.kind === "principal" && !pr.taken ? pr : null);
    this.pushClaim(t); this.faIdx++; this.faTurn();
  }

  startLock() {
    ensureLineups(this.game, this.worstFirst); // anyone still short after trades gets the best of what is left
    this.step = "lock"; this.openWindow(); this.keepChoices = new Map(); this.keepConfirmed = new Set();
    this.lockHumans = this.humanTeams().filter((t) => t.drivers.length > 2 || principalsOf(t).length > 1).map((t) => t.id);
    if (!this.lockHumans.length) return this.finishLock();
    this.after(this.settings.lockSec * 1000, () => this.finishLock());
    this.changed();
  }
  setKeep(token, drivers, principal, confirm) {
    const p = this.players.get(token); if (!p || this.step !== "lock" || !this.lockHumans.includes(p.teamId)) return;
    const t = this.game.teams[p.teamId];
    const ds = (drivers || []).map(Number).filter((x) => t.drivers.includes(x));
    this.keepChoices.set(t.id, { drivers: ds.length === 2 ? ds : undefined, principal: principalsOf(t).includes(+principal) ? +principal : undefined });
    if (confirm) this.keepConfirmed.add(t.id); else this.keepConfirmed.delete(t.id);
    this.changed();
    if (this.lockHumans.every((id) => this.keepConfirmed.has(id) || !this.playerOfTeam(id)?.connected)) this.after(1000, () => this.finishLock());
  }
  finishLock() {
    this.closeWindow();
    const g = this.game, keep = new Map();
    for (const [id, c] of this.keepChoices) keep.set(id, c);
    lockIn(g, keep);
    this.step = "offseason.done";
    this.setReveal({ kind: "lineups", season: g.seasonNo });
    this.save("preseason");
    this.after(this.p(14000), () => this.beginSeason());
    this.changed();
  }

  // ---------- reveals, feed, persistence ----------
  setReveal(r) { this.revealSeq++; this.reveal = { seq: this.revealSeq, ...r }; }
  pushFeed(e) { this.feed.push({ ...e, n: ++this.feedN || (this.feedN = 1) }); if (this.feed.length > KEEP_FEED) this.feed.shift(); }

  save(kind) {
    const g = this.game;
    const snap = {
      code: this.code, hostToken: this.hostToken, seed: this.seed, settings: this.settings, kind, created: this.created,
      N: g.N, archetypes: g.teams.map((t) => t.bot), seasonNo: g.seasonNo, prevFinale: g.prevFinale, history: g.history,
      players: [...this.players.values()].map((p) => ({ token: p.token, name: p.name, teamName: p.teamName, livery: p.livery, teamId: p.teamId, auto: p.auto, wish: p.wish })),
      teams: g.teams.map((t) => ({ id: t.id, name: t.name, livery: t.livery, human: !!t.human, drivers: t.drivers, principal: t.principal, partIds: t.partIds, pts: t.pts, wins: t.wins, pos: t.pos, titles: t.titles, pickValue: t.pickValue, pref: t.pref, lastPre: t.lastPre, lastMid: t.lastMid })),
    };
    this.onSave(this, snap);
  }

  static restore(snap, { D, liveries, onChange, onSave }) {
    const room = new Room({ code: snap.code, D, liveries, hostToken: snap.hostToken, onChange, onSave });
    room.created = snap.created; room.seed = snap.seed; room.settings = { ...DEFAULTS, ...snap.settings };
    const g = createGame({ D, N: snap.N, seed: snap.seed, archetypes: snap.archetypes, draftResolve: "lottery", redraft: room.settings.redraft });
    g.seasonNo = snap.seasonNo; g.prevFinale = snap.prevFinale; g.history = snap.history || [];
    for (const st of snap.teams) {
      const t = g.teams[st.id];
      Object.assign(t, { name: st.name, livery: st.livery, human: st.human, pts: st.pts, wins: st.wins, pos: st.pos, titles: st.titles, pickValue: st.pickValue, pref: st.pref, lastPre: st.lastPre, lastMid: st.lastMid });
      for (const ref of st.drivers) { const it = g.items.drivers[ref]; it.taken = true; it.owner = t.id; t.drivers.push(ref); }
      const pi = g.items.principals[st.principal]; pi.taken = true; pi.owner = t.id; t.principal = st.principal;
      for (const [slot, id] of Object.entries(st.partIds)) { const it = g.itemById.get(id); it.taken = true; it.owner = t.id; t.partIds[slot] = id; t.parts[slot] = it.bonus; }
    }
    g.pool = makePool(g.items);
    for (const sp of snap.players) room.players.set(sp.token, { ...sp, connected: false });
    room.game = g; room.rng = makeRng(snap.seed, "live", g.seasonNo);
    g.draftRng = makeRng(snap.seed, "draft", g.seasonNo, "restored");
    room.draftRound = 7;
    room.phase = snap.kind === "seasonEnd" ? "season" : "draft";
    if (snap.kind === "seasonEnd") {
      room.lastStandings = standingsOf(g);
      room.step = "season.end";
      room.setReveal({ kind: "season", season: g.seasonNo, standings: room.lastStandings.map((t) => ({ id: t.id, pts: t.pts, wins: t.wins })), champion: room.lastStandings[0].id });
    } else {
      room.step = "draft.done";
      room.setReveal({ kind: "lineups", season: g.seasonNo });
    }
    room.restored = true;
    return room;
  }

  // Did a taken gamble pay off? null while it is still open (not taken yet, or a weather bet before lights out).
  gambleWin(pu, phase) {
    if (pu.took !== true) return null;
    if (phase === "pre" && pu.opt.byRain) { const info = this.game.race.info; return info ? !!info.rain : null; }
    return pu.roll < pu.pS;
  }

  // ---------- views ----------
  teamPub(t) {
    const p = this.playerOfTeam(t.id);
    return { id: t.id, name: t.name, owner: p ? p.name : null, livery: t.livery, human: !!t.human, connected: t.human ? !!(p && p.connected) : true, idle: !!(p && p.idle), drivers: t.drivers, principal: t.principal, principal2: t.principal2 ?? null, spare: t.spare || [], parts: t.partIds, pts: t.pts, wins: t.wins, titles: t.titles, ptsBySeason: undefined };
  }

  view(token) {
    const g = this.game, me = this.players.get(token);
    const v = {
      room: this.code, phase: this.phase, step: this.step, paused: this.paused,
      deadline: this.deadline, dur: this.dur, now: Date.now(), settings: this.settings, host: this.isHost(token),
      players: [...this.players.values()].map((p) => ({ you: p.token === token, name: p.name, teamName: p.teamName, livery: p.livery, teamId: p.teamId, connected: p.connected, host: p.token === this.hostToken, auto: p.auto, idle: !!p.idle })),
      chat: this.chat.slice(-30), reveal: this.reveal, feed: this.feed,
      liveriesTaken: this.phase === "lobby" ? [...this.players.values()].filter((p) => p.livery).map((p) => p.livery) : [],
    };
    { const humans = [...this.players.values()].filter((q) => q.teamId != null && q.connected), votes = { up: 0, down: 0 };
      for (const [tk, d] of this.speedVotes || []) { const q = this.players.get(tk); if (q && q.connected) votes[d]++; }
      v.speed = { pace: this.settings.pace, levels: PACES, votes, need: Math.floor(humans.length / 2) + 1, mine: (this.speedVotes && this.speedVotes.get(token)) || null, note: this.paceNote || null }; }
    if (!g) return v;
    v.N = g.N; v.seasonNo = g.seasonNo; v.history = g.history;
    v.points = { format: pointsFormat(g.N), table: g.season ? g.season.table : pointsTable(g.N) };
    v.teams = g.teams.map((t) => this.teamPub(t));
    v.standings = standingsOf(g).map((t) => t.id);
    v.driverStandings = driverStandingsOf(g);
    const taken = {};
    for (const arr of [g.items.drivers, g.items.principals, g.items.parts]) for (const it of arr) if (it.taken && it.owner >= 0) taken[it.id] = it.owner;
    v.taken = taken;
    if (g.cal && this.phase !== "draft") v.calendar = g.cal.map((t) => t.id);
    if (this.phase === "draft" && g.draftRound) {
      v.draft = { round: this.draftRound, total: 7, locked: [...this.humanPicks].filter(([, h]) => h.locked).map(([id]) => id), humans: this.humanTeams().map((t) => t.id), order: g.draftRound.order.map((t) => t.id) };
    }
    if (this.phase === "season" && g.race) {
      const r = g.race;
      v.race = { round: this.raceIdx, total: 18, track: r.track.id, stage: r.stage, humanPopups: (this.popupHumans || []).length };
    }
    if (this.phase === "offseason" && g.rd) {
      const turns = g.rd.turns, cur = this.step.startsWith("parts") ? turns[this.turnIdx] : null;
      v.parts = { idx: this.turnIdx, total: turns.length, team: cur ? cur.team : null, round: cur ? cur.round : null, upNext: turns.slice(this.turnIdx + 1, this.turnIdx + 6).map((x) => x.team),
        turns: turns.map((x) => ({ r: x.round, t: x.team, o: x.orig, p: x.pick || null, s: x.skip ? 1 : 0 })), snake: this.settings.redraft === "snake" };
      if (this.step.startsWith("fa") || this.step === "lock" || this.step === "trade2") {
        v.fa = { idx: this.faIdx, total: this.faTurns.length, team: this.step === "fa.turn" ? this.faTurns[this.faIdx] : null, upNext: this.faTurns.slice(this.faIdx + 1, this.faIdx + 6) };
      }
      if (this.trade) v.trade = this.tradeView(token);
      if (this.step === "lock") v.lock = { teams: this.lockHumans, confirmed: [...this.keepConfirmed] };
    }
    if (me && me.teamId != null) {
      const t = g.teams[me.teamId];
      const mv = { teamId: t.id, needs: needsOf(t), auto: me.auto, wish: me.wish, idle: !!me.idle };
      if (this.phase === "draft") { const hp = this.humanPicks.get(t.id); mv.pick = hp ? { pri: hp.pri, alt: hp.alt, locked: hp.locked } : null; }
      if (this.phase === "season" && g.race && (this.step === "race.pre" || this.step === "race.mid")) {
        const set = this.step === "race.pre" ? g.race.pre : g.race.mid;
        const pu = set.get(t.id);
        if (pu) {
          const princ = g.D.principals[t.principal];
          mv.popup = { phase: this.step === "race.pre" ? "pre" : "mid", ...describeOption(pu.opt, g.P.decisions.scale), pS: pu.pS, stat: pu.opt.stat, statVal: princ[pu.opt.stat], base: pu.opt.p ?? null, took: pu.took, rainChance: g.race.track.rain, outcome: this.gambleWin(pu, this.step === "race.pre" ? "pre" : "mid") };
        }
      }
      if (this.phase === "season" && g.race && (this.step === "race.half" || this.step === "race.finish")) {
        const gam = [];
        for (const ph of ["pre", "mid"]) {
          const pu = (ph === "pre" ? g.race.pre : g.race.mid)?.get(t.id);
          if (pu && pu.took === true) gam.push({ phase: ph, ...describeOption(pu.opt, g.P.decisions.scale), outcome: this.gambleWin(pu, ph) });
        }
        if (gam.length) mv.gambles = gam;
      }
      if (this.step === "lock" && this.lockHumans.includes(t.id)) mv.keep = { drivers: t.drivers, principals: principalsOf(t), confirmed: this.keepConfirmed.has(t.id), choice: this.keepChoices.get(t.id) || null };
      if (this.step === "fa.turn" && this.faTurns[this.faIdx] === t.id) mv.faTurn = true;
      v.me = mv;
    }
    return v;
  }
}
Object.assign(Room.prototype, tradingMethods);
