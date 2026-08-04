@echo off
setlocal

rem 切换到本脚本所在目录，避免工作目录问题
cd /d "%~dp0"

rem 运行 PowerShell 启动脚本
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-gui.ps1"

if errorlevel 1 (
  echo.
  echo [launch-gui] 启动失败，退出码 %errorlevel%
  pause
)

endlocal