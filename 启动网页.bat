@echo off
chcp 65001 >nul
set "PROJECT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\start.ps1"
if errorlevel 1 (
  echo.
  echo 启动失败，请查看上方提示。
  pause
)
