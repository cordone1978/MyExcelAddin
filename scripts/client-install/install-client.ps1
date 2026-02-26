param(
  [string]$ServerIp,
  [string]$HostName,
  [int]$Port,
  [string]$SharePath,
  [switch]$NoBrowser,
  [switch]$NoExcel
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step($msg) { Write-Host "[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Write-WarnMsg($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-ErrMsg($msg) { Write-Host "[ERR]  $msg" -ForegroundColor Red }

function Invoke-CmdCapture {
  param(
    [Parameter(Mandatory = $true)][string]$CommandLine
  )
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $out = & cmd.exe /c $CommandLine 2>&1
  $ErrorActionPreference = $oldEap
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output   = ($out | Out-String).Trim()
  }
}

function Get-CompactCmdMessage {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return '' }
  $lines = $Text -split "(`r`n|`n|`r)" | Where-Object {
    $_ -and
    ($_ -notmatch '^\s*所在位置 ') -and
    ($_ -notmatch '^\s*\+\s') -and
    ($_ -notmatch '^\s*\~+') -and
    ($_ -notmatch '^\s*\+ CategoryInfo') -and
    ($_ -notmatch '^\s*\+ FullyQualifiedErrorId')
  }
  if (-not $lines -or $lines.Count -eq 0) { return '' }
  $first = ($lines | Select-Object -First 1).Trim()
  if ($first -like 'cmd.exe : *') { $first = $first.Substring(9).Trim() }
  $last = ($lines | Select-Object -Last 1).Trim()
  if ($last -and $last -ne $first -and $last -notmatch '^cmd\.exe :') {
    return "$first | $last"
  }
  return $first
}

function Set-OfficeTrustedCatalog {
  param(
    [Parameter(Mandatory = $true)][string]$CatalogUrl
  )

  $versions = @('16.0', '15.0')
  $configured = @()

  foreach ($ver in $versions) {
    $basePath = "HKCU:\Software\Microsoft\Office\$ver\WEF\TrustedCatalogs"
    try {
      if (-not (Test-Path $basePath)) {
        New-Item -Path $basePath -Force | Out-Null
      }

      $existing = Get-ChildItem -Path $basePath -ErrorAction SilentlyContinue | Where-Object {
        try {
          (Get-ItemProperty -Path $_.PSPath -Name Url -ErrorAction Stop).Url -eq $CatalogUrl
        } catch {
          $false
        }
      } | Select-Object -First 1

      if ($existing) {
        $id = (Get-ItemProperty -Path $existing.PSPath -Name Id -ErrorAction SilentlyContinue).Id
        if (-not $id) { $id = "{0}" -f ([guid]::NewGuid().ToString()) }
        New-ItemProperty -Path $existing.PSPath -Name Id -Value $id -PropertyType String -Force | Out-Null
        New-ItemProperty -Path $existing.PSPath -Name Url -Value $CatalogUrl -PropertyType String -Force | Out-Null
        New-ItemProperty -Path $existing.PSPath -Name Flags -Value 1 -PropertyType DWord -Force | Out-Null
        $configured += $ver
        continue
      }

      $guid = '{' + [guid]::NewGuid().ToString() + '}'
      $catalogPath = Join-Path $basePath $guid
      New-Item -Path $catalogPath -Force | Out-Null
      New-ItemProperty -Path $catalogPath -Name Id -Value $guid -PropertyType String -Force | Out-Null
      New-ItemProperty -Path $catalogPath -Name Url -Value $CatalogUrl -PropertyType String -Force | Out-Null
      New-ItemProperty -Path $catalogPath -Name Flags -Value 1 -PropertyType DWord -Force | Out-Null
      $configured += $ver
    } catch {
      Write-WarnMsg "Failed to configure Office trusted catalog for version ${ver}: $($_.Exception.Message)"
    }
  }

  return $configured
}

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-ErrMsg 'Please run install-client.bat as Administrator.'
  exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptDir 'config.json'
$cfg = $null
if (Test-Path $configPath) {
  try {
    $cfg = Get-Content -Path $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Write-WarnMsg "Failed to read config.json: $($_.Exception.Message)"
  }
}

if (-not $HostName) {
  $HostName = if ($cfg -and $cfg.hostName) { [string]$cfg.hostName } else { 'quotation.company' }
}
if (-not $PSBoundParameters.ContainsKey('Port') -or $Port -le 0) {
  $Port = if ($cfg -and $cfg.port) { [int]$cfg.port } else { 3001 }
}
$defaultIp = if ($cfg -and $cfg.defaultServerIp) { [string]$cfg.defaultServerIp } else { '192.168.1.79' }
if (-not $ServerIp) {
  $ServerIp = $defaultIp
}
if (-not $SharePath) {
  $SharePath = if ($cfg -and $cfg.sharePath) { [string]$cfg.sharePath } else { "\\$HostName\office-addins" }
}
if ($cfg) {
  if ($cfg.openBrowser -eq $false) { $NoBrowser = $true }
  if ($cfg.openExcel -eq $false) { $NoExcel = $true }
}
$smbUser = if ($cfg -and $cfg.smbUsername) { [string]$cfg.smbUsername } else { '' }
$smbPass = if ($cfg -and $cfg.smbPassword) { [string]$cfg.smbPassword } else { '' }

