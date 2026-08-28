# Auction Eleven v1.8 — Player Pool + Manual Selection + Dual Primary Positions

## Root causes fixed

### 1. Only a limited group of footballers appeared
The previous server pool builder always reduced CURRENT / ICON / MIXED eligibility to a recommended-size subset. It used a target based on the room requirement and then sliced/shuffled that subset, so there was no way to auction the whole eligible catalogue. The room also rebuilt its pool when managers joined, which made the chosen set feel inconsistent between lobby changes.

v1.8 separates **eligible players** from the **actual auction queue**. CURRENT, ICONS and GENERATIONS are filters over the one canonical `FOOTBALLERS` catalogue. The host then independently chooses QUICK, STANDARD, LARGE, ALL or CUSTOM COUNT for the actual queue. ALL queues every eligible canonical footballer exactly once.

### 2. Custom/manual selection was not truly authoritative
The same `selectedFootballerIds` field was being used both as the host's manual eligibility list and as the generated auction queue. That allowed auto-build/reselection logic to overwrite the meaning of the host's selection.

v1.8 adds `customPlayerIds` as the authoritative manual eligibility set. `selectedFootballerIds` is now the actual server-selected queue. Joining/ready/unrelated settings do not destroy `customPlayerIds`. Starting a match does not regenerate the pool.

### 3. The position model assumed one primary role
The shared footballer model exposed one `primaryRole`, and formation scoring/UI/filtering often used direct equality checks against it. That meant a genuinely versatile player could not receive full position effectiveness in two roles.

v1.8 keeps `primaryRole` for backward compatibility and adds `primaryRoles` (1–2 roles). All new role-aware helpers fall back to `[primaryRole]` for old data. Both primary roles receive full positional effectiveness; secondary roles retain the existing small penalty.

## New pool architecture

1. `FOOTBALLERS` remains the single canonical catalogue.
2. Player type chooses the eligible set:
   - CURRENT: all current players
   - ICONS: all icon/retired players
   - GENERATIONS: all current + icons
   - CUSTOM: exactly the host's `customPlayerIds`
3. Pool size chooses the queue size:
   - QUICK: minimum squads + small reserve
   - STANDARD: normal balanced variety
   - LARGE: larger balanced pool
   - ALL: every eligible unique player
   - CUSTOM COUNT: exact queue count (never allowed below the squad requirement)
4. The server uses a crypto-backed Fisher–Yates shuffle and balanced role/position seeding.
5. `start()` uses the already-validated `selectedFootballerIds`; it does not silently replace them.

## Dual-primary examples

- Lionel Messi: RW / CAM — secondary ST / CF
- Cristiano Ronaldo: ST / LW — secondary CF
- Neymar: LW / CAM — secondary ST
- Kylian Mbappé: ST / LW — secondary RW
- Ruud Gullit: CM / CAM — secondary CDM / ST
- Ronaldinho: LW / CAM — secondary LM
- Pelé: CAM / ST — secondary CF
- Johan Cruyff: CF / CAM — secondary ST
- Lothar Matthäus: CM / CDM — secondary CB
- Franz Beckenbauer: CB / CDM — secondary CM
- Paolo Maldini: CB / LB
- Joshua Kimmich: RB / CDM — secondary CM
- Federico Valverde: CM / RM — secondary RW / CDM
- Bernardo Silva: CAM / RW — secondary CM
- Phil Foden: CAM / RW — secondary LW
- Son Heung-min: LW / ST — secondary LM

Goalkeepers stay GK-only. Players such as Erling Haaland and Virgil van Dijk remain single-primary.

## Validation and performance

- Custom IDs are checked for existence and canonical duplicates on the server.
- The queue is checked against minimum total size and broad positional health.
- Detailed role coverage uses both primary and secondary roles.
- The manual selector uses memoized filtering and lazy image loading.
- The auction does not preload the whole catalogue after kickoff.
- ALL mode warns the host when the queue is likely to create a long match.

## Verification in the packaging environment

Passed:
- Shared TypeScript typecheck
- Server TypeScript typecheck
- Web TypeScript typecheck
- Typecheck of all server test files
- Runtime smoke: MIXED ALL = 186/186 unique
- Runtime smoke: CURRENT ALL = 107/107
- Runtime smoke: ICONS ALL = 79/79
- Runtime smoke: 3 managers × (11 starters + 5 subs) = 48 required
- Runtime smoke: QUICK/STANDARD/LARGE/ALL/CUSTOM COUNT sizes
- Runtime smoke: manual custom selection survives another manager joining
- Runtime smoke: starting CUSTOM/ALL uses the exact custom ID set
- Runtime smoke: Gullit and Messi dual-primary; Haaland single-primary
- `git diff --check`

The uploaded `node_modules` was installed for Windows. Vitest/Vite cannot execute in this Linux packaging environment because the Linux Rollup/esbuild native optional packages are absent. Run the normal repository commands on your Windows machine before deployment.
