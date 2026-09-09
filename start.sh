#!/usr/bin/env bash
set -e

# Load local environment
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "=== Starting Kwipu Bridge on http://127.0.0.1:8765 ==="
./.venv/bin/python -m bridge &
BRIDGE_PID=$!

echo "=== Starting Frontend on http://localhost:5173 ==="
npm --prefix frontend run dev &
FRONTEND_PID=$!

trap "kill $BRIDGE_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM
wait
