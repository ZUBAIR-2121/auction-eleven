# Auction Eleven v2.0.1 — Test Regression Fix

This patch fixes the two remaining failing tests reported after v2.0.

No production gameplay source file changes are required.

## Fix 1 — impossible player-pool error assertion

The server now correctly returns the more informative message:

`Icons contains 79 unique footballers, but this setup needs at least 168...`

The old test expected the older wording `needs 168 unique players`, so the assertion failed even though the server behavior was correct. The assertion now checks the stable requirement: `needs at least 168`.

## Fix 2 — unresolved highest-bidder fixture

The test manually constructed a valid starter squad from the first footballers in the global catalogue. Because the auction queue is randomized, the active footballer could also be one of those manually assigned players (in the reported run it was William Saliba). The normal duplicate-ownership validation correctly rejected the bid before the test reached the I'M DONE rule.

The fixture now explicitly excludes the active auction footballer's canonical identity when constructing the host's starter squad. This allows the test to test what it actually intends: a valid current bid followed by rejection of I'M DONE while the manager is the unresolved highest bidder.

## Files

- `apps/server/test/roomFlow.test.ts`

## Verify on Windows

```powershell
npm run typecheck
npm test
npm run build
```

This patch only changes tests, so it does not require a Render or Vercel redeploy after the tests pass.
