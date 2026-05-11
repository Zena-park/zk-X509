#!/bin/bash
# Stop zk-X509 frontend + backend started by start-services.sh.
# Idempotent — safe to run when nothing's up.

set -uo pipefail

echo "Stopping zk-X509 services…"

# Match the *paths* rather than generic "next dev" so we don't
# kill scatter-dex's Pay or Pro that share `next dev` in pgrep.
pkill -f "zk-X509/frontend/node_modules/.bin/next" 2>/dev/null && echo "  ✓ frontend stopped" || echo "  · frontend not running"
pkill -f "zk-X509/backend/.*ts-node" 2>/dev/null && echo "  ✓ backend stopped" || echo "  · backend not running"
# Fallback: any process with cwd in zk-X509/{frontend,backend}.
# (npm/node wrappers sometimes don't surface the file path in the
# kill matcher above on older systems.)
pgrep -fl "zk-X509/(frontend|backend)" 2>/dev/null | while read -r line; do
    pid=$(echo "$line" | awk '{print $1}')
    kill "$pid" 2>/dev/null && echo "  ✓ killed $pid ($line)"
done
echo "Done."
