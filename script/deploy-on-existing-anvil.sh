#!/bin/bash
# ============================================================
# Deploy zk-X509 contracts onto an EXISTING anvil instance
# (used to share an anvil with scatter-dex / Pay).
#
# Unlike run-local.sh, this script:
#   - does NOT kill or start anvil
#   - does NOT start prover server / frontend
#
# It DOES run `cargo run --release --bin vkey` to extract the live
# ELF VK before deploying, so the factory is constructed with the
# correct `programVKey` from the start — see Step 1 below. Pass
# `ELF_VKEY=0x…` to skip the cargo step when iterating on contracts
# alone.
#
# After this script you can plug the deployed IdentityRegistry
# into scatter-dex's IdentityGate via:
#   cast send <SCATTER_DEX_IDENTITY_GATE> "addRegistry(address)" <REGISTRY_ADDR> \
#     --rpc-url $RPC_URL --private-key $DEPLOYER_KEY
#
# Re-verify deployment state at any time without redeploying:
#   bash script/verify-deployment.sh
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
# Step 1: Pre-flight — SP1 cache + ELF VK extraction
# ========================================
# Every SP1 ELF rebuild changes the program VK; baking that into a
# script literal silently bit-rots and produces opaque `ProofInvalid()`
# reverts at register() time. So we extract the live VK from the
# workspace-bundled ELF before each deploy and feed it to the factory.
# The desktop app's `client.setup(ELF)` derives the same VK at proof
# generation time, so both paths are anchored to the same source.
#
# Inputs (env overrides):
#   ELF_VKEY     pre-computed hex VK — skip the cargo run (useful in
#                tight redeploy loops; pair with checking against the
#                printed value to avoid feeding a stale override)
#   SP1_VERSION  defaults to v6.0.0 (matches sp1-contracts import
#                in DeployLocal.s.sol — bump in lock-step when the SDK
#                pin moves)
echo "[1/5] Pre-flight: SP1 cache + ELF VK..."
SP1_VERSION="${SP1_VERSION:-v6.0.0}"
SP1_CACHE_DIR="${HOME}/.sp1/circuits/groth16/${SP1_VERSION}"
# Files the local Groth16 prover + the contract-side verifier both
# need end-to-end (witness gen → proving → pairing). Empty/missing →
# SP1 SDK silently downloads on first use, which can fail offline; we
# surface the absence here instead of producing a confused error
# deep inside `cargo run --bin vkey`.
for f in groth16_pk.bin groth16_vk.bin groth16_circuit.bin Groth16Verifier.sol SP1VerifierGroth16.sol; do
    if [ ! -s "$SP1_CACHE_DIR/$f" ]; then
        echo "❌ Missing/empty SP1 artifact: $SP1_CACHE_DIR/$f"
        echo "    The SP1 SDK populates this dir on first prove. To trigger,"
        echo "    run the desktop app once OR invoke \`cargo run --release"
        echo "    --bin vkey\` in this repo — the first run is slow (~1m30s)"
        echo "    but later runs are incremental."
        exit 1
    fi
done
echo "  ✓ SP1 ${SP1_VERSION} circuit cache present"

