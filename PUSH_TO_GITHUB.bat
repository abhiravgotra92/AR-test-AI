@echo off
title Push to GitHub
color 0A
echo.
echo  ============================================
echo   Pushing Landscaping App to GitHub...
echo  ============================================
echo.

cd /d "y:\AR test AI"

git add Landscaping-App/
git commit -m "Add GreenEdge Landscaping App with NFC truck tracking"
git push

if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Push failed. See message above.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   Done! Code pushed to GitHub successfully.
echo  ============================================
pause
