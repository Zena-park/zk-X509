#!/bin/bash
# ============================================================
# Deploy zk-X509 contracts onto an EXISTING anvil instance
# (used to share an anvil with scatter-dex / Pay).
#
# Unlike run-local.sh, this script:
#   - does NOT kill or start anvil
#   - does NOT run cargo / SP1 (so CA root defaults to 0x0; pass
#     CA_MERKLE_ROOT=0x... env var to seed one)
#   - does NOT start prover server / frontend
#
# After this script you can plug the deployed IdentityRegistry
# into scatter-dex's IdentityGate via:
#   cast send <SCATTER_DEX_IDENTITY_GATE> "addRegistry(address)" <REGISTRY_ADDR> \
#     --rpc-url $RPC_URL --private-key $DEPLOYER_KEY
#
# Usage:
#   bash script/deploy-on-existing-anvil.sh
#   RPC_URL=http://localhost:8545 \
#   CA_MERKLE_ROOT=0xabc... \
#   SERVICE_NAME="KR User CA" \
#   bash script/deploy-on-existing-anvil.sh
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

RPC_URL="${RPC_URL:-http://localhost:8545}"
DEPLOYER_KEY="${DEPLOYER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
DEPLOYER_ADDR="${DEPLOYER_ADDR:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"
SERVICE_NAME="${SERVICE_NAME:-zk-X509 dev registry}"
CA_MERKLE_ROOT="${CA_MERKLE_ROOT:-0x0000000000000000000000000000000000000000000000000000000000000000}"

echo "=== zk-X509 deploy onto existing anvil ==="
echo "  RPC:        $RPC_URL"
echo "  Deployer:   $DEPLOYER_ADDR"
echo "  CA root:    $CA_MERKLE_ROOT"
echo "  Service:    $SERVICE_NAME"
echo ""

# Sanity: confirm the RPC responds.
if ! cast block-number --rpc-url "$RPC_URL" > /dev/null 2>&1; then
    echo "❌ No anvil reachable at $RPC_URL — start scatter-dex's dev stack first."
    exit 1
fi
echo "  ✓ Anvil reachable at $RPC_URL"
echo ""

# ========================================
# Step 1: Deploy RegistryFactory
# ========================================
echo "[1/4] Deploying RegistryFactory..."
cd contracts
DEPLOY_OUTPUT=$(forge script script/DeployLocal.s.sol --tc DeployLocalScript \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --sender "$DEPLOYER_ADDR" \
    --private-key "$DEPLOYER_KEY" 2>&1)

FACTORY_ADDR=$(echo "$DEPLOY_OUTPUT" | awk '/RegistryFactory:/ {print $2; exit}')
if [ -z "$FACTORY_ADDR" ]; then
    echo "❌ Deploy failed:"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi
echo "  ✓ RegistryFactory: $FACTORY_ADDR"

# ========================================
# Step 2: Seed an IdentityRegistry via the factory
# ========================================
echo "[2/4] Creating IdentityRegistry via factory..."
# Capture both stdout+stderr and the exit status separately so a
# forge failure surfaces with full context (previously masked by
# `|| true`, which forced the awk-empty branch to print a
# generic "Seed failed" message regardless of the real cause).
set +e
SEED_OUTPUT=$(FACTORY="$FACTORY_ADDR" \
    CA_MERKLE_ROOT="$CA_MERKLE_ROOT" \
    SERVICE_NAME="$SERVICE_NAME" \
    forge script script/SeedLocal.s.sol --tc SeedLocalScript \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --sender "$DEPLOYER_ADDR" \
    --private-key "$DEPLOYER_KEY" 2>&1)
SEED_STATUS=$?
set -e

REGISTRY_ADDR=$(echo "$SEED_OUTPUT" | awk '/IdentityRegistry \(proxy\):/ {print $3; exit}')
if [ "$SEED_STATUS" -ne 0 ] || [ -z "$REGISTRY_ADDR" ]; then
    echo "❌ Seed failed (exit $SEED_STATUS):"
    echo "$SEED_OUTPUT"
    exit 1
fi
echo "  ✓ IdentityRegistry: $REGISTRY_ADDR"

