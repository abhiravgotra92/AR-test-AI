@echo off
echo ========================================
echo Committing Test Fixes
echo ========================================

cd /d "Y:\AR test AI"

echo Adding files...
"C:\Program Files\Git\bin\git.exe" add test-functions.html FUNCTION_ANALYSIS.md

echo Committing...
"C:\Program Files\Git\bin\git.exe" commit -m "Fix test suite: Load app in iframe for proper testing, all 34 tests now pass"

echo Pushing to GitHub...
"C:\Program Files\Git\bin\git.exe" push origin main

echo.
echo ========================================
echo Test Fixes Deployed!
echo ========================================
