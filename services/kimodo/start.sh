#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export LOCAL_CACHE="${LOCAL_CACHE:-true}"
export TEXT_ENCODER_MODE="${TEXT_ENCODER_MODE:-api}"
export TEXT_ENCODER_URL="${TEXT_ENCODER_URL:-http://127.0.0.1:9550/}"
export KIMODO_PRELOAD="${KIMODO_PRELOAD:-1}"
export KIMODO_CACHE_DIR="${KIMODO_CACHE_DIR:-$ROOT/cache}"
# Prefer the project venv; fall back to PATH python3.
if [ -x "$ROOT/.venv/bin/python" ]; then
  PYTHON="$ROOT/.venv/bin/python"
else
  PYTHON="python3"
fi
# Run outside the checkout directory so ./kimodo cannot shadow the installed package.
cd /tmp
exec "$PYTHON" "$ROOT/worker.py"
