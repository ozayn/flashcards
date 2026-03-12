#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Stopping existing processes..."

# Kill uvicorn processes
pkill -f "uvicorn.*main:app" 2>/dev/null && echo "  Stopped uvicorn" || true

# Kill Next.js dev server (next dev)
pkill -f "next dev" 2>/dev/null && echo "  Stopped Next.js dev" || true

# Kill node processes on port 3000 (Next.js default)
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null && echo "  Stopped process on port 3000" || true

# Kill processes on port 8000 (FastAPI default)
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null && echo "  Stopped process on port 8000" || true

sleep 2
echo ""
echo "Starting application..."
exec "$SCRIPT_DIR/dev.sh"
