@echo off
cd /d C:\Users\Administrator\Desktop\EventCraft

echo === Untracking secrets, cache, db, node_modules ===

:: Untrack .env files (they should not be in git)
git rm --cached backend/.env 2>nul
git rm --cached eventcraft-frontend/.env 2>nul

:: Untrack __pycache__ directories
git rm -r --cached "backend/app/__pycache__" 2>nul
git rm -r --cached "backend/app/routers/__pycache__" 2>nul

:: Untrack venv
git rm -r --cached "backend/venv" 2>nul

:: Untrack node_modules
git rm -r --cached "eventcraft-frontend/node_modules" 2>nul

:: Untrack dist
git rm -r --cached "eventcraft-frontend/dist" 2>nul

echo === Staging all changes ===
git add -A

echo === Committing ===
git commit -m "feat: switch LLM to Groq, update agent UI, update README, untrack secrets/cache"

echo === Force pushing to master (overwriting remote) ===
git push origin master --force

echo === Done! ===
pause
