#Requires -Version 5.1
# Watcher v3.0 — Inbox notifier (notify only, no auto-spawn)
# Monitors E:\inbox\ for new .txt files and pops a Windows notification.
# User then opens Claude Code to run /intake and /go interactively.
#
# Start: powershell -File H:\claude-assets\companies\web-outsource\watcher\watcher.ps1
# Stop: Ctrl+C

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$cfgPath = Join-Path $PSScriptRoot 'config.json'
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json

$null = New-Item -ItemType Directory -Force -Path $cfg.logDir, $cfg.inboxDir
$logFile = Join-Path $cfg.logDir ("watcher-{0:yyyyMMdd}.log" -f (Get-Date))

function Log($msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "$ts  $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Notify($title, $message) {
    try {
        if (Get-Module -ListAvailable -Name BurntToast) {
            Import-Module BurntToast -ErrorAction Stop
            New-BurntToastNotification -Text $title, $message -ErrorAction Stop
            return
        }
    } catch {}
    [System.Windows.Forms.MessageBox]::Show($message, $title,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}

function Scan-Inbox {
    if (-not (Test-Path $cfg.inboxDir)) { return }

    $txtFiles = Get-ChildItem -Path $cfg.inboxDir -Recurse -Filter '*.txt' -File -ErrorAction SilentlyContinue
    foreach ($txt in $txtFiles) {
        $marker = "$($txt.FullName).notified"
        if (Test-Path $marker) { continue }

        $clientName = $txt.Directory.Name
        Log "NEW_INBOX: $clientName ($($txt.Name))"

        Set-Content -Path $marker -Value (Get-Date -Format o) -Encoding UTF8

        Notify 'New Client Requirements' "Client: $clientName`nFile: $($txt.FullName)`n`nOpen Claude Code in H:\claude-assets and run:`n/intake $clientName"
    }
}

# ── Main Loop ────────────────────────────────────────────────────────────────

Log '==================== Watcher v3.0 (notify mode) ===================='
Log "poll=$($cfg.pollSeconds)s inbox=$($cfg.inboxDir)"

while ($true) {
    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
    try { Scan-Inbox } catch { Log "ERROR: $($_.Exception.Message)" }
    Start-Sleep -Seconds $cfg.pollSeconds
}
