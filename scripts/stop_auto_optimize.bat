@echo off
setlocal

cd /d "%~dp0.."

echo Stopping fact_sim auto-optimize related processes...
echo Root: %CD%
echo.

powershell -NoProfile -Command ^
  "$patterns = @('auto-improve.mjs','auto-optimize-event-fast.mjs','auto-patch-event-fast.mjs','auto-fix-runner.mjs','watch-auto-optimize-status.mjs','watch-auto-improve-status.mjs');" ^
  "$found = $false;" ^
  "$procs = Get-CimInstance Win32_Process;" ^
  "foreach($pattern in $patterns) {" ^
  "  foreach($proc in $procs) {" ^
  "    if(($proc.Name -match '^(node(\.exe)?|npm(\.cmd|\.exe)?)$') -and $proc.CommandLine -and ($proc.CommandLine -like ('*' + $pattern + '*'))) {" ^
  "      $found = $true;" ^
  "      Write-Host ('Stopping PID ' + $proc.ProcessId + ' for ' + $pattern + ' ...');" ^
  "      Start-Process -FilePath taskkill.exe -ArgumentList @('/PID',$proc.ProcessId,'/T','/F') -WindowStyle Hidden -Wait | Out-Null;" ^
  "      Write-Host ('  Stopped PID ' + $proc.ProcessId);" ^
  "    }" ^
  "  }" ^
  "}" ^
  "if(-not $found) { Write-Host 'No running auto-optimize or watch processes were found.' }"

echo.
echo Done.
exit /b 0
