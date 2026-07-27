#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js 20 or later is required." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }
if [ ! -d node_modules ]; then
  echo "Installing MyDash dependencies..."
  npm install --no-audit --no-fund
fi
echo "Starting MyDash..."
exec npm start
