#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Cleanup function: kill backend when script exits
cleanup() {
  echo ""
  echo "Stopping backend..."
  kill $BACKEND_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

echo "Starting backend..."
cd apps/api
if [ -d .venv313 ]; then source .venv313/bin/activate; elif [ -d .venv ]; then source .venv/bin/activate; fi
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd "$PROJECT_ROOT"

# Give backend a moment to start
sleep 2

echo "Starting frontend..."
echo ""
echo "Flashcard app running!"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo ""
cd apps/web
npm run dev
