$ErrorActionPreference = "Stop"

Write-Host "Auction Eleven v2.3 verification" -ForegroundColor Cyan

function Run-Step([string]$Name, [scriptblock]$Command) {
    Write-Host "`n== $Name ==" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nFAILED: $Name" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "PASSED: $Name" -ForegroundColor Green
}

Run-Step "npm install" { npm install }
Run-Step "TypeScript" { npm run typecheck }
Run-Step "Tests" { npm test }
Run-Step "Production build" { npm run build }

Write-Host "`nAll v2.3 checks passed. Safe to commit/push." -ForegroundColor Green
