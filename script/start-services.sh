#!/bin/bash
# ============================================================
# Start zk-X509 frontend + backend against an EXISTING anvil
# (so we share scatter-dex's chain + contracts).
#
# Default ports:
#   - frontend: 3000  (Next dev)
#   - backend:  4444  (scatter-dex shared-orderbook owns 4000)
#
# Override via env:
#   FRONTEND_PORT=3001 BACKEND_PORT=4500 bash script/start-services.sh
#
# This script does NOT touch contracts. Run
# `bash script/deploy-on-existing-anvil.sh` first if the registry
# address in frontend/.env.local is stale.
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-4444}"
RPC_URL="${RPC_URL:-http://localhost:8545}"
LOG_DIR="${LOG_DIR:-/tmp/zk-x509-logs}"
mkdir -p "$LOG_DIR"

echo "=== zk-X509 services (shared-anvil mode) ==="
echo "  Frontend port: $FRONTEND_PORT"
echo "  Backend port:  $BACKEND_PORT"
echo "  RPC:           $RPC_URL"
echo "  Logs:          $LOG_DIR"
echo ""

# ----------------------------------------------------------------
# Port pre-flight — bail out instead of cohabiting with another
# service. Scatter-dex's anvil and shared-orderbook hold 8545 +
# 4000; we use 3000/4444 by default to stay clear.
# ----------------------------------------------------------------
check_port() {
    local port="$1"
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        local owner
        owner=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN | awk 'NR==2 {print $1, $2}')
        echo "❌ Port $port is in use by: $owner"
        echo "   Override via FRONTEND_PORT / BACKEND_PORT envs, or"
        echo "   stop whoever owns the port and rerun."
        exit 1
    fi
}
check_port "$FRONTEND_PORT"
check_port "$BACKEND_PORT"

if ! curl -s "$RPC_URL" -o /dev/null -w "%{http_code}\n" 2>/dev/null | grep -q "^200\|^405"; then
    echo "⚠ RPC $RPC_URL not responding — start scatter-dex's anvil first."
fi

# ----------------------------------------------------------------
# Backend
# ----------------------------------------------------------------
echo "[1/2] Starting backend on :$BACKEND_PORT…"
(cd backend && PORT="$BACKEND_PORT" \
    CORS_ORIGIN="http://localhost:$FRONTEND_PORT" \
    nohup npm run dev > "$LOG_DIR/backend.log" 2>&1 & echo "  PID: $!")
sleep 2

# ----------------------------------------------------------------
# Frontend — drop a tiny .env.local.runtime that the script wrote
# (so the static .env.local in source stays as a template), then
# launch on the chosen port. Note: Next reads .env.local at boot;
# the runtime overlay is sourced via export.
# ----------------------------------------------------------------
echo "[2/2] Starting frontend on :$FRONTEND_PORT…"
(cd frontend && \
    NEXT_PUBLIC_BACKEND_URL="http://localhost:$BACKEND_PORT" \
    NEXT_PUBLIC_RPC_URL="$RPC_URL" \
    PORT="$FRONTEND_PORT" \
    nohup npm run dev -- -p "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 & echo "  PID: $!")
sleep 3

echo ""
echo "=== Started ==="
echo "  Frontend:  http://localhost:$FRONTEND_PORT"
echo "  Backend:   http://localhost:$BACKEND_PORT"
echo "  Logs:      $LOG_DIR/{frontend,backend}.log"
echo ""
echo "  Stop with: pkill -f 'next dev.*$FRONTEND_PORT' ; pkill -f 'src/server.ts'"
