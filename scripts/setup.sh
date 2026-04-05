#!/bin/bash
set -e

echo "Setting up Flashcards development environment..."
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# --------------------------------
# Check Python
# --------------------------------
if ! command -v python3 &> /dev/null; then
    echo "Error: Python3 is required but not installed."
    exit 1
fi

# --------------------------------
# Check Node
# --------------------------------
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    exit 1
fi

# --------------------------------
# Setup API environment
# --------------------------------
echo "Setting up API environment..."

cd "$ROOT_DIR/apps/api"

if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

echo "Installing backend dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Verify API setup
echo "Verifying API setup..."
python -c "import fastapi, uvicorn, email_validator; print('  OK')" || { echo "Error: API dependencies failed to install."; exit 1; }

# --------------------------------
# Setup Web environment
# --------------------------------
echo ""
echo "Setting up Web environment..."

cd "$ROOT_DIR/apps/web"

echo "Installing frontend dependencies..."
npm install

# Verify web setup
echo "Verifying web setup..."
if [ -d "node_modules/next" ]; then
    echo "  OK"
else
    echo "  Warning: Could not verify Next.js installation."
    exit 1
fi

cd "$ROOT_DIR"

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "Start development environment:"
echo "  ./scripts/dev.sh"
echo ""
