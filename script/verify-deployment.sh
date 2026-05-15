#!/bin/bash
# ============================================================
# Standalone health check for a zk-X509 deployment on anvil.
#
# Re-runnable in isolation from `deploy-on-existing-anvil.sh` —
# verifies the same invariants that script asserts at the end of
# Step 5 plus a few wiring-level ones that only matter outside the
# atomic deploy:
#
#   1. SP1 Groth16 circuit cache populated at the expected version
#   2. ELF VK (from `cargo run --bin vkey`) matches the snapshot in
#      .env.shared-anvil — catches an ELF rebuild that landed after
#      deploy
#   3. factory.currentProgramVKey()      == ELF VK
#   4. registry.effectiveProgramVKey()   == ELF VK
#   5. registry.factory()                == FACTORY_ADDRESS
#      (factory-mode wiring; without this, effectiveProgramVKey
#      reads stale `PROGRAM_V_KEY` baked at registry init time)
#   6. registry.caMerkleRoot()           != 0
#   7. registry.paused()                 == false
#
# Returns 0 on all-pass, 1 on first failure. Each check prints a
# one-line remediation hint so the failure is actionable without
# digging into source.
#
# Usage:
#   bash script/verify-deployment.sh
#   bash script/verify-deployment.sh --quick        # skip SP1 cache + cargo
#   bash script/verify-deployment.sh --rebuild-vk   # recompute ELF VK
#   REGISTRY_ADDRESS=0x... bash script/verify-deployment.sh
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

QUICK=0
REBUILD_VK=0
while [ $# -gt 0 ]; do
    case "$1" in
        --quick)       QUICK=1; shift ;;
        --rebuild-vk)  REBUILD_VK=1; shift ;;
        -h|--help)
            sed -n '2,/^$/p' "$0" | sed 's/^# \?//' >&2
            exit 0
            ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

ENV_FILE=".env.shared-anvil"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ $ENV_FILE not found — run script/deploy-on-existing-anvil.sh first."
    exit 1
fi
# Parse `.env.shared-anvil` as data, not code. `source` would evaluate
# arbitrary shell — and the same file holds the deployer private key,
# so an attacker who can write it can already steal funds, but giving
# them straight-up RCE on every verify run widens blast radius for
# free. The grep is conservative: ignores comments, blank lines, and
# anything that doesn't look like `KEY="…"` so a corrupted file fails
# the strict assertions below instead of mis-binding.
parse_env() {
    local key="$1"
    awk -v k="$key" '
        $0 ~ "^[[:space:]]*"k"=" {
            sub("^[[:space:]]*"k"=", "")
            # Strip optional surrounding double-quotes.
            sub(/^"/, ""); sub(/"$/, "")
            print
            exit
        }
    ' "$ENV_FILE"
}
RPC_URL="$(parse_env RPC_URL)"
FACTORY_ADDRESS="$(parse_env FACTORY_ADDRESS)"
REGISTRY_ADDRESS="$(parse_env REGISTRY_ADDRESS)"
SP1_VERIFIER_ADDRESS="$(parse_env SP1_VERIFIER_ADDRESS)"
ELF_VKEY="$(parse_env ELF_VKEY)"
SERVICE_NAME="$(parse_env SERVICE_NAME)"
SP1_VERSION="${SP1_VERSION:-$(parse_env SP1_VERSION)}"

# Caller can pin to a non-default registry from the same factory
# without editing .env.shared-anvil — used by scatter-dex's swap
# script to verify a specific target before mutating IdentityGate.
REGISTRY_ADDRESS="${REGISTRY_ADDRESS_OVERRIDE:-$REGISTRY_ADDRESS}"

# Required fields — fail fast with the actual missing key in the
# message so a partial / hand-edited env file surfaces clearly.
: "${RPC_URL:?missing RPC_URL in $ENV_FILE}"
: "${FACTORY_ADDRESS:?missing FACTORY_ADDRESS in $ENV_FILE}"
: "${REGISTRY_ADDRESS:?missing REGISTRY_ADDRESS in $ENV_FILE}"

echo "=== zk-X509 deployment verify ==="
echo "  RPC:       $RPC_URL"
echo "  Factory:   $FACTORY_ADDRESS"
echo "  Registry:  $REGISTRY_ADDRESS"
echo "  Mode:      $([ "$QUICK" = 1 ] && echo 'quick (skip SP1 cache + cargo)' || echo 'full')"
echo ""

