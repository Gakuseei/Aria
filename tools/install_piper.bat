@echo off
title Aria - Piper TTS Installer
echo ===================================================
echo   Aria Standard Voice Installer (Piper)
echo ===================================================
echo.

if exist "piper" (
    echo [INFO] Piper folder already exists. Skipping download.
    pause
    exit /b
)

echo [1/2] Downloading Piper TTS (Windows x64)...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip' -OutFile 'piper.zip'"
if %errorlevel% neq 0 (
    echo [ERROR] Download failed. Check your internet connection.
    pause
    exit /b
)
echo [OK] Download complete.
echo.

echo [2/2] Extracting Files...
powershell -Command "Expand-Archive -Path 'piper.zip' -DestinationPath '.'"
if %errorlevel% neq 0 (
    echo [ERROR] Extraction failed.
    pause
    exit /b
)
del piper.zip
echo [OK] Extracted to 'piper' folder.
echo.

echo ===================================================
echo   Installation Complete!
echo   Location: %~dp0piper\piper.exe
echo   Please select this file in Aria's Voice Setup.
echo ===================================================
pause
