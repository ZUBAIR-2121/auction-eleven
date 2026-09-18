Blind Auction patch v2
======================

What this patch changes:
1) Fixes blind-auction player images so the real local player image pack is used instead of depending on Wikimedia at runtime.
2) Fixes player framing in the blind-auction card so portrait images are shown properly inside the frame.
3) Adds a new Blind Auction setting: REVEAL STYLE
   - BLUR
   - RANDOM WIPE
4) RANDOM WIPE reveals the same hidden player image progressively from a random direction every round:
   - top-down
   - bottom-up
   - left-right
   - right-left

Files included:
- packages/shared/src/index.ts
- apps/server/src/gameEngine.ts
- apps/server/src/roomManager.ts
- apps/server/src/blindReveal.ts
- apps/server/src/localPlayerImages.ts
- apps/server/test/blindReveal.test.ts
- apps/web/src/main.tsx
- apps/web/src/styles.css

How to apply:
- Copy these files into your project using the same folder paths.
- Keep your existing apps/server/player-images folder in place.
- Redeploy both frontend and backend after replacing the files.