ELF_VKEY="${ELF_VKEY:-}"
if [ -z "$ELF_VKEY" ]; then
    # `cargo run --bin vkey` always reads the workspace-bundled ELF
    # (via `include_elf!`) so the VK reflects whatever program source
    # is currently committed — no separate pre-built binary path
    # that could diverge from the source.
    echo "  Extracting ELF VK via 'cargo run --release --bin vkey'..."
    VK_OUT=$(cargo run --release --bin vkey --quiet 2>&1)
    ELF_VKEY=$(printf '%s\n' "$VK_OUT" | awk '/Verification Key:/ {print $NF; exit}')
    # 64 hex chars + 0x prefix; reject anything else outright so a
    # cargo failure that leaks a half-line of stderr can't sneak in
    # as a bogus VK.
    if [ -z "$ELF_VKEY" ] || [[ ! "$ELF_VKEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
        echo "❌ Could not extract a 32-byte VK from vkey binary output:"
        printf '%s\n' "$VK_OUT" | tail -20
        exit 1
    fi
fi
echo "  ✓ ELF VK: $ELF_VKEY"
echo ""

# ========================================
# Step 2: Deploy RegistryFactory
# ========================================
echo "[2/5] Deploying RegistryFactory..."
cd contracts
DEPLOY_OUTPUT=$(PROGRAM_V_KEY="$ELF_VKEY" forge script script/DeployLocal.s.sol --tc DeployLocalScript \
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
# DeployLocal.s.sol also deploys an SP1VerifierGroth16 ahead of the
# factory; capture its address so the frontend env sync below can
# point NEXT_PUBLIC_SP1_VERIFIER_ADDRESS at the live verifier instead
# of leaving it on the previous anvil session's stale address.
SP1_VERIFIER_ADDR=$(echo "$DEPLOY_OUTPUT" | awk '/SP1VerifierGroth16/ {print $NF; exit}')
echo "  ✓ RegistryFactory: $FACTORY_ADDR"
[ -n "$SP1_VERIFIER_ADDR" ] && echo "  ✓ SP1VerifierGroth16: $SP1_VERIFIER_ADDR"

# ========================================
# Step 3: Seed an IdentityRegistry via the factory
# ========================================
echo "[3/5] Creating IdentityRegistry via factory..."
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
# Step 4: Seed the registry with the test CA (default-on for dev)
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
        echo "[4/5] ⚠ SEED_TEST_CA=1 but $CA_CERT_PATH not found — skipping addCA."
        echo "    Run \`bash certs/generate-test-certs.sh\` to create test certs."
    else
        # `addCA(bytes32 caHash)` per IdentityRegistry.sol — caHash is
        # SHA-256 of the CA's SPKI DER bytes (same hash the prover uses
        # when binding a registration proof to a trusted CA).
        CA_HASH="0x$(sha256_hex "$CA_CERT_PATH")"
        echo "[4/5] Seeding test CA on the registry..."
        echo "  cert:    $CA_CERT_PATH"
        echo "  caHash:  $CA_HASH"
        cast send "$REGISTRY_ADDR" "addCA(bytes32)" "$CA_HASH" \
            --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null
        echo "  ✓ CA added"
    fi
else
    echo "[4/5] Skipping test-CA seed (SEED_TEST_CA=0)."
fi

# ========================================
# Step 5: Verify deployment — on-chain state + VK match
# ========================================
# Defense-in-depth on top of Step 1: even though the factory's
# `currentProgramVKey` is set from $ELF_VKEY at constructor time,
# explicitly read it back and compare. Catches:
#   - forge silently picking up a different PROGRAM_V_KEY env var
#     (e.g. exported in the shell)
#   - the registry's `effectiveProgramVKey()` resolving to something
#     other than the factory (factory-mode wiring drift)
# A mismatch surfaces here, where the operator can act, instead of
# at register() time in a user's wallet where the diagnosis trail
# is invisible.
echo "[5/5] Verifying deployment..."
CA_ROOT=$(cast call "$REGISTRY_ADDR" "caMerkleRoot()(bytes32)" --rpc-url "$RPC_URL" 2>/dev/null)
echo "  caMerkleRoot:                  $CA_ROOT"
PAUSED=$(cast call "$REGISTRY_ADDR" "paused()(bool)" --rpc-url "$RPC_URL" 2>/dev/null)
echo "  paused:                        $PAUSED"

ONCHAIN_FACTORY_VK=$(cast call "$FACTORY_ADDR" "currentProgramVKey()(bytes32)" --rpc-url "$RPC_URL" 2>/dev/null)
ONCHAIN_REGISTRY_VK=$(cast call "$REGISTRY_ADDR" "effectiveProgramVKey()(bytes32)" --rpc-url "$RPC_URL" 2>/dev/null)
echo "  factory.currentProgramVKey:    $ONCHAIN_FACTORY_VK"
echo "  registry.effectiveProgramVKey: $ONCHAIN_REGISTRY_VK"
# Case-insensitive compare keeps EIP-55 checksum vs lowercase output
# from cast from tripping a false-negative.
ELF_LOWER=$(printf '%s' "$ELF_VKEY"             | tr 'A-F' 'a-f')
FACT_LOWER=$(printf '%s' "$ONCHAIN_FACTORY_VK"  | tr 'A-F' 'a-f')
REG_LOWER=$(printf '%s' "$ONCHAIN_REGISTRY_VK"  | tr 'A-F' 'a-f')
if [ "$FACT_LOWER" != "$ELF_LOWER" ] || [ "$REG_LOWER" != "$ELF_LOWER" ]; then
    echo "❌ VK mismatch detected — registration proofs will revert ProofInvalid()."
    echo "    ELF VK (from cargo bin vkey):    $ELF_VKEY"
    echo "    factory.currentProgramVKey:      $ONCHAIN_FACTORY_VK"
    echo "    registry.effectiveProgramVKey:   $ONCHAIN_REGISTRY_VK"
    echo "    Remediation: re-run this script (clears stale state), or"
    echo "    call factory.updateProgramVKey(\$ELF_VKEY) as owner if you"
    echo "    only need to repoint an already-deployed factory."
    exit 1
fi
echo "  ✓ ELF and on-chain VK match"

# Quote values so strict dotenv parsers (and `source`) don't choke
# on SERVICE_NAME containing spaces or punctuation. Embedded
# double-quotes are escaped via printf %q-style fallback.
escape_dotenv() {
    # Replace " with \" so the surrounding double-quotes stay valid.
    printf '%s' "$1" | sed 's/"/\\"/g'
}
# `verify-deployment.sh` reads this file to re-check the live state
# without redeploying — include SP1 verifier address + ELF VK so it
# can assert wiring and VK match without re-running cargo.
{
    printf 'RPC_URL="%s"\n'              "$(escape_dotenv "$RPC_URL")"
    printf 'FACTORY_ADDRESS="%s"\n'      "$(escape_dotenv "$FACTORY_ADDR")"
    printf 'REGISTRY_ADDRESS="%s"\n'     "$(escape_dotenv "$REGISTRY_ADDR")"
    printf 'SP1_VERIFIER_ADDRESS="%s"\n' "$(escape_dotenv "$SP1_VERIFIER_ADDR")"
    printf 'ELF_VKEY="%s"\n'             "$(escape_dotenv "$ELF_VKEY")"
    printf 'DEPLOYER_ADDRESS="%s"\n'     "$(escape_dotenv "$DEPLOYER_ADDR")"
    printf 'DEPLOYER_KEY="%s"\n'         "$(escape_dotenv "$DEPLOYER_KEY")"
    printf 'SERVICE_NAME="%s"\n'         "$(escape_dotenv "$SERVICE_NAME")"
} > .env.shared-anvil

# Keep frontend/.env.local in sync with the freshly-deployed addresses
# so the Next dev server doesn't read stale REGISTRY/FACTORY addresses
# from a previous anvil session (every fresh anvil mints new ones, and
# the frontend's WalletProvider would otherwise hit `0x` on owner() →
# BAD_DATA on every page that depends on the on-chain config).
#
# Opt out with `SYNC_FRONTEND_ENV=0`; override the file location with
# `FRONTEND_ENV_FILE=...`.
SYNC_FRONTEND_ENV="${SYNC_FRONTEND_ENV:-1}"
FRONTEND_ENV_FILE="${FRONTEND_ENV_FILE:-$(pwd)/frontend/.env.local}"
if [ "$SYNC_FRONTEND_ENV" = "1" ] && [ -f "$FRONTEND_ENV_FILE" ]; then
    # Updates only the address lines; leaves any user-added keys
    # (analytics IDs, custom feature flags) untouched. Stage the
    # rewrite next to the target file so the final `mv` is an atomic
    # rename — `mktemp` defaults to /tmp, which may sit on a different
    # filesystem and degrade into copy+unlink (losing the atomicity
    # guarantee and resetting file mode/owner).
    env_dir=$(cd "$(dirname "$FRONTEND_ENV_FILE")" && pwd)
    tmp=$(mktemp "$env_dir/.env.local.XXXXXX")
    # Quote every value through `escape_dotenv` so `source` and strict
    # dotenv parsers don't choke on spaces / `#` / `=` in future values
    # — matches what `.env.shared-anvil` does just above.
    Q_RPC=$(escape_dotenv "$RPC_URL")
    Q_REG=$(escape_dotenv "$REGISTRY_ADDR")
    Q_FAC=$(escape_dotenv "$FACTORY_ADDR")
    Q_SP1=$(escape_dotenv "$SP1_VERIFIER_ADDR")
    awk -v rpc="$Q_RPC" -v reg="$Q_REG" -v fac="$Q_FAC" -v sp1="$Q_SP1" '
        /^NEXT_PUBLIC_RPC_URL=/              { print "NEXT_PUBLIC_RPC_URL=\"" rpc "\"";              seen_rpc=1; next }
        /^NEXT_PUBLIC_REGISTRY_ADDRESS=/     { print "NEXT_PUBLIC_REGISTRY_ADDRESS=\"" reg "\"";     seen_reg=1; next }
        /^NEXT_PUBLIC_FACTORY_ADDRESS=/      { print "NEXT_PUBLIC_FACTORY_ADDRESS=\"" fac "\"";      seen_fac=1; next }
        /^NEXT_PUBLIC_SP1_VERIFIER_ADDRESS=/ { if (sp1 != "") { print "NEXT_PUBLIC_SP1_VERIFIER_ADDRESS=\"" sp1 "\""; seen_sp1=1 } else { print } ; next }
        { print }
        END {
            if (!seen_rpc) print "NEXT_PUBLIC_RPC_URL=\"" rpc "\""
            if (!seen_reg) print "NEXT_PUBLIC_REGISTRY_ADDRESS=\"" reg "\""
            if (!seen_fac) print "NEXT_PUBLIC_FACTORY_ADDRESS=\"" fac "\""
            if (!seen_sp1 && sp1 != "") print "NEXT_PUBLIC_SP1_VERIFIER_ADDRESS=\"" sp1 "\""
        }
    ' "$FRONTEND_ENV_FILE" > "$tmp"
    mv "$tmp" "$FRONTEND_ENV_FILE"
    echo "  Synced frontend env: $FRONTEND_ENV_FILE"
    echo "    NEXT_PUBLIC_RPC_URL=$RPC_URL"
    echo "    NEXT_PUBLIC_REGISTRY_ADDRESS=$REGISTRY_ADDR"
    echo "    NEXT_PUBLIC_FACTORY_ADDRESS=$FACTORY_ADDR"
    [ -n "$SP1_VERIFIER_ADDR" ] && echo "    NEXT_PUBLIC_SP1_VERIFIER_ADDRESS=$SP1_VERIFIER_ADDR"
    echo "  (restart the Next dev server to pick the new values up: bash script/stop-services.sh && bash script/start-services.sh)"
fi

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
