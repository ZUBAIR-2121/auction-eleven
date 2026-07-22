# Auction Eleven v0.8.2 — Formation Card Swap Fix

Copy everything inside this folder into your existing Auction Eleven project and replace matching files.

## Fixed
- Manual formation swaps now update the complete player card.
- The player portrait resets and reloads for the newly assigned footballer.
- Player name, natural position and OVR move together.
- A short transition makes each completed swap visually clear.
- The tactical slot role remains separate from the footballer's natural position.

## Install
1. Stop the dev server.
2. Copy this folder's contents into `C:\Auction\auction-eleven`.
3. Replace destination files.
4. Run:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Then hard-refresh the browser with Ctrl+F5 and create a new room.
