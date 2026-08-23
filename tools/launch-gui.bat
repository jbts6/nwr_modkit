@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_SCRIPT=%SCRIPT_DIR%launch-gui.ps1"

if not exist "%POWERSHELL_SCRIPT%" (
  echo [launch-gui] ERROR: script not found
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%POWERSHELL_SCRIPT%"

if errorlevel 1 (
  echo.
  echo [launch-gui] FAILED with exit code %errorlevel%
  pause
)

endlocal