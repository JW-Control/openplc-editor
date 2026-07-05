@echo off
setlocal
cd /d "%~dp0"

echo ======================================
echo OpenPLC Editor - JWPLC Edition DEV
echo ======================================
echo.

where node
node -v
where npm.cmd
call npm.cmd -v

echo.
echo Iniciando editor en modo desarrollo...
echo.

call npm.cmd run dev

pause
