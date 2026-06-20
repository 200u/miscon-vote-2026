@echo off
cd /d "%~dp0"
echo Starting static setup server only.
echo Votes are stored inside each iPad, not on this PC.
echo.
node setup-server.js
echo.
pause
