# Putting the game online (Plan B) — step by step

What you are doing: giving the game a permanent home on the internet so that every player opens one web address
and plays on the same server. You do this once (~30 minutes). After that, a game night is just "share the link".

Costs (render.com/pricing, checked Oct 2026): GitHub is free. Render's cheapest always-on paid web service is
US$7/month (512 MB RAM; may be labelled "Starter"). A persistent disk is $0.25 per GB per month, so the 1 GB
disk below is about 25 cents. You can suspend the service between game nights if you prefer.

## 1. Put the code on GitHub (one time)
1. Make a free account at github.com.
2. Click **New repository**, name it `driver-draft-game`, set it **Private**, create it.
3. On the new repo page choose **uploading an existing file** and drag in the *contents* of the unzipped game folder
   (do NOT upload `node_modules` or `saved`). Click **Commit changes**.
   (If you know git, `git push` works just as well.)

## 2. Create the server on Render (one time)
1. Make an account at render.com (sign in with GitHub).
2. **New +  →  Web Service**, connect the `driver-draft-game` repo.
3. Fill in:
   * Language / runtime: **Node**
   * Build command: `npm install`
   * Start command: `npm start`
   * Instance type: the **$7/month** one (512 MB) (the free tier goes to sleep after a period of no visitors and takes about a
     minute to wake, and has no persistent disk — fine for a quick test, not for a game night)
4. Under **Advanced → Add Disk**: name `saves`, mount path `/var/data`, size 1 GB.
5. Under **Environment**, add `DATA_DIR` = `/var/data` (the disk mount path), and `NODE_VERSION` = `22`.
6. Click **Create Web Service**. After a few minutes Render shows your address, like
   `https://driver-draft-game.onrender.com`. Open it — you should see the landing page.

Check: `https://<your address>/api/health` should show `{"ok":true,...}`.

## 3. Game night
1. Open the address, **Create room**, send the 4-letter code (and the address) to everyone.
2. Everyone opens the address and **Join**s. Put `/screen?room=CODE` on a projector if you have one.
3. Host presses **Start**. The host bar has Pause / Skip / Continue if something needs a breather.
4. If someone's connection drops, they reopen the address; the game recognises them and drops them back in.

## 4. Updating the game later
Upload changed files to GitHub (or push). Render rebuilds automatically (~2 minutes). Do not update in the middle
of a game: the restart interrupts the race in progress (the room is restored from its last save).

Adding team art: put the images in `public/liveries/<slug>/` on GitHub and commit.

## 5. Backup plan (no internet / host service down)
The same program runs on one laptop and everybody joins over the same wifi or the host's phone hotspot.
1. Install Node 22 (nodejs.org) on the host laptop and unzip the game folder.
2. In that folder run `npm install` once, then `npm start`.
3. The console prints "Others on the same wifi: http://192.168.x.x:3000". Everyone types that address.
4. If other laptops can't connect, allow Node through the host's firewall when the OS asks, and make sure the
   wifi doesn't isolate clients (some office/guest networks do — a phone hotspot usually works).

## Troubleshooting
* Players see "connecting…": wake the service by opening the address once; with the free tier this can take a minute.
* Game lost after a restart: the disk or `DATA_DIR` isn't set. Check step 2.4–2.5.
* More than ~30 players: the game is tuned for 10–30 teams per room.
