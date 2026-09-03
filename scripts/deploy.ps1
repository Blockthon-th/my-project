# memory_market 컨트랙트 테스트넷 배포 → PackageID를 .env에 기록
# 실행:  powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pkg = Join-Path $root "contracts\memory_market"

Write-Host "[1/3] 빌드 + 테스트..."
Push-Location $pkg
sui move test
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "테스트 실패" }

Write-Host "[2/3] 테스트넷 배포 (가스 필요)..."
$out = sui client publish --gas-budget 200000000 --json | Out-String
Pop-Location
$j = $out | ConvertFrom-Json
$packageId = ($j.objectChanges | Where-Object { $_.type -eq "published" }).packageId
if (-not $packageId) { throw "PackageID를 찾지 못함. 출력:`n$out" }

Write-Host "[3/3] .env 기록..."
$envFile = Join-Path $root ".env"
$lines = @()
if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch "^MARKET_PACKAGE_ID=" } }
$lines += "MARKET_PACKAGE_ID=$packageId"
$lines += "SUI_NETWORK=testnet"
$lines | Set-Content $envFile

Write-Host ""
Write-Host "배포 완료. PackageID: $packageId"
Write-Host "탐색기: https://suiscan.xyz/testnet/object/$packageId"
