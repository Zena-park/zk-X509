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

# On Apple Silicon Macs, the frontend's native deps (lightningcss,
# better-sqlite3, esbuild) ship as platform-specific .node files —
# the optional-dep install only picks up the arch matching the npm
# process that ran `install`. If this script is launched from an
# x86_64 shell (common when /usr/local/bin/bash is on PATH first or
# the wrapping terminal is in Rosetta), npm's child `node` reports
# `process.arch === "x64"` and tries to load `lightningcss.darwin-x64`
# even though only the arm64 variant is installed → MODULE_NOT_FOUND.
# Re-exec under native arm64 bash before any work so every child
# inherits the right arch.
if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "x86_64" ] \
    && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
    # Prefer Homebrew's arm64 bash when present (handles users that
    # explicitly installed it); fall back to /bin/bash, the system
    # universal binary that always exists on macOS and switches arch
    # cleanly under `arch -arm64`.
    BASH_BIN="/bin/bash"
    [ -x /opt/homebrew/bin/bash ] && BASH_BIN="/opt/homebrew/bin/bash"
    exec arch -arm64 "$BASH_BIN" "$0" "$@"
fi

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
# Backend — record PID so stop-services.sh can kill the exact
# process tree we spawned (npm/ts-node wrappers don't always
# surface the source path in pgrep -f).
# ----------------------------------------------------------------
echo "[1/2] Starting backend on :${BACKEND_PORT}…"
(cd backend && PORT="$BACKEND_PORT" \
    CORS_ORIGIN="http://localhost:$FRONTEND_PORT" \
    nohup npm run dev > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$LOG_DIR/backend.pid"
    echo "  PID: $(cat "$LOG_DIR/backend.pid")")
sleep 2

# ----------------------------------------------------------------
# Frontend — runtime env (NEXT_PUBLIC_BACKEND_URL / RPC / PORT) is
# exported into the npm process so the static .env.local in source
# can stay as a template. Next reads .env.local at boot; the
# overrides here win for this run only.
# ----------------------------------------------------------------
echo "[2/2] Starting frontend on :${FRONTEND_PORT}…"
(cd frontend && \
    NEXT_PUBLIC_BACKEND_URL="http://localhost:$BACKEND_PORT" \
    NEXT_PUBLIC_RPC_URL="$RPC_URL" \
    PORT="$FRONTEND_PORT" \
    nohup npm run dev -- -p "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$LOG_DIR/frontend.pid"
    echo "  PID: $(cat "$LOG_DIR/frontend.pid")")
sleep 3

echo ""
echo "=== Started ==="
echo "  Frontend:  http://localhost:$FRONTEND_PORT"
echo "  Backend:   http://localhost:$BACKEND_PORT"
echo "  Logs:      $LOG_DIR/{frontend,backend}.log"
echo "  PIDs:      $LOG_DIR/{frontend,backend}.pid"
echo ""
echo "  Stop with: bash script/stop-services.sh"
