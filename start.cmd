@echo off
rem Start Desk Cat in the background (detached from this console).
rem Usage: start.cmd  (or double-click it)
cd /d "%~dp0"

if not exist node_modules\electron\dist\electron.exe (
  echo Installing dependencies...
  call npm install || exit /b 1
)

rem VS Code terminals set this, which makes Electron run as plain Node.
set ELECTRON_RUN_AS_NODE=
rem Electron attaches to the launching console by default, so closing that
rem terminal would kill it (and its helper). Stay fully detached instead.
set ELECTRON_NO_ATTACH_CONSOLE=1

start "" "node_modules\electron\dist\electron.exe" .
echo Desk Cat started. Right-click the cat or the cat girl -^> Quit Desk Cat to quit.