$rootCertCandidates = @(
  (Join-Path $scriptDir 'quotation-company-root.cer'),
  (Join-Path $scriptDir 'quotation-company-root.pem'),
  (Join-Path $scriptDir 'rootCA.cer'),
  (Join-Path $scriptDir 'rootCA.pem')
)
$rootCert = $rootCertCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $rootCert) {
  Write-ErrMsg 'Root CA certificate not found in package folder.'
  Write-Host 'Expected one of:'
  $rootCertCandidates | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

$manifestPath = Join-Path $scriptDir 'manifest.xml'
if (-not (Test-Path $manifestPath)) {
  Write-WarnMsg 'manifest.xml not found in package folder (shared folder mode can still work).'
}

$hostsFile = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$apiUrl = "https://$HostName`:$Port/api/test"
$taskpaneUrl = "https://$HostName`:$Port/taskpane.html"

Write-Host '=========================================='
Write-Host 'Quotation Client Installer (One-Click v1.3)'
Write-Host '=========================================='
Write-Host "Config File : $(if (Test-Path $configPath) { $configPath } else { 'N/A (using built-in defaults)' })"
Write-Host "HostName   : $HostName"
Write-Host "Server IP  : $ServerIp (from config.json unless overridden)"
Write-Host "Port       : $Port"
Write-Host "Share Path : $SharePath"
Write-Host "SMB User   : $(if ([string]::IsNullOrWhiteSpace($smbUser)) { '<none>' } else { $smbUser })"
Write-Host "Root Cert  : $rootCert"
Write-Host ''

Write-Step 'Updating hosts mapping'
$escapedHost = [regex]::Escape($HostName)
$lines = @()
if (Test-Path $hostsFile) {
  $lines = [System.IO.File]::ReadAllLines($hostsFile)
}
$filtered = foreach ($line in $lines) {
  if ($line -match "^\s*\d{1,3}(\.\d{1,3}){3}\s+$escapedHost(\s|$)") { continue }
  $line
}
$filtered += "$ServerIp $HostName"
[System.IO.File]::WriteAllLines($hostsFile, [string[]]$filtered, [System.Text.Encoding]::ASCII)
Write-Ok "hosts updated: $ServerIp $HostName"

Write-Step 'Importing root certificate to LocalMachine\\Root'
& certutil -f -addstore Root $rootCert | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'certutil failed to import root certificate.'
}
Write-Ok 'Root certificate imported'

Write-Step 'Flushing DNS cache'
& ipconfig /flushdns | Out-Null
Write-Ok 'DNS cache flushed'

Write-Step 'Verifying DNS resolution'
try {
  $resolved = [System.Net.Dns]::GetHostAddresses($HostName) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -ExpandProperty IPAddressToString
  if ($resolved -contains $ServerIp) {
    Write-Ok "$HostName resolves to $ServerIp"
  } elseif ($resolved.Count -gt 0) {
    Write-WarnMsg "$HostName resolves to: $($resolved -join ', ') (expected $ServerIp)"
  } else {
    Write-WarnMsg 'No IPv4 result from DNS resolution check.'
  }
} catch {
  Write-WarnMsg "DNS resolution check failed: $($_.Exception.Message)"
}

Write-Step 'Verifying HTTPS endpoints'
$apiOk = $false
$taskpaneOk = $false
try {
  $apiResp = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 12
  if ($apiResp.StatusCode -ge 200 -and $apiResp.StatusCode -lt 300) {
    $apiOk = $true
    Write-Ok "API reachable: $apiUrl"
  }
} catch {
  Write-WarnMsg "API check failed: $($_.Exception.Message)"
}
try {
  $tpResp = Invoke-WebRequest -Uri $taskpaneUrl -UseBasicParsing -TimeoutSec 12
  if ($tpResp.StatusCode -ge 200 -and $tpResp.StatusCode -lt 400) {
    $taskpaneOk = $true
    Write-Ok "Taskpane reachable: $taskpaneUrl"
  }
} catch {
  Write-WarnMsg "Taskpane check failed: $($_.Exception.Message)"
}

