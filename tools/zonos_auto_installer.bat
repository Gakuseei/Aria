@echo off
setlocal enabledelayedexpansion
title Aria - Zonos Auto Installer

:: ===================================================
::   Zonos TRUE One-Click Auto Installer
::   Runs silently, reports progress via status file
:: ===================================================

cd /d "%~dp0"
set "STATUS_FILE=%cd%\zonos_install_status.txt"
set "LOG_FILE=%cd%\zonos_install_log.txt"

:: Reset status file
echo STARTING>"%STATUS_FILE%"
echo [%date% %time%] Installation started >"%LOG_FILE%"

:: Helper function to update status
goto :MAIN

:UPDATE_STATUS
echo %~1>"%STATUS_FILE%"
echo [%date% %time%] %~1 >>"%LOG_FILE%"
exit /b 0

:MAIN
:: Check if already running
netstat -ano 2>nul | findstr :7860 | findstr LISTENING >nul
if !errorlevel! equ 0 (
    call :UPDATE_STATUS "RUNNING"
    exit /b 0
)

:: Check if cancelled
if exist "%STATUS_FILE%" (
    for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
        if "%%a"=="CANCELLED" (
            echo [%date% %time%] Installation cancelled by user >>"%LOG_FILE%"
            exit /b 0
        )
    )
)

:: Check if already installed
if exist "Zonos\venv\Scripts\python.exe" (
    if exist "Zonos\zonos\model.py" (
        call :UPDATE_STATUS "STARTING_SERVER"
        goto :START_SERVER
    )
)

:: ===================================================
::   INSTALLATION START
:: ===================================================
call :UPDATE_STATUS "CHECKING_DEPS"

:: Step 1: Check Python
python --version >nul 2>&1
if !errorlevel! neq 0 (
    call :UPDATE_STATUS "ERROR_PYTHON_NOT_FOUND"
    exit /b 1
)

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Step 2: Check Git
git --version >nul 2>&1
if !errorlevel! neq 0 (
    call :UPDATE_STATUS "ERROR_GIT_NOT_FOUND"
    exit /b 1
)

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Step 3: Check/Install espeak-ng
call :UPDATE_STATUS "CHECKING_ESPEAK"
espeak-ng --version >nul 2>&1
if !errorlevel! neq 0 (
    call :UPDATE_STATUS "INSTALLING_ESPEAK"
    
    :: Try winget install
    winget install --id espeak.espeak -e --accept-package-agreements --accept-source-agreements --silent 2>nul
    
    :: Check cancellation
    for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
        if "%%a"=="CANCELLED" exit /b 0
    )
    
    :: Wait and check again
    timeout /t 3 >nul
    espeak-ng --version >nul 2>&1
    if !errorlevel! neq 0 (
        call :UPDATE_STATUS "ERROR_ESPEAK_INSTALL_FAILED"
        exit /b 1
    )
)

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Find espeak-ng path for environment setup
for /f "delims=" %%i in ('where espeak-ng 2^>nul') do (
    set "ESPEAK_DIR=%%~dpi"
    set "ESPEAK_ROOT=%%~dpi.."
    goto :ESPEAK_FOUND
)
:ESPEAK_FOUND

:: Step 4: Clone repository
call :UPDATE_STATUS "CLONING_REPO"

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

if not exist "Zonos" (
    git clone --depth 1 https://github.com/Zyphra/Zonos.git >nul 2>&1
    if !errorlevel! neq 0 (
        call :UPDATE_STATUS "ERROR_CLONE_FAILED"
        exit /b 1
    )
)

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Step 5: Create virtual environment
call :UPDATE_STATUS "CREATING_VENV"
cd Zonos

if not exist "venv" (
    python -m venv venv >nul 2>&1
    if !errorlevel! neq 0 (
        call :UPDATE_STATUS "ERROR_VENV_FAILED"
        exit /b 1
    )
)

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Step 6: Install dependencies
call :UPDATE_STATUS "INSTALLING_DEPS"
call venv\Scripts\activate.bat >nul 2>&1

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Upgrade pip silently
pip install --upgrade pip wheel setuptools -q >nul 2>&1

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Install PyTorch (try CUDA first, fall back to CPU)
call :UPDATE_STATUS "INSTALLING_PYTORCH"
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 -q >nul 2>&1
if !errorlevel! neq 0 (
    pip install torch torchvision torchaudio -q >nul 2>&1
)

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Install Zonos package
call :UPDATE_STATUS "INSTALLING_ZONOS"
pip install -e . -q >nul 2>&1
if !errorlevel! neq 0 (
    call :UPDATE_STATUS "ERROR_ZONOS_INSTALL_FAILED"
    exit /b 1
)

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Install additional packages
call :UPDATE_STATUS "INSTALLING_PACKAGES"
pip install flask flask-cors espeakng phonemizer -q >nul 2>&1

cd ..

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: ===================================================
::   START SERVER
:: ===================================================
:START_SERVER
call :UPDATE_STATUS "STARTING_SERVER"

cd Zonos
call venv\Scripts\activate.bat >nul 2>&1

:: Check cancellation
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Setup espeak-ng environment for Python
if defined ESPEAK_DIR (
    set "PATH=!ESPEAK_DIR!;!PATH!"
    set "ESPEAK_DATA_PATH=!ESPEAK_ROOT!\share\espeak-ng-data"
    set "PHONEMIZER_ESPEAK_PATH=!ESPEAK_DIR!espeak-ng.exe"
    set "PHONEMIZER_ESPEAK_DATA_PATH=!ESPEAK_ROOT!\share\espeak-ng-data"
)

:: Verify all packages are installed
pip show flask >nul 2>&1
if !errorlevel! neq 0 pip install flask flask-cors -q >nul 2>&1

pip show espeakng >nul 2>&1
if !errorlevel! neq 0 pip install espeakng -q >nul 2>&1

pip show phonemizer >nul 2>&1
if !errorlevel! neq 0 pip install phonemizer -q >nul 2>&1

:: Check cancellation one last time before starting server
for /f "delims=" %%a in ('type "%STATUS_FILE%"') do (
    if "%%a"=="CANCELLED" exit /b 0
)

:: Start the API server
call :UPDATE_STATUS "LOADING_MODEL"
python ..\zonos_api_server.py >>"%LOG_FILE%" 2>&1

:: If we get here, the server stopped
call :UPDATE_STATUS "STOPPED"
exit /b 0
