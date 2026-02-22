@echo off
REM Quick Test Script for Windows
echo Running Quick Test Suite...
echo.

echo [1/4] Health Check...
call npm run test:health
if %errorlevel% neq 0 (
    echo Health check failed!
    pause
    exit /b 1
)

echo.
echo [2/4] Type Check...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo Type check failed!
    pause
    exit /b 1
)

echo.
echo [3/4] Linting...
call npm run lint
if %errorlevel% neq 0 (
    echo Linting failed!
    pause
    exit /b 1
)

echo.
echo [4/4] Running Tests...
call npm run test:run
if %errorlevel% neq 0 (
    echo Tests failed!
    pause
    exit /b 1
)

echo.
echo All checks passed!
pause
