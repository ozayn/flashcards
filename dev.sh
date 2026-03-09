#!/bin/bash

# Get the directory where the script is located (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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
if [ -d .venv ]; then source .venv/bin/activate; fi
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

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
