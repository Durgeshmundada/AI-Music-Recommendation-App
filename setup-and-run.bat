@echo off
REM ===============================
REM Music Recommendation App Setup
REM One-Click Setup & Run
REM ===============================

cls
echo.
echo ====================================================
echo   Music Recommendation System - Setup and Run
echo ====================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js found
node --version
echo.

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm is not installed!
    echo Please install npm or Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ npm found
npm --version
echo.

REM Install dependencies
echo ====================================================
echo Installing dependencies...
echo ====================================================
echo.

call npm install
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo ✓ Dependencies installed successfully
echo.

REM Check if .env file exists, if not create from .env.example
if not exist .env (
    echo ====================================================
    echo Setting up environment configuration...
    echo ====================================================
    echo.

    if exist .env.example (
        copy .env.example .env
        echo ✓ Created .env file from .env.example
        echo.
        echo IMPORTANT: Update .env file with your actual values:
        echo   - MONGODB_URI: Your MongoDB connection string
        echo   - JWT_SECRET: A secure random string
        echo   - JWT_REFRESH_SECRET: Another secure random string
        echo.
        echo Open .env file and update the required fields before running.
        echo.
    ) else (
        echo WARNING: .env.example not found. Creating default .env file.
        (
            echo MONGODB_URI=mongodb://localhost:27017/musicrecommendation
            echo JWT_SECRET=your_super_secret_jwt_key_change_this_NOW
            echo JWT_REFRESH_SECRET=your_super_secret_refresh_key_change_this_NOW
            echo NODE_ENV=development
            echo PORT=5000
        ) > .env
        echo ✓ Created default .env file
        echo.
        echo IMPORTANT: Update .env file with your actual values!
        echo.
    )
) else (
    echo ✓ .env file already exists
    echo.
)

REM Optional: Seed database
echo ====================================================
echo Database Setup (Optional)
echo ====================================================
echo.
echo Do you want to seed the database with sample data?
echo.
set /p SEED="Enter 'y' for yes or 'n' for no: "

if /i "%SEED%"=="y" (
    echo.
    echo Seeding database...
    call npm run seed
    if %ERRORLEVEL% NEQ 0 (
        echo WARNING: Database seeding failed or completed with issues
        echo You can run "npm run seed" manually later
        echo.
    ) else (
        echo ✓ Database seeded successfully
        echo.
    )
)

REM Start development server
echo ====================================================
echo Starting Development Server...
echo ====================================================
echo.
echo Server will run on: http://localhost:5000
echo API Health Check: http://localhost:5000/api/health
echo.
echo Press Ctrl+C to stop the server
echo.

call npm run dev

pause
