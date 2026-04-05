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
echo "Syncing API dependencies (requirements.txt)..."
python -m pip install -q -r requirements.txt
uvicorn main:app --reload --port 8080 &
BACKEND_PID=$!
cd "$PROJECT_ROOT"

# Give backend a moment to start
sleep 2

# Clear build caches in development to avoid stale Turbopack/Webpack artifacts
if [ "${NODE_ENV:-development}" != "production" ]; then
  echo "Clearing Next.js cache..."
  rm -rf apps/web/.next
  rm -rf node_modules/.cache
  rm -rf apps/web/node_modules/.cache
fi

echo "Starting frontend..."
cd apps/web
echo ""
echo "Flashcard app running!"
echo "  Backend:  http://localhost:8080"
echo "  Frontend: http://localhost:3000"
echo ""
npm run dev
