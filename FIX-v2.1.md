# Auction Eleven v2.1

## Main changes
- Compact one-screen auction layout for phones/tablets/low-height landscape.
- Permanent main screen shows only authoritative current highest bid and bidder.
- Accepted bid history moved into an optional history overlay.
- Large auction squad tracker replaced by a compact squad button.
- Lazy-rendered mini formation popup shows only actually-owned footballers and substitutes.
- Compact current footballer presentation with optional full player-details overlay.
- Compact bid amount field, -5M/+5M, BID, PASS, I'M DONE, plus optional quick adjustments.
- Opponent budgets remain private.
- Active disconnects receive a 20-second reconnect grace period.
- After grace, the same human manager seat becomes Legendary AI controlled without changing squad or budget.
- Human can reclaim the same seat through the existing session token; pending AI actions are invalidated by controllerVersion.
- Explicit active-match leave immediately hands gameplay to Legendary AI.
- Host authority migrates separately from gameplay control.
- PASS, DONE and current highest-bid state are preserved through takeover.

## Verification in this build workspace
- `npm run typecheck` passed for shared, server and web.
- A TypeScript compile covering all server source + all test files passed.
- Full Vitest/Vite execution cannot run in this Linux workspace because the copied node_modules contains Windows-native Rollup/esbuild optional binaries. Run the included PowerShell verification on the Windows project before deployment.
