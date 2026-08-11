@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
  echo Trascina il file live-google-contributions.json sopra questo comando.
  echo Nessun file pubblico e stato modificato.
  echo.
  pause
  exit /b 1
)

node "tools\sync-google-contributions.mjs" --export "%~1"

set "GOOGLE_MEDIA_EXIT=%ERRORLEVEL%"
echo.
if not "%GOOGLE_MEDIA_EXIT%"=="0" (
  echo Sincronizzazione Google Maps media non completata.
) else (
  echo Dataset Google Maps media aggiornato. Controlla map.html prima del commit.
)
echo.
pause
exit /b %GOOGLE_MEDIA_EXIT%
