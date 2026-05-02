# Static server for PokerTracker (Flask — ES modules need http://, not file://)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

$Port = 8080
if ($args.Count -ge 1) {
  $parsed = 0
  if ([int]::TryParse($args[0], [ref]$parsed)) {
    $Port = $parsed
  }
}

$python = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
  $python = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  $python = "py"
}

if (-not $python) {
  Write-Host "Python 3 is required. Install from https://www.python.org/downloads/" -ForegroundColor Red
  exit 1
}

Write-Host "PokerTracker root: $Root" -ForegroundColor Cyan
Write-Host ""

& $python -m pip install -q -r (Join-Path $Root 'requirements.txt')
& $python (Join-Path $Root 'server.py') --port $Port
