#!/bin/bash

echo "Setting up Flashcards development environment..."
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --------------------------------
# Check Python
# --------------------------------
if ! command -v python3 &> /dev/null
then
    echo "Python3 is required but not installed."
    exit 1
fi

# --------------------------------
# Check Node
# --------------------------------
if ! command -v node &> /dev/null
then
    echo "Node.js is required but not installed."
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

# --------------------------------
# Setup Web environment
# --------------------------------
echo ""
echo "Setting up Web environment..."

cd "$ROOT_DIR/apps/web"

echo "Installing frontend dependencies..."
npm install

cd "$ROOT_DIR"

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "Start development environment:"
echo "  ./scripts/dev.sh"
echo ""
