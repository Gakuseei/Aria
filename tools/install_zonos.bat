@echo off
title Aria - Zonos Installer
echo ===================================================
echo   Aria Premium Voice Installer (Zonos)
echo ===================================================
echo.

echo [1/5] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found! Please install Python 3.10+ from python.org.
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b
)
echo [OK] Python found.
echo.

echo [2/5] Checking espeak-ng...
espeak-ng --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] espeak-ng not found! Installing via winget...
    winget install --id espeak.espeak -e --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install espeak-ng automatically.
        echo Please install espeak-ng manually from: https://github.com/espeak-ng/espeak-ng/releases
        pause
    ) else (
        echo [OK] espeak-ng installed.
        echo [IMPORTANT] Please RESTART your computer after installation!
        echo [IMPORTANT] Then run this installer again.
        pause
        exit /b
    )
) else (
    echo [OK] espeak-ng found.
)
echo.

echo [3/5] Cloning Zonos Repository...
if not exist "Zonos" (
    git clone https://github.com/Zyphra/Zonos.git
    if %errorlevel% neq 0 (
        echo [ERROR] Git clone failed. Is Git installed?
        pause
        exit /b
    )
) else (
    echo [INFO] Zonos folder already exists. Skipping clone.
)
echo.

echo [4/5] Creating Virtual Environment...
cd Zonos
if not exist "venv" (
    python -m venv venv
    echo [OK] venv created.
) else (
    echo [INFO] venv already exists.
)
echo.

echo [5/5] Installing Dependencies (This may take a while)...
call venv\Scripts\activate
echo [5.1/5] Upgrading pip and installing build tools...
pip install --upgrade pip wheel setuptools
echo [5.2/5] Installing Torch (CUDA 12.1)...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
echo [5.3/5] Installing Zonos package (editable mode)...
pip install -e .
echo [5.4/5] Installing espeak-ng Python package...
pip install espeakng
echo [5.5/5] Installing Flask for API server...
pip install flask flask-cors
echo.

echo ===================================================
echo   Installation Complete!
echo   You can now use 'start_zonos.bat' to run the voice engine.
echo ===================================================
pause
