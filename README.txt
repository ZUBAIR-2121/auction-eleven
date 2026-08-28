AUCTION ELEVEN — DRAGGABLE CHAT BUBBLE (v2 — fix)
=====================================================

WHAT WAS WRONG WITH v1
------------------------
The first attempt used a manual "start drag on pointer-down" trick
that broke normal tap-to-open on both PC and mobile, and limited how
far it could actually be dragged.

WHAT CHANGED IN THIS FIX
--------------------------
Switched to Framer Motion's standard, built-in drag pattern instead
of a manual one:
  - A plain tap/click on the bubble opens/closes chat, same as
    before you ever asked for dragging — this now works reliably on
    both PC and mobile again.
  - Pressing and actually moving your finger/mouse drags the bubble
    freely around the screen.
  - The chat window (when open) moves together with the bubble.
  - Double-click/double-tap resets it to the default corner.
  - Its position is remembered across reloads.

HOW TO APPLY
------------
1. Copy the two files into your project, overwriting the originals:
     apps/web/src/main.tsx
     apps/web/src/styles.css
2. Test locally: npm run dev
   - Click/tap the bubble normally — chat should open/close.
   - Press and drag it — it should move and stay wherever you drop
     it, on both a mouse and a touch/mobile-emulated view.
3. Commit and push:
     git add -A
     git commit -m "Fix draggable chat bubble: restore tap-to-open, fix drag range"
     git push
