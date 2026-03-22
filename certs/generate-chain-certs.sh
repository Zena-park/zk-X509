#!/bin/bash
# ============================================================
# Generate 3-level certificate chain for zk-X509 testing.
#
# Chain: Root CA → Intermediate CA → User Certificate
# (Mimics Korean NPKI: Root CA → 금융결제원 CA → User)
#
# Creates:
#   chain/root_ca_pub.der      - Root CA public key (SPKI DER)
#   chain/intermediate_ca.der  - Intermediate CA cert (full X.509 DER)
#   chain/signCert.der         - User cert (DER)
#   chain/signPri.key          - User private key (PKCS#1 DER)
# ============================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$SCRIPT_DIR/chain"
cd "$SCRIPT_DIR/chain"

echo "=== 1. Root CA ==="
openssl genrsa -out root_ca.key 2048 2>/dev/null
openssl req -new -x509 -key root_ca.key -out root_ca.pem -days 3650 \
    -subj "/C=KR/O=KISA/CN=zk-X509 Test Root CA" 2>/dev/null
openssl x509 -in root_ca.pem -noout -pubkey | \
    openssl pkey -pubin -outform DER -out root_ca_pub.der
echo "  root_ca_pub.der ($(wc -c < root_ca_pub.der) bytes)"

echo "=== 2. Intermediate CA ==="
openssl genrsa -out intermediate_ca.key 2048 2>/dev/null
openssl req -new -key intermediate_ca.key -out intermediate_ca.csr \
    -subj "/C=KR/O=KFTC/CN=zk-X509 Test Intermediate CA" 2>/dev/null
openssl x509 -req -in intermediate_ca.csr -CA root_ca.pem -CAkey root_ca.key \
    -CAcreateserial -out intermediate_ca.pem -days 1825 \
    -extfile <(echo "basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign") 2>/dev/null
openssl x509 -in intermediate_ca.pem -outform DER -out intermediate_ca.der
echo "  intermediate_ca.der ($(wc -c < intermediate_ca.der) bytes)"

echo "=== 3. User Certificate ==="
openssl genrsa -out user.key 2048 2>/dev/null
openssl req -new -key user.key -out user.csr \
    -subj "/C=KR/O=Test Bank/CN=Kim Cheolsu/serialNumber=testuser002" 2>/dev/null
openssl x509 -req -in user.csr -CA intermediate_ca.pem -CAkey intermediate_ca.key \
    -CAcreateserial -out signCert.pem -days 365 2>/dev/null
openssl x509 -in signCert.pem -outform DER -out signCert.der
openssl rsa -in user.key -outform DER -traditional -out signPri.key 2>/dev/null
echo "  signCert.der ($(wc -c < signCert.der) bytes)"
echo "  signPri.key ($(wc -c < signPri.key) bytes)"

echo "=== 4. Verify Chain ==="
openssl verify -CAfile root_ca.pem -untrusted intermediate_ca.pem signCert.pem

echo ""
echo "=== Cleanup ==="
rm -f *.csr *.srl root_ca.key intermediate_ca.key user.key *.pem

echo ""
echo "Test command (3-level chain):"
echo "  cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \\"
echo "    --cert certs/chain/signCert.der \\"
echo "    --key certs/chain/signPri.key \\"
echo "    --ca-cert certs/chain/root_ca_pub.der \\"
echo "    --intermediate certs/chain/intermediate_ca.der"
