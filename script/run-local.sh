#!/bin/bash
# ============================================================
# zk-X509 Local Environment Setup
#
# Starts Anvil + deploys contracts + opens interactive CLI.
#
# Usage:
#   bash script/run-local.sh
#
# Prerequisites:
#   - anvil (foundryup)
#   - forge (foundryup)
#   - cargo (rustup)
#   - Test certs generated (cd certs && bash generate-test-certs.sh)
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== zk-X509 Local Environment ==="
echo ""

# ========================================
# Step 1: Start Anvil (background)
# ========================================
echo "[1/4] Starting Anvil (local Ethereum)..."

# Kill any existing anvil
pkill -f "anvil" 2>/dev/null || true
sleep 1

anvil --silent &
ANVIL_PID=$!
sleep 2

if ! kill -0 $ANVIL_PID 2>/dev/null; then
    echo "❌ Failed to start Anvil"
    exit 1
fi
echo "  ✅ Anvil running (PID: $ANVIL_PID)"
echo "  RPC: http://localhost:8545"
echo "  Chain ID: 31337"
echo ""

# Anvil default account #0
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

# ========================================
# Step 2: Compute CA Merkle Root from current certs
# ========================================
echo "[2/5] Computing CA Merkle Root from certs/ca_pub.der..."

if [ ! -f certs/ca_pub.der ]; then
    echo "  ⚠️  certs/ca_pub.der not found. Generating test certs..."
    cd certs && bash generate-test-certs.sh > /dev/null 2>&1 && cd ..
fi

CA_MERKLE_ROOT=$(cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
    --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
    --registrant 0x0000000000000000000000000000000000000001 2>&1 | grep "CA Merkle Root:" | awk '{print $4}')

if [ -z "$CA_MERKLE_ROOT" ]; then
    echo "  ⚠️  Could not compute CA root, using default"
    CA_MERKLE_ROOT="0x0000000000000000000000000000000000000000000000000000000000000000"
fi
echo "  ✅ CA Merkle Root: $CA_MERKLE_ROOT"
echo ""

# ========================================
# Step 3: Deploy contracts
# ========================================
echo "[3/5] Deploying IdentityRegistry..."

cd contracts
DEPLOY_OUTPUT=$(CA_MERKLE_ROOT=$CA_MERKLE_ROOT forge script script/DeployLocal.s.sol --tc DeployLocalScript \
    --rpc-url http://localhost:8545 \
    --broadcast \
    --sender $DEPLOYER_ADDR \
    --private-key $DEPLOYER_KEY 2>&1)

# Extract contract address from logs
REGISTRY_ADDR=$(echo "$DEPLOY_OUTPUT" | grep "IdentityRegistry:" | awk '{print $2}')
if [ -z "$REGISTRY_ADDR" ]; then
    echo "❌ Deploy failed:"
    echo "$DEPLOY_OUTPUT"
    kill $ANVIL_PID 2>/dev/null
    exit 1
fi
echo "  ✅ IdentityRegistry: $REGISTRY_ADDR"
echo ""
cd ..

# ========================================
# Step 3: Verify deployment
# ========================================
echo "[4/5] Verifying deployment..."

CA_ROOT=$(cast call $REGISTRY_ADDR "caMerkleRoot()(bytes32)" --rpc-url http://localhost:8545 2>/dev/null)
echo "  CA Merkle Root: $CA_ROOT"

MAX_AGE=$(cast call $REGISTRY_ADDR "maxProofAge()(uint256)" --rpc-url http://localhost:8545 2>/dev/null)
echo "  Max Proof Age: $MAX_AGE seconds"

echo "  ✅ Contract verified"
echo ""

# ========================================
# Step 4: Print summary
# ========================================
echo "=== Environment Ready ==="
echo ""
echo "  Anvil PID:          $ANVIL_PID"
echo "  RPC URL:            http://localhost:8545"
echo "  Chain ID:           31337"
echo "  Registry:           $REGISTRY_ADDR"
echo "  Deployer:           $DEPLOYER_ADDR"
echo ""
echo "  Test accounts (10000 ETH each):"
echo "    #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "    #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
echo ""
echo "=== Quick Test Commands ==="
echo ""
echo "  # Execute mode (no proof, fast):"
echo "  cargo run --release --bin zk-x509 -- --execute \\"
echo "    --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \\"
echo "    --registrant $DEPLOYER_ADDR --chain-id 31337 --contract-address $REGISTRY_ADDR"
echo ""
echo "  # Interactive mode:"
echo "  cargo run --release --bin interactive"
echo ""
echo "  # Check if verified:"
echo "  cast call $REGISTRY_ADDR 'isVerified(address)(bool)' $DEPLOYER_ADDR --rpc-url http://localhost:8545"
echo ""
echo "  # Stop Anvil:"
echo "  kill $ANVIL_PID"
echo ""

# Save env for other scripts
cat > .env.local << EOF
ANVIL_PID=$ANVIL_PID
RPC_URL=http://localhost:8545
CHAIN_ID=31337
REGISTRY_ADDRESS=$REGISTRY_ADDR
DEPLOYER_ADDRESS=$DEPLOYER_ADDR
DEPLOYER_KEY=$DEPLOYER_KEY
EOF
echo "  Environment saved to .env.local"
echo ""
# ========================================
# Step 5/5: Start prover server + frontend
# ========================================
echo "[5/5] Starting services..."

# Start prover server (background)
echo "  Starting prover server on :8080..."
cargo run --release --bin server &
SERVER_PID=$!
sleep 3
echo "  ✅ Prover server: http://localhost:8080"

# Start frontend (background)
if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
    echo "  Starting frontend on :3000..."
    cd frontend
    npm install --silent 2>/dev/null
    npm run dev &
    FRONTEND_PID=$!
    cd ..
    sleep 3
    echo "  ✅ Frontend: http://localhost:3000"
else
    FRONTEND_PID=""
    echo "  ⚠️  Frontend not found, skipping"
fi

echo ""
echo "=== All Services Running ==="
echo "  Anvil:    http://localhost:8545 (PID: $ANVIL_PID)"
echo "  Server:   http://localhost:8080 (PID: $SERVER_PID)"
if [ -n "$FRONTEND_PID" ]; then
echo "  Frontend: http://localhost:3000 (PID: $FRONTEND_PID)"
fi
echo "  Registry: $REGISTRY_ADDR"
echo ""
echo "  Open http://localhost:3000 in browser"
echo "  Connect MetaMask to http://localhost:8545 (Chain ID: 31337)"
echo ""
echo "=== Press Ctrl+C to stop all ==="

# Cleanup on exit
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $ANVIL_PID 2>/dev/null
    kill $SERVER_PID 2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
    echo "Done."
}
trap cleanup EXIT

wait $ANVIL_PID
