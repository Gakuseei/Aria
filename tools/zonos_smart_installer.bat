@echo off
setlocal enabledelayedexpansion
title Aria - Zonos Voice (One-Click Install & Launch)

:: ===================================================
::   Aria Zonos Voice - Smart Installer & Launcher
::   Auto-installs if needed, then starts server
:: ===================================================

cd /d "%~dp0"
echo ===================================================
echo   Aria Zonos Voice
echo   One-Click Install ^& Launch
echo ===================================================
echo Working directory: %cd%
echo.

:: Check if already running
echo [*] Checking if Zonos is already running on port 7860...
netstat -ano 2>nul | findstr :7860 | findstr LISTENING >nul
if !errorlevel! equ 0 (
    echo.
    echo ===================================================
    echo   [OK] Zonos is already running on port 7860!
    echo ===================================================
    echo.
    echo You can now use voice generation in the Aria app.
    echo.
    echo Press any key to close this window...
    pause >nul
    exit /b 0
)

:: Check if installed
if exist "Zonos\venv\Scripts\python.exe" (
    echo [*] Zonos found. Starting server...
    goto :START_SERVER
)

:: ===================================================
::   INSTALLATION SECTION
:: ===================================================
echo.
echo ===================================================
echo   Zonos not installed yet.
echo   Starting installation (10-20 minutes)...
echo ===================================================
echo.

:: Step 1: Check Python
echo [Step 1/6] Checking Python installation...
python --version >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Python not found!
    echo.
    echo Please install Python 3.10+ from: https://python.org
    echo IMPORTANT: Check "Add Python to PATH" during installation!
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)
echo [OK] Python found.
echo.

:: Step 2: Check Git
echo [Step 2/6] Checking Git installation...
git --version >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Git not found!
    echo.
    echo Please install Git from: https://git-scm.com/download/win
    echo Or run: winget install Git.Git
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)
echo [OK] Git found.
echo.

:: Step 3: Check/Install espeak-ng
echo [Step 3/6] Checking espeak-ng...
espeak-ng --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [INFO] espeak-ng not found. Attempting auto-install...
    echo.
    winget install --id espeak.espeak -e --accept-package-agreements --accept-source-agreements --silent 2>nul
    
    :: Check again
    timeout /t 2 >nul
    espeak-ng --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo.
        echo [WARNING] Automatic install failed.
        echo.
        echo Please install espeak-ng manually:
        echo 1. Download from: https://github.com/espeak-ng/espeak-ng/releases
        echo 2. Install it
        echo 3. RESTART your computer
        echo 4. Run this installer again
        echo.
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
)
echo [OK] espeak-ng found.
echo.

:: Find espeak-ng path and set environment variable
echo [*] Configuring espeak-ng environment...
for /f "delims=" %%i in ('where espeak-ng 2^>nul') do (
    set "ESPEAK_PATH=%%~dpi"
    goto :found_espeak
)
:found_espeak
if defined ESPEAK_PATH (
    set "ESPEAK_DATA_PATH=!ESPEAK_PATH!..
share\espeak-ng-data"
    echo [OK] ESPEAK_DATA_PATH set to: !ESPEAK_DATA_PATH!
)
echo.

:: Step 4: Clone repository
echo [Step 4/6] Cloning Zonos Repository (~200MB)...
if not exist "Zonos" (
    git clone https://github.com/Zyphra/Zonos.git
    if !errorlevel! neq 0 (
        echo [ERROR] Git clone failed!
        echo.
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
    echo [OK] Repository cloned.
) else (
    echo [OK] Repository already exists.
)
echo.

:: Step 5: Create virtual environment
echo [Step 5/6] Creating Python Virtual Environment...
cd Zonos
if not exist "venv" (
    python -m venv venv
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to create virtual environment!
        echo.
        cd ..
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created.
) else (
    echo [OK] Virtual environment already exists.
)
echo.

:: Step 6: Install dependencies
echo [Step 6/6] Installing Dependencies (This takes 10-20 minutes)...
echo [6.1] Activating virtual environment...
call venv\Scripts\activate.bat
if !errorlevel! neq 0 (
    echo [ERROR] Failed to activate virtual environment!
    cd ..
    pause
    exit /b 1
)

echo [6.2] Upgrading pip...
pip install --upgrade pip wheel setuptools -q

echo [6.3] Installing PyTorch (CUDA 12.1)...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 -q
if !errorlevel! neq 0 (
    echo [WARNING] CUDA install failed, trying CPU version...
    pip install torch torchvision torchaudio -q
)

echo [6.4] Installing Zonos package...
pip install -e . -q

echo [6.5] Installing additional packages...
pip install flask flask-cors espeakng phonemizer -q

echo [OK] All dependencies installed!
cd ..
echo.

:: ===================================================
::   START SERVER SECTION
:: ===================================================
:START_SERVER
echo.
echo ===================================================
echo   Starting Zonos API Server
echo ===================================================
echo.
echo [INFO] First run will download models (~4GB)
echo [INFO] Please keep this window open!
echo [INFO] Server will be available at: http://127.0.0.1:7860
echo.
echo ===================================================
echo.

cd Zonos
call venv\Scripts\activate.bat

:: Setup espeak-ng environment for Python
for /f "delims=" %%i in ('where espeak-ng 2^>nul') do (
    set "ESPEAK_BINDIR=%%~dpi"
    set "ESPEAK_DATA_PATH=%%~dpi..\share\espeak-ng-data"
    goto :espeak_set
)
:espeak_set

:: Add espeak to PATH if found
if defined ESPEAK_BINDIR (
    set "PATH=!ESPEAK_BINDIR!;!PATH!"
    echo [INFO] espeak-ng path added to environment
)

:: Verify all packages are installed
pip show flask >nul 2>&1
if !errorlevel! neq 0 pip install flask flask-cors -q

pip show espeakng >nul 2>&1
if !errorlevel! neq 0 pip install espeakng -q

pip show phonemizer >nul 2>&1  
if !errorlevel! neq 0 pip install phonemizer -q

:: Create a wrapper script to ensure environment is set
echo [*] Launching server...
echo.

python ..\zonos_api_server.py

:: If we get here, the server stopped
echo.
echo ===================================================
echo   Server stopped.
echo ===================================================
echo.
echo Press any key to close this window...
pause >nul
exit /b 0
