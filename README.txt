AUCTION ELEVEN — BLURRY-TO-CLEAR REVEAL (replaces the directional wipe)
============================================================================

WHAT CHANGED
------------
Per your choice, this replaces the directional-wipe/resolution-ladder
reveal with the simplest style: ONE real photo per round, blurred
heavily with CSS at the start, gradually sharpening to fully clear as
the timer counts down — the classic "guess the blurry photo" look.

IMPORTANT — SECURITY TRADE-OFF (please read)
-----------------------------------------------
This is simpler, but it brings back exactly the anti-cheat gap your
original spec asked to avoid: the browser downloads the real, correct
photo immediately at the start of the round (blurred only by CSS). A
player who opens DevTools and deletes the `filter: blur(...)` style
sees the clear, correct photo instantly, at any point in the round,
before anyone has a fair chance to guess. There is no way to prevent
that with a client-side-only blur — the pixels are already fully
present in the browser's memory the moment the image loads.

If that's an acceptable trade-off for how you'll actually use this
(friends, casual play), this is the right, simplest choice. If you
later want it cheat-resistant again while keeping this exact visual
style, the fix is to blur server-side (so the browser only ever
receives an already-blurred image, never the clear pixels) — that's
a bigger change than this one; just ask if you want it.

WHAT'S IN THIS FOLDER (4 files)
----------------------------------
  apps/web/src/main.tsx
    - BlindRevealImage rewritten: fetches ONE fixed image per round
      instead of swapping between resolution stages, and applies a
      continuous CSS blur (26px -> ~0px) driven by the same
      authoritative server timestamps as before, so it stays in sync
      across the room and recovers correctly after a reconnect.
    - The "REVEAL STAGE X/6" badge is now "CLARITY X%".

  apps/web/src/styles.css
    - Swapped the old clip-path wipe transition for a smooth blur
      transition, plus a very slight zoom while blurred (a standard
      trick that hides the faint edge halo blur filters can create).

  apps/server/src/roomManager.ts
    - getBlindRevealFootballer now allows the full-resolution (stage
      5) asset to be requested for the WHOLE round, not just once
      revealed — required so the client can hold one steady image and
      blur it locally instead of re-fetching a new file each stage.
      Still rejects an invalid/expired round token exactly as before.

  apps/server/test/roomFlow.test.ts
    - Updated the one test that specifically checked the old "stage 5
      blocked early" behavior, since that's now intentionally
      different. Added an explicit check that an invalid token is
      still rejected regardless of stage.

VERIFIED
--------
  apps/web:    npm run typecheck  -> pass
               npx vite build     -> pass
  apps/server: npm run typecheck  -> pass
               npm test           -> 150/150 pass, run 4 times back to
                                      back with no flakiness
               npm run build      -> pass

HOW TO APPLY (PowerShell)
---------------------------
1. Unzip this folder, then copy the 4 files into your project,
   overwriting the originals at the same paths:
     apps/web/src/main.tsx
     apps/web/src/styles.css
     apps/server/src/roomManager.ts
     apps/server/test/roomFlow.test.ts

2. Verify locally:
     cd apps\server
     npm run typecheck
     npm test
     npm run build
     cd ..\web
     npm run typecheck

3. Test it for real: start a Blind Auction round and watch the image
   sharpen smoothly as the timer runs down.

4. Commit and push:
     git add -A
     git commit -m "Switch Blind Auction reveal to CSS blur-to-clear (simpler, replaces directional wipe)"
     git push

   Both Vercel (web) and Render (server, since roomManager.ts changed)
   will redeploy.
