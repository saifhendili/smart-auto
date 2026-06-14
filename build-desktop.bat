@echo off
setlocal
title Smart Auto - Construction de l'application desktop (.exe)
echo ============================================
echo   Smart Auto - Construction du .exe (Electron)
echo ============================================
echo.

REM --- Verifier Node.js ---
where node >nul 2>nul
if not %errorlevel%==0 (
  echo [ERREUR] Node.js manquant. Lancez d'abord install.bat
  pause
  exit /b 1
)

REM --- Dependances Electron (racine) ---
echo [1/3] Installation des dependances Electron...
cd /d "%~dp0"
call npm install
if errorlevel 1 ( echo [ERREUR] npm install racine & pause & exit /b 1 )

REM --- Dependances serveur (embarquees dans le .exe) ---
echo [2/3] Verification des dependances serveur...
call npm --prefix server install
if errorlevel 1 ( echo [ERREUR] npm install serveur & pause & exit /b 1 )

REM --- Build client + packaging ---
echo [3/3] Compilation de l'UI et creation de l'installateur...
call npm run dist:win
if errorlevel 1 ( echo [ERREUR] electron-builder & pause & exit /b 1 )

echo.
echo ============================================
echo   Termine ! L'installateur se trouve dans :
echo   dist\Smart Auto Setup ^<version^>.exe
echo ============================================
start "" "%~dp0dist"
pause