# Lowercase a hex string for case-insensitive bytes32/address compare.
# `cast` output mixes EIP-55 checksum case (for addresses) with all-
# lowercase (for bytes32); naive `=` comparisons false-fail on the
# former. tr handles both shapes uniformly.
lower() {
    printf '%s' "$1" | tr 'A-F' 'a-f'
}

fail() {
    # First arg is the headline error; remaining args are remediation
    # hints, each on its own line. Passing as separate args instead of
    # embedding `\n` in one string — bash's `echo` doesn't interpret
    # backslash escapes by default, so the previous one-string design
    # printed `\n` as a literal two-character sequence and made the
    # mismatch message a blob.
    echo "  ❌ $1"
    shift
    while [ $# -gt 0 ]; do
        echo "     → $1"
        shift
    done
    exit 1
}

# ── 1. SP1 Groth16 circuit cache ───────────────────────────
if [ "$QUICK" = 0 ]; then
    echo "[1/7] SP1 ${SP1_VERSION:-v6.0.0} circuit cache..."
    SP1_VERSION="${SP1_VERSION:-v6.0.0}"
    SP1_CACHE_DIR="${HOME}/.sp1/circuits/groth16/${SP1_VERSION}"
    for f in groth16_pk.bin groth16_vk.bin groth16_circuit.bin Groth16Verifier.sol SP1VerifierGroth16.sol; do
        if [ ! -s "$SP1_CACHE_DIR/$f" ]; then
            fail "Missing/empty: $SP1_CACHE_DIR/$f" \
                 "Run \`cargo run --release --bin vkey\` once to populate."
        fi
    done
    echo "  ✓ cache present at $SP1_CACHE_DIR"
else
    echo "[1/7] SP1 cache check skipped (--quick)"
fi

# ── 2. ELF VK (from cargo + ELF snapshot in .env) ──────────
# Two sources to cross-check:
#   - `$ELF_VKEY` snapshot from .env.shared-anvil (written at deploy)
#   - `cargo run --bin vkey` live (catches ELF rebuilds since deploy)
echo "[2/7] ELF VK..."
ENV_VKEY="${ELF_VKEY:-}"
if [ -z "$ENV_VKEY" ]; then
    fail "ELF_VKEY not in $ENV_FILE" \
         "Older deploys didn't snapshot it — re-run deploy-on-existing-anvil.sh."
fi
echo "  snapshot from .env.shared-anvil: $ENV_VKEY"

LIVE_VKEY=""
if [ "$QUICK" = 0 ] || [ "$REBUILD_VK" = 1 ]; then
    echo "  Recomputing live ELF VK via 'cargo run --release --bin vkey'..."
    VK_OUT=$(cargo run --release --bin vkey --quiet 2>&1)
    LIVE_VKEY=$(printf '%s\n' "$VK_OUT" | awk '/Verification Key:/ {print $NF; exit}')
    if [ -z "$LIVE_VKEY" ] || [[ ! "$LIVE_VKEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
        # Pre-format the cargo tail so newlines come out naturally
        # when echoed line-by-line by fail().
        VK_TAIL=$(printf '%s\n' "$VK_OUT" | tail -10)
        fail "vkey binary didn't print a usable VK" \
             "Tail of cargo output:" \
             "$VK_TAIL"
    fi
    if [ "$(lower "$LIVE_VKEY")" != "$(lower "$ENV_VKEY")" ]; then
        fail "Live ELF VK differs from .env snapshot (ELF rebuilt since deploy)" \
             "Live:     $LIVE_VKEY" \
             "Snapshot: $ENV_VKEY" \
             "Redeploy with script/deploy-on-existing-anvil.sh, or call" \
             "factory.updateProgramVKey(\$LIVE) as owner."
    fi
    echo "  ✓ live VK matches snapshot"
fi
# Anchor downstream comparisons on the live value when we have it,
# otherwise fall back to the snapshot.
EXPECTED_VKEY="${LIVE_VKEY:-$ENV_VKEY}"

# Helper: run a `cast call`, return value on success, or fail() with
# the captured stderr included. Without this, a reverted call was
# diagnosed as "call reverted" with no clue *why* it reverted —
# Gemini review on PR #125. The `2>&1` capture is then split: if the
# call exited 0 the merged output is the bytes32/address answer; if
# it exited non-zero, it's the foundry error message verbatim.
cast_call_or_fail() {
    local _addr="$1" _sig="$2" _label="$3" _hint="$4"
    set +e
    local _out
    _out=$(cast call "$_addr" "$_sig" --rpc-url "$RPC_URL" 2>&1)
    local _status=$?
    set -e
    if [ "$_status" -ne 0 ]; then
        fail "$_label call failed" \
             "cast error: $_out" \
             "$_hint"
    fi
    printf '%s' "$_out"
}

# ── 3. factory.currentProgramVKey() ────────────────────────
echo "[3/7] factory.currentProgramVKey()..."
FACT_VK=$(cast_call_or_fail "$FACTORY_ADDRESS" "currentProgramVKey()(bytes32)" \
    "factory.currentProgramVKey()" \
    "Factory may not be a RegistryFactory: $FACTORY_ADDRESS")
echo "  $FACT_VK"
if [ "$(lower "$FACT_VK")" != "$(lower "$EXPECTED_VKEY")" ]; then
    fail "factory VK ≠ ELF VK" \
         "factory.updateProgramVKey($EXPECTED_VKEY) as owner, then re-verify."
fi
echo "  ✓ matches ELF VK"

# ── 4. registry.effectiveProgramVKey() ─────────────────────
echo "[4/7] registry.effectiveProgramVKey()..."
REG_VK=$(cast_call_or_fail "$REGISTRY_ADDRESS" "effectiveProgramVKey()(bytes32)" \
    "registry.effectiveProgramVKey()" \
    "Address is not an IdentityRegistry proxy: $REGISTRY_ADDRESS")
echo "  $REG_VK"
if [ "$(lower "$REG_VK")" != "$(lower "$EXPECTED_VKEY")" ]; then
    fail "registry effective VK ≠ ELF VK" \
         "If in factory mode this auto-tracks the factory — check Step 5 below."
fi
echo "  ✓ matches ELF VK"

# ── 5. registry.factory() wiring ───────────────────────────
echo "[5/7] registry.factory()..."
REG_FACTORY=$(cast_call_or_fail "$REGISTRY_ADDRESS" "factory()(address)" \
    "registry.factory()" \
    "Older non-factory-mode registries lack this getter.")
echo "  $REG_FACTORY"
if [ "$(lower "$REG_FACTORY")" != "$(lower "$FACTORY_ADDRESS")" ]; then
    fail "registry.factory() ≠ deployed factory ($FACTORY_ADDRESS)" \
         "Registry was created by a different factory — VK updates here won't propagate."
fi
echo "  ✓ wired to factory"

# ── 6. registry.caMerkleRoot() ─────────────────────────────
echo "[6/7] registry.caMerkleRoot()..."
CA_ROOT=$(cast_call_or_fail "$REGISTRY_ADDRESS" "caMerkleRoot()(bytes32)" \
    "registry.caMerkleRoot()" \
    "Registry proxy may be uninitialized or paused.")
echo "  $CA_ROOT"
ZERO_BYTES32="0x0000000000000000000000000000000000000000000000000000000000000000"
if [ "$(lower "$CA_ROOT")" = "$ZERO_BYTES32" ]; then
    fail "caMerkleRoot is zero — every register() will revert" \
         "Add a CA with: cast send \$REGISTRY 'addCA(bytes32)' \$CA_HASH …"
fi
echo "  ✓ non-zero"

# ── 7. registry.paused() ───────────────────────────────────
echo "[7/7] registry.paused()..."
PAUSED=$(cast_call_or_fail "$REGISTRY_ADDRESS" "paused()(bool)" \
    "registry.paused()" \
    "Registry proxy may be uninitialized.")
echo "  $PAUSED"
if [ "$PAUSED" = "true" ]; then
    fail "Registry is paused — register()/unregister() reject" \
         "cast send \$REGISTRY 'unpause()' as owner."
fi
echo "  ✓ unpaused"

echo ""
echo "=== ALL CHECKS PASSED ==="
echo "  ELF VK:                       $EXPECTED_VKEY"
echo "  factory.currentProgramVKey:   $FACT_VK"
echo "  registry.effectiveProgramVKey:$REG_VK"
echo "  registry.factory:             $REG_FACTORY"
echo "  registry.caMerkleRoot:        $CA_ROOT"
echo "  registry.paused:              $PAUSED"
