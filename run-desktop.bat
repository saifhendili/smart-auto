@echo off
setlocal
title Smart Auto - App desktop (test rapide)
echo ============================================
echo   Smart Auto - Lancement de l'app desktop
echo ============================================
echo.
cd /d "%~dp0"

REM Dependances Electron si absentes
if not exist "node_modules\electron" (
  echo [..] Installation des dependances Electron...
  call npm install
)

echo [..] Compilation de l'UI et ouverture de la fenetre...
call npm run electron:dev
