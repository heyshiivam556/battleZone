@echo off
title BattleZone 🎮 Launcher
color 0A

echo.
echo  ██████╗  █████╗ ████████╗████████╗██╗     ███████╗███████╗ ██████╗ ███╗   ██╗███████╗
echo  ██╔══██╗██╔══██╗╚══██╔══╝╚══██╔══╝██║     ██╔════╝╚══███╔╝██╔═══██╗████╗  ██║██╔════╝
echo  ██████╔╝███████║   ██║      ██║   ██║     █████╗    ███╔╝ ██║   ██║██╔██╗ ██║█████╗
echo  ██╔══██╗██╔══██║   ██║      ██║   ██║     ██╔══╝   ███╔╝  ██║   ██║██║╚██╗██║██╔══╝
echo  ██████╔╝██║  ██║   ██║      ██║   ███████╗███████╗███████╗╚██████╔╝██║ ╚████║███████╗
echo  ╚═════╝ ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝
echo.
echo  Cross-platform 2D Multiplayer Top-Down Shooter
echo  ================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Please install Node.js from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

echo  [1/2] Starting game server on http://localhost:3001 ...
start cmd /k "cd /d "%~dp0server" && npm install && node index.js"

REM Brief pause so the server has a moment to initialize
timeout /t 3 /nobreak >nul

echo  [2/2] Opening game client ...
echo.

REM Try to open with the default browser using the file path
start "" "%~dp0client\index.html"

echo  ============================================================
echo   BattleZone is launching!
echo.
echo   Server: http://localhost:3001
echo   Client: client/index.html (opened in default browser)
echo.
echo   For best PWA experience, serve the client instead:
echo     npx serve client -p 8080
echo   Then open: http://localhost:8080
echo.
echo   Share your 4-letter room code with friends to play together!
echo  ============================================================
echo.
echo  Press any key to close this launcher (server keeps running in its own window)
pause >nul
