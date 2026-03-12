#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default: apps/api (backend config). Override with first argument.
ENV_DIR="${1:-$ROOT_DIR/apps/api}"
ENV_FILE="$ENV_DIR/.env"
[ ! -f "$ENV_FILE" ] && [ -f "$ENV_DIR/.env.local" ] && ENV_FILE="$ENV_DIR/.env.local"
OUTPUT="$ENV_DIR/.env.example"

echo "Updating .env.example from env file"
echo "  Source: $ENV_FILE"
echo "  Output: $OUTPUT"
echo ""

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: No .env or .env.local found in $ENV_DIR"
    echo ""
    echo "Create apps/api/.env with your config, then run:"
    echo "  ./scripts/update_env_example.sh"
    echo ""
    echo "Or for apps/web:"
    echo "  ./scripts/update_env_example.sh apps/web"
    exit 1
fi

echo "# Environment configuration template" > "$OUTPUT"
echo "# Copy this file to .env and fill in real values" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Use || [[ -n "$line" ]] to handle files without trailing newline
while IFS= read -r line || [[ -n "$line" ]]
do
    # Trim carriage returns (Windows line endings)
    line="${line%$'\r'}"

    # Skip comments
    if [[ "$line" =~ ^[[:space:]]*# ]]; then
        echo "$line" >> "$OUTPUT"
        continue
    fi

    # Skip empty lines
    if [[ -z "${line//[[:space:]]/}" ]]; then
        echo "" >> "$OUTPUT"
        continue
    fi

    key="${line%%=*}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    case "$key" in
        *KEY*|*TOKEN*|*SECRET*|*PASSWORD*)
            echo "$key=your_value_here" >> "$OUTPUT"
            ;;
        *)
            echo "$key=${line#*=}" >> "$OUTPUT"
            ;;
    esac

done < "$ENV_FILE"

echo ".env.example updated."
