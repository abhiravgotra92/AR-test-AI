@echo off
set PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%PATH%
cd /d "%~dp0"

git add .
git commit -m "Add chat history, auto-refresh, clear history button"
git push

echo.
echo Done! Changes live at:
echo https://abhiravgotra92.github.io/livechat/
echo.
pause
