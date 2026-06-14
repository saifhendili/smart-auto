@echo off
setlocal enabledelayedexpansion
title Smart Auto - Installation
echo ============================================
echo        Smart Auto - Installation Windows
echo ============================================
echo.

REM --- 1) Verifier / installer Node.js ---
where node >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Node.js detecte :
  node -v
) else (
  echo [..] Node.js introuvable. Installation via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo [ERREUR] Installation automatique impossible.
    echo Telechargez Node.js LTS ici : https://nodejs.org/  puis relancez install.bat
    pause
    exit /b 1
  )
  echo.
  echo [IMPORTANT] Fermez cette fenetre, rouvrez-en une nouvelle, puis relancez install.bat
  pause
  exit /b 0
)

REM --- 2) Backend ---
echo.
echo [1/3] Installation des dependances backend...
cd /d "%~dp0server"
call npm install
if errorlevel 1 ( echo [ERREUR] Backend & pause & exit /b 1 )

REM --- 3) Fichier .env ---
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo [INFO] Fichier server\.env cree. Renseignez MONGO_URI et GEMINI_API_KEY avant de lancer.
)

REM --- 4) Frontend + build PWA ---
echo.
echo [2/3] Installation des dependances frontend...
cd /d "%~dp0client"
call npm install
if errorlevel 1 ( echo [ERREUR] Frontend & pause & exit /b 1 )

echo.
echo [3/3] Compilation de l'application (PWA installable)...
call npm run build
if errorlevel 1 ( echo [ERREUR] Build & pause & exit /b 1 )

echo.
echo ============================================
echo   Installation terminee avec succes !
echo   Lancez l'application avec : start.bat
echo ============================================
pause
