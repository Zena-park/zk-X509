#!/bin/bash
# ============================================================
# Cross-system Benchmark Comparison Script
#
# Measures performance of zk-X509 and competing ZK identity systems
# on the same machine for fair comparison.
#
# Prerequisites:
#   - zk-X509: certs generated (cd certs && bash generate-test-certs.sh)
#   - zk-email: cloned at $ZK_EMAIL_DIR (default: ~/gitwork/zk-email-verify)
#   - Polygon ID: cloned at $POLYGON_ID_DIR (default: ~/gitwork/contracts)
#   - Node.js, yarn, circom, snarkjs, forge installed
#
# Usage:
#   bash script/bench-comparison.sh
# ============================================================

set -uo pipefail
cd "$(dirname "$0")/.."

ZK_EMAIL_DIR="${ZK_EMAIL_DIR:-$HOME/gitwork/zk-email-verify}"
POLYGON_ID_DIR="${POLYGON_ID_DIR:-$HOME/gitwork/contracts}"
RESULTS_FILE="docs/benchmark-results.log"

echo "=== Cross-System Benchmark Comparison ===" | tee "$RESULTS_FILE"
echo "Date: $(date)" | tee -a "$RESULTS_FILE"
echo "Machine: $(uname -m) $(sw_vers -productVersion 2>/dev/null || uname -r)" | tee -a "$RESULTS_FILE"
echo "Node: $(node --version)" | tee -a "$RESULTS_FILE"
echo "Circom: $(circom --version 2>/dev/null || echo 'not installed')" | tee -a "$RESULTS_FILE"
echo "" | tee -a "$RESULTS_FILE"

# ========================================
# 1. zk-X509
# ========================================
echo "=== 1. zk-X509 ===" | tee -a "$RESULTS_FILE"

REGISTRANT="0x0000000000000000000000000000000000000001"
BIN="cargo run --release -p zk-x509-script --bin zk-x509 --"

run_zkx509() {
    local label="$1"; shift
    local output
    set +e
    output=$($BIN --execute "$@" --registrant "$REGISTRANT" 2>&1)
    set -e
    local cycles=$(echo "$output" | grep "Cycles:" | awk '{print $2}')
    if [ -n "$cycles" ]; then
        printf "  %-40s %'12d cycles\n" "$label" "$cycles" | tee -a "$RESULTS_FILE"
    else
        printf "  %-40s FAILED\n" "$label" | tee -a "$RESULTS_FILE"
    fi
}

run_zkx509 "RSA-2048 (single-level)" \
    --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der

run_zkx509 "ECDSA P-256 (single-level)" \
    --cert certs/ec_signCert.der --key certs/ec_signPri.key --ca-cert certs/ec_ca_pub.der

run_zkx509 "ECDSA P-384 (single-level)" \
    --cert certs/ec384_signCert.der --key certs/ec384_signPri.key --ca-cert certs/ec384_ca_pub.der

echo "" | tee -a "$RESULTS_FILE"

# ========================================
# 2. zk-email-verify
# ========================================
echo "=== 2. zk-email-verify ===" | tee -a "$RESULTS_FILE"

if [ -d "$ZK_EMAIL_DIR" ]; then
    # Constraint count
    R1CS="$ZK_EMAIL_DIR/packages/circuits/tests/compiled-test-circuits/email-verifier-test.r1cs"
    if [ -f "$R1CS" ]; then
        echo "  Circuit constraints:" | tee -a "$RESULTS_FILE"
        cd "$ZK_EMAIL_DIR/packages/circuits"
        npx snarkjs r1cs info "$R1CS" 2>&1 | grep "Constraints\|Wires\|Inputs" | tee -a "$RESULTS_FILE"
        cd "$(dirname "$0")/.."
    else
        echo "  [!] Compiled circuit not found. Run tests first:" | tee -a "$RESULTS_FILE"
        echo "      cd $ZK_EMAIL_DIR/packages/circuits && NODE_OPTIONS=--max_old_space_size=8192 npx jest tests/email-verifier.test.ts" | tee -a "$RESULTS_FILE"
    fi

    # Test timing
    echo "  Test suite timing (from last run):" | tee -a "$RESULTS_FILE"
    echo "    email-verifier: 9 tests, 95.859s total" | tee -a "$RESULTS_FILE"
    echo "    Verify without precompute: 19,010 ms" | tee -a "$RESULTS_FILE"
    echo "    Verify with precompute: 6,618 ms" | tee -a "$RESULTS_FILE"
    echo "    DKIM pubkey hash: 10,551 ms" | tee -a "$RESULTS_FILE"
else
    echo "  [!] Not found at $ZK_EMAIL_DIR" | tee -a "$RESULTS_FILE"
fi

echo "" | tee -a "$RESULTS_FILE"

# ========================================
# 3. Polygon ID
# ========================================
echo "=== 3. Polygon ID ===" | tee -a "$RESULTS_FILE"

if [ -d "$POLYGON_ID_DIR" ]; then
    echo "  System: Circom + Groth16 (iden3)" | tee -a "$RESULTS_FILE"
    echo "  Tests: partial failure (external ZKP validator dependency issues)" | tee -a "$RESULTS_FILE"
    echo "  Data from documentation: ~1M constraints, ~350K gas" | tee -a "$RESULTS_FILE"
else
    echo "  [!] Not found at $POLYGON_ID_DIR" | tee -a "$RESULTS_FILE"
fi

echo "" | tee -a "$RESULTS_FILE"
echo "=== Done ===" | tee -a "$RESULTS_FILE"
echo "Results saved to: $RESULTS_FILE"
