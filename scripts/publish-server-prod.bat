@echo off
setlocal EnableExtensions

rem ============================================================
rem Fixed production publish script (edit values below if needed)
rem ============================================================

set "SSH_HOST=192.168.1.79"
set "SSH_USER=zhuhuihua"
set "SSH_PORT=22"

set "REMOTE_WORKDIR=/home/zhuhuihua/quotationaddin"
set "REMOTE_UPLOADDIR=/home/zhuhuihua/upload"

set "APP_HOST=quotation.company"
set "APP_PORT=3001"
set "DB_PROFILE=company"
set "CERT_BASE_DIR=/home/zhuhuihua/certs"
set "CERT_KEY_FILE=quotation.company-key.pem"
set "CERT_PEM_FILE=quotation.company.pem"
set "SHARE_MANIFEST_PATH=/srv/office-addins/manifest.xml"

rem Optional switches:
rem set "EXTRA_SWITCHES=-NoBuild"
rem set "EXTRA_SWITCHES=-NoShareSync"
set "EXTRA_SWITCHES="

set "SCRIPT_DIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%publish-server.ps1" ^
  -SshHost "%SSH_HOST%" ^
  -SshUser "%SSH_USER%" ^
  -SshPort "%SSH_PORT%" ^
  -RemoteWorkDir "%REMOTE_WORKDIR%" ^
  -RemoteUploadDir "%REMOTE_UPLOADDIR%" ^
  -AppHost "%APP_HOST%" ^
  -AppPort %APP_PORT% ^
  -DbProfile "%DB_PROFILE%" ^
  -CertBaseDir "%CERT_BASE_DIR%" ^
  -CertKeyFile "%CERT_KEY_FILE%" ^
  -CertPemFile "%CERT_PEM_FILE%" ^
  -ShareManifestPath "%SHARE_MANIFEST_PATH%" ^
  %EXTRA_SWITCHES%

if errorlevel 1 (
  echo.
  echo [ERROR] Production publish failed.
  pause
  exit /b 1
)

echo.
echo [OK] Production publish completed.
pause
exit /b 0
