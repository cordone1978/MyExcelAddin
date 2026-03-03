param(
  [Parameter(Mandatory = $true)][string]$SshHost,
  [Parameter(Mandatory = $true)][string]$SshUser,
  [string]$SshPort = "22",
  [string]$RemoteWorkDir = "/opt/quotationaddin",
  [string]$RemoteUploadDir = "",
  [string]$RemotePackageName = "quotationaddin-deploy.tgz",
  [string]$AppHost = "quotation.company",
  [int]$AppPort = 3001,
  [string]$DbProfile = "company",
  [string]$CertBaseDir = "",
  [string]$CertKeyFile = "",
  [string]$CertPemFile = "",
  [string]$ShareManifestPath = "/srv/office-addins/manifest.xml",
  [switch]$NoPatch,
  [switch]$NoBuild,
  [switch]$NoRestart,
  [switch]$NoShareSync,
  [switch]$KeepRemotePackage,
  [switch]$SkipPuppeteerDownload = $true,
  [switch]$KeepLocalPackage,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Write-WarnMsg($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-ErrMsg($msg) { Write-Host "[ERR]  $msg" -ForegroundColor Red }

function Require-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $Name"
  }
}

function Quote-Sh {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)
  $shellEscapedSingleQuote = ("'" + '"' + "'" + '"' + "'")
  return "'" + ($Value -replace "'", $shellEscapedSingleQuote) + "'"
}

function Get-PosixParentDir {
  param([Parameter(Mandatory = $true)][string]$Path)
  $trimmed = $Path.TrimEnd("/")
  if ([string]::IsNullOrWhiteSpace($trimmed)) { return "/" }
  $lastSlash = $trimmed.LastIndexOf("/")
  if ($lastSlash -le 0) { return "/" }
  return $trimmed.Substring(0, $lastSlash)
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [string]$Label = $FilePath
  )

  Write-Step "$Label"
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

Require-Command tar
Require-Command scp
Require-Command ssh

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$RemoteUploadDir = if ([string]::IsNullOrWhiteSpace($RemoteUploadDir)) { "/home/$SshUser/upload" } else { $RemoteUploadDir }
$localPackagePath = Join-Path $repoRoot $RemotePackageName
$remotePackagePath = (($RemoteUploadDir.TrimEnd("/")) + "/" + $RemotePackageName)
$remoteWorkParentDir = Get-PosixParentDir -Path $RemoteWorkDir
$remoteBootstrapPath = (($remoteWorkParentDir.TrimEnd("/")) + "/.quotationaddin-bootstrap-update.sh")
$localBootstrapScriptPath = Join-Path $scriptDir "remote-bootstrap-update.sh"

if (-not (Test-Path $localBootstrapScriptPath)) {
  throw "Missing bootstrap script: $localBootstrapScriptPath"
}

Write-Host "=========================================="
Write-Host "Publish To Server (Local -> SSH)"
Write-Host "=========================================="
Write-Host "Repo Root         : $repoRoot"
Write-Host "SSH Target        : $SshUser@$SshHost`:$SshPort"
Write-Host "Remote WorkDir    : $RemoteWorkDir"
Write-Host "Remote Upload Dir : $RemoteUploadDir"
Write-Host "Remote Package    : $remotePackagePath"
Write-Host "Remote Bootstrap  : $remoteBootstrapPath"
Write-Host "APP_HOST          : $AppHost"
Write-Host "APP_PORT          : $AppPort"
Write-Host "DB_PROFILE        : $DbProfile"
Write-Host "CERT_BASE_DIR     : $(if ([string]::IsNullOrWhiteSpace($CertBaseDir)) { '<unset>' } else { $CertBaseDir })"
Write-Host "CERT_KEY_FILE     : $(if ([string]::IsNullOrWhiteSpace($CertKeyFile)) { '<default>' } else { $CertKeyFile })"
Write-Host "CERT_PEM_FILE     : $(if ([string]::IsNullOrWhiteSpace($CertPemFile)) { '<default>' } else { $CertPemFile })"
Write-Host ""

$tarArgs = @(
  "-czf", $localPackagePath,
  "--exclude=.git",
  "--exclude=node_modules",
  "--exclude=dist",
  "--exclude=logs",
  "--exclude=.deploy-backups",
  "--exclude=.release-backups",
  "--exclude=summary/*.zip",
  "--exclude=quotationaddin-deploy.tgz",
  "-C", $repoRoot,
  "."
)

