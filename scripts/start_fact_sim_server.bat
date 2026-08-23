@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0.."

set "BASE_PORT=8123"
set /a MAX_PORT=BASE_PORT+20
set "PORT="
set "PORT_STATE="
set "URL="
set "CHROME_EXE="
set "CHROME_USER_DATA=%TEMP%\fact_sim_chrome_profile"

echo Starting fact_sim static server...
echo Root: %CD%
echo.

call :find_chrome
call :resolve_port
if not defined PORT (
  echo Failed to determine a usable local port.
  pause
  exit /b 1
)
rem The launcher uses a persistent Chrome profile so folder permissions remain
rem available. Give each launch a fresh document URL to prevent that profile
rem from reopening a cached index.html that references obsolete node scripts.
set "URL=http://127.0.0.1:%PORT%/index.html?launch=%RANDOM%%RANDOM%"
echo URL : %URL%
echo.

if /I "%PORT_STATE%"=="healthy" (
  echo Port %PORT% already serves FACT SIM. Opening the app.
  call :open_browser
  goto :eof
)

where py >nul 2>nul
if not errorlevel 1 (
  if /I "%PORT_STATE%"=="occupied" (
    echo Port %BASE_PORT% is occupied by another process. Starting server on %PORT% instead.
  )
  call :open_browser
  py -3 -m http.server %PORT%
  goto :eof
)

where python >nul 2>nul
if not errorlevel 1 (
  if /I "%PORT_STATE%"=="occupied" (
    echo Port %BASE_PORT% is occupied by another process. Starting server on %PORT% instead.
  )
  call :open_browser
  python -m http.server %PORT%
  goto :eof
)

echo Python 3 was not found.
echo Install Python and then run this file again.
pause
exit /b 1

:find_chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  goto :eof
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  goto :eof
)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
  set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
  goto :eof
)
for /f "delims=" %%I in ('where chrome 2^>nul') do (
  set "CHROME_EXE=%%I"
  goto :eof
)
goto :eof

:open_browser
if defined CHROME_EXE (
  if not exist "%CHROME_USER_DATA%" mkdir "%CHROME_USER_DATA%" >nul 2>nul
  powershell -NoProfile -Command "$profilePath = [Regex]::Escape('%CHROME_USER_DATA%'); Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^chrome(\\.exe)?$' -and $_.CommandLine -match $profilePath } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }" >nul 2>nul
  echo Opening in Chrome with fixed app scale...
  start "" "%CHROME_EXE%" --new-window --start-maximized --high-dpi-support=1 --force-device-scale-factor=1 --user-data-dir="%CHROME_USER_DATA%" "%URL%"
  goto :eof
)
echo Chrome was not found. Opening in your default browser.
start "" "%URL%"
goto :eof

:resolve_port
for /l %%P in (%BASE_PORT%,1,%MAX_PORT%) do (
  call :probe_port %%P
  if /I "!PROBE_RESULT!"=="healthy" (
    set "PORT=%%P"
    set "PORT_STATE=healthy"
    goto :eof
  )
  if /I "!PROBE_RESULT!"=="free" (
    set "PORT=%%P"
    if %%P==%BASE_PORT% (
      set "PORT_STATE=free"
    ) else (
      set "PORT_STATE=occupied"
    )
    goto :eof
  )
)
goto :eof

:probe_port
set "TARGET_PORT=%~1"
set "PROBE_RESULT="
for /f "usebackq delims=" %%R in (`powershell -NoProfile -Command "$port=%TARGET_PORT%; $result='occupied'; try { $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1 } catch { $conn = $null }; if(-not $conn){ $result='free' } else { try { $resp = Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $port + '/index.html') -TimeoutSec 2; if($resp.StatusCode -eq 200 -and $resp.Content -match 'FACT SIM'){ $result='healthy' } } catch {} }; Write-Output $result"` ) do (
  set "PROBE_RESULT=%%R"
)
goto :eof
