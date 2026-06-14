@echo off
setlocal
title Smart Auto - Developpement
echo ============================================
echo     Smart Auto - Mode developpement
echo ============================================
echo  Backend  : http://localhost:5000
echo  Frontend : http://localhost:5173  (avec rechargement a chaud)
echo ============================================
echo.
start "Smart Auto - API"    cmd /k "cd /d "%~dp0server" && npm run dev"
start "Smart Auto - Client" cmd /k "cd /d "%~dp0client" && npm run dev"
