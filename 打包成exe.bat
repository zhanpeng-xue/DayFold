@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo   Dayfold - Package to .exe
echo ================================================
echo.

rem Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

rem Install deps if missing
if not exist "node_modules\electron-builder" (
    echo [INFO] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

rem Clear polluting vars
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_ENABLE_LOGGING="

echo [INFO] Building NSIS installer + portable exe...
echo        This may take a few minutes.

call node_modules\.bin\electron-builder.cmd --win

if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. See messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Done! Check the "release" folder:
echo     - Dayfold Setup 0.1.0.exe   (installer)
echo     - Dayfold 0.1.0.exe         (portable)
echo ================================================
echo.
pause
endlocal
exit /b 0