AUCTION ELEVEN — MOBILE SCROLL FIX + BLIND AUCTION LOCK
=========================================================

WHAT'S IN THIS FOLDER
----------------------
Only 2 files changed — same paths as in your project:
  apps/web/src/main.tsx
  apps/web/src/styles.css

WHAT CHANGED
------------
1. Mobile scroll fix — Lobby ("Room Managers") page and Results page
   ("Final Leaderboard" / "Awards" / "Squads") now use a dedicated,
   high-priority scroll container so touch-scrolling works reliably
   on phones. Desktop/mouse layout is untouched (fix only applies on
   touch devices / narrow screens).

2. Blind Auction locked — tapping "Blind Auction" in the lobby now
   shows a "Blind Auction is under development. Coming soon!" message
   and a SOON badge, instead of switching game modes.

HOW TO APPLY (VS Code)
-----------------------
1. Unzip this folder.
2. Copy the two files into your project, overwriting the originals:
     apps/web/src/main.tsx
     apps/web/src/styles.css
   (In VS Code: drag-and-drop the files from this folder's
   apps/web/src/ into your project's apps/web/src/, choose
   "Replace" when prompted.)

3. Test locally:
     npm run dev
   Open the app, resize your browser to a phone width (or use
   Chrome DevTools device toolbar) and confirm the lobby and
   results pages scroll.

4. Commit and push:
     git add apps/web/src/main.tsx apps/web/src/styles.css
     git commit -m "Fix mobile scrolling on lobby/results pages; lock Blind Auction"
     git push

DEPLOYING
---------
- Vercel (web app): if it's connected to your GitHub repo, pushing
  to your main branch auto-deploys — no extra command needed. If you
  deploy manually instead, run:
     vercel --prod
  from the apps/web folder (or your usual deploy command).

- Render (server): the server code (apps/server) was NOT changed in
  this fix, so no redeploy is needed there unless you want to be
  safe — in that case just trigger a redeploy from the Render
  dashboard ("Manual Deploy" > "Deploy latest commit").

NOTES
-----
- I did NOT touch the Formation/team-setup page in this pass since
  it has delicate drag-and-drop logic I can't test live. If it also
  doesn't scroll on mobile, tell me and I'll apply the same fix there.
- If after deploying the lobby/results pages still don't scroll on a
  real phone, it's worth checking whether your phone browser has any
  extensions/reader mode active, and clearing the site cache (old
  cached CSS/JS can look like the fix "didn't work").
