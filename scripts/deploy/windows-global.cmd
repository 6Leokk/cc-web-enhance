@echo off
setlocal
cd /d "%~dp0\..\.."
node scripts/deploy.js --profile global --reset %*
