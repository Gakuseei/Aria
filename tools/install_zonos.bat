@echo off
title Aria - Zonos Installer
echo ===================================================
echo   Aria Premium Voice Installer (Zonos)
echo ===================================================
echo.

echo [1/4] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found! Please install Python 3.10+ from python.org.
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b
)
echo [OK] Python found.
echo.

echo [2/4] Cloning Zonos Repository...
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

echo [3/4] Creating Virtual Environment...
cd Zonos
if not exist "venv" (
    python -m venv venv
    echo [OK] venv created.
) else (
    echo [INFO] venv already exists.
)
echo.

echo [4/4] Installing Dependencies (This may take a while)...
call venv\Scripts\activate
echo [4.1/4] Upgrading pip and installing build tools...
pip install --upgrade pip wheel setuptools
echo [4.2/4] Installing Torch (CUDA 12.1)...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
echo [4.3/4] Installing Zonos package (editable mode)...
pip install -e .
echo [4.4/4] Installing Gradio for the web interface...
pip install gradio
echo.

echo ===================================================
echo   Installation Complete!
echo   You can now use 'start_zonos.bat' to run the voice engine.
echo ===================================================
pause
