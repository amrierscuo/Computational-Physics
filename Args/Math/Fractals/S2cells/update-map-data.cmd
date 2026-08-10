@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
  node "tools\update-map-data.mjs" --inbox "data\inbox"
) else (
  node "tools\update-map-data.mjs" %*
)

set "MAP_UPDATE_EXIT=%ERRORLEVEL%"
echo.
if not "%MAP_UPDATE_EXIT%"=="0" (
  echo Aggiornamento non completato. I file pubblici non sono stati sostituiti senza backup.
) else (
  echo Operazione completata.
)
echo.
pause
exit /b %MAP_UPDATE_EXIT%
