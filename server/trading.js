// Trade windows for the off-season, mixed into Room. Window 1 opens before the parts re-draft (drivers, principals, re-draft picks,
// free-agency picks). Window 2 opens after free agency (drivers and principals only). Players answer each other; autopilot teams
// answer by value. Every trade is checked again at the moment it happens, so a stale offer can never move something twice.
import { validateOffer, executeOffer, pickEstimates, valuer, botVerdict, MAX_SIDE } from "../engine/trade.js";

// An offer needs both sides: it starts "open" (waiting for the other team), becomes "agreed" when they accept, and only moves
// assets once the team that made it confirms. That also covers autopilot teams, so a probe never trades by accident.
const live = (o) => o.status === "open" || o.status === "agreed";
const OPEN_LIMIT = 4, OFFER_LIMIT = 40;
const speed = () => +process.env.TEST_SPEED || 1;

export const tradingMethods = {
  tradeCtx() { return { g: this.game, turns: this.game.rd.turns, fa: this.faSlots }; },
  inTrade() { return this.trade && (this.step === "trade" || this.step === "trade2"); },
  // Human teams that can still act: connected and not on auto-pilot.
  tradeActive() { return this.humanTeams().filter((t) => { const p = this.playerOfTeam(t.id); return p && p.connected && !p.auto; }); },
  tradeEnabled() { return this.settings.trading !== false && this.tradeActive().length > 0; },

  startTrade(stage) {
    const prev = this.trade;
    this.trade = { stage, offers: [], next: prev ? prev.next : 1, done: new Set(), sent: new Map(), notes: new Map() };
    this.tradeVc = valuer(this.game, this.game.rd.turns, this.faSlots);
    const sec = stage === 1 ? this.settings.tradeSec : Math.max(30, Math.round(this.settings.tradeSec / 2));
    this.tradeSecs = sec;
    this.step = stage === 1 ? "trade" : "trade2";
    this.setReveal({ kind: "trade", stage });
    this.openWindow(); this.tradeQuick = false; this.tradeEndAt = Date.now() + (sec * 1000) / speed();
    this.after(sec * 1000, () => this.endTrade());
    // Nobody to trade with (everyone away or on auto): do not hold the room up.
    if (!this.tradeActive().length) this.after(800, () => this.endTrade());
    this.changed();
  },
  endTrade() {
    if (!this.trade) return;
    this.closeWindow();
    for (const o of this.trade.offers) if (live(o)) { o.status = "void"; o.note = "The window closed."; }
    const stage = this.trade.stage;
    if (stage === 1) {
      this.turnIdx = 0; this.step = "parts";
      this.setReveal({ kind: "offseason", season: this.game.seasonNo });
      this.after(this.p(3500), () => this.partsTurn());
      this.changed();
    } else this.startLock();
  },

  tradeNote(token, text) { if (this.trade) this.trade.notes.set(token, { id: (this.trade.notes.get(token)?.id || 0) + 1, text }); this.changed(); },

  tradeOffer(token, to, give, get) {
    const p = this.players.get(token); if (!p || p.teamId == null || !this.inTrade()) return;
    const g = this.game; to = +to;
    const target = g.teams[to]; if (!target) return;
    const tp = this.playerOfTeam(to);
    if (target.human && tp && !tp.connected) return this.tradeNote(token, `${target.name} is offline.`);
    const mine = this.trade.offers.filter((o) => o.from === p.teamId);
    if (mine.filter(live).length >= OPEN_LIMIT) return this.tradeNote(token, `You already have ${OPEN_LIMIT} offers waiting. Cancel one first.`);
    if (mine.length >= OFFER_LIMIT) return this.tradeNote(token, "That is enough offers for one window.");
    give = [...new Set(Array.isArray(give) ? give.map(String) : [])]; get = [...new Set(Array.isArray(get) ? get.map(String) : [])];
    const err = validateOffer(this.tradeCtx(), this.trade.stage, p.teamId, to, give, get);
    if (err) return this.tradeNote(token, err);
    const offer = { id: this.trade.next++, from: p.teamId, to, give, get, status: "open", note: "" };
    this.trade.offers.push(offer);
    // Autopilot teams (and players who left their team on auto) answer after a short think.
    if (!target.human || (tp && tp.auto)) this.botRespond(offer);
    this.changed();
  },
  botRespond(offer) {
    const delay = (1100 + Math.random() * 1700) / speed();
    const t = setTimeout(() => {
      if (!this.trade || offer.status !== "open" || !this.inTrade()) return;
      const ctx = this.tradeCtx();
      if (validateOffer(ctx, this.trade.stage, offer.from, offer.to, offer.give, offer.get)) { offer.status = "void"; offer.note = "An asset moved."; return this.changed(); }
      const v = botVerdict(ctx, this.tradeVc, offer.to, offer.give, offer.get, Math.random);
      if (v.accept) { offer.status = "agreed"; offer.note = "They accept. Confirm to complete the deal."; return this.changed(); }
      offer.status = "declined"; offer.note = v.close ? "Close. Sweeten the deal." : "Not interested.";
      this.changed();
    }, delay);
    if (t.unref) t.unref();
  },
  tradeRespond(token, id, accept) {
    const p = this.players.get(token); if (!p || p.teamId == null || !this.inTrade()) return;
    const offer = this.trade.offers.find((o) => o.id === +id);
    if (!offer || offer.status !== "open" || offer.to !== p.teamId) return;
    if (!accept) { offer.status = "declined"; offer.note = "Declined."; return this.changed(); }
    const err = validateOffer(this.tradeCtx(), this.trade.stage, offer.from, offer.to, offer.give, offer.get);
    if (err) { offer.status = "void"; offer.note = "An asset moved."; this.tradeNote(token, "That offer is no longer valid."); return; }
    offer.status = "agreed"; offer.note = "Accepted. Waiting for them to confirm."; this.changed();
  },
  // The team that made the offer has the last word.
  tradeConfirm(token, id) {
    const p = this.players.get(token); if (!p || p.teamId == null || !this.inTrade()) return;
    const offer = this.trade.offers.find((o) => o.id === +id);
    if (!offer || offer.status !== "agreed" || offer.from !== p.teamId) return;
    const err = validateOffer(this.tradeCtx(), this.trade.stage, offer.from, offer.to, offer.give, offer.get);
    if (err) { offer.status = "void"; offer.note = "An asset moved."; this.tradeNote(token, "That deal is no longer valid."); return; }
    this.doTrade(offer, "Done.");
  },
  tradeCancel(token, id) {
    const p = this.players.get(token); if (!p || !this.inTrade()) return;
    const offer = this.trade.offers.find((o) => o.id === +id);
    if (!offer || !live(offer) || offer.from !== p.teamId) return;
    offer.status = "cancelled"; offer.note = "Withdrawn."; this.changed();
  },
  doTrade(offer, note) {
    const ctx = this.tradeCtx(), rec = executeOffer(ctx, offer);
    offer.status = "accepted"; offer.note = note;
    this.pushFeed({ kind: "trade", ...rec });
    for (const o of this.trade.offers) {
      if (live(o) && validateOffer(ctx, this.trade.stage, o.from, o.to, o.give, o.get)) { o.status = "void"; o.note = "An asset moved."; }
    }
    this.tradeVc = valuer(this.game, this.game.rd.turns, this.faSlots);
    this.changed();
  },
  tradeDone(token, on) {
    const p = this.players.get(token); if (!p || p.teamId == null || !this.inTrade()) return;
    if (on) this.trade.done.add(p.teamId); else this.trade.done.delete(p.teamId);
    this.changed();
    this.tradeMaybeEnd();
  },
  // Everyone who can still act is finished: wrap up early. Un-readying puts the clock back.
  tradeMaybeEnd() {
    if (!this.inTrade()) return;
    const waiting = this.tradeActive().filter((t) => !this.trade.done.has(t.id));
    if (!waiting.length) { this.tradeQuick = true; this.after(1200, () => this.endTrade()); }
    else if (this.tradeQuick) { this.tradeQuick = false; this.after(Math.max(2000, this.tradeEndAt - Date.now()), () => this.endTrade()); }
  },

  tradeView(token) {
    const g = this.game, T = this.trade, me = this.players.get(token), mine = me && me.teamId != null ? me.teamId : null;
    const turns = g.rd ? g.rd.turns : [];
    const offers = T.offers.filter((o) => mine != null && (o.from === mine || o.to === mine)).slice(-14).reverse()
      .map((o) => ({ id: o.id, from: o.from, to: o.to, give: o.give, get: o.get, status: o.status, note: o.note }));
    const note = T.notes.get(token) || null;
    return {
      stage: T.stage, open: this.inTrade(), max: MAX_SIDE,
      picks: turns.map((x) => ({ r: x.round, o: x.orig, w: x.team })),
      fa: this.faSlots.map((x) => ({ o: x.orig, w: x.team })),
      est: pickEstimates(g, turns.length),
      done: [...T.done], active: this.tradeActive().map((t) => t.id),
      offers, note,
    };
  },
};
