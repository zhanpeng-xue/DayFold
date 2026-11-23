@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo   Dayfold Launcher (dev mode first)
echo ================================================
echo.

rem Clear polluting env vars early
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_ENABLE_LOGGING="

rem --- dev mode (runs latest src code) ---
if exist "node_modules\electron\dist\electron.exe" (
    echo [OK] Dev environment ready. Starting latest code...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
    exit /b 0
)

rem --- no dev env: try packaged build ---
set "EXE=%~dp0release\win-unpacked\Dayfold.exe"
if exist "%EXE%" (
    echo [OK] No dev env, launching packaged build instead...
    start "" "%EXE%"
    echo.
    echo Dayfold launched from packaged build.
    timeout /t 3 >nul
    exit /b 0
)

rem --- nothing available: install deps ---
echo [INFO] No runnable copy found, installing dependencies...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install it from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo [INFO] Starting latest code...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

exit /b 0