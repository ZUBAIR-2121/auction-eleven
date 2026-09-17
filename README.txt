AUCTION ELEVEN — FIX: GENUINELY FLAKY "MOVES TO FORMATION..." TEST
========================================================================

ROOT CAUSE (this time actually proven with debug output, not guessed)
--------------------------------------------------------------------------
This was a real, reproducible bug in the TEST, not your product code.

The test builds a synthetic "already complete" squad for both the host
and the guest using the same helper, which always picks the SAME first
few players from the database for both managers. That's fine on its
own — but the room's first auction round independently and randomly
picks a live player to auction.

When that random pick happened to be one of the same players baked
into both synthetic squads, your (correct) "you already own this
player" rule removed the guest as an eligible bidder. With the guest
excluded and the host already marked done, ZERO eligible bidders
remained, so the round legitimately auto-resolved into round_result
immediately — before the guest ever got a chance to call DONE. The
test then asserted "auction" and got "round_result", intermittently,
purely depending on which player happened to be drawn.

I proved this by temporarily instrumenting the test to log the live
player and outcome across many runs — the two real failures were both
cases where the synthetic squad happened to include the live player
(def-01, def-02).

THE FIX
-------
apps/server/test/roomFlow.test.ts:
  - squadWithValidStarters() now accepts an optional exclude list.
  - The flaky test now excludes the room's actual live footballer
    when building both synthetic squads, so this coincidence can
    never happen again, regardless of which player gets drawn.

VERIFIED
--------
Ran the full suite 8 times back to back: 146/146 passing every time
(previously it failed roughly 1 in 3-5 runs). Also verified:
  npm run typecheck  -> pass
  npm run build      -> pass

WHAT'S IN THIS FOLDER
------------------------
  apps/server/test/roomFlow.test.ts  (only file changed)

HOW TO APPLY (PowerShell)
---------------------------
1. Unzip this folder, then copy the file into your project,
   overwriting the original at the same path:
     apps/server/test/roomFlow.test.ts

2. Verify locally (run it several times, since the whole point was
   that a single green run doesn't prove anything for this one):
     cd apps\server
     npm run typecheck
     for ($i=1; $i -le 6; $i++) { npm test }
     npm run build

3. Commit and push:
     git add -A
     git commit -m "Fix flaky DONE-completion test: exclude live round player from synthetic test squads"
     git push

NOTE
----
Test-only change. No production code touched, so no behavior change
for players — just a more reliable test suite.
