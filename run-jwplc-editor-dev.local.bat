@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ======================================
echo OpenPLC Editor - JWPLC Edition DEV
echo ======================================
echo.

REM ============================================================
REM NODE / NPM
REM ============================================================

where node
node -v

where npm.cmd
call npm.cmd -v

echo.
echo ======================================
echo Limpieza segura del puerto DEV 1313
echo ======================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$repo=[IO.Path]::GetFullPath((Get-Location).Path);" ^
  "$maxAttempts=5;" ^
  "for($i=1; $i -le $maxAttempts; $i++) {" ^
  "  $listeners=@(Get-NetTCPConnection -LocalPort 1313 -State Listen -ErrorAction SilentlyContinue);" ^
  "  if($listeners.Count -eq 0) { Write-Host 'PORT_1313=FREE' -ForegroundColor Green; exit 0 };" ^
  "  foreach($listener in $listeners) {" ^
  "    $pid1313=$listener.OwningProcess;" ^
  "    $p=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $pid1313) -ErrorAction SilentlyContinue;" ^
  "    if(-not $p) { continue };" ^
  "    $cmd=[string]$p.CommandLine;" ^
  "    $isNode=($p.Name -ieq 'node.exe');" ^
  "    $isOpenPLC=($cmd -like ('*' + $repo + '*'));" ^
  "    $isRenderer=($cmd -like '*webpack.config.renderer.dev.ts*') -and ($cmd -like '*webpack*serve*');" ^
  "    if(-not ($isNode -and $isOpenPLC -and $isRenderer)) {" ^
  "      Write-Host ('PORT_1313=BUSY_UNRELATED PID=' + $pid1313) -ForegroundColor Red;" ^
  "      Write-Host ('PROCESS=' + $p.Name);" ^
  "      Write-Host ('COMMAND=' + $cmd);" ^
  "      exit 2;" ^
  "    };" ^
  "    Write-Host ('STALE_OPENPLC_RENDERER_PID=' + $pid1313) -ForegroundColor Yellow;" ^
  "    Write-Host 'Cerrando renderer DEV anterior...';" ^
  "    taskkill.exe /PID $pid1313 /T /F | Out-Null;" ^
  "  };" ^
  "  Start-Sleep -Milliseconds 750;" ^
  "};" ^
  "if(Get-NetTCPConnection -LocalPort 1313 -State Listen -ErrorAction SilentlyContinue) {" ^
  "  Write-Host 'PORT_1313_CLEANUP=FAIL' -ForegroundColor Red;" ^
  "  exit 3" ^
  "};" ^
  "Write-Host 'PORT_1313_CLEANUP=PASS' -ForegroundColor Green; exit 0"

if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo liberar el puerto 1313 de forma segura.
    echo No se iniciara OpenPLC Editor.
    pause
    exit /b 1
)

echo.
echo ======================================
echo Iniciando editor en modo desarrollo...
echo ======================================
echo.

call npm.cmd run dev

set EXITCODE=%ERRORLEVEL%

echo.
echo ======================================
echo OpenPLC DEV finalizado
echo Exit code: %EXITCODE%
echo ======================================

exit /b %EXITCODE%