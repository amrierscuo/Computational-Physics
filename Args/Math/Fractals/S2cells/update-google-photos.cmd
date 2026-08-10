@echo off
setlocal
cd /d "%~dp0"

node "tools\build-google-photos.mjs" --inbox "data\google-photo-inbox"

set "GOOGLE_PHOTO_EXIT=%ERRORLEVEL%"
echo.
if not "%GOOGLE_PHOTO_EXIT%"=="0" (
  echo Aggiornamento foto Google non completato.
) else (
  echo Dataset foto Google aggiornato. Controlla map.html prima del commit.
)
echo.
pause
exit /b %GOOGLE_PHOTO_EXIT%
