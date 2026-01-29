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
echo [INFO] Checking for Flask...
pip show flask >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing Flask...
    pip install flask flask-cors
)

echo.
echo [INFO] Starting Zonos API Server...
echo [INFO] Please wait. The first run might download models (approx 4GB).
echo.
python ..\zonos_api_server.py
pause
