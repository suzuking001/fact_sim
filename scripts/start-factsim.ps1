param(
    [ValidateRange(1024, 65515)][int]$Port = 8123,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$indexPath = Join-Path $appRoot 'index.html'
$expectedPageBytes = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($indexPath))

function Test-FactSimPage([string]$Address) {
    try {
        $response = Invoke-WebRequest -Uri $Address -UseBasicParsing -TimeoutSec 1
        return $response.StatusCode -eq 200 -and [Convert]::ToBase64String($response.RawContentStream.ToArray()) -eq $expectedPageBytes
    } catch { return $false }
}

function Test-FreePort([int]$Candidate) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Candidate)
    try { $listener.Start(); return $true }
    catch { return $false }
    finally { $listener.Stop() }
}

$serverProcess = $null
$appUrl = $null
$reuse = $false
for ($candidate = $Port; $candidate -le $Port + 20; $candidate++) {
    $candidateUrl = "http://127.0.0.1:$candidate/index.html"
    if (Test-FactSimPage $candidateUrl) {
        $appUrl = $candidateUrl
        $reuse = $true
        break
    }
    if (Test-FreePort $candidate) {
        $appUrl = $candidateUrl
        $Port = $candidate
        break
    }
}
if (-not $appUrl) { throw 'No available local port. Close an unused local server and try again.' }

if (-not $reuse) {
    $pythonCommand = Get-Command py.exe -ErrorAction SilentlyContinue
    $pythonPrefix = '-3 '
    if (-not $pythonCommand) {
        $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
        $pythonPrefix = ''
    }
    if (-not $pythonCommand) { throw 'Python 3 is required. Install Python 3 and try again.' }
    $logRoot = Join-Path $appRoot 'tmp'
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $arguments = "$pythonPrefix-m http.server $Port --bind 127.0.0.1"
    $serverProcess = Start-Process -FilePath $pythonCommand.Source -ArgumentList $arguments `
        -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logRoot "factsim-server-$Port.stdout.log") `
        -RedirectStandardError (Join-Path $logRoot "factsim-server-$Port.stderr.log")
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($serverProcess.HasExited) { break }
        if (Test-FactSimPage $appUrl) { $ready = $true; break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) {
        if (-not $serverProcess.HasExited) { $serverProcess.Kill() }
        throw "The local server did not start. Check tmp/factsim-server-$Port.stderr.log."
    }
}

$launchUrl = $appUrl + '?launch=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
if (-not $NoBrowser) { Start-Process $launchUrl }
Write-Host "FactSim: $launchUrl"
if ($reuse) { Write-Host 'Using the existing local server.' }
else { Write-Host "Local-only server started in the background (PID $($serverProcess.Id))." }
if ($NoBrowser) {
    [pscustomobject]@{ Url = $launchUrl; Started = -not $reuse; ProcessId = if ($serverProcess) { $serverProcess.Id } else { $null } }
}
