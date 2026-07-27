@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20 or later is required. & exit /b 1)
where npm >nul 2>nul || (echo npm is required. & exit /b 1)
if not exist node_modules (
  echo Installing MyDash dependencies...
  call npm install --no-audit --no-fund || exit /b 1
)
echo Starting MyDash...
call npm start
