$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
Set-Location $root

Write-Host "Building frontend..."
npm run build:frontend | Out-Host

Write-Host "Ensuring dependencies are installed..."
npm install | Out-Host

Write-Host "Building Windows executable with pkg..."
npx pkg . --targets node18-win-x64 --output "dist-exe\AI-Music-Recommendation-App.exe" | Out-Host

$shareDir = Join-Path $root "dist-exe\share"
if (Test-Path $shareDir) {
  Remove-Item $shareDir -Recurse -Force
}
New-Item -ItemType Directory -Path $shareDir | Out-Null

Copy-Item "dist-exe\AI-Music-Recommendation-App.exe" (Join-Path $shareDir "AI-Music-Recommendation-App.exe") -Force
if (Test-Path ".env.example") {
  Copy-Item ".env.example" (Join-Path $shareDir ".env.example") -Force
}

$runBat = @"
@echo off
setlocal
cd /d %~dp0
if not exist .env (
  echo Please create .env using .env.example before first run.
  pause
)
AI-Music-Recommendation-App.exe
endlocal
"@
Set-Content -Path (Join-Path $shareDir "run-app.bat") -Value $runBat -Encoding ASCII

$readme = @"
Share Package Quick Start

1. Install MongoDB or set MONGODB_URI in .env to Atlas.
2. Copy .env.example to .env and fill values.
3. Double-click run-app.bat.
4. Open http://localhost:5002

Health endpoint:
http://localhost:5002/api/health
"@
Set-Content -Path (Join-Path $shareDir "README_SHARE.txt") -Value $readme -Encoding ASCII

Write-Host "Done. Share folder: $shareDir"
