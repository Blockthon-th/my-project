# Copies the demo templates out of the repo into C:\demo\{seller,buyer,baseline-1..3}.
# Run before every rehearsal to reset the folders to the v1 state.
#
#   powershell -ExecutionPolicy Bypass -File C:\mm\demo\setup.ps1            # all folders
#   powershell -ExecutionPolicy Bypass -File C:\mm\demo\setup.ps1 -Only buyer  # one folder (seller|buyer|baseline)
#   ... -KeepSellerSteps   # keep seller .mm\steps + state.json (after the 5-turn pre-run you want to keep them!)
#
# ASCII only on purpose: PowerShell 5.1 reads .ps1 without BOM as CP949 and breaks Korean text.
param(
  [ValidateSet('all','seller','buyer','baseline')] [string] $Only = 'all',
  [string] $Dest = 'C:\demo',
  [switch] $KeepSellerSteps
)
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $MyInvocation.MyCommand.Path   # ...\demo

function Copy-Template([string] $from, [string] $to, [string[]] $keep) {
  if (Test-Path $to) {
    Get-ChildItem -Force $to | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
  } else {
    New-Item -ItemType Directory -Force $to | Out-Null
  }
  Get-ChildItem -Force $from | Where-Object { $keep -notcontains $_.Name } | ForEach-Object {
    Copy-Item -Recurse -Force $_.FullName (Join-Path $to $_.Name)
  }
  Write-Host ("  {0}  <-  {1}" -f $to, $from)
}

New-Item -ItemType Directory -Force $Dest | Out-Null
Write-Host "demo folders:"

if ($Only -eq 'all' -or $Only -eq 'seller') {
  $keep = @()
  if ($KeepSellerSteps) { $keep = @('.mm') }
  Copy-Template (Join-Path $src 'seller') (Join-Path $Dest 'seller') $keep
  if (-not $KeepSellerSteps) {
    # fresh session state: only config.json survives from the template
    $mm = Join-Path $Dest 'seller\.mm'
    Get-ChildItem -Force $mm | Where-Object { $_.Name -ne 'config.json' } | Remove-Item -Recurse -Force
  }
}
if ($Only -eq 'all' -or $Only -eq 'buyer') {
  Copy-Template (Join-Path $src 'buyer') (Join-Path $Dest 'buyer') @()
  Remove-Item -Recurse -Force (Join-Path $Dest 'buyer\README.md') -ErrorAction SilentlyContinue
}
if ($Only -eq 'all' -or $Only -eq 'baseline') {
  foreach ($i in 1..3) {
    $to = Join-Path $Dest ("baseline-{0}" -f $i)
    Copy-Template (Join-Path $src 'baseline') $to @()
    Remove-Item -Force (Join-Path $to 'README.md') -ErrorAction SilentlyContinue
    Copy-Item -Force (Join-Path $src 'buyer\index.html') (Join-Path $to 'index.html')
  }
}

Write-Host ""
Write-Host "next:"
Write-Host "  seller : cd $Dest\seller ; claude    (prompts: demo\seller\SESSION-SCRIPT.md)"
Write-Host "  buyer  : cd $Dest\buyer  ; claude    then /improve"
Write-Host "  screen : node $src\serve.mjs  ->  http://localhost:8787/compare.html"
