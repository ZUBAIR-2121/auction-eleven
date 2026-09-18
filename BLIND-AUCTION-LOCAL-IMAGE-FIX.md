# Blind Auction local-player-image fix

Blind Auction no longer fetches the selected player's reveal image from Wikimedia during a match.

- 186 real footballer images are bundled in `apps/server/player-images/`.
- Filenames match the game's canonical footballer IDs exactly.
- `/api/blind-stage/:token/:stage.webp` now reads the selected player's local image.
- The existing Blind Auction UI progressively removes CSS blur from that real image.
- Wikimedia HTTP 429 errors can no longer cause the green `MYSTERY PLAYER` fallback for bundled players.
- `/health` now reports local image coverage so missing files are easy to spot.

The generic fallback remains only as an emergency safety net for a missing/corrupt local image.