# ========================================
# Step 3: Seed the registry with the test CA (default-on for dev)
# ========================================
cd ..
# Optional: seed the registry with the test CA from certs/ca_pub.der.
# Enabled by default so a freshly-deployed dev registry isn't stuck
# at caMerkleRoot=0 (which forbids every register() call). Disable
# with `SEED_TEST_CA=0` if you intend to add CAs manually later.
SEED_TEST_CA="${SEED_TEST_CA:-1}"
CA_CERT_PATH="${CA_CERT_PATH:-$(pwd)/certs/ca_pub.der}"

# Portable SHA-256: prefer GNU coreutils' `sha256sum` when present
# (Linux / CI images), fall back to macOS's `shasum -a 256`, then to
# `openssl dgst -sha256` on stripped-down images that have neither.
sha256_hex() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1; exit}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1; exit}'
    else
        openssl dgst -sha256 "$1" | awk '{print $NF; exit}'
    fi
}

if [ "$SEED_TEST_CA" = "1" ]; then
    if [ ! -f "$CA_CERT_PATH" ]; then
        echo "[3/4] ⚠ SEED_TEST_CA=1 but $CA_CERT_PATH not found — skipping addCA."
        echo "    Run \`bash certs/generate-test-certs.sh\` to create test certs."
    else
        # `addCA(bytes32 caHash)` per IdentityRegistry.sol — caHash is
        # SHA-256 of the CA's SPKI DER bytes (same hash the prover uses
        # when binding a registration proof to a trusted CA).
        CA_HASH="0x$(sha256_hex "$CA_CERT_PATH")"
        echo "[3/4] Seeding test CA on the registry..."
        echo "  cert:    $CA_CERT_PATH"
        echo "  caHash:  $CA_HASH"
        cast send "$REGISTRY_ADDR" "addCA(bytes32)" "$CA_HASH" \
            --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
        echo "  ✓ CA added"
    fi
else
    echo "[3/4] Skipping test-CA seed (SEED_TEST_CA=0)."
fi

echo "[4/4] Verifying deployment..."
CA_ROOT=$(cast call "$REGISTRY_ADDR" "caMerkleRoot()(bytes32)" --rpc-url "$RPC_URL" 2>/dev/null)
echo "  caMerkleRoot: $CA_ROOT"
PAUSED=$(cast call "$REGISTRY_ADDR" "paused()(bool)" --rpc-url "$RPC_URL" 2>/dev/null)
echo "  paused:       $PAUSED"

# Quote values so strict dotenv parsers (and `source`) don't choke
# on SERVICE_NAME containing spaces or punctuation. Embedded
# double-quotes are escaped via printf %q-style fallback.
escape_dotenv() {
    # Replace " with \" so the surrounding double-quotes stay valid.
    printf '%s' "$1" | sed 's/"/\\"/g'
}
{
    printf 'RPC_URL="%s"\n'          "$(escape_dotenv "$RPC_URL")"
    printf 'FACTORY_ADDRESS="%s"\n'  "$(escape_dotenv "$FACTORY_ADDR")"
    printf 'REGISTRY_ADDRESS="%s"\n' "$(escape_dotenv "$REGISTRY_ADDR")"
    printf 'DEPLOYER_ADDRESS="%s"\n' "$(escape_dotenv "$DEPLOYER_ADDR")"
    printf 'DEPLOYER_KEY="%s"\n'     "$(escape_dotenv "$DEPLOYER_KEY")"
    printf 'SERVICE_NAME="%s"\n'     "$(escape_dotenv "$SERVICE_NAME")"
} > .env.shared-anvil

echo ""
echo "=== Done ==="
echo "  Saved to: .env.shared-anvil"
echo ""
echo "  To plug this registry into scatter-dex's IdentityGate (so Pay's"
echo "  isVerified() lookups go through it), run:"
echo ""
echo "    cast send \$SCATTER_DEX_IDENTITY_GATE \"addRegistry(address)\" $REGISTRY_ADDR \\"
echo "      --rpc-url $RPC_URL --private-key \$DEPLOYER_KEY"
echo ""
