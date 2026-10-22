# Driver Draft Game

A multiplayer motorsport draft game. 10–30 teams draft 2 drivers, 4 car parts and a team principal, then run an
18-race season (about 45–50 minutes), then trade (drivers, principals, re-draft picks and free-agency picks, with players and autopilot teams), re-draft parts, sign free agents, make final trades and lock in line-ups for the next season.
Everyone sees the same race at the same moment; the server decides everything.

## Run it on your own computer
```
npm install
npm start          # http://localhost:3000
```
The console also prints "Others on the same wifi: http://192.168.x.x:3000" — people on the same wifi/hotspot can
open that address on their laptops. That is the backup plan if the internet fails (see DEPLOY.md, part 5).

* Host: open the address, enter a name, **Create room**, share the 4-letter code, pick settings, **Start**.
* Players: open the address, enter a name and the code, **Join**.
* Big screen / projector: open `/screen?room=CODE` (watch only).

## Folders
| Folder | What it is |
|---|---|
| `engine/` | The game rules and simulation (pure code, no network). Tunables are in `engine/params.js`. |
| `server/` | The authoritative game server: rooms, timers, WebSocket, saving. |
| `public/` | The browser app (no build step). |
| `data/` | Drivers, principals, parts, tracks, pop-ups, liveries. |
| `tests/` | `node tests/e2e.js` plays full seasons with 30 simulated players. Balance tests are `t1`–`t8`. |
| `results/` | Saved balance-test output. |
| `tools/` | `clean_asset.py` (removes the magenta background from generated images). |

## Environment variables
* `PORT` — port to listen on (default 3000; Render sets this itself).
* `DATA_DIR` — where room saves go (default `./saved`). Point it at a persistent disk when hosting.

## Team art (optional — the game works without any of it)
Put images in `public/liveries/<slug>/` (slugs are in `data/liveries.json`):
* `icon.png` — square, ~256px, transparent background. Shown next to team names everywhere.
* `banner.png` — wide, transparent. Shown faintly in the top bar for that team's player.
* `wallpaper-dark.png` — full-screen background (dark) for that team's player.

Generated with a flat magenta background? Clean it with
`python3 tools/clean_asset.py raw.png public/liveries/castrol/icon.png --size 256` (needs `pip install pillow`).
Missing files simply fall back to colours from the livery palette.

## Good to know
* Rooms are saved after the draft, after each season and after lock-in. If the server restarts you can rejoin
  and continue from the last save; a race that was in progress restarts from its pre-race stage.
* Teams that nobody controls (fewer than the room minimum) are run by autopilot.
