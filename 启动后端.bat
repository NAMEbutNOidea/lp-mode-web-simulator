@echo off
setlocal
cd /d "%~dp0"
title LP Fiber Simulator - Backend

rem 可选：把含 torch / timm 的 Python 解释器路径作为第一个参数传入
rem   start-backend.bat "C:\path\to\envs\your-env\python.exe"
if not "%~1"=="" set "LP_PREDICT_PYTHON=%~1"

where node.exe >nul 2>&1
if errorlevel 1 goto node_missing

node.exe --no-warnings "backend.mjs"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo The backend has stopped ^(exit code %EXIT_CODE%^).
echo Check the messages above, then press any key to close.
pause >nul
exit /b %EXIT_CODE%

:node_missing
echo Node.js was not found on PATH.
echo Install Node.js 22.13 or newer from https://nodejs.org and run this file again.
pause
exit /b 1
