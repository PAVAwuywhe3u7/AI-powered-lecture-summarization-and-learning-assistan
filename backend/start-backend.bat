@echo off
cd /d "e:\Major project\backend"
start "" /b python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