Write-Step 'Verifying shared folder access'
$shareOk = $false
$shareHost = $null
if ($SharePath -match '^\\\\([^\\]+)\\([^\\]+)') {
  $shareHost = $matches[1]
  $shareName = $matches[2]
  $shareRoot = "\\$shareHost\$shareName"
} else {
  $shareName = $null
  $shareRoot = $null
}
if (-not [string]::IsNullOrWhiteSpace($smbUser) -and -not [string]::IsNullOrWhiteSpace($smbPass) -and $shareHost -and $shareRoot) {
  Write-Step 'Connecting SMB share with configured credentials'
  $legacyHosts = @($shareHost, 'quotation-vm.test') | Select-Object -Unique
  foreach ($h in $legacyHosts) {
    foreach ($target in @("\\$h\$shareName", "\\$h\IPC$")) {
      try {
        $delRes = Invoke-CmdCapture "net use `"$target`" /delete /y"
        if ($delRes.ExitCode -eq 0) {
          Write-Ok "Removed stale SMB connection: $target"
        } elseif (-not [string]::IsNullOrWhiteSpace($delRes.Output)) {
          # Common and safe on first run: "The network connection could not be found."
          $compact = Get-CompactCmdMessage $delRes.Output
          Write-WarnMsg "net use delete skipped for $target (exit $($delRes.ExitCode)): $compact"
        }
      } catch {
        Write-WarnMsg "net use delete exception for ${target}: $($_.Exception.Message)"
      }
    }
  }

  $cmdkeyCandidates = @($smbUser, "$shareHost\$smbUser") | Select-Object -Unique
  $cmdkeyOk = $false
  foreach ($candidateUser in $cmdkeyCandidates) {
    try {
      $ck = Invoke-CmdCapture "cmdkey /add:$shareHost /user:$candidateUser /pass:$smbPass"
      if ($ck.ExitCode -eq 0) {
        Write-Ok "Stored SMB credentials for $shareHost with user $candidateUser"
        $cmdkeyOk = $true
        break
      } elseif (-not [string]::IsNullOrWhiteSpace($ck.Output)) {
        $compact = Get-CompactCmdMessage $ck.Output
        Write-WarnMsg "cmdkey failed for user $candidateUser (exit $($ck.ExitCode)): $compact"
      }
    } catch {
      Write-WarnMsg "cmdkey exception for user ${candidateUser}: $($_.Exception.Message)"
    }
  }
  if (-not $cmdkeyOk) {
    Write-WarnMsg "Could not pre-store SMB credentials via cmdkey for $shareHost"
  }

  $candidates = @($smbUser, "$shareHost\$smbUser")
  $connected = $false
  foreach ($candidateUser in ($candidates | Select-Object -Unique)) {
    try {
      $conn = Invoke-CmdCapture "net use `"$shareRoot`" /user:$candidateUser $smbPass /persistent:no"
      if ($conn.ExitCode -eq 0) {
        Write-Ok "SMB credentials applied to $shareRoot with user $candidateUser"
        $connected = $true
        break
      } elseif (-not [string]::IsNullOrWhiteSpace($conn.Output)) {
        $compact = Get-CompactCmdMessage $conn.Output
        Write-WarnMsg "net use failed for user $candidateUser (exit $($conn.ExitCode)): $compact"
      }
    } catch {
      Write-WarnMsg "net use exception for user ${candidateUser}: $($_.Exception.Message)"
    }
  }
  if (-not $connected) {
    Write-WarnMsg "Failed to preconnect SMB share for $shareRoot. User/password may be incorrect."
  }
}
try {
  if (Test-Path $SharePath) {
    $shareOk = $true
    Write-Ok "Share reachable: $SharePath"
    if (Test-Path (Join-Path $SharePath 'manifest.xml')) {
      Write-Ok 'manifest.xml found in shared folder'
    } else {
      Write-WarnMsg 'manifest.xml not found in shared folder'
    }
  } else {
    Write-WarnMsg 'Share path not reachable right now (credentials may be required).'
  }
} catch {
    Write-WarnMsg "Share check failed: $($_.Exception.Message)"
}

Write-Step 'Configuring Excel shared add-in catalog (registry)'
$catalogVersions = Set-OfficeTrustedCatalog -CatalogUrl $SharePath
if ($catalogVersions.Count -gt 0) {
  Write-Ok "Trusted Add-in Catalog configured for Office version(s): $($catalogVersions -join ', ')"
  Write-WarnMsg 'Restart all Office apps before opening Excel add-ins.'
} else {
  Write-WarnMsg 'Could not auto-configure Trusted Add-in Catalog. Manual Excel setup may be required.'
}

if (-not $NoBrowser) {
  Write-Step 'Opening browser verification pages'
  Start-Process $apiUrl | Out-Null
  Start-Process $taskpaneUrl | Out-Null
}

Write-Step 'Opening shared folder'
Start-Process explorer.exe $SharePath | Out-Null

if (-not $NoExcel) {
  Write-Step 'Opening Excel (if installed)'
  try {
    Start-Process excel.exe | Out-Null
    Write-Ok 'Excel launched (or request sent to shell)'
  } catch {
    Write-WarnMsg 'Excel launch failed. Open Excel manually.'
  }
}

Write-Host ''
Write-Host '=========================================='
Write-Host 'Installer completed'
Write-Host '=========================================='
Write-Host "HTTPS API    : $(if ($apiOk) {'OK'} else {'CHECK'})"
Write-Host "Taskpane URL : $(if ($taskpaneOk) {'OK'} else {'CHECK'})"
Write-Host "Share Path   : $(if ($shareOk) {'OK'} else {'CHECK'})"
Write-Host ''
Write-Host 'Next steps in Excel:'
Write-Host '1. Restart Excel if it was already open.'
Write-Host "2. Shared folder path: $SharePath"
Write-Host '3. In Excel -> My Add-ins -> Shared Folder, open Quotation System (报价系统)'
Write-Host ''
Write-Host 'Fallback: use manifest.xml in this package for manual sideload if needed.'
