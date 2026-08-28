# Auction Eleven v1.6.1 — Player-pool regression fix

This patch fixes the five failing tests reported after v1.6.

## Production fixes

- Lobby pool sizing now uses the configured room capacity (`managerLimit`) instead of only the number of managers who have joined so far. This makes a 3-manager room with 11 starters + 5 substitutes correctly calculate 48 required players before the other two managers join.
- Kickoff validation still uses the managers actually participating, so a host can safely start a not-full room when the selected pool is sufficient for the active managers.
- Hard broad-position viability no longer assumes every large team must use a four-defender formation. 10/11-a-side rooms can use valid three-at-the-back formations, which fixes false DEF shortages in 7- and 8-manager rooms.
- Automatic pool selection continues to aim for a healthy balanced distribution and adds extra auction variety; only the hard rejection threshold was corrected.

## Test maintenance

- `playerPool.test.ts` no longer assumes the old fixed 24-player-per-position catalogue size. v1.6 intentionally expanded the database.
- It now checks the real invariant: at least 24 real selectable players per broad position, unique IDs/canonical identities, and the current 24-per-position default targets.

## Files

- `apps/server/src/roomManager.ts`
- `apps/server/test/playerPool.test.ts`
