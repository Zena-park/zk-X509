#!/bin/bash
# Stop zk-X509 frontend + backend started by start-services.sh.
# Idempotent — safe to run when nothing's up.
#
# Strategy:
#   1. Kill the exact PIDs recorded by start-services.sh (and any
#      direct children, since `npm run dev` spawns next/ts-node).
#   2. Fall back to whoever is bound to FRONTEND_PORT / BACKEND_PORT
#      so a stale pidfile or a manual `npm run dev` still gets cleaned.

set -uo pipefail

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-4444}"
LOG_DIR="${LOG_DIR:-/tmp/zk-x509-logs}"

echo "Stopping zk-X509 services…"

kill_tree() {
    local pid="$1"
    [ -z "$pid" ] && return 0
    kill -0 "$pid" 2>/dev/null || return 0
    # Kill children first so the npm wrapper doesn't respawn next/ts-node.
    local children
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for c in $children; do kill_tree "$c"; done
    kill "$pid" 2>/dev/null && echo "  ✓ killed PID $pid"
}

stop_by_pidfile() {
    local label="$1" pidfile="$2"
    if [ -f "$pidfile" ]; then
        kill_tree "$(cat "$pidfile")"
        rm -f "$pidfile"
        echo "  · $label pidfile cleared"
    else
        echo "  · $label pidfile not found ($pidfile)"
    fi
}

stop_by_port() {
    local label="$1" port="$2"
    local pids
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            kill_tree "$pid"
        done
        echo "  ✓ $label port $port freed"
    else
        echo "  · $label port $port already free"
    fi
}

stop_by_pidfile "frontend" "$LOG_DIR/frontend.pid"
stop_by_pidfile "backend"  "$LOG_DIR/backend.pid"
stop_by_port    "frontend" "$FRONTEND_PORT"
stop_by_port    "backend"  "$BACKEND_PORT"

echo "Done."
