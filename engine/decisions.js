// The two option pools (12 pre-race, 12 mid-race). Effects are in rating points; tune here.
// Pre-race: p = whole race, p1/p2 = one half. Mid-race: p2 = second half only.
// crash/fail = fractional change to that incident chance (+0.4 = 40% more likely). grid = places lost on the grid.
// lead/other = effects for the team's better car and its other car.
export const PRE = [
  { id: "q_push", name: "Qualifying push", stat: "mentality", p: 58, win: { q: 5 }, lose: { q: -4, crash: 0.4 }, text: "Better qualifying pace, small crash risk." },
  { id: "engine_up", name: "Engine turned up", stat: "mechanical", p: 55, win: { p: 2.0 }, lose: { p: -0.6, fail: 1.5 }, text: "More race pace, higher failure chance." },
  { id: "tyre_strat", name: "Aggressive tyre strategy", stat: "strategy", p: 55, win: { p: 2.4 }, lose: { p: -2.2 }, text: "One stop instead of two." },
  { id: "wet_setup", name: "Wet-weather setup", stat: "strategy", byRain: true, rainWin: { p: 4 }, dryLose: { p: -1.8 }, cond: "rainHigh", text: "A bet on rain." },
  { id: "low_drag", name: "Low-drag setup", stat: "mechanical", p: 55, win: { p: 2.2 }, lose: { p: -1.8 }, text: "More straight-line speed, less cornering." },
  { id: "team_orders", name: "Team orders", stat: "mentality", p: 60, win: { lead: { p: 3.2 }, other: { p: -1.0 } }, lose: { lead: { p: -0.5 }, other: { p: -2.5 } }, text: "One lead car gets a boost." },
  { id: "fresh_engine", name: "Fresh engine", stat: "mechanical", p: 60, win: { p: 2.5, grid: 3 }, lose: { p: -0.5, grid: 3 }, text: "A grid penalty for race pace." },
  { id: "experimental", name: "Experimental upgrade", stat: "mechanical", p: 50, win: { p: 3.2, q: 2 }, lose: { p: -2.8, fail: 1.0 }, text: "It works or it does not." },
  { id: "pit_drills", name: "Pit-crew drills", stat: "mechanical", p: 55, win: { p: 0.8, pit: -0.7 }, lose: { pit: 1.2 }, text: "Faster stops, higher error risk." },
  { id: "fuel_light", name: "Fuel-light start", stat: "strategy", p: 55, win: { p1: 3.5, p2: -0.5 }, lose: { p1: 1.5, p2: -3 }, text: "Strong early pace, forced early stop." },
  { id: "off_leash", name: "Off the leash", stat: "mentality", p: 55, win: { p: 2.4, crash: 0.3 }, lose: { p: -0.8, crash: 0.9 }, text: "Both drivers attack." },
  { id: "long_run", name: "Long-run focus", stat: "strategy", p: 60, win: { q: -3, p: 3.3 }, lose: { q: -3, p: 0.5 }, text: "Worse qualifying, better tyre life." },
];
export const MID = [
  { id: "sc_pit", name: "Pit under the safety car", stat: "strategy", p: 55, cond: "sc", win: { p2: 6 }, lose: { p2: -5 } },
  { id: "undercut", name: "Undercut attempt", stat: "strategy", p: 55, win: { p2: 5 }, lose: { p2: -4 } },
  { id: "softs", name: "Softs for a final push", stat: "strategy", p: 50, win: { p2: 7 }, lose: { p2: -6 } },
  { id: "push_mode", name: "Push mode", stat: "mechanical", p: 55, win: { p2: 4.5 }, lose: { p2: -1.5, fail: 1.2 } },
  { id: "nurse", name: "Nurse the car", stat: "mechanical", p: 70, win: { fail: -0.6, p2: 0.3 }, lose: { fail: -0.3, p2: -3 } },
  { id: "inters", name: "Pit for inters", stat: "strategy", p: 55, cond: "rain", win: { p2: 7 }, lose: { p2: -6 } },
  { id: "risky_pass", name: "Risky pass", stat: "mentality", p: 50, win: { p2: 7 }, lose: { p2: -4, crash: 0.9 } },
  { id: "defend", name: "Defend at all costs", stat: "mentality", p: 55, win: { p2: 3 }, lose: { p2: -2.5, crash: 0.8 } },
  { id: "swap", name: "Swap by team order", stat: "mentality", p: 60, win: { lead: { p2: 4 }, other: { p2: -1.5 } }, lose: { lead: { p2: -1 }, other: { p2: -3 } } },
  { id: "tyre_save", name: "Tyre save for a late charge", stat: "strategy", p: 55, win: { p2: 5 }, lose: { p2: -4 } },
  { id: "double_stack", name: "Double-stack pit stop", stat: "mechanical", p: 50, win: { p2: 3 }, lose: { p2: -4.5 } },
  { id: "extra_stop", name: "Extra stop for fresh tyres", stat: "strategy", p: 55, win: { p2: 6 }, lose: { p2: -6 } },
];
