# Auction Eleven v2.0.3 — Results / Awards Mobile Scroll Fix

## Root cause

The Results screen had two competing scroll models on mobile:

- global mobile recovery CSS kept the document/body scrollable and forced `.results` toward document-flow scrolling;
- a later Results rule also clamped the `<main>` element to one viewport and made that same `<main>` an internal `overflow-y:auto` scroller.

That nested/competing ownership was fragile on Android/iOS and could leave the Results screen visually clipped even though more result content existed below the Awards panel.

The base `.awards { overflow:hidden; }` rule existed, but mobile overrides already changed its vertical overflow; the Awards panel itself was not supposed to be the scroll owner.

A stale Formation body lock was also audited. `releaseDocumentScrollLock()` is already called when leaving Formation and again when Results mounts, so that was not the primary root cause.

The floating chat launcher also needed more clearance: the mobile Results bottom padding could be smaller than the launcher plus its safe-area/bottom offset.

## Fix

- Results is now a dedicated 100dvh flex screen.
- The Results shell never scrolls.
- One child `.results-scroll-area` is the only vertical scroll owner.
- The scroll area uses `flex:1`, `min-height:0`, `overflow-y:auto`, `-webkit-overflow-scrolling:touch`, and `touch-action:pan-y pinch-zoom`.
- Safe-area-aware top/bottom spacing is included.
- Extra bottom reserve lets the final award/squad/action move fully above the floating chat launcher.
- Low-height landscape receives a tighter top offset while keeping full vertical scrolling.
- Results scroll position resets only when Results first opens; opening/closing chat does not reset it.
- No global body-scroll behavior was changed for Lobby/Auction/Formation.

## Files

- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`

## Validation in packaging environment

- Shared TypeScript: passed
- Server TypeScript: passed
- Web TypeScript: passed
- Full Vitest/Vite execution is blocked in this Linux packaging environment by the copied Windows dependency tree missing `@rollup/rollup-linux-x64-gnu`. Run `npm test` and `npm run build` on the normal Windows project before deployment.
