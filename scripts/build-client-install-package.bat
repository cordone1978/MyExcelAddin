@echo off
setlocal EnableExtensions

title Build Client Install Package

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "WORK_DIR=%ROOT_DIR%\scripts\client-install"
set "OUT_DIR=%ROOT_DIR%\summary"
set "OUT_ZIP=%OUT_DIR%\client-install-package.zip"

if not exist "%WORK_DIR%\install-client.bat" (
  echo [ERROR] Missing file: %WORK_DIR%\install-client.bat
  pause
  exit /b 1
)
if not exist "%WORK_DIR%\install-client.ps1" (
  echo [ERROR] Missing file: %WORK_DIR%\install-client.ps1
  pause
  exit /b 1
)
if not exist "%WORK_DIR%\config.json" (
  echo [ERROR] Missing file: %WORK_DIR%\config.json
  pause
  exit /b 1
)
if not exist "%WORK_DIR%\quotation-company-root.cer" if not exist "%WORK_DIR%\rootCA.cer" if not exist "%WORK_DIR%\rootCA.pem" (
  echo [ERROR] Missing root CA certificate in %WORK_DIR%
  echo         Expected quotation-company-root.cer or rootCA.cer/rootCA.pem
  pause
  exit /b 1
)
if not exist "%WORK_DIR%\manifest.xml" (
  echo [WARN] manifest.xml not found. Package can still be used via shared folder mode.
)

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"
if exist "%OUT_ZIP%" del /q "%OUT_ZIP%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Compress-Archive -Path '%WORK_DIR%\*' -DestinationPath '%OUT_ZIP%' -Force"

if errorlevel 1 (
  echo [ERROR] Failed to create zip package.
  pause
  exit /b 1
)

echo [OK] Package created:
echo %OUT_ZIP%
pause
exit /b 0
