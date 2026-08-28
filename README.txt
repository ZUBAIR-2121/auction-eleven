AUCTION ELEVEN — DESIGN & ANIMATION POLISH PASS
=================================================

WHAT'S IN THIS FOLDER
----------------------
Same 2 files as before, updated further:
  apps/web/src/main.tsx
  apps/web/src/styles.css

WHAT CHANGED (animation-only, no layout/logic changes)
---------------------------------------------------------
LOBBY
  - Manager cards now stagger in on load, react to tap, and the
    READY/WAITING badge cross-fades instead of snapping.

RESULTS
  - Trophy pops in with a spring bounce, winner banner slides down.
  - Podium places (gold/silver/bronze) spring in one after another
    with a bouncing medal reveal.
  - Leaderboard rows and award cards slide/fade in staggered.
  - Squad cards fade in one by one.

LIVE BIDDING (ARENA)
  - The current bid number now pops/glows every time it changes —
    the single most important number on screen is now the most
    noticeable.
  - The leading manager's row pulses gently when they take the lead.
  - New accepted bids slide into the bid history feed instead of
    appearing instantly.

FORMATION PICKER
  - Formation buttons get tap/hover feedback and a smoother active-
    state transition.
  - Pitch slots and bench cards "pop" in with a CSS animation
    whenever a player is placed — done in pure CSS so it can NEVER
    interfere with the drag-and-drop logic (I deliberately did not
    touch the drag code itself, since that's fragile and untestable
    without a real device).

GLOBAL
  - All buttons get a subtle press-down feedback.
  - Respects prefers-reduced-motion (users with that OS setting get
    none of this — accessibility default).

HOW TO APPLY (same as last time)
-----------------------------------
1. Copy the two files into your project, overwriting the originals:
     apps/web/src/main.tsx
     apps/web/src/styles.css
2. Test locally: npm run dev
3. Commit and push:
     git add -A
     git commit -m "Add animation and design polish across lobby, results, arena, formation"
     git push
   (git add -A catches these plus anything else pending, same as
   the shared-package fix from before)

NOTES
-----
- This is a first pass focused on the highest-impact moments (bid
  changes, leader changes, winner reveal, ready status) rather than
  animating everything — per the "meaningful motion only" principle,
  so it stays fast on mid-range phones during a live auction.
- If you want a specific screen pushed further (e.g. a full
  pack-opening-style reveal for the winner, confetti, sound), tell
  me which one and I'll do a deeper pass on just that screen.
