@echo off
setlocal

cd /d "%~dp0"

set "PORT=8123"
set "URL=http://127.0.0.1:%PORT%/index.html"
set "CHROME_EXE="

echo Starting fact_sim static server...
echo Root: %CD%
echo URL : %URL%
echo.

call :find_chrome

powershell -NoProfile -Command "try { $conn = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction Stop | Select-Object -First 1 } catch { $conn = $null }; if($conn){ exit 0 } else { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Port %PORT% is already in use. Opening the app.
  call :open_browser
  goto :eof
)

where py >nul 2>nul
if not errorlevel 1 (
  call :open_browser
  py -3 -m http.server %PORT%
  goto :eof
)

where python >nul 2>nul
if not errorlevel 1 (
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
  echo Opening in Chrome...
  start "" "%CHROME_EXE%" "%URL%"
  goto :eof
)
echo Chrome was not found. Opening in your default browser.
start "" "%URL%"
goto :eof
