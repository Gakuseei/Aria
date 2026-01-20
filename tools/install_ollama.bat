@echo off
title Aria - Ollama Installer
echo ===================================================
echo   Aria Core Installer (Ollama)
echo ===================================================
echo.

echo [1/2] Downloading Ollama Setup...
powershell -Command "Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile 'OllamaSetup.exe'"
if %errorlevel% neq 0 (
    echo [ERROR] Download failed. Check your internet connection.
    pause
    exit /b
)
echo [OK] Download complete.
echo.

echo [2/2] Launching Installer...
echo Please follow the prompts in the Ollama installer window.
start /wait OllamaSetup.exe
echo.

echo ===================================================
echo   Installation Complete!
echo   You can now restart Aria to detect Ollama.
echo ===================================================
del OllamaSetup.exe
pause
