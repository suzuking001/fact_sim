@echo off
setlocal
title FactSim Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-factsim.ps1" %*
if errorlevel 1 (
  echo.
  echo FactSim could not start. See the error above.
  pause
  exit /b 1
)
exit /b 0
