param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-GitleaksPath {
  $cmd = Get-Command gitleaks -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $wingetBase = Join-Path $env:LOCALAPPDATA "Microsoft\\WinGet\\Packages"
  $candidates = @(Get-ChildItem -Path $wingetBase -Filter "Gitleaks.Gitleaks*" -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "gitleaks.exe" } |
    Where-Object { Test-Path $_ })

  if ($candidates.Length -gt 0) { return $candidates[0] }
  return $null
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$gitleaks = Resolve-GitleaksPath

if (-not $gitleaks) {
  throw "gitleaks is not installed (or PATH is not updated yet)."
}

Push-Location $repoRoot
try {
  Write-Host "[secret-scan] Using: $gitleaks"
  Write-Host "[secret-scan] Scan git history"
  & $gitleaks git --no-banner --redact .
  Write-Host "[secret-scan] Scan working tree"
  & $gitleaks dir --no-banner --redact .
}
finally {
  Pop-Location
}
