@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%publish-server.ps1" %*

if errorlevel 1 (
  echo.
  echo [ERROR] Publish failed.
  pause
  exit /b 1
)

echo.
echo [OK] Publish completed.
pause
exit /b 0
