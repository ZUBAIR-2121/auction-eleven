$ErrorActionPreference = "Stop"

Write-Host "Auction Eleven: removing Cinematic v4-only assets..." -ForegroundColor Cyan

if (Test-Path ".\apps\web\public\sfx") {
  Remove-Item ".\apps\web\public\sfx" -Recurse -Force
  Write-Host "Removed apps/web/public/sfx" -ForegroundColor Green
}

if (Test-Path ".\apps\web\public\ui") {
  Remove-Item ".\apps\web\public\ui" -Recurse -Force
  Write-Host "Removed apps/web/public/ui" -ForegroundColor Green
}

Write-Host "Keeping apps/web/public/manager-badges and apps/server/player-images." -ForegroundColor Green
Write-Host "Pre-v4 restore cleanup complete." -ForegroundColor Cyan
