@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Quotation Client Installer

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Please right-click and run as Administrator.
  pause
  exit /b 1
)

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%install-client.ps1"

if not exist "%PS_SCRIPT%" (
  echo [ERROR] Missing file: !PS_SCRIPT!
  pause
  exit /b 1
)

echo ==========================================
echo Quotation Client Installer is starting...
echo Please keep this window open until it shows [OK] Installer finished.
echo ==========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
set "RC=%ERRORLEVEL%"

if not "!RC!"=="0" (
  echo.
  echo [ERROR] Installer failed. ExitCode=!RC!
  pause
  exit /b !RC!
)

echo.
echo [OK] Installer finished.
pause
exit /b 0
