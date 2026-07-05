@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ============================================================================
rem OpenPLC Editor - JWPLC Edition builder
rem Ubicacion recomendada:
rem   openplc-editor\build-jwplc-editor.bat
rem
rem Uso rapido:
rem   build-jwplc-editor.bat
rem
rem Opciones:
rem   build-jwplc-editor.bat --install
rem   build-jwplc-editor.bat --clean
rem   build-jwplc-editor.bat --install --clean
rem   build-jwplc-editor.bat --open-output
rem
rem Requisito:
rem   Node 22.x. Si fnm esta instalado, el script intenta activar Node 22.
rem ============================================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "RUN_INSTALL=0"
set "RUN_CLEAN=0"
set "OPEN_OUTPUT=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--install" set "RUN_INSTALL=1"
if /I "%~1"=="--clean" set "RUN_CLEAN=1"
if /I "%~1"=="--open-output" set "OPEN_OUTPUT=1"
shift
goto parse_args
:args_done

echo.
echo ============================================================
echo  OpenPLC Editor - JWPLC Edition builder
echo ============================================================
echo Root: "%ROOT%"
echo.

cd /d "%ROOT%" || exit /b 1

if not exist "%ROOT%\package.json" (
  echo [ERROR] No se encontro package.json.
  echo Coloca este .bat en la raiz del repo openplc-editor.
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [WARN] Node no esta disponible en PATH.
) else (
  echo [INFO] Node actual:
  node -v
)

rem Intentar activar Node 22 con fnm si esta disponible.
where fnm >nul 2>nul
if not errorlevel 1 (
  echo.
  echo [INFO] fnm detectado. Intentando activar Node 22...
  for /f "tokens=*" %%I in ('fnm env --use-on-cd --shell cmd 2^>nul') do call %%I
  fnm install 22
  if errorlevel 1 (
    echo [ERROR] fnm no pudo instalar Node 22.
    exit /b 1
  )
  fnm use 22
  if errorlevel 1 (
    echo [ERROR] fnm no pudo activar Node 22.
    exit /b 1
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta disponible. Instala Node 22 o fnm.
  exit /b 1
)

for /f "tokens=1 delims=." %%M in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%M"

echo.
echo [INFO] Node final:
node -v
echo [INFO] npm:
call npm.cmd -v

if not "%NODE_MAJOR%"=="22" (
  echo.
  echo [ERROR] Este repo debe compilarse con Node 22.x.
  echo Node actual major: %NODE_MAJOR%
  echo.
  echo Sugerencia:
  echo   winget install Schniz.fnm
  echo   fnm install 22
  echo   fnm use 22
  exit /b 1
)

if "%RUN_CLEAN%"=="1" (
  echo.
  echo [1/4] Limpiando salidas previas...
  if exist "%ROOT%\dist" rmdir /s /q "%ROOT%\dist"
  if exist "%ROOT%\release\build" rmdir /s /q "%ROOT%\release\build"
) else (
  echo.
  echo [1/4] Limpieza omitida. Usa --clean si quieres borrar dist y release\build.
)

if "%RUN_INSTALL%"=="1" (
  echo.
  echo [2/4] Instalando dependencias...
  if exist "%ROOT%\package-lock.json" (
    call npm.cmd ci
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 (
    echo [ERROR] Fallo la instalacion de dependencias.
    exit /b 1
  )
) else (
  echo.
  echo [2/4] Instalacion omitida. Usa --install si cambiaste dependencias o node_modules no existe.
)

echo.
echo [3/4] Construyendo instalador...
call npm.cmd run package
if errorlevel 1 (
  echo [ERROR] Fallo npm run package.
  exit /b 1
)

echo.
echo [4/4] Buscando instalador generado...
set "BUILD_DIR=%ROOT%\release\build"

if not exist "%BUILD_DIR%" (
  echo [ERROR] No existe release\build.
  exit /b 1
)

dir /b "%BUILD_DIR%\*.exe" 2>nul
if errorlevel 1 (
  echo [WARN] No se encontro ningun .exe en "%BUILD_DIR%".
) else (
  echo.
  echo [OK] Instalador(es) generado(s) en:
  echo "%BUILD_DIR%"
)

if "%OPEN_OUTPUT%"=="1" (
  start "" "%BUILD_DIR%"
)

echo.
echo ============================================================
echo  Build finalizado
echo ============================================================
echo.

endlocal
exit /b 0
