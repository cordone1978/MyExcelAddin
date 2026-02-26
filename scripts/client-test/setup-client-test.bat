@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Client Test Environment Setup

REM Must run as administrator
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Please right-click and run this BAT as Administrator.
  echo.
  pause
  exit /b 1
)

set "DEFAULT_HOST=quotation-vm.test"
set "DEFAULT_IP=192.168.100.117"
set "HOST_NAME=%DEFAULT_HOST%"
set "TARGET_IP=%DEFAULT_IP%"

echo ==========================================
echo Client Test Environment Setup
echo ==========================================
echo.
echo Default host: %DEFAULT_HOST%
echo Default server IP: %DEFAULT_IP%
echo.

set /p "TARGET_IP=Input test server IP, press Enter for %DEFAULT_IP%: "
if "%TARGET_IP%"=="" set "TARGET_IP=%DEFAULT_IP%"

set "SCRIPT_DIR=%~dp0"
set "CERT_FILE=%SCRIPT_DIR%quotation-vm.test.cer"
if not exist "%CERT_FILE%" set "CERT_FILE=%SCRIPT_DIR%quotation-vm.test.pem"

if not exist "%CERT_FILE%" (
  echo.
  echo [ERROR] Certificate file not found.
  echo Please place quotation-vm.test.cer ^(or .pem^) in this folder:
  echo %SCRIPT_DIR%
  echo.
  pause
  exit /b 1
)

set "MANIFEST_FILE=%SCRIPT_DIR%manifest.xml"
if not exist "%MANIFEST_FILE%" (
  echo.
  echo [WARN] manifest.xml not found in the same folder.
  echo You can still finish hosts/certificate setup, but Excel sideload needs manifest.xml.
  echo.
)

set "HOSTS_FILE=%SystemRoot%\System32\drivers\etc\hosts"
set "TEMP_HOSTS=%TEMP%\hosts_%RANDOM%.tmp"

echo [1/4] Updating hosts mapping...
type nul > "%TEMP_HOSTS%"
for /f "usebackq delims=" %%L in ("%HOSTS_FILE%") do (
  echo %%L | findstr /R /I /C:"^[ ]*[0-9][0-9\.]*[ ]\+%HOST_NAME%[ ]*$" >nul
  if errorlevel 1 (
    >> "%TEMP_HOSTS%" echo %%L
  )
)
>> "%TEMP_HOSTS%" echo %TARGET_IP% %HOST_NAME%
copy /Y "%TEMP_HOSTS%" "%HOSTS_FILE%" >nul
del /Q "%TEMP_HOSTS%" >nul 2>&1
echo [OK] hosts updated: %TARGET_IP% %HOST_NAME%

echo.
echo [2/4] Importing certificate to Trusted Root...
certutil -f -addstore Root "%CERT_FILE%" >nul
if errorlevel 1 (
  echo [ERROR] Certificate import failed.
  echo File: %CERT_FILE%
  echo.
  pause
  exit /b 1
)
echo [OK] Certificate imported.

echo.
echo [3/4] Verifying host resolution...
ping -n 1 %HOST_NAME% | findstr /I /C:"%TARGET_IP%" >nul
if not errorlevel 1 (
  echo [OK] %HOST_NAME% resolves to %TARGET_IP%
) else (
  echo [WARN] ping did not show the target IP. This may still be OK.
  echo Continue with browser verification.
)

echo.
echo [4/4] Opening browser verification pages...
start "" "https://%HOST_NAME%:3001/api/test"
start "" "https://%HOST_NAME%:3001/taskpane.html"

echo.
echo ==========================================
echo Setup complete
echo ==========================================
echo Next steps:
echo 1. Confirm both pages open in the browser.
echo 2. In Excel, open Quotation System from shared folder catalog (preferred).
echo 3. If shared folder catalog is not configured, use manifest.xml as sideload fallback.
echo 4. If server IP changes, rerun this BAT and enter the new IP.
echo.
pause
exit /b 0

