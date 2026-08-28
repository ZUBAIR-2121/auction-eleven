# Auction Eleven v2.3.1 - Blind Reveal Reliability Fix

## Root causes fixed

1. The v2.3 browser rendered only the server snapshot `blind.revealStage`. Image progress therefore depended on receiving every scheduled room-state broadcast. A delayed/missed broadcast, backgrounded tab, or reconnect could leave the image on a stale stage.
2. The protected image endpoint authorized stages using the same mutable `room.blindRevealStage`. Even if a client knew enough time had passed, the endpoint could still reject the next stage until the corresponding timeout callback ran.
3. Early image generation depended on a narrow regular expression that only understood one Wikimedia thumbnail URL shape. When the resolver returned an original/alternate Wikimedia URL, early stages fell back to the generic mystery SVG rather than progressively revealing the actual footballer.
4. Reconnect snapshots returned the last stored stage instead of deriving the correct stage from `startedAt`/`endsAt`.
5. Guesses arriving after `endsAt` could still be processed if the timeout callback had been delayed by the event loop.

## New architecture

- Server remains authoritative for `blindRoundId`, `startedAt`, `endsAt`, difficulty, status, and stage authorization.
- `getBlindRevealStage()` deterministically derives the current stage from timestamps.
- The client uses a server clock sample and a lightweight 200 ms clock to derive image stage locally, so a missed stage broadcast cannot freeze the reveal.
- `visibilitychange` and window focus immediately recalculate the stage after mobile tab/app suspension.
- The image endpoint independently derives the currently legal stage from authoritative server timestamps.
- Stage URLs are opaque-token URLs and future stages remain blocked.
- Wikimedia thumbnail URLs are generated from both thumbnail and original Commons URLs, so early stages use actual reduced player pixels instead of falling back unnecessarily.
- Correct guess and timeout still force stage 5 immediately and cancel old round timers.
- Expired guesses are rejected using `endsAt` even if a timeout callback is late.
- Failed stage images retry once, then show a usable Mystery Player fallback without stopping guesses/timer.

## Security

The clear player name/aliases are still not included in public state while guessing. The browser only receives the permitted low-resolution stage asset through the protected backend endpoint. Stage 5 remains unavailable before the server-authorized end/reveal point.
