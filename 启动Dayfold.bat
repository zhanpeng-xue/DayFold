@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo   Dayfold Launcher
echo ================================================
echo.

rem Check for the packaged exe first (self-contained, most reliable)
set "EXE=%~dp0release\win-unpacked\Dayfold.exe"

if exist "%EXE%" (
    echo [OK] Found packaged app. Launching...
    start "" "%EXE%"
    echo.
    echo Dayfold launched from packaged build.
    echo If no tray icon appears, open release\win-unpacked and double-click Dayfold.exe.
    timeout /t 3 >nul
    exit /b 0
)

echo [INFO] Packaged app not found, trying dev mode...

rem Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install it from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

rem Install dependencies if needed
if not exist "node_modules\electron\dist\electron.exe" (
    echo [INFO] Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        echo.
        pause
        exit /b 1
    )
)

rem Clear polluting env vars
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_ENABLE_LOGGING="

echo [INFO] Starting dev mode...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start.
    pause
)
endlocal
exit /b 0