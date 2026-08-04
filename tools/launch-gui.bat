@echo off
setlocal

rem 直接指向真实的 ps1 脚本（绝对路径，不依赖本 bat 所在位置）
set "POWERSHELL_SCRIPT=C:\Games\Nightmare without return\nwr_modkit\tools\launch-gui.ps1"

if not exist "%POWERSHELL_SCRIPT%" (
  echo [launch-gui] 找不到脚本：%POWERSHELL_SCRIPT%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%POWERSHELL_SCRIPT%"

if errorlevel 1 (
  echo.
  echo [launch-gui] 启动失败，退出码 %errorlevel%
  pause
)

endlocal