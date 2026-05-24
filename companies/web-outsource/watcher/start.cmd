@echo off
REM start.cmd — 手动启动 Watcher v3（前台运行，可看日志）
echo Starting Watcher v3...
echo Press Ctrl+C to stop.
echo.
powershell.exe -ExecutionPolicy Bypass -File "H:\claude-assets\companies\web-outsource\watcher\watcher.ps1"
