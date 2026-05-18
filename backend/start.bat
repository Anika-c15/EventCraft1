@echo off
echo Starting EventCraft Backend...
echo.

REM Use Python 3.13 explicitly to avoid msys64 conflict
set PYTHON=C:\Users\Administrator\AppData\Local\Programs\Python\Python313\python.exe

REM Create venv if it doesn't exist
if not exist "venv" (
    echo Creating virtual environment...
    %PYTHON% -m venv venv
)

REM Install dependencies
echo Installing dependencies...
venv\Scripts\pip install -r requirements.txt -q

echo.
echo Starting FastAPI server on http://localhost:8000
echo API docs: http://localhost:8000/docs
echo Press Ctrl+C to stop.
echo.

venv\Scripts\uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
