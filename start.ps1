# Dayfold startup script
# Clears the lingering ELECTRON_RUN_AS_NODE var (which makes Electron run as plain
# Node and fail to launch), then starts the app via the real electron binary.
# Usage: double-click startDayfold.bat, or:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ./start.ps1

$ErrorActionPreference = 'Stop'

# 1) Override process-scoped polluting vars (does NOT alter system settings)
$env:ELECTRON_RUN_AS_NODE = $null
$env:ELECTRON_ENABLE_LOGGING = $null

$root = $args[0]
if (-not $root) { $root = $PSScriptRoot }
$root = (Resolve-Path -LiteralPath $root).Path

# Locate the real electron executable. Resolution order:
#   a) require('electron')  ->  returns the dist/*.exe path string
#   b) node_modules/electron/dist/electron.exe (standard layout)
#   c) scan node_modules/.pnpm for any electron@*/node_modules/electron/dist/electron.exe
function Resolve-ElectronExe {
    param([string]$Root)

    # (a) ask Node (if available on PATH)
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        try {
            $script = "console.log(require(process.argv[1] + '/node_modules/electron'))"
            $out = & $node.Source -e $script $Root 2>$null
            if ($LASTEXITCODE -eq 0) {
                $p = ($out | Select-Object -First 1)
                if ($p -and (Test-Path -LiteralPath $p)) { return $p }
            }
        } catch { }
    }

    # (b) standard npm/pnpm-hoisted layout
    $std = Join-Path $Root 'node_modules\electron\dist\electron.exe'
    if (Test-Path -LiteralPath $std) { return $std }

    # (c) pnpm store layout (version-agnostic scan)
    $pnpmRoot = Join-Path $Root 'node_modules\.pnpm'
    if (Test-Path -LiteralPath $pnpmRoot) {
        $candidates = Get-ChildItem -LiteralPath $pnpmRoot -Directory -Filter 'electron@*' -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName 'node_modules\electron\dist\electron.exe' } |
            Where-Object { Test-Path -LiteralPath $_ }
        $preferred = $candidates | Where-Object { $_ -notmatch '_supports-color' } | Select-Object -First 1
        if ($preferred) { return $preferred }
        if ($candidates) { return ($candidates | Select-Object -First 1) }
    }

    return $null
}

$electronExe = Resolve-ElectronExe -Root $root

if (-not $electronExe -or -not (Test-Path -LiteralPath $electronExe)) {
    Write-Host ('ERROR: could not locate electron.exe under ' + $root) -ForegroundColor Red
    Write-Host '       Run "pnpm install" (or "npm install") in the project folder first.' -ForegroundColor Yellow
    Read-Host 'Press Enter to exit'
    exit 1
}

Write-Host ('Starting Dayfold using: ' + $electronExe) -ForegroundColor Cyan

# 3) Launch the binary directly (detached; app stays resident in tray)
#    Capture startup stderr/stdout so a crash-on-launch is diagnosable.
$errLog = Join-Path $root 'startup-err.log'
$outLog = Join-Path $root 'startup-out.log'
Remove-Item $errLog, $outLog -ErrorAction SilentlyContinue
$p = Start-Process -FilePath $electronExe -ArgumentList ('"' + $root + '"') `
    -RedirectStandardError $errLog -RedirectStandardOutput $outLog -PassThru

# Wait briefly; if the process exits immediately, surface the log.
Start-Sleep -Milliseconds 800
if ($p.HasExited) {
    Write-Host ('Dayfold exited immediately (exit code ' + $p.ExitCode + ').') -ForegroundColor Red
    if (Test-Path -LiteralPath $errLog) {
        Write-Host '--- error log ---' -ForegroundColor Yellow
        Get-Content -LiteralPath $errLog -Tail 20 | ForEach-Object { Write-Host $_ }
    }
    Read-Host 'Press Enter to exit'
    exit 1
}

Write-Host 'Dayfold is now running in the system tray.' -ForegroundColor Green
Write-Host 'If no tray icon appears, check startup-err.log next to package.json.' -ForegroundColor DarkGray
Read-Host 'Press Enter to close this window (Dayfold stays resident).'