# End-to-End Test Guide

## Prerequisites

- Docker Desktop running
- Rust + SP1 toolchain installed (`sp1up --version v6.0.2`)
- SP1 Rust crates: v6.0.1 (script/program), SP1 contracts: v6.0.0
- Test certificate in macOS Keychain (or `certs/signCert.der` + `certs/signPri.key`)
- On Apple Silicon: Docker must be able to pull `linux/amd64` images (Groth16 uses `sp1-gnark:v6.0.0` which is x86 only)

## 1. Start Local Stack

```bash
docker compose up -d
```

This starts:
- **anvil** (localhost:8545) — local Ethereum node
- **deployer** — deploys RegistryFactory + seeds a registry
- **backend** (localhost:4000) — API server
- **frontend** (localhost:3000) — web UI

Verify:
```bash
docker compose ps                        # All services running
curl -s http://localhost:4000/health      # {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000  # 200
```

## 2. Get Deployed Addresses

```bash
# Parse addresses from deployer logs (works regardless of volume name)
FACTORY=$(docker compose logs deployer 2>/dev/null | grep "FACTORY=" | tail -1 | sed 's/.*FACTORY=//')
echo "FACTORY=$FACTORY"

# Get first registry address
REGISTRY=$(cast call $FACTORY "registries(uint256)(address)" 0 --rpc-url http://localhost:8545)
echo "REGISTRY=$REGISTRY"
```

## 3. Register Test CA

```bash
# Compute CA hash
CA_HASH=$(python3 -c "
import hashlib
with open('certs/ca_pub.der', 'rb') as f:
    print('0x' + hashlib.sha256(f.read()).hexdigest())
")
echo "CA_HASH=$CA_HASH"

# Register CA
cast send $REGISTRY "addCA(bytes32)" $CA_HASH \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Verify
cast call $REGISTRY "getCaCount()(uint256)" --rpc-url http://localhost:8545
```

## 4. Check VKey Match

```bash
# On-chain vkey
ONCHAIN_VKEY=$(cast call $FACTORY "currentProgramVKey()(bytes32)" --rpc-url http://localhost:8545)
echo "On-chain: $ONCHAIN_VKEY"

# Local vkey (from current build)
LOCAL_VKEY=$(cargo run --release --bin vkey 2>/dev/null | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
echo "Local:    $LOCAL_VKEY"

# Compare
if [ "$ONCHAIN_VKEY" = "$LOCAL_VKEY" ]; then
  echo "MATCH ✅"
else
  echo "MISMATCH ❌ — updating on-chain..."
  cast send $FACTORY "updateProgramVKey(bytes32)" $LOCAL_VKEY \
    --rpc-url http://localhost:8545 \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
  echo "Updated ✅"
fi
```

## 5. Generate Proof (Execute Mode — Fast)

Quick circuit validation without generating an actual proof:

```bash
SP1_PROVER=mock cargo run --release --bin evm -- \
  --system groth16 \
  --cert certs/signCert.der \
  --key certs/signPri.key \
  --ca-cert certs/ca_pub.der \
  --registrant 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --wallet-index 0 --max-wallets 1 \
  --chain-id 31337 \
  --registry-address $REGISTRY \
  --rpc-url http://localhost:8545 \
  --disclosure-mask 3
```

## 6. Generate Proof (Groth16 — Production)

Requires Docker. Takes ~5–10 minutes. On Apple Silicon, the `sp1-gnark:v6.0.0` image runs under Rosetta emulation (linux/amd64).

```bash
cargo run --release --bin evm -- \
  --system groth16 \
  --cert certs/signCert.der \
  --key certs/signPri.key \
  --ca-cert certs/ca_pub.der \
  --registrant 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --wallet-index 0 --max-wallets 1 \
  --chain-id 31337 \
  --registry-address $REGISTRY \
  --rpc-url http://localhost:8545 \
  --disclosure-mask 3 \
  | tee /tmp/proof-output.txt
```

Capture proof and public values from output:
```bash
PROOF=$(grep "^Proof:" /tmp/proof-output.txt | awk '{print $2}')
PUBLIC_VALUES=$(grep "^Public Values:" /tmp/proof-output.txt | awk '{print $3}')
echo "PROOF=${PROOF:0:20}..."
echo "PV=${PUBLIC_VALUES:0:20}..."
```

## 7. Register On-Chain

```bash
cast send $REGISTRY "register(bytes,bytes)" $PROOF $PUBLIC_VALUES \
  --rpc-url http://localhost:8545 \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

## 8. Verify

```bash
cast call $REGISTRY "isVerified(address)(bool)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url http://localhost:8545
# → true
```

## 9. Test Delegated Proving Config

```bash
# Enable
cast send $REGISTRY "setDelegatedProving(bool,string)" true "http://localhost:9090" \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Verify
cast call $REGISTRY "delegatedProvingRequired()(bool)" --rpc-url http://localhost:8545
cast call $REGISTRY "proverUrl()(string)" --rpc-url http://localhost:8545

# Disable
cast send $REGISTRY "setDelegatedProving(bool,string)" false "" \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

## 10. Cleanup

```bash
docker compose down -v
```
