@echo off
setlocal
cd /d "%~dp0"
title LP Fiber Simulator Backend

rem Optional machine-local Python configuration (ignored by Git).
if exist "%~dp0.env.local.bat" call "%~dp0.env.local.bat"

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%NODE_EXE%" goto run_backend

where node.exe >nul 2>&1
if errorlevel 1 goto node_missing
set "NODE_EXE=node.exe"

:run_backend
"%NODE_EXE%" --no-warnings "backend.mjs"
echo.
echo The backend has stopped or failed to start.
echo Review the message above, then press any key to close.
pause >nul
exit /b

:node_missing
echo Node.js was not found.
echo Install Node.js 22 or run this project from Codex Desktop.
pause
exit /b 1
