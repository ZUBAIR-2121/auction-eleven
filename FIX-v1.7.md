# Auction Eleven v1.7 — Pass finalization + formation interaction fix

## Root cause: auction pass / sole bidder

The server already had an idempotent `transitionRoundId` guard and `endRound()` cancelled the active timer, but early-completion logic was fragmented. `pass()` checked whether the current leader had any challengers left, while `bid()` never re-evaluated bidder eligibility after accepting a bid. Therefore, if everyone except one manager had already passed and the final manager then made the opening bid, that valid bid could sit until the timer reached zero.

The fix adds one authoritative `evaluateAuctionCompletion()` path. It is called after accepted bids, passes, auction completion, and active-match disconnect/leave events. A round now finalizes immediately when a highest bidder exists and nobody else can place the next legal bid. If no bid exists, one remaining manager still has to place the opening bid; if nobody remains, the round becomes skipped immediately.

Pass requests now include a per-request ID as well as the round ID, so duplicate/stale pass requests are rejected/ignored consistently with bids. `endRound()` remains the single idempotent finalizer and cancels the actual auction timeout and bot timers before broadcasting the 2-second result state.

## Root cause: formation drag lag

The formation editor was mixing two drag architectures on the same cards:

- native HTML5 `draggable` / `dataTransfer` for mouse,
- custom Pointer Events for touch,
- Framer Motion elements on every starter card.

The touch pointer handler also called React `setDragPoint()` for every pointer movement. That caused the entire `FormationRoom` to re-render for virtually every finger movement. Because the render recalculated slot fit previews, rerendered the bench/pitch tree, and re-ran player-card JSX, the interaction became expensive on low-end devices.

Footballer `<img>` elements also used the browser default draggable behavior and the draggable card area lacked scoped `-webkit-touch-callout: none`, which allowed native image drag/copy/save behavior to interfere on mobile.

## Formation changes

- Removed native HTML5 dragging from formation cards.
- Uses one Pointer Events path for mouse, touch, and stylus.
- Uses `setPointerCapture()` for active drags where supported.
- Uses a short 120 ms touch hold (80 ms pen) and a small movement threshold so normal scrolling/tapping is still possible.
- Mouse drag activates after 3 px of movement.
- The drag overlay moves through `requestAnimationFrame()` + `translate3d()` by directly updating one overlay element. React state is not changed on every pointer pixel.
- Drop target highlighting is updated only on animation frames and uses direct classes rather than rerendering the whole formation continuously.
- Lineup state is committed only once on a valid drop.
- Starter↔starter, substitute↔starter, empty-slot movement, and starter↔specific-substitute swaps are atomic one-state updates.
- Tap-to-swap is restored and calls the same move functions used by drag/drop.
- Wrong drops leave the lineup unchanged.
- Player images use `draggable={false}`.
- Scoped formation CSS blocks native image dragging, text selection, and iOS touch callouts without disabling those browser features across the rest of the website.
- The lightweight drag overlay contains only the footballer thumbnail, role, name, and OVR.
- Performance Mode removes extra drag-card animation/shadow work.
- Reduced-motion preferences disable snap animation.
- Window blur / tab hiding cleans active drag state and RAF work.

## Files changed

- `packages/shared/src/index.ts`
- `apps/server/src/index.ts`
- `apps/server/src/roomManager.ts`
- `apps/server/test/roomFlow.test.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`

## Verification performed in the packaging environment

- Shared TypeScript: PASS
- Server TypeScript: PASS
- Web TypeScript: PASS
- All server test TypeScript files compile directly: PASS
- `git diff --check`: PASS
- Runtime smoke checks for the five required auction pass scenarios: PASS

Full Vitest / production bundling cannot execute in this Linux packaging container because the supplied `node_modules` directory contains the Windows Rollup optional binary and not `@rollup/rollup-linux-x64-gnu`. This is an environment mismatch that occurs before project tests/build code executes. Run the normal commands on the Windows project before deployment.

## Windows verification

```powershell
cd C:\Auction\auction-eleven
npm install
npm run typecheck
npm test
npm run build
```

Do not deploy unless all commands pass.
