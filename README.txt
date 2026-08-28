AUCTION ELEVEN — DRAGGABLE CHAT BUBBLE
========================================

WHAT'S IN THIS FOLDER
----------------------
Same 2 files as before, updated further:
  apps/web/src/main.tsx
  apps/web/src/styles.css

WHAT CHANGED
------------
The chat bubble (💬) in the bottom-right corner can now be:
  - Dragged anywhere on screen (grab it and move it).
  - Tapped normally to open/close the chat (a small tap still opens
    it — only a real drag moves it, so nothing breaks).
  - Double-clicked/double-tapped to snap it back to its original
    position, if it ends up somewhere awkward.

Its position is saved (per device/browser) so it stays where you put
it the next time you open the app.

It's constrained so you can't drag it off-screen or lose it behind
other UI.

HOW TO APPLY
------------
1. Copy the two files into your project, overwriting the originals:
     apps/web/src/main.tsx
     apps/web/src/styles.css
2. Test locally: npm run dev — try dragging the chat bubble around,
   then reload the page and confirm it stays where you left it.
3. Commit and push:
     git add -A
     git commit -m "Make chat bubble draggable and repositionable"
     git push

NOTES
-----
- The chat WINDOW itself (when open) is not separately draggable —
  it opens anchored near wherever you've moved the bubble to, which
  is the intended behavior since they move together.
- If you'd rather it NOT remember position across reloads (always
  reset to the default spot each time), tell me and I'll remove the
  save/restore part — it's a one-line change.
