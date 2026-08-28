# Auction Eleven v2.3 — Blind Auction / Guess The Player

## Architecture

Blind Auction is an optional room game mode alongside the existing normal auction. It reuses the existing server-authoritative player pool, ownership, squad capacity, DONE, reconnect, formation, and result systems.

### Identity and answer matching

The existing footballer catalogue remains canonical and unique by footballer ID/canonical ID. Blind-answer aliases live only on the server in `apps/server/src/guessing.ts`; aliases are not added to public RoomState or sent to browsers.

`normalizeFootballerGuess()` performs case folding, Unicode accent removal, whitespace normalization and harmless punctuation normalization. The server builds an alias index from safe full-name forms plus explicit common aliases. Ambiguous aliases map to multiple canonical players and cannot win. `ronaldo`, for example, is ambiguous between Cristiano Ronaldo and Ronaldo Nazário, while `CR7` and `R9` are unique.

Conservative typo tolerance accepts a one-edit typo only on sufficiently long unique aliases and only when exactly one player can match. Exact/normalized aliases always take priority.

### Hidden identity security

During `guessing`, public RoomState contains `currentFootballer: null`. The browser receives only:

- opaque Blind round ID
- server deadline
- reveal stage number
- currently public clues
- an opaque stage-image proxy URL

It does not receive the hidden name, aliases, player ID, full player object, or original/clear photo URL.

The stage-image endpoint validates that a client cannot request a future reveal stage. The server obtains the project's existing reusable Wikimedia thumbnail and proxies progressively larger raster thumbnails (very small early stages, full stage only once allowed). Thus the browser does not receive a clear image and merely hide it with CSS.

If a reusable staged thumbnail cannot be safely produced, the endpoint returns a generic mystery silhouette rather than leaking the original URL.

### Round state

Blind round lifecycle:

`GUESSING -> WON/REVEALED -> ROUND_RESULT -> NEXT ROUND`

No-guess fallback may instead be:

`GUESSING -> REVEALED -> QUICK_AUCTION`

or:

`GUESSING -> REVEALED -> SKIPPED`

The first correct guess processed by the Node server locks the round synchronously. Client timestamps are ignored. Reveal/clue timers are cancelled on finalization and stale callbacks verify the current round before acting.

### Fair bots

Bots do not read the hidden identity and guess it. During the blind guessing phase they simply observe. If the configured fallback becomes a Quick Auction, normal strategic bot logic applies to the revealed player through the same authoritative bid validation used for humans. AI takeover therefore does not gain secret recognition powers.

## Room settings

- Game Mode: Normal Auction / Blind Auction
- Reveal Timer: 10 / 15 / 20 / 30 seconds
- Blind Difficulty: Easy / Normal / Hard
- Clues: Off / Light / Normal / More
- If Nobody Guesses: Quick Auction / Skip

Blind mode works with Current, Icons, Generations/Mixed and Custom player pools.

## Gameplay details

- First valid correct server-received guess wins the footballer for 0 auction cost.
- Squad capacity and DONE state are validated before guesses are accepted.
- Guess spam is rate-limited per manager.
- Other managers never see the text of wrong guesses.
- Guess input has no footballer-name autocomplete.
- Correct guesses immediately stop reveal timers and assign the footballer exactly once.
- The default no-guess behavior is a short normal Quick Auction.
- Blind-specific secondary awards are added to final results when appropriate.

## Verification performed in packaging environment

Passed:

- `npm run typecheck` for shared/server/web
- explicit TypeScript compilation of all server test files
- no `sharp` or new native image-processing dependency added

The copied `node_modules` in the packaging environment contains Windows-native dependencies while the packaging runtime is Linux. Therefore `npm test` and `npm run build` cannot execute here because Rollup's Linux optional binary is absent. This is an environment/runtime dependency mismatch before application code runs. Run `VERIFY-v2.3.ps1` in the real Windows repository and do not deploy unless typecheck, tests, and build all pass.
