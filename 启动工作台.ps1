param(
    [switch]$NewWindow,
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'terminal-layout.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command wt.exe -ErrorAction SilentlyContinue)) {
    throw '未找到 wt.exe，请先安装 Windows Terminal。'
}

if (-not (Test-Path $ConfigPath)) {
    throw "配置文件不存在: $ConfigPath"
}

$config = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $config.tabs -or $config.tabs.Count -eq 0) {
    throw '配置文件里没有 tabs 项。'
}

$windowTarget = if ($NewWindow) { 'new' } else { '0' }
$args = @('-w', $windowTarget)
$added = 0

foreach ($tab in $config.tabs) {
    if (-not $tab.dir) { continue }
    if (-not (Test-Path $tab.dir)) {
        Write-Warning "目录不存在，已跳过: $($tab.dir)"
        continue
    }

    if ($added -gt 0) { $args += ';' }

    $title = [string]$tab.title
    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = Split-Path -Path $tab.dir -Leaf
    }

    $args += @('new-tab', '--title', $title)

    if ($tab.color -and $tab.color -match '^#([0-9A-Fa-f]{6})$') {
        $args += @('--tabColor', [string]$tab.color)
    }

    $args += @('-d', [string]$tab.dir)

    $cmd = [string]$tab.cmd
    if (-not [string]::IsNullOrWhiteSpace($cmd)) {
        $args += @('pwsh', '-NoExit', '-Command', $cmd)
    }

    $added++
}

if ($added -eq 0) {
    throw '没有可打开的 tab（目录可能都不存在）。'
}

& wt.exe @args
