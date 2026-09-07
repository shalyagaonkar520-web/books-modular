@echo off
echo ========================================================
echo   Starting Zoho Books Clone
echo   Backend:  Python FastAPI + SQLite (http://127.0.0.1:8000)
echo   Docs:     Swagger UI (http://127.0.0.1:8000/docs)
echo   Frontend: React + Vite (http://localhost:3000)
echo ========================================================

start "Zoho Books Backend (FastAPI)" cmd /k "python run_server.py"
start "Zoho Books Frontend (Vite)" cmd /k "npm run dev"

echo Both services launched in separate terminal windows.
pause
