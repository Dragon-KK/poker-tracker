@echo off
setlocal
cd /d "%~dp0"
set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
  python -m pip install -q -r requirements.txt 2>nul
  python server.py --port %PORT%
  goto :eof
)

where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
  py -m pip install -q -r requirements.txt 2>nul
  py server.py --port %PORT%
  goto :eof
)

echo Python 3 is required. Install from https://www.python.org/downloads/
exit /b 1
