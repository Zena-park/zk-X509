#!/bin/bash
# ============================================================
# Turn ON delegated proving for an already-deployed IdentityRegistry.
#
# Calls IdentityRegistry.setDelegatedProving(bool,string) (onlyOwner)
# so the registry advertises that proofs must be produced by a delegated
# prover server, and where that server lives. The desktop app reads
# `delegatedProvingRequired` / `proverUrl` to switch into the consent +
# delegated-proving flow, and the prover server logs each proof for the
# admin KYC-reconciliation screen (GET /api/compliance).
#
# This does NOT start anvil or the prover server — it only flips on-chain
# config on a registry that already exists. Start the prover separately:
#   PROVER_LOG_DIR=./logs PROVER_PORT=9090 cargo run --release --bin prover-server
#
# Usage:
#   bash script/enable-delegated-proving.sh
#   REGISTRY_ADDR=0x4565... PROVER_URL=http://localhost:9090 \
#   bash script/enable-delegated-proving.sh
#
#   # Turn it back OFF:
#   REQUIRED=false bash script/enable-delegated-proving.sh
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

RPC_URL="${RPC_URL:-http://localhost:8545}"
DEPLOYER_KEY="${DEPLOYER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
# Local anvil registry deployed by the dev stack. Override for other deployments.
REGISTRY_ADDR="${REGISTRY_ADDR:-0x4565072738662672Bb9B1b1b5CF015C4b05A9328}"
PROVER_URL="${PROVER_URL:-http://localhost:9090}"
REQUIRED="${REQUIRED:-true}"

echo "=== zk-X509 enable delegated proving ==="
echo "  RPC:       $RPC_URL"
echo "  Registry:  $REGISTRY_ADDR"
echo "  Required:  $REQUIRED"
echo "  ProverURL: $PROVER_URL"
echo ""

# Sanity: confirm the RPC responds.
if ! cast block-number --rpc-url "$RPC_URL" > /dev/null 2>&1; then
    echo "❌ No anvil reachable at $RPC_URL — start the dev stack first."
    exit 1
fi
echo "  ✓ Anvil reachable at $RPC_URL"

# Safety: never sign with the well-known Anvil dev key on a non-local chain.
ANVIL_DEFAULT_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
if [ "$DEPLOYER_KEY" = "$ANVIL_DEFAULT_KEY" ]; then
    CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || echo "")"
    if [ "$CHAIN_ID" != "31337" ]; then
        echo "❌ Refusing to use the well-known Anvil dev key on chain-id '$CHAIN_ID' (expected 31337)."
        echo "   Set DEPLOYER_KEY explicitly for non-local chains."
        exit 1
    fi
    echo "  ✓ Default dev key allowed on local chain (31337)"
fi

# Sanity: confirm a contract actually lives at REGISTRY_ADDR.
CODE="$(cast code "$REGISTRY_ADDR" --rpc-url "$RPC_URL" 2>/dev/null || echo 0x)"
if [ "$CODE" = "0x" ] || [ -z "$CODE" ]; then
    echo "❌ No contract code at $REGISTRY_ADDR — deploy the registry first."
    exit 1
fi
echo "  ✓ Registry contract present"
echo ""

# Flip the on-chain config.
echo "→ setDelegatedProving($REQUIRED, \"$PROVER_URL\")"
cast send "$REGISTRY_ADDR" \
    "setDelegatedProving(bool,string)" \
    "$REQUIRED" "$PROVER_URL" \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
echo "  ✓ tx mined"
echo ""

# Read back the on-chain state to confirm both values landed.
GOT_REQUIRED="$(cast call "$REGISTRY_ADDR" "delegatedProvingRequired()(bool)" --rpc-url "$RPC_URL")"
GOT_URL="$(cast call "$REGISTRY_ADDR" "proverUrl()(string)" --rpc-url "$RPC_URL")"
echo "=== on-chain state ==="
echo "  delegatedProvingRequired = $GOT_REQUIRED"
echo "  proverUrl                = $GOT_URL"
echo ""

# cast returns the string value quoted; strip quotes before comparing.
GOT_URL_UNQUOTED="${GOT_URL%\"}"; GOT_URL_UNQUOTED="${GOT_URL_UNQUOTED#\"}"
if [ "$GOT_REQUIRED" = "$REQUIRED" ] && [ "$GOT_URL_UNQUOTED" = "$PROVER_URL" ]; then
    echo "✓ Done. Desktop app will now require delegated proving via $PROVER_URL"
else
    echo "❌ Read-back mismatch (expected required=$REQUIRED url=$PROVER_URL)."
    echo "   Is the deployer the registry owner?"
    exit 1
fi
