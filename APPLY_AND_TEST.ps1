$ErrorActionPreference = "Stop"
Write-Host "Auction Eleven Result Engine V2 patch files should already be merged into the project root." -ForegroundColor Cyan
npm ci
npm run typecheck
npm test
npm run build
Write-Host "All checks passed. Starting dev server..." -ForegroundColor Green
npm run dev
