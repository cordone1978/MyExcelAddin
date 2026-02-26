@echo off
setlocal EnableExtensions

title Build Client Test Package

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "WORK_DIR=%ROOT_DIR%\scripts\client-test"
set "OUT_DIR=%ROOT_DIR%\summary"
set "OUT_ZIP=%OUT_DIR%\client-test-package.zip"

if not exist "%WORK_DIR%\setup-client-test.bat" (
  echo [ERROR] Missing file: %WORK_DIR%\setup-client-test.bat
  pause
  exit /b 1
)

if not exist "%WORK_DIR%\manifest.xml" (
  echo [ERROR] Please copy the test manifest.xml into:
  echo         %WORK_DIR%
  pause
  exit /b 1
)

if not exist "%WORK_DIR%\quotation-vm.test.cer" if not exist "%WORK_DIR%\quotation-vm.test.pem" (
  echo [ERROR] Please copy quotation-vm.test.cer ^(or .pem^) into:
  echo         %WORK_DIR%
  pause
  exit /b 1
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
