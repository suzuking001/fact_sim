@echo off
setlocal
cd /d "%~dp0..\mcp"
call npm.cmd run watch:auto-optimize
