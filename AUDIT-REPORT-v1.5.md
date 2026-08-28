# Auction Eleven v1.5 — Critical Stability & Performance Audit

## Bug 1 — multiplayer capacity / player-limit failures

The previous flow mixed a fixed maximum-bench assumption with the actual room squad configuration. Pool creation and start validation could therefore disagree, especially as manager count increased. The room now calculates its target from the exact number of joined managers and the host-selected number of substitutes:

`required footballers = managers × (starting XI size + substitute count)`

Substitutes are selectable from 0 through 10. The lobby shows the live total and blocks kickoff with a clear required-vs-selected message before the auction starts. It also checks goalkeeper and outfield feasibility.

## Bug 2 — Back navigation

Room entry previously replaced browser history instead of creating a safe in-app history step, and overlays were not consistently represented. The frontend now establishes an app-root history entry, pushes a room entry, restores the room query on refresh, and gives modal/drawer layers their own Back-close behavior. Active auction/formation Back actions require confirmation rather than immediately abandoning the session.

## Bug 3 — random match crashes / recovery

The audit found timer-driven auction transitions that could throw from asynchronous callbacks, stale socket/room events, session restoration timing, duplicate-tab ownership, and UI work without an error boundary. Timer callbacks are now guarded, round transitions are idempotent, stale rounds are rejected, duplicate sessions reuse the same seat, stale tabs lose authority, reconnect restores the server snapshot, and a React Error Boundary provides safe UI recovery without deleting the room token.

## Bug 4 — low-end performance

Major avoidable costs included whole-auction rerenders from countdown updates, eager footballer-photo resolution, heavy video/blur/filter effects, and full room snapshots after every bid/pass. Countdown rendering is isolated, compact photos resolve lazily, bid/pass traffic uses a small typed patch, and AUTO / QUALITY / PERFORMANCE visual modes reduce optional effects without changing gameplay. Reduced-motion is also respected.

## Bug 5 — skipped/sold footballers repeating

The previous auction result path could place an unsold footballer back into the active pool. Older pool construction could also create mirrored copies. The backend now uses a unique catalogue pool and explicit lifecycle statuses (`QUEUED`, `ACTIVE`, `SOLD`, `SKIPPED`, `FINISHED`). A skipped player returns only when the host explicitly enables the new re-auction setting; otherwise it is permanently removed for that match. A transition lock and round ID make end-of-round processing idempotent.

## Additional reliability fixes

- Host migration when a connected host disappears.
- 30-second lobby disconnect grace before removing a ghost seat.
- Same-session reconnect reuses the existing manager rather than duplicating it.
- Old tab/device socket cannot mutate the active manager seat after takeover.
- Safe room cleanup cancels timers.
- Formation transition tolerates an exhausted auction pool without crashing.
- Client ignores stale room versions/round patches.
- Reaction/loading timers and socket listeners have exact cleanup.
- Photo failures use a fallback instead of destabilizing the UI.

## Verification

- `npm run typecheck`: passed for shared, server and web.
- Runtime validation passed for viable 2–8 manager configurations and the exact 3-manager 11+5 setup.
- Runtime validation passed for skipped and sold non-repeat behavior and duplicate transition protection.
- Runtime validation passed for session reuse/stale-tab rejection and clear impossible-config errors.
- The Linux sandbox could not start Vitest/Tsup because the provided dependency tree contains Windows Rollup native packages and lacks `@rollup/rollup-linux-x64-gnu`. Run `npm test` and `npm run build` in the Windows project before pushing.
