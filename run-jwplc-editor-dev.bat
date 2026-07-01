@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ============================================================================
rem OpenPLC Editor - JWPLC Edition DEV runner - LOCAL
rem Ubicacion:
rem   openplc-editor\run-jwplc-editor-dev.bat
rem
rem Uso normal:
rem   run-jwplc-editor-dev.bat
rem
rem Este .bat NO genera instalador.
rem Ejecuta el editor en modo desarrollo con:
rem   npm run dev
rem
rem Opciones:
rem   run-jwplc-editor-dev.bat --install
rem   run-jwplc-editor-dev.bat --lint
rem
rem Notas:
rem   - Para cerrar el proceso dev, usa CTRL+C en esta ventana.
rem   - Al terminar o fallar, espera ESC antes de cerrar.
rem ============================================================================

set "EXIT_CODE=0"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "RUN_INSTALL=0"
set "RUN_LINT=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--install" set "RUN_INSTALL=1"
if /I "%~1"=="--lint" set "RUN_LINT=1"
shift
goto parse_args
:args_done

echo.
echo ============================================================
echo  OpenPLC Editor - JWPLC Edition DEV runner
echo ============================================================
echo Root:       "%ROOT%"
echo Install:    "%RUN_INSTALL%"
echo Lint:       "%RUN_LINT%"
echo.

cd /d "%ROOT%"
if errorlevel 1 (
  echo [ERROR] No se pudo entrar a la carpeta del repo.
  set "EXIT_CODE=1"
  goto finish
)

if not exist "%ROOT%\package.json" (
  echo [ERROR] No se encontro package.json.
  echo Coloca este .bat en la raiz del repo openplc-editor.
  set "EXIT_CODE=1"
  goto finish
)

where node >nul 2>nul
if errorlevel 1 (
  echo [WARN] Node no esta disponible en PATH.
) else (
  echo [INFO] Node inicial:
  node -v
)

where fnm >nul 2>nul
if not errorlevel 1 (
  echo.
  echo [INFO] fnm detectado. Intentando activar Node 22...
  for /f "tokens=*" %%I in ('fnm env --use-on-cd --shell cmd 2^>nul') do call %%I

  fnm install 22
  if errorlevel 1 (
    echo [ERROR] fnm no pudo instalar Node 22.
    set "EXIT_CODE=1"
    goto finish
  )

  fnm use 22
  if errorlevel 1 (
    echo [ERROR] fnm no pudo activar Node 22.
    set "EXIT_CODE=1"
    goto finish
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta disponible. Instala Node 22 o fnm.
  set "EXIT_CODE=1"
  goto finish
)

for /f "tokens=1 delims=." %%M in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%M"

echo.
echo [INFO] Node final:
node -v
echo [INFO] npm:
call npm.cmd -v

if not "%NODE_MAJOR%"=="22" (
  echo.
  echo [ERROR] Este repo debe ejecutarse con Node 22.x.
  echo Node actual major: %NODE_MAJOR%
  echo.
  echo Sugerencia:
  echo   winget install Schniz.fnm
  echo   fnm install 22
  echo   fnm use 22
  set "EXIT_CODE=1"
  goto finish
)

if "%RUN_INSTALL%"=="1" (
  echo.
  echo [1/4] Instalando dependencias...
  if exist "%ROOT%\package-lock.json" (
    call npm.cmd ci
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 (
    echo [ERROR] Fallo la instalacion de dependencias.
    set "EXIT_CODE=1"
    goto finish
  )
) else (
  echo.
  echo [1/4] Instalacion omitida. Usa --install si cambiaste dependencias o node_modules no existe.
)

if not exist "%ROOT%\node_modules" (
  echo.
  echo [ERROR] No existe node_modules.
  echo Ejecuta:
  echo   run-jwplc-editor-dev.bat --install
  set "EXIT_CODE=1"
  goto finish
)

if "%RUN_LINT%"=="1" (
  echo.
  echo [2/4] Ejecutando lint...
  call npm.cmd run lint
  if errorlevel 1 (
    echo [ERROR] Fallo lint.
    set "EXIT_CODE=1"
    goto finish
  )
) else (
  echo.
  echo [2/4] Lint omitido.
)

echo.
echo [3/4] Ejecutando OpenPLC Editor en modo desarrollo...
echo.
echo IMPORTANTE:
echo   - Este modo NO genera instalador.
echo   - Para detenerlo, presiona CTRL+C en esta ventana.
echo   - Si editas frontend, webpack suele refrescar.
echo   - Si editas proceso main/backend, electronmon deberia reiniciar.
echo.

call npm.cmd run dev
if errorlevel 1 (
  echo.
  echo [ERROR] npm run dev termino con error.
  set "EXIT_CODE=1"
  goto finish
)

echo.
echo [4/4] Proceso dev finalizado.
goto finish

:finish
echo.
echo ============================================================
if "%EXIT_CODE%"=="0" (
  echo  DEV runner finalizado correctamente
) else (
  echo  DEV runner finalizado con errores
)
echo ============================================================
echo.
echo Presiona ESC para cerrar esta ventana...

call :waitEsc

endlocal & exit /b %EXIT_CODE%

:waitEsc
powershell -NoProfile -ExecutionPolicy Bypass -Command "$Host.UI.RawUI.FlushInputBuffer(); do { $key = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } until ($key.VirtualKeyCode -eq 27)"
if errorlevel 1 (
  echo.
  echo No se pudo capturar ESC con PowerShell. Presiona cualquier tecla para cerrar...
  pause >nul
)
exit /b 0
