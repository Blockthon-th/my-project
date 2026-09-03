# Sui CLI 설치 + 테스트넷 지갑 생성 (Windows PowerShell)
# 실행:  powershell -ExecutionPolicy Bypass -File scripts\setup-sui.ps1
$ErrorActionPreference = "Stop"
$ver = "testnet-v1.79.0"
$dir = "$env:LOCALAPPDATA\sui\bin"
$tgz = "$env:TEMP\sui.tgz"

if (-not (Get-Command sui -ErrorAction SilentlyContinue)) {
  Write-Host "[1/4] Sui CLI $ver 다운로드 (약 200MB)..."
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Invoke-WebRequest -Uri "https://github.com/MystenLabs/sui/releases/download/$ver/sui-$ver-windows-x86_64.tgz" -OutFile $tgz
  Write-Host "[2/4] 압축 해제..."
  tar -xzf $tgz -C $dir
  Remove-Item $tgz
  # PATH 등록 (사용자 환경변수, 영구)
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$dir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$dir", "User")
  }
  $env:Path = "$env:Path;$dir"
} else {
  Write-Host "[1/4] sui 이미 설치됨: $(sui --version)"
}

Write-Host "[3/4] 클라이언트 설정 (testnet) + 지갑 생성..."
if (-not (Test-Path "$env:USERPROFILE\.sui\sui_config\client.yaml")) {
  Write-Host "  질문 3개: 연결? -> y  /  URL -> Enter(기본 testnet)  /  key scheme -> 0"
  sui client
}
sui client switch --env testnet
$addr = (sui client active-address).Trim()

Write-Host ""
Write-Host "[4/4] 완료. 지갑 주소:"
Write-Host "  $addr"
Write-Host ""
Write-Host "다음: 아래 주소를 브라우저에서 열어 테스트넷 SUI를 받으세요 (무료, 하루 몇 번 제한)"
Write-Host "  https://faucet.sui.io/?address=$addr"
Write-Host "받은 뒤:  sui client gas   로 잔액 확인 → scripts\deploy.ps1 실행"
