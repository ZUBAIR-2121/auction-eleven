# Auction Eleven v1.9 — Starter-Based "I'm Done" Fix

## Root causes found

1. **Substitutes were mandatory for `I'M DONE` on both client and server.**
   - Frontend required `me.squad.length >= maximumSquadSize`.
   - Backend `completeAuction()` required the exact configured squad size (`starters + substituteCount`).
   - Result: 11 valid starters + 0/6 subs could not finish bidding.

2. **Budget reservation also treated optional substitutes as mandatory.**
   - `validateBid()` reserved enough minimum-bid money to fill the entire maximum squad.
   - That could reject a legal upgrade/substitute bid even after the starting lineup was already complete.

3. **Starter completion logic was duplicated.**
   - Client and server each computed GK/outfield readiness separately.
   - v1.9 introduces the shared `getSquadCompletion()` helper so UI and backend use one definition.

4. **DONE persistence itself was already server-authoritative and correct.**
   - `manager.auctionComplete` survived normal round changes and reconnects.
   - `managersAbleToChallenge()` already excluded DONE managers.
   - v1.9 preserves this and also prevents crafted PASS requests from DONE managers.

5. **Bot scheduling could still schedule work for a DONE bot.**
   - The bid later failed server validation, but the timer work was wasteful.
   - DONE bots are now excluded before timers are scheduled.

6. **Full-auction transition did not have its own explicit idempotency latch.**
   - Round finalization already used `transitionRoundId`, but formation transition relied mostly on phase/timer checks.
   - v1.9 adds `auctionCompletionStarted` and clears auction timers before entering formation.

## New completion rule

`getSquadCompletion(squad, settings)` returns:

- `requiredStarters`
- `completedStarters`
- `startersRemaining`
- `maxSubstitutes`
- `currentSubstitutes`
- `maxSquadSize`
- `startersComplete`
- `squadFull`
- `goalkeeperReady`
- `canDeclareDone`

In the current Auction Eleven formation rules, the only hard auction-stage placement restriction is GK vs outfield. Exact roles and formation fit are decided later on the formation screen. Therefore starter completion means:

- at least one goalkeeper, and
- enough outfield footballers to fill the remaining starting slots.

Examples:

- 11 required, 1 GK + 10 outfield, 0 subs → DONE allowed.
- 11 required, 1 GK + 13 outfield → DONE allowed.
- 11 required, 16 outfield and no GK → DONE rejected (10/11 starter-ready, 6 bench-depth players).
- 8 required, 1 GK + 7 outfield → DONE allowed.

## Highest bidder rule

A manager cannot press `I'M DONE` while they are the unresolved highest bidder in the active round. The server returns:

> Finish the current auction round before leaving bidding. You are the highest bidder.

## All managers DONE

When the final manager declares DONE:

- current auction timers are cancelled,
- the active unused footballer is marked finished,
- the formation transition is latched so it can happen only once,
- all managers move directly to formation.

## Full squad behaviour

A human with a full valid squad is automatically marked auction-complete because they have no legal capacity for another purchase. A full invalid squad is prevented during normal bidding by projected-capacity validation.

Bots use the same starter-completion helper and can finish after starter completion based on difficulty/bench depth:

- Amateur: starter-complete
- Professional: starter-complete + roughly 1 bench player when available
- World Class: + roughly 2
- Legendary: + roughly 3

## UI changes

Auction UI now shows:

- STARTERS X/Y
- BENCH X/Y (optional)
- STARTING LINEUP COMPLETE status
- compact reason when `I'M DONE` is locked
- confirmation before permanently leaving the auction
- DONE status for opponents without exposing private budgets

Lobby copy now says **MAX SUBSTITUTES / optional bench depth**, rather than implying substitutes are required for `I'M DONE`.

## Files changed

- `packages/shared/src/index.ts`
- `apps/server/src/gameEngine.ts`
- `apps/server/src/roomManager.ts`
- `apps/server/test/gameEngine.test.ts`
- `apps/server/test/roomFlow.test.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
