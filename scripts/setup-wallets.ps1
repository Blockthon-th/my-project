# 판매자/구독자 두 지갑의 개인키를 .env 에 기록 (e2e 테스트용)
# 실행:  powershell -ExecutionPolicy Bypass -File scripts\setup-wallets.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"

# 주소가 2개 미만이면 하나 더 만든다
$addrs = @(sui client addresses --json | ConvertFrom-Json | Select-Object -ExpandProperty addresses)
if ($addrs.Count -lt 2) {
  Write-Host "구독자용 주소 생성..."
  sui client new-address ed25519 | Out-Host
  $addrs = @(sui client addresses --json | ConvertFrom-Json | Select-Object -ExpandProperty addresses)
}

# addresses는 [alias, address] 쌍의 배열
$sellerAddr = $addrs[0][1]
$buyerAddr  = $addrs[1][1]

Write-Host "판매자: $sellerAddr"
Write-Host "구독자: $buyerAddr"

# 개인키 export (suiprivkey1... 형식)
$sellerKey = (sui keytool export --key-identity $sellerAddr --json | ConvertFrom-Json).exportedPrivateKey
$buyerKey  = (sui keytool export --key-identity $buyerAddr  --json | ConvertFrom-Json).exportedPrivateKey

$keep = @()
if (Test-Path $envFile) {
  $keep = Get-Content $envFile | Where-Object { $_ -notmatch "^(SELLER_SUI_PRIVATE_KEY|BUYER_SUI_PRIVATE_KEY)=" }
}
$keep += "SELLER_SUI_PRIVATE_KEY=$sellerKey"
$keep += "BUYER_SUI_PRIVATE_KEY=$buyerKey"
$keep | Set-Content $envFile

Write-Host ""
Write-Host ".env 에 기록 완료 (커밋 금지, .gitignore 에 포함됨)"
Write-Host ""
Write-Host "구독자 주소에도 가스가 필요합니다. 아래를 브라우저에서 여세요:"
Write-Host "  https://faucet.sui.io/?address=$buyerAddr"
Write-Host "받은 뒤:  cd scripts; npm install; npm run e2e"
