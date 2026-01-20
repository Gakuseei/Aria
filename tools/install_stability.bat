@echo off
title Aria - Stability Matrix Installer
echo ===================================================
echo   Aria Image Installer (Stability Matrix)
echo ===================================================
echo.

if exist "StabilityMatrix" (
    echo [INFO] StabilityMatrix folder already exists.
    goto :LAUNCH
)

echo [1/3] Creating Folder...
mkdir StabilityMatrix
cd StabilityMatrix

echo [2/3] Downloading Stability Matrix...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/LykosAI/StabilityMatrix/releases/latest/download/StabilityMatrix-win-x64.zip' -OutFile 'StabilityMatrix.zip'"
if %errorlevel% neq 0 (
    echo [ERROR] Download failed. Check your internet connection.
    pause
    exit /b
)
echo [OK] Download complete.
echo.

echo [3/3] Extracting Files...
powershell -Command "Expand-Archive -Path 'StabilityMatrix.zip' -DestinationPath '.'"
if %errorlevel% neq 0 (
    echo [ERROR] Extraction failed.
    pause
    exit /b
)
del StabilityMatrix.zip
echo [OK] Extracted.

:LAUNCH
echo.
echo ===================================================
echo   Installation Complete!
echo   Launching Stability Matrix...
echo   Please install 'Stable Diffusion WebUI Forge' via the app.
echo ===================================================
start StabilityMatrix.exe
pause
