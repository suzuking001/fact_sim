@echo off
setlocal

cd /d "%~dp0"

set "PORT=8123"
set "URL=http://127.0.0.1:%PORT%/index.html"

echo Starting fact_sim static server...
echo Root: %CD%
echo URL : %URL%
echo.

powershell -NoProfile -Command "try { $conn = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction Stop | Select-Object -First 1 } catch { $conn = $null }; if($conn){ exit 0 } else { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Port %PORT% is already in use. Opening the app in your browser.
  start "" "%URL%"
  goto :eof
)

where py >nul 2>nul
if not errorlevel 1 (
  start "" "%URL%"
  py -3 -m http.server %PORT%
  goto :eof
)

where python >nul 2>nul
if not errorlevel 1 (
  start "" "%URL%"
  python -m http.server %PORT%
  goto :eof
)

echo Python 3 was not found.
echo Install Python and then run this file again.
pause
exit /b 1
