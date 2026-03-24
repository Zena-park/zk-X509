#!/bin/bash
# ============================================================
# Generate test X.509 certificates for zk-X509 development.
#
# Creates (RSA):
#   ca.key       - CA private key (RSA 2048)
#   ca.der       - CA certificate (DER format, self-signed)
#   signCert.der - User certificate (DER, signed by CA)
#   signPri.key  - User private key (PKCS#1 DER, unencrypted)
#   signPri.pem  - User private key (PEM, for reference)
#
# Creates (ECDSA P-256):
#   ec_ca.key        - EC CA private key (P-256)
#   ec_ca.der        - EC CA certificate (DER, self-signed)
#   ec_ca_pub.der    - EC CA public key (SPKI DER)
#   ec_signCert.der  - EC user certificate (DER, signed by EC CA)
#   ec_signPri.key   - EC user private key (PKCS#8 DER)
#
# Creates (ECDSA P-384):
#   ec384_ca.key        - EC CA private key (P-384)
#   ec384_ca.der        - EC CA certificate (DER, self-signed)
#   ec384_ca_pub.der    - EC CA public key (SPKI DER)
#   ec384_signCert.der  - EC user certificate (DER, signed by EC CA)
#   ec384_signPri.key   - EC user private key (PKCS#8 DER)
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
echo "=== Generating ECDSA P-256 CA ==="

# Generate EC CA private key (P-256)
openssl ecparam -genkey -name prime256v1 -noout -out ec_ca.key 2>/dev/null

# Generate self-signed EC CA certificate (valid for 10 years)
openssl req -new -x509 -key ec_ca.key -out ec_ca.pem -days 3650 \
    -subj "/C=KR/O=Test EC CA/CN=zk-X509 Test EC Root CA" 2>/dev/null

# Convert EC CA cert to DER
openssl x509 -in ec_ca.pem -outform DER -out ec_ca.der

# Extract EC CA public key (SPKI DER)
openssl x509 -in ec_ca.pem -noout -pubkey | \
    openssl pkey -pubin -outform DER -out ec_ca_pub.der

echo "  EC CA certificate: ec_ca.der"
echo "  EC CA public key (SPKI): ec_ca_pub.der"

echo ""
echo "=== Generating ECDSA P-256 User Certificate ==="

# Generate EC user private key (P-256)
openssl ecparam -genkey -name prime256v1 -noout -out ec_signPri_raw.key 2>/dev/null

# Create CSR
openssl req -new -key ec_signPri_raw.key -out ec_user.csr \
    -subj "/C=KR/O=Test EC User/CN=Kim Cheolsu/serialNumber=ecuser001" 2>/dev/null

# Sign with EC CA
openssl x509 -req -in ec_user.csr -CA ec_ca.pem -CAkey ec_ca.key \
    -CAcreateserial -out ec_signCert.pem -days 365 2>/dev/null

# Convert to DER
openssl x509 -in ec_signCert.pem -outform DER -out ec_signCert.der

# Convert private key to PKCS#8 DER (standard format for EC keys)
openssl pkcs8 -topk8 -nocrypt -in ec_signPri_raw.key -outform DER -out ec_signPri.key

echo "  EC User certificate: ec_signCert.der"
echo "  EC User private key: ec_signPri.key (PKCS#8 DER)"

# Verify EC certificate chain
openssl verify -CAfile ec_ca.pem ec_signCert.pem && echo "  EC Certificate chain: VALID"

echo ""
echo "=== Generating ECDSA P-384 CA ==="

# Generate EC CA private key (P-384)
openssl ecparam -genkey -name secp384r1 -noout -out ec384_ca.key 2>/dev/null

# Generate self-signed EC CA certificate (explicit -sha384)
openssl req -new -x509 -key ec384_ca.key -out ec384_ca.pem -days 3650 \
    -subj "/C=KR/O=Test EC384 CA/CN=zk-X509 Test EC384 Root CA" -sha384 2>/dev/null

# Convert to DER
openssl x509 -in ec384_ca.pem -outform DER -out ec384_ca.der

# Extract public key (SPKI DER)
openssl x509 -in ec384_ca.pem -noout -pubkey | \
    openssl pkey -pubin -outform DER -out ec384_ca_pub.der

echo "  EC384 CA certificate: ec384_ca.der"
echo "  EC384 CA public key (SPKI): ec384_ca_pub.der"

echo ""
echo "=== Generating ECDSA P-384 User Certificate ==="

# Generate EC user private key (P-384)
openssl ecparam -genkey -name secp384r1 -noout -out ec384_signPri_raw.key 2>/dev/null

# Create CSR
openssl req -new -key ec384_signPri_raw.key -out ec384_user.csr \
    -subj "/C=KR/O=Test EC384 User/CN=Park Minsoo/serialNumber=ec384user001" 2>/dev/null

# Sign with EC384 CA (explicit -sha384 to ensure ecdsa-with-SHA384 OID)
openssl x509 -req -in ec384_user.csr -CA ec384_ca.pem -CAkey ec384_ca.key \
    -CAcreateserial -out ec384_signCert.pem -days 365 -sha384 2>/dev/null

# Convert to DER
openssl x509 -in ec384_signCert.pem -outform DER -out ec384_signCert.der

# Convert private key to PKCS#8 DER
openssl pkcs8 -topk8 -nocrypt -in ec384_signPri_raw.key -outform DER -out ec384_signPri.key

echo "  EC384 User certificate: ec384_signCert.der"
echo "  EC384 User private key: ec384_signPri.key (PKCS#8 DER)"

# Verify EC384 certificate chain
openssl verify -CAfile ec384_ca.pem ec384_signCert.pem && echo "  EC384 Certificate chain: VALID"

echo ""
echo "=== Cleanup temporary files ==="
rm -f user.csr ca.srl signPri_rsa.key
rm -f ec_user.csr ec_ca.srl ec_signPri_raw.key ec_ca.pem ec_signCert.pem
rm -f ec384_user.csr ec384_ca.srl ec384_signPri_raw.key ec384_ca.pem ec384_signCert.pem

echo ""
echo "=== Generating CRL (auto, keeps in sync with CA) ==="
bash "$SCRIPT_DIR/generate-test-crl.sh"

echo ""
echo "Done! Files ready for zk-X509 testing:"
echo "  RSA:      cargo run --release -- --execute --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der"
echo "  EC P-256: cargo run --release -- --execute --cert certs/ec_signCert.der --key certs/ec_signPri.key --ca-cert certs/ec_ca_pub.der"
echo "  EC P-384: cargo run --release -- --execute --cert certs/ec384_signCert.der --key certs/ec384_signPri.key --ca-cert certs/ec384_ca_pub.der"
