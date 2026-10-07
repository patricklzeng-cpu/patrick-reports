#!/bin/bash
# Patrick OS — terminal launcher.
# Use this if you want to start Patrick OS from the terminal directly.

# Find the .app bundle this script lives in.
SELF="$0"
while [ -h "$SELF" ]; do
  DIR="$(cd -P "$(dirname "$SELF")" && pwd)"
  SELF="$(readlink "$SELF")"
  [[ "$SELF" != /* ]] && SELF="$DIR/$SELF"
done
DIR="$(cd -P "$(dirname "$SELF")" && pwd)"
APP_DIR="$DIR"
PAYLOAD="$APP_DIR/../Resources/app"
if [ ! -d "$PAYLOAD" ]; then
  PAYLOAD="$APP_DIR/Resources/app"
fi
if [ ! -d "$PAYLOAD" ]; then
  echo "[Patrick OS] could not locate Resources/app inside the bundle."
  echo "  expected: $APP_DIR/../Resources/app"
  exit 1
fi

cd "$PAYLOAD" || exit 1

PORT="${PORT:-7331}"

echo "=========================================="
echo "  Patrick OS v0.1.0 — Agentic Framework"
echo "=========================================="
echo "  payload: $PAYLOAD"
echo "  port:    http://127.0.0.1:$PORT"
echo ""
echo "  Press Ctrl-C to stop."
echo ""

# Pick the user's preferred Node. Prefer Homebrew, then ~/.local, then PATH.
NODE_BIN="${NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [ -x "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [ -x "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
  else
    echo "[Patrick OS] node not found in PATH. Install Node 18+ from https://nodejs.org/"
    read -p "Press Enter to close."
    exit 1
  fi
fi

echo "  using node: $NODE_BIN ($($NODE_BIN --version))"
echo ""

# Open browser after a short delay so the server has time to boot.
(sleep 2 && open "http://127.0.0.1:$PORT") >/dev/null 2>&1 &

exec "$NODE_BIN" src/server.js
