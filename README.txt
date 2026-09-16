AUCTION ELEVEN — BLIND AUCTION: UNLOCKED, 45s TIMER, DIRECTIONAL WIPE REVEAL
================================================================================

WHAT WAS ACTUALLY WRONG / MISSING
------------------------------------
Your spec assumed Blind Auction needed to be built from scratch. It didn't —
your existing codebase already has a genuinely solid implementation:
  - Server-authoritative reveal timing (no drift, survives reconnects/tab
    switches automatically because it's recomputed from timestamps, not a
    running client clock)
  - Progressive hints gated by reveal stage
  - A real alias/typo-tolerant guess-matching system with automatic
    ambiguity detection (a typed "Ronaldo" correctly returns "ambiguous"
    when more than one Ronaldo exists in the pool)
  - No-repeat player pooling by unique ID (shared with the normal auction)
  - Anti-cheat: the hidden player's name/clear image is never sent to the
    browser before the server authorizes it; images are served through an
    opaque per-room token, not a clear image hidden with CSS
  - Clean per-round timer cleanup, single-award guarantees, no-guess
    fallback to quick auction or skip

The three genuine gaps were:
  1. Blind Auction was LOCKED in your lobby UI (from an earlier request in
     this conversation to disable it) — nobody could actually select it.
  2. No 45-second timer option (only 10/15/20/30 existed).
  3. The reveal was resolution/blur-based (low-res -> high-res), not the
     directional wipe (top-down / bottom-up / left-right / right-left)
     you described.

Along the way, running your full test suite also surfaced two PRE-EXISTING,
unrelated test bugs (not caused by Blind Auction): a test helper was
generating manager names longer than your 18-character limit, which threw
and, as a side effect, made one unrelated "I'M DONE" completion test flaky.
Both are fixed.

WHAT CHANGED (5 files)
------------------------
  packages/shared/src/index.ts
    - Added BlindRevealDirection type and getBlindWipeProgress() helper
      (continuous 0-1 progress from the same authoritative timestamps
      already used for reveal stages).
    - Added revealDirection to BlindRoundPublicState.
    - Widened blindRevealSeconds to include 45.

  apps/server/src/roomManager.ts
    - Picks one of the 4 directions at random per round, stored on the
      room and included in the broadcast state (so every client agrees).
    - Accepts 45s in the settings validator.

  apps/server/test/roomFlow.test.ts
    - Fixed the over-long test names (root cause of 3 failures + 1 flaky
      test).
    - Added 2 new tests: direction is one of the 4 valid values and stays
      stable for the whole round; and directions actually vary across
      many rounds (not hard-coded).

  apps/web/src/main.tsx
    - Blind Auction is unlocked in the lobby again (real button, not the
      "under development" message).
    - Added 45s to the timer selector.
    - BlindRevealImage now computes a continuous wipe progress and applies
      a CSS clip-path in the server-chosen direction on top of the
      existing secure staged image — so it looks like a directional quiz
      reveal while keeping the exact same anti-cheat guarantee (the
      browser still only ever receives the resolution the server has
      currently authorized).

  apps/web/src/styles.css
    - Removed the old "locked/under development" button styling.
    - Added a smooth clip-path transition for the wipe (respects your
      existing prefers-reduced-motion rule, which already turns off
      reveal-frame transitions for that setting).

VERIFIED
--------
  packages/shared:  npm run typecheck  -> pass
  apps/server:      npm run typecheck  -> pass
                     npm test          -> 144/144 pass
                     npm run build     -> pass
  apps/web:         npm run typecheck  -> pass
                     npx vite build    -> pass

HOW TO APPLY (PowerShell)
---------------------------
1. Unzip this folder, then copy the 5 files into your project, overwriting
   the originals at the same paths:
     packages/shared/src/index.ts
     apps/server/src/roomManager.ts
     apps/server/test/roomFlow.test.ts
     apps/web/src/main.tsx
     apps/web/src/styles.css

2. Verify locally before pushing:
     cd apps\server
     npm run typecheck
     npm test
     npm run build
     cd ..\web
     npm run typecheck

3. Test it for real: npm run dev in apps/web (and your server), create a
   room, switch Game Mode to Blind Auction, pick a timer including 45s,
   start a match, and confirm the image wipes in from a direction instead
   of just getting less blurry.

4. Commit and push:
     git add -A
     git commit -m "Unlock Blind Auction: 45s timer, directional wipe reveal, fix flaky tests"
     git push

   Vercel auto-deploys on push. Render will redeploy the server since
   apps/server changed — watch both dashboards for a clean build.

NOTES
-----
- I deliberately did NOT rebuild the alias system, the hint system, the
  server-authoritative timing, or the anti-cheat asset serving — they
  were already correct and already covered by passing tests. Rebuilding
  working, tested code would only have introduced risk.
- If you want the wipe to feel faster/slower or want a visible seam/edge
  glow on the reveal boundary, that's a quick follow-up — just ask.
