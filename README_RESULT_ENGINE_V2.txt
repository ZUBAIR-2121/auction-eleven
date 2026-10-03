AUCTION ELEVEN — RESULT ENGINE V2 (OPTION A)
=============================================

PURPOSE
-------
Fix inaccurate / confusing post-match results so the BEST FOOTBALL TEAM wins.
Auction spending does NOT directly add points to the champion score.

SCORING
-------
With substitutes enabled:
- Starting XI quality:       45%
- Formation / position fit:  25%
- Team balance:              20%
- Bench depth:               10%

With substitutes = 0:
- Starting XI quality:       50%
- Formation / position fit:  30%
- Team balance:              20%
- Bench:                      0%

Team balance uses the ACTUAL starting lineup's Attack, Midfield, Defence and Goalkeeper
strength and penalizes weak links instead of checking the whole owned squad.

IMPORTANT FIXES
---------------
1. Correctly respects configured 6/7/8/9/10/11 starter size.
2. No fake bench strength when no bench exists.
3. Bench score is adjusted by how much configured bench capacity is actually filled.
4. Missing starters receive an explicit completeness multiplier and are shown as INCOMPLETE.
5. Winner score uses two decimal places so close matches are transparent.
6. Football-first deterministic tiebreaks:
   Starting XI -> Formation Fit -> Team Balance -> Bench Depth -> Remaining Budget.
7. Auction value / remaining money does NOT directly increase the main score.
8. Results page now explains the formula, Top-2 comparison, unit ratings and why the winner won.
9. Awards now include football-unit awards and clearer bargain / overpay / remaining-budget awards.
10. Rolling deploy is safer: the new UI tolerates old ranking payloads while server/frontend update.

FILES TO REPLACE
----------------
packages/shared/src/index.ts
apps/server/src/gameEngine.ts
apps/server/src/roomManager.ts
apps/server/test/gameEngine.test.ts
apps/web/src/main.tsx
apps/web/src/styles.css

DO NOT COPY node_modules FROM THIS PATCH.

VALIDATION PERFORMED HERE
-------------------------
PASS: shared TypeScript typecheck
PASS: server TypeScript typecheck
PASS: web TypeScript typecheck
PASS: gameEngine test source standalone TypeScript check
PASS: direct runtime checks for:
      - configured 8-player result
      - incomplete 8-player result
      - stronger team beats weaker team even with far less budget
      - remaining budget affects only a tied score's late tiebreak
PASS: git diff --check

The full Vitest/Vite production commands could not run in the Linux validation container because
the uploaded project carries Windows node_modules and therefore lacks Rollup's Linux native
optional package. This is an environment/platform dependency issue, not a TypeScript source error.
Run npm ci on your Windows PC before npm test / npm run build.

WINDOWS TEST COMMANDS
---------------------
Run from your project root after replacing the files:

cd C:\Auction\auction-eleven
npm ci
npm run typecheck
npm test
npm run build
npm run dev

If your actual project path is different, cd to that folder instead.

WHAT TO TEST MANUALLY
---------------------
- 6-player starting match
- 8-player starting match
- 10-player starting match
- standard 11-player match
- substitutes = 0
- substitutes > 0
- intentionally incomplete squad
- two very close teams
- human vs bot
- Normal Auction result
- Blind Auction result
- mobile result screen
- tablet result screen

EXPECTED RESULT
---------------
The manager with the strongest final FOOTBALL TEAM should win.
A weak team should not beat a stronger team simply because it has more money left.
