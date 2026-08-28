# Auction Eleven v2.0 — Strategic AI Upgrade

## Root causes found in v1.9

The previous bot scheduler was not purely random, but it was still shallow. It calculated one base-price multiplier from difficulty, broad/supported positional counts, OVR, ICON status and a small personality modifier. Then it added large random variance, chose a random number of bid attempts, and scheduled those attempts at random/late times.

Important limitations:

- no projected starting-lineup improvement calculation;
- no weakest-link upgrade value;
- no real future budget reserve (only remaining squad slots × minimum bid);
- no dynamic scarcity model;
- no public opponent-behaviour model;
- no public market-price learning;
- no opportunity-cost/lookahead evaluation;
- primary and secondary roles were both treated simply as "playable" during bot valuation;
- bots did not explicitly PASS when a player became strategically unattractive;
- old bot schedules used a fixed max valuation computed at round start instead of re-evaluating after each public bid/pass.

The old code already had important fairness/stability protections: bot actions ultimately used the normal `bid()` path, bot callbacks checked `roundId`, and round completion cleared bot timers. Those protections are preserved.

## New bot engine

`apps/server/src/ai/botEngine.ts` is a pure decision module. It returns a structured `BotDecision` with:

- action: BID / PASS / DONE / WAIT
- bid amount
- confidence
- reasons
- estimated value
- maximum ownership price
- protected reserve budget
- factor breakdown

The decision model uses:

- base economic value and OVR quality;
- broad and detailed positional need;
- full value for either primary position;
- reduced value for secondary positions;
- weakest-link / projected lineup upgrade value;
- versatility and formation flexibility;
- aggregate role scarcity without seeing exact future order;
- auction stage / endgame urgency;
- public sale-price history;
- public opponent bidding/pass behaviour;
- small bounded superstar/personality bias;
- future budget reservation;
- bounded heuristic beam-style lookahead for World Class / Legendary;
- controlled seeded uncertainty rather than uncontrolled random bidding.

## Fairness / privacy

Bots do NOT receive opponent budgets in their decision context. `PublicOpponentSnapshot` intentionally contains no budget field.

Bots may use only public information such as:

- opponent squad contents/counts;
- public bids;
- public passes;
- DONE/connection status;
- historical public sale prices;
- aggregate remaining pool counts, never the exact future player order.

Every bot BID still calls the same `RoomManager.bid()` validation used by human bids. Every bot PASS uses the same `pass()` route. There is no force-purchase method and no hidden extra money.

## Opponent and market learning

Within one match the server tracks public behavioural signals:

- aggression score;
- icon interest;
- role/position interest;
- early-bid tendency;
- late-bid tendency;
- average bid escalation;
- pass count.

This profile resets when the match starts. It is not stored across sessions.

Completed public sales are stored in a small capped market history. Bots use that to make bounded market-value adjustments when similar players have recently sold above or below base expectations.

## Personalities

Bots receive one of these internal personalities:

- VALUE_HUNTER
- AGGRESSIVE
- STAR_COLLECTOR
- BALANCED
- TACTICIAN
- PATIENT

Personality modifies a strong common decision engine instead of replacing it with simplistic behaviour.

## Difficulty

- Amateur: basic needs, weak planning, larger valuation uncertainty.
- Professional: sensible position/budget management.
- World Class: scarcity, opponent signals, stronger reserve logic and bounded lookahead.
- Legendary: strongest fair reserve, market/opponent adaptation, deepest bounded lookahead and late-auction urgency.

No difficulty receives rule-breaking advantages.

## Performance protections

The first prototype used full formation rebuilds during every valuation. Benchmarking showed that was unnecessarily expensive, so the final engine uses a lighter role-demand / weakest-link calculation during live bids.

Static role-demand and versatility calculations are cached.

World Class and Legendary lookahead automatically reduce depth/beam width when many AI rooms/bots are active. Basic strategic intelligence stays enabled.

Bots are evaluated mainly when:

- a new round starts;
- a valid bid changes the price;
- a manager passes;
- eligibility changes due to DONE/disconnect.

They are not simulated continuously.

## DONE logic

The v1.9 starter-completion rule is preserved. Bots can only consider DONE after a valid starting lineup exists. The new AI decides whether continuing for substitutes/upgrades is worthwhile based on difficulty, remaining auction opportunity, lineup quality, budget and personality.

A bot currently leading an unresolved player is not auto-DONE.

## Debug mode

Development only:

`AUCTION_ELEVEN_AI_DEBUG=1`

When `NODE_ENV !== production`, the server emits one structured log when a bot action executes, including estimated value, max bid, reserve and short reasons.

Production does not expose internal decision calculations to players.

## Tournament harness

Run on Windows after installing dependencies:

```powershell
npm run ai:tournament -w @auction-eleven/server -- 100
```

A 100-match deterministic benchmark in the packaging environment produced:

| Difficulty | Completion | Avg lineup score | Avg budget left | Avg squad size | Avg overpay |
|---|---:|---:|---:|---:|---:|
| Amateur | 99.0% | 93.30 | 179.2 | 16.00 | 3.72 |
| Professional | 99.0% | 93.37 | 182.9 | 16.00 | 3.34 |
| World Class | 99.0% | 93.57 | 174.2 | 15.98 | 3.58 |
| Legendary | 99.0% | 93.65 | 166.8 | 15.98 | 3.91 |

The harness is synthetic and is intended for tuning/regression comparison, not as proof that a difficulty must win every real match.

## Verification performed in packaging environment

Passed:

- shared TypeScript check
- server TypeScript check
- web TypeScript check
- TypeScript compilation of all server test files
- strategic AI runtime smoke assertions
- room-level AI scheduling / early-completion smoke
- 100-match deterministic AI tournament
- `git diff --check`

Full Vitest and Vite execution could not run in the Linux packaging environment because the available `node_modules` was installed on Windows and lacks Linux-native Rollup/esbuild optional packages. Run the normal commands on the Windows project before deployment.
