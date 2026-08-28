# Auction Eleven v1.6 — Player Database, Icons, Private Budgets & Saved Username

## Source catalogue audit

- Uploaded catalogue rows inspected: 136
- Canonical supplied footballers after alias merge: 135
- Existing Auction Eleven footballers before import: 96
- Supplied catalogue footballers already present and merged/upgraded: 45
- New supplied catalogue footballers added: 90
- Final unique Auction Eleven footballers: 186
  - Current: 107
  - Icons/retired legends: 79
- Neymar / Neymar Jr. resolves to one canonical `neymar` record.
- Cristiano Ronaldo and Ronaldo Nazário remain distinct canonical records.

The uploaded pack contains catalogue metadata plus a Wikimedia Commons resolver, rather than bundled photo binaries. Auction Eleven keeps its existing Commons-based resolver and attribution links, and uses the supplied `photoSearchName` data for the imported catalogue.

## Database model changes

`Footballer` now supports:
- `canonicalId`
- `playerType: CURRENT | ICON`
- `primaryRole`
- `secondaryRoles`

Existing player IDs are preserved. Existing famous players are upgraded in-place instead of duplicated. New imported footballers use stable `current-*` or `icon-*` IDs.

Base OVR remains capped at 99. Ratings are original Auction Eleven ratings, not copied from EA FC.

## Player-pool modes

Host can select:
- Current — active/current stars only
- Icons — retired/icon footballers only
- Generations — current + icons
- Custom — exact manual selection

Generations supports icon frequency:
- Low ≈ 20%
- Normal ≈ 35%
- High ≈ 50%

Icon Surprise is server-authoritative and inserts icon reveals into the shared auction order. The same player order is used by all clients.

## Balanced pool logic

Minimum footballers:

`managers × (starters + substitutes)`

Recommended automatic pool is approximately 18% larger when enough eligible players exist, while preserving broad position coverage. The server validates total count and broad-position viability, plus warns about thin LB/RB/CB/central-midfield coverage.

Custom pools are deduplicated by canonical footballer identity, not display name or array index.

## Budget privacy

During lobby/auction/formation:
- each human client receives its own exact budget;
- opponent and bot budgets are `null` in that client's RoomState;
- the auction sidebar displays `PRIVATE` for opponents;
- high-frequency auction patches contain no budget data;
- the full footballer catalogue is not included in live auction snapshots.

After the game finishes, final budget information may be revealed as part of results/rankings.

## Saved manager name

The browser stores only the validated display name under:

`auction-eleven-manager-name`

It is written only after a successful create/join. It remains editable. Room passwords, budgets and privileges are never stored in this preference.

## Performance protections

- Full 186-player catalogue is sent only while in the lobby where selection is needed.
- Live auction snapshots omit the entire catalogue.
- Player-pool thumbnails remain lazy-loaded with IntersectionObserver.
- Search/filter work is memoized.
- No catalogue images are preloaded at startup.
- Existing performance mode and reduced-motion behavior remain intact.
- Icon effects use borders/gradients rather than heavy particles.

## Secondary awards

Mixed/custom games can add:
- Best Icon Signing
- Best Current Signing
- Most Expensive Icon

They do not replace normal final rankings/awards.

## Verification performed in this environment

Passed:
- `npm run typecheck` for shared, server and web
- explicit TypeScript check including all server test files
- `tsc -b apps/web --pretty false`
- server TypeScript emit to a clean temporary runtime
- custom runtime/integration smoke suite covering:
  - 186 final unique players
  - 107 CURRENT / 79 ICON
  - all 135 canonical supplied catalogue IDs represented
  - Neymar alias merge
  - Cristiano vs Ronaldo Nazário separation
  - Messi/elite OVR upgrade
  - 99 OVR cap
  - current-only pool
  - icons-only pool
  - generations pool containing both types
  - 3 managers × (11 starters + 5 subs) = 48 minimum
  - unique auto-built pool
  - client-specific opponent budget privacy
  - custom current+icon pool
  - skipped-player no-repeat smoke test

The repository's `npm test` / `npm run build` could not execute in this Linux packaging sandbox because the supplied `node_modules` was created for Windows and the sandbox registry does not provide the missing Linux-native Rollup/esbuild optional packages. This failure occurs before Auction Eleven code is executed. TypeScript compilation and the native-free runtime smoke suite passed. Run the normal test/build commands on the Windows project after replacing files.

## Database migration

No external database exists in this repository for footballers. The catalogue is a TypeScript seed, so no SQL/Redis migration is required.

Compatibility safeguards:
- `canonicalId` is optional at the shared type boundary; old objects fall back to `catalogId`/`id`.
- `playerType` is optional at the shared type boundary; missing old records default to CURRENT behavior.
- Existing footballer IDs are preserved for already-present players.
- Room settings are server memory only and are recreated from defaults after server deployment.
