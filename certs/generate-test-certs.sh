#!/bin/bash
# ============================================================
# Generate test X.509 certificates for zk-X509 development.
#
# Creates:
#   ca.key       - CA private key (RSA 2048)
#   ca.der       - CA certificate (DER format, self-signed)
#   signCert.der - User certificate (DER, signed by CA)
#   signPri.key  - User private key (PKCS#1 DER, unencrypted)
#   signPri.pem  - User private key (PEM, for reference)
#
# Usage:
#   cd certs && bash generate-test-certs.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Generating Test CA ==="

# Generate CA private key
openssl genrsa -out ca.key 2048 2>/dev/null

# Generate self-signed CA certificate (valid for 10 years)
openssl req -new -x509 -key ca.key -out ca.pem -days 3650 \
    -subj "/C=KR/O=Test CA/CN=zk-X509 Test Root CA" 2>/dev/null

# Convert CA cert to DER format
openssl x509 -in ca.pem -outform DER -out ca.der

# Extract CA public key in SubjectPublicKeyInfo (SPKI) DER format
# This is what the ZK program expects for CA signature verification
openssl x509 -in ca.pem -noout -pubkey | \
    openssl pkey -pubin -outform DER -out ca_pub.der

echo "  CA certificate: ca.der"
echo "  CA public key (SPKI): ca_pub.der"

echo ""
echo "=== Generating User Certificate ==="

# Generate user private key
openssl genrsa -out signPri_rsa.key 2048 2>/dev/null

# Create certificate signing request (CSR)
openssl req -new -key signPri_rsa.key -out user.csr \
    -subj "/C=KR/O=Test User/CN=Hong Gildong/serialNumber=testuser001" 2>/dev/null

# Sign the user certificate with the CA (valid for 1 year)
openssl x509 -req -in user.csr -CA ca.pem -CAkey ca.key \
    -CAcreateserial -out signCert.pem -days 365 2>/dev/null

# Convert user cert to DER format
openssl x509 -in signCert.pem -outform DER -out signCert.der

# Convert user private key to PKCS#1 DER format
# (This is the format expected by the ZK program's RSA parser)
openssl rsa -in signPri_rsa.key -outform DER -traditional -out signPri.key 2>/dev/null

# Also save PEM for reference
cp signPri_rsa.key signPri.pem

echo "  User certificate: signCert.der"
echo "  User private key: signPri.key (PKCS#1 DER)"

echo ""
echo "=== Verifying ==="

# Verify the certificate chain
openssl verify -CAfile ca.pem signCert.pem && echo "  Certificate chain: VALID"

# Show certificate info
echo ""
echo "=== Certificate Info ==="
openssl x509 -in signCert.der -inform DER -noout -subject -issuer -serial -dates

echo ""
echo "=== Cleanup temporary files ==="
rm -f user.csr ca.srl signPri_rsa.key

echo ""
echo "Done! Files ready for zk-X509 testing:"
echo "  cargo run --release -- --execute \\"
echo "    --cert certs/signCert.der \\"
echo "    --key certs/signPri.key \\"
echo "    --ca-cert certs/ca_pub.der"
