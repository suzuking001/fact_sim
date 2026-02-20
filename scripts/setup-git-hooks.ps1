param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-GitleaksInstalled {
  if (Get-Command gitleaks -ErrorAction SilentlyContinue) { return $true }
  $wingetBase = Join-Path $env:LOCALAPPDATA "Microsoft\\WinGet\\Packages"
  $path = Get-ChildItem -Path $wingetBase -Filter "Gitleaks.Gitleaks*" -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "gitleaks.exe" } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
  return [bool]$path
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot
try {
  git config core.hooksPath .githooks
  Write-Host "Configured git hooks path: .githooks"
  Write-Host "Current value: $(git config --get core.hooksPath)"
  if (-not (Test-GitleaksInstalled)) {
    Write-Warning "gitleaks is not installed (or PATH is not updated yet)."
    Write-Warning "Install command (Windows): winget install --id Gitleaks.Gitleaks --source winget"
  }
}
finally {
  Pop-Location
}
