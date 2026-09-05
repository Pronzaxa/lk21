@echo off
setlocal
title nuRESQ Portable
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0nuresq-server.ps1"
if errorlevel 1 (
  echo.
  echo Launcher lokal tidak dapat dijalankan. Membuka versi satu-file...
  start "" "%~dp0nuRESQ.html"
  pause
)
endlocal
