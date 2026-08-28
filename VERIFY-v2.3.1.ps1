$ErrorActionPreference = "Stop"

Write-Host "Auction Eleven v2.3.1 verification" -ForegroundColor Cyan
Write-Host "Running npm install..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed. Do not deploy." }

Write-Host "Running TypeScript checks..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeScript check failed. Do not deploy." }

Write-Host "Running tests..." -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) { throw "Tests failed. Do not deploy." }

Write-Host "Running production build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Production build failed. Do not deploy." }

Write-Host "All v2.3.1 checks passed. Safe to commit/push." -ForegroundColor Green
