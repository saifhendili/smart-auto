@echo off
setlocal
title Smart Auto
echo ============================================
echo            Smart Auto - Demarrage
echo ============================================
echo.

REM Compile le client s'il ne l'est pas encore
if not exist "%~dp0client\dist\index.html" (
  echo [..] Premier lancement : compilation de l'application...
  cd /d "%~dp0client"
  call npm run build
  if errorlevel 1 ( echo [ERREUR] Build & pause & exit /b 1 )
)

cd /d "%~dp0server"

REM Ouvre le navigateur apres 4s (le temps que le serveur demarre)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:5000"

echo.
echo Application disponible sur :  http://localhost:5000
echo (Depuis le navigateur, cliquez sur "Installer" pour l'ajouter en application.)
echo Appuyez sur Ctrl+C pour arreter le serveur.
echo.
call npm start