if ($DryRun) {
  Write-WarnMsg "Dry run: skip local packaging/upload/remote update."
  Write-Host "Planned local package: $localPackagePath"
  Write-Host "Planned remote package: $remotePackagePath"
  exit 0
}

Invoke-Checked -FilePath "tar" -ArgumentList $tarArgs -Label "Create deployment package"
Write-Ok "Package created: $localPackagePath"

$sshTarget = "$SshUser@$SshHost"
$scpBaseArgs = @("-P", $SshPort)
$sshBaseArgs = @("-p", $SshPort)

$ensureRemoteDirsCmd = @(
  "mkdir -p " + (Quote-Sh $RemoteUploadDir),
  "mkdir -p " + (Quote-Sh $RemoteWorkDir),
  "mkdir -p " + (Quote-Sh $remoteWorkParentDir)
) -join " && "
Invoke-Checked -FilePath "ssh" -ArgumentList ($sshBaseArgs + @($sshTarget, $ensureRemoteDirsCmd)) -Label "Ensure remote dirs"

Invoke-Checked -FilePath "scp" -ArgumentList ($scpBaseArgs + @($localPackagePath, "${sshTarget}:$remotePackagePath")) -Label "Upload package"
Write-Ok "Uploaded: $remotePackagePath"
Invoke-Checked -FilePath "scp" -ArgumentList ($scpBaseArgs + @($localBootstrapScriptPath, "${sshTarget}:$remoteBootstrapPath")) -Label "Upload remote bootstrap script"
Invoke-Checked -FilePath "ssh" -ArgumentList ($sshBaseArgs + @($sshTarget, "chmod +x " + (Quote-Sh $remoteBootstrapPath))) -Label "Make remote bootstrap executable"

$remoteArgs = New-Object System.Collections.Generic.List[string]
if ($NoPatch) { [void]$remoteArgs.Add("--no-patch") }
if ($NoBuild) { [void]$remoteArgs.Add("--no-build") }
if ($NoRestart) { [void]$remoteArgs.Add("--no-restart") }
if ($NoShareSync) { [void]$remoteArgs.Add("--no-share-sync") }
if ($KeepRemotePackage) { [void]$remoteArgs.Add("--keep-package") }
if ($SkipPuppeteerDownload) { } # default handled via env below

$envPairs = @(
  "APP_HOST=" + (Quote-Sh $AppHost),
  "APP_PORT=" + (Quote-Sh ([string]$AppPort)),
  "DB_PROFILE=" + (Quote-Sh $DbProfile),
  "WORKDIR=" + (Quote-Sh $RemoteWorkDir),
  "SHARE_MANIFEST_PATH=" + (Quote-Sh $ShareManifestPath)
)
if (-not [string]::IsNullOrWhiteSpace($CertBaseDir)) {
  $envPairs += "CERT_BASE_DIR=" + (Quote-Sh $CertBaseDir)
}
if (-not [string]::IsNullOrWhiteSpace($CertKeyFile)) {
  $envPairs += "CERT_KEY_FILE=" + (Quote-Sh $CertKeyFile)
}
if (-not [string]::IsNullOrWhiteSpace($CertPemFile)) {
  $envPairs += "CERT_PEM_FILE=" + (Quote-Sh $CertPemFile)
}
if ($SkipPuppeteerDownload) {
  $envPairs += "SKIP_PUPPETEER_DOWNLOAD='1'"
}

$remoteBootstrapCall = (Quote-Sh $remoteBootstrapPath) + " " + (Quote-Sh $RemoteWorkDir) + " " + (Quote-Sh $remotePackagePath)
if ($remoteArgs.Count -gt 0) {
  $remoteBootstrapCall += " " + ($remoteArgs -join " ")
}
$remoteCommand = (($envPairs -join " ") + " " + $remoteBootstrapCall).Trim()

Invoke-Checked -FilePath "ssh" -ArgumentList ($sshBaseArgs + @($sshTarget, $remoteCommand)) -Label "Run remote update"

if (-not $KeepLocalPackage -and (Test-Path $localPackagePath)) {
  Remove-Item -Path $localPackagePath -Force
  Write-Ok "Local package removed: $localPackagePath"
}

Write-Host ""
Write-Ok "Publish and remote update completed."
