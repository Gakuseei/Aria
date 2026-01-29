@echo off
setlocal enabledelayedexpansion
title Aria - Zonos Voice (Launch)

cd /d "%~dp0"

:: Check if installed
if not exist "Zonos\venv\Scripts\python.exe" (
    echo ===================================================
    echo   [ERROR] Zonos is not installed!
    echo ===================================================
    echo.
    echo Please run: zonos_smart_installer.bat
    echo.
    pause
    exit /b 1
)

:: Check if already running
netstat -ano 2>nul | findstr :7860 | findstr LISTENING >nul
if !errorlevel! equ 0 (
    echo ===================================================
    echo   [OK] Zonos is already running on port 7860!
    echo ===================================================
    echo.
    echo You can now use voice generation in the Aria app.
    echo.
    pause
    exit /b 0
)

echo ===================================================
echo   Starting Zonos API Server
echo ===================================================
echo.
echo [INFO] Loading models (~4GB on first run)...
echo [INFO] URL: http://127.0.0.1:7860
echo.

cd Zonos
call venv\Scripts\activate.bat

:: Setup espeak-ng environment for Python
for /f "delims=" %%i in ('where espeak-ng 2^>nul') do (
    set "ESPEAK_BINDIR=%%~dpi"
    set "ESPEAK_DATA_PATH=%%~dpi..\share\espeak-ng-data"
    set "PHONEMIZER_ESPEAK_PATH=%%i"
    set "PHONEMIZER_ESPEAK_DATA_PATH=%%~dpi..\share\espeak-ng-data"
    goto :espeak_set
)
:espeak_set

:: Add espeak to PATH if found
if defined ESPEAK_BINDIR (
    set "PATH=!ESPEAK_BINDIR!;!PATH!"
    echo [INFO] espeak-ng path configured: !ESPEAK_BINDIR!
)

:: Verify packages
pip show flask >nul 2>&1
if !errorlevel! neq 0 pip install flask flask-cors -q

pip show espeakng >nul 2>&1
if !errorlevel! neq 0 pip install espeakng -q

pip show phonemizer >nul 2>&1
if !errorlevel! neq 0 pip install phonemizer -q

echo.
python ..\zonos_api_server.py

echo.
echo ===================================================
echo   Server stopped.
echo ===================================================
pause
