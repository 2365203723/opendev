@echo off
REM install.cmd — 注册 Watcher v3 为 Windows 计划任务（登录时自动启动）
REM 以管理员身份运行

set TASK_NAME=web-outsource-watcher
set SCRIPT_PATH=H:\claude-assets\companies\web-outsource\watcher\watcher.ps1

echo === Installing Watcher v3 as Scheduled Task ===
echo Task: %TASK_NAME%
echo Script: %SCRIPT_PATH%
echo.

schtasks /Create /TN "%TASK_NAME%" ^
    /TR "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%SCRIPT_PATH%\"" ^
    /SC ONLOGON ^
    /RL HIGHEST ^
    /F

if %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS: Task "%TASK_NAME%" registered.
    echo It will start automatically on next login.
    echo.
    echo To start now:  schtasks /Run /TN "%TASK_NAME%"
    echo To stop:       schtasks /End /TN "%TASK_NAME%"
    echo To remove:     schtasks /Delete /TN "%TASK_NAME%" /F
) else (
    echo.
    echo FAILED: Could not create task. Run as Administrator.
)

pause
