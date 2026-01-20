@echo off
title Aria - Zonos Voice Engine
echo ===================================================
echo   Starting Zonos Voice Engine...
echo ===================================================
echo.

if not exist "Zonos" (
    echo [ERROR] Zonos folder not found! Please run 'install_zonos.bat' first.
    pause
    exit /b
)

cd Zonos
if not exist "venv" (
    echo [ERROR] Virtual environment not found! Please run 'install_zonos.bat' first.
    pause
    exit /b
)

call venv\Scripts\activate
echo [INFO] Running Server...
echo [INFO] Please wait. The first run might download models (approx 4GB).
echo.
python gradio_interface.py
pause
