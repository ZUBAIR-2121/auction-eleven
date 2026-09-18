AUCTION ELEVEN - PREMIUM UI + 30 MANAGER CRESTS PATCH
=====================================================

WHAT THIS PATCH ADDS
--------------------
- 30 original Auction Eleven manager crest/logo choices.
- Manager chooses a crest next to their manager name before creating/joining a room.
- Selected crest is saved locally and sent to the server.
- Crests appear in lobby manager cards, live auction rivals, chat, formation waiting screen, round winner presentation, and final squad/results cards.
- Server validates crest IDs so clients cannot inject arbitrary image URLs.
- Bots also receive Auction Eleven crests.
- Footballer photo frame upgraded: full player image is preserved using a contain foreground plus a cinematic blurred backdrop instead of ugly cropping.
- Auction layout/presentation upgraded with stronger current-bid hierarchy, leader highlighting, premium bid buttons, and more cinematic panels.
- Last 5 seconds use a tension timer state.
- Optional SFX toggle added to the top bar. Bid, countdown, correct/wrong guess, round transition, and sold moments receive short UI tones.
- Blind Auction receives clue entrance animation, wrong-answer shake, correct-answer feedback, improved image framing, plus existing BLUR/RANDOM WIPE reveal support.
- Lobby, auction, round-result, formation-status, and results styling polished without adding a new game mode.
- Reduced-motion handling retained for accessibility/performance.

IMPORTANT
---------
Keep your existing:
  apps/server/player-images/
folder containing the footballer images. This patch does NOT duplicate those images.

HOW TO APPLY
------------
Extract this ZIP and copy/merge its folders into the ROOT of your Auction Eleven project.
Allow Windows to replace files with the same names.

Example project root:
  C:\Auction\auction-eleven

RUN / TEST / BUILD COMMANDS
---------------------------
Open PowerShell in C:\Auction\auction-eleven and run:

cd C:\Auction\auction-eleven
npm ci
npm run typecheck
npm test
npm run build

Verify the footballer image pack:

(Get-ChildItem .\apps\server\player-images -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|webp|avif)$' }).Count

Expected: 186

Run locally:

npm run dev

LOCAL TEST CHECKLIST
--------------------
1. Home -> pick a manager name and one of the 30 crests.
2. Create a room and confirm your crest is visible in lobby.
3. Join from another browser/incognito with a different crest.
4. Start normal auction and confirm crests appear in the rivals panel.
5. Confirm player photos are fitted rather than badly cropped.
6. Bid and confirm current bid + leader animations work.
7. Let timer reach 5 seconds and confirm tension state.
8. Test SFX on/off from top bar.
9. Blind Auction -> test BLUR.
10. Blind Auction -> test RANDOM WIPE over several players.
11. Wrong blind guess should shake; correct guess should give positive feedback.
12. Finish a match and confirm crests appear in results/squad cards.

GIT / VERCEL / RENDER COMMANDS
-------------------------------
After local test succeeds:

git status
git add -A
git status
git commit -m "Upgrade Auction Eleven UI and add 30 manager crests"
git push origin main

or branch-safe push:

git push origin HEAD

Recommended Vercel settings:
Install Command:
  npm ci
Build Command:
  npm run typecheck -w @auction-eleven/web && npm run build -w @auction-eleven/web
Output Directory:
  apps/web/dist

Recommended Render settings:
Build Command:
  npm ci && npm run typecheck && npm test && npm run build -w @auction-eleven/server
Start Command:
  npm run start -w @auction-eleven/server

VALIDATION NOTE
---------------
The modified TypeScript source passed full workspace TypeScript typechecking in the build environment.
The container could not execute Vitest/Vite production bundling from the uploaded Windows node_modules because Rollup's Linux native optional package is absent from that Windows dependency archive. On your Windows project, npm ci installs the correct platform packages; run the commands above before pushing.
