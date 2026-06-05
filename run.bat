@echo off
title FinSight AI Launcher
echo ===================================================
echo               Starting FinSight AI App
echo ===================================================

:: Ensure backend .env exists
if not exist backend\.env (
    echo [INFO] Backend .env not found. Creating from .env.example...
    copy backend\.env.example backend\.env
)

:: Launch Backend in a new command window
echo [Backend] Starting FastAPI Backend on port 8000...
start "FinSight Backend Server" cmd /k "cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

:: Launch Frontend in a new command window
echo [Frontend] Starting Vite React Frontend on port 5173...
start "FinSight Frontend Dev Server" cmd /k "cd frontend && npm run dev"

echo ===================================================
echo  Launch triggered successfully!
echo  - Backend will be ready at: http://localhost:8000
echo  - Frontend will be ready at: http://localhost:5173
echo ===================================================
pause
