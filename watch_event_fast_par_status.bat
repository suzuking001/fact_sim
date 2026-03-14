@echo off
setlocal
cd /d "%~dp0mcp"
call npm.cmd run watch:auto-optimize
