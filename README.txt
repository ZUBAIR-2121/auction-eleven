AUCTION ELEVEN — BLIND AUCTION PLAYER IMAGE PATCH (CODE ONLY)

This patch is for your main auction-eleven project.
It does NOT contain the whole project.

REPLACE / ADD THESE FILES:
1) apps/server/src/blindReveal.ts        (replace existing file)
2) apps/server/src/localPlayerImages.ts  (new file)
3) apps/server/test/blindReveal.test.ts  (replace existing test so npm test checks the new local-image behavior)

PLAYER IMAGES:
Create this folder in your main project if it does not already exist:
  apps/server/player-images/

Then copy the 186 footballer image files from your downloaded images folder into it.
The files must be directly inside player-images, for example:
  apps/server/player-images/lionel-messi.jpg
  apps/server/player-images/cristiano-ronaldo.jpg
  apps/server/player-images/neymar.jpg

Do NOT put another nested images folder inside player-images.
Wrong: apps/server/player-images/images/lionel-messi.jpg
Right: apps/server/player-images/lionel-messi.jpg

NO FRONTEND FILE NEEDS REPLACING.
Your current apps/web/src/main.tsx already requests one fixed player image and progressively removes CSS blur as clarity increases.
This patch changes the server so that fixed image is loaded from your local real-player image pack instead of Wikimedia.

CHECK AFTER COPYING:
PowerShell from the project root:
  (Get-ChildItem .\apps\server\player-images -File | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png|webp|avif)$' }).Count

Expected result:
  186

Then run:
  npm run typecheck
  npm test
  npm run build
  npm run dev

DEPLOYMENT:
Commit these 3 code files AND apps/server/player-images/ to GitHub so Render receives the images.
Vercel frontend does not need a Blind Auction code replacement for this fix.
