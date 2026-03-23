#!/bin/bash
# ============================================================
# zk-X509 Cycle Benchmark Script
#
# Measures SP1 zkVM cycle counts for all supported configurations.
# Requires: test certs generated (certs/generate-test-certs.sh)
#
# Usage:
#   bash script/bench.sh
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

REGISTRANT="0x0000000000000000000000000000000000000001"
BIN="cargo run --release -p zk-x509-script --bin zk-x509 --"

echo "=== zk-X509 Cycle Benchmarks ==="
echo "SP1 zkVM execute mode"
echo ""

run_bench() {
    local label="$1"
    shift
    local cycles
    cycles=$($BIN --execute "$@" --registrant "$REGISTRANT" 2>&1 | grep "Cycles:" | awk '{print $2}')
    if [ -n "$cycles" ]; then
        printf "%-45s %'12d cycles\n" "$label" "$cycles"
    else
        printf "%-45s FAILED\n" "$label"
    fi
}

# RSA-2048
run_bench "RSA-2048 (full disclosure)" \
    --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der

run_bench "RSA-2048 (no disclosure)" \
    --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der --disclosure-mask 0

run_bench "RSA-2048 + CRL" \
    --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der --crl certs/test_crl.der

# ECDSA P-256
run_bench "ECDSA P-256 (full disclosure)" \
    --cert certs/ec_signCert.der --key certs/ec_signPri.key --ca-cert certs/ec_ca_pub.der

# ECDSA P-384
run_bench "ECDSA P-384 (full disclosure)" \
    --cert certs/ec384_signCert.der --key certs/ec384_signPri.key --ca-cert certs/ec384_ca_pub.der

echo ""
echo "Done."
