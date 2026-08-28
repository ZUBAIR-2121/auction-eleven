$ErrorActionPreference = "Stop"
Set-Location "C:\Auction\auction-eleven"

Write-Host "[1/3] TypeScript" -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed. Do not deploy." }

Write-Host "[2/3] Tests" -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { throw "Tests failed. Do not deploy." }

Write-Host "[3/3] Production build" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Do not deploy." }

Write-Host "All Auction Eleven verification checks passed." -ForegroundColor Green
