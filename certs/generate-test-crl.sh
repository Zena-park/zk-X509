#!/bin/bash
# Generate a test CRL signed by the test CA for zk-X509 testing.
#
# Prerequisites: run generate-test-certs.sh first (needs ca.key and ca.pem)
#
# Creates:
#   test_crl.der - CRL with one revoked serial (not our test cert)
#   test_crl_revoked.der - CRL that contains our test cert's serial

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f ca.key ] || [ ! -f ca.pem ]; then
    echo "Error: ca.key and ca.pem not found. Run generate-test-certs.sh first."
    exit 1
fi

# Get the serial number of our test user cert
USER_SERIAL=$(openssl x509 -in signCert.pem -noout -serial | cut -d= -f2)
echo "User cert serial: $USER_SERIAL"

# Create an OpenSSL CA database
> index.txt
echo "01" > crlnumber

cat > ca.cnf << 'CNFEOF'
[ca]
default_ca = CA_default

[CA_default]
database = index.txt
crlnumber = crlnumber
default_md = sha256
default_crl_days = 30
CNFEOF

# Use dummy serials that cannot collide with the user cert serial
DUMMY_SERIAL_1="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
DUMMY_SERIAL_2="BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"

# Generate CRL with a dummy revoked cert (not our user cert)
echo "=== CRL with unrelated revoked cert ==="
echo "V	350101000000Z		${DUMMY_SERIAL_1}	unknown	/CN=dummy" > index.txt
echo "R	350101000000Z	260101000000Z	${DUMMY_SERIAL_2}	unknown	/CN=revoked-other" >> index.txt
openssl ca -gencrl -keyfile ca.key -cert ca.pem -config ca.cnf -out test_crl.pem
openssl crl -in test_crl.pem -outform DER -out test_crl.der
echo "  test_crl.der ($(wc -c < test_crl.der) bytes) — user cert NOT revoked"

# Generate CRL that revokes our user cert
echo "=== CRL with user cert revoked ==="
echo "V	350101000000Z		${DUMMY_SERIAL_1}	unknown	/CN=dummy" > index.txt
echo "R	350101000000Z	260101000000Z	${USER_SERIAL}	unknown	/CN=revoked-user" >> index.txt
openssl ca -gencrl -keyfile ca.key -cert ca.pem -config ca.cnf -out test_crl_revoked.pem
openssl crl -in test_crl_revoked.pem -outform DER -out test_crl_revoked.der
echo "  test_crl_revoked.der ($(wc -c < test_crl_revoked.der) bytes) — user cert IS revoked"

# Cleanup
rm -f index.txt* crlnumber* ca.cnf *.pem.old test_crl.pem test_crl_revoked.pem

echo ""
echo "Test commands:"
echo "  # Should PASS (user cert not in CRL):"
echo "  cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \\"
echo "    --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \\"
echo "    --registrant 0x0000000000000000000000000000000000000001 --crl certs/test_crl.der"
echo ""
echo "  # Should FAIL (user cert IS revoked):"
echo "  cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \\"
echo "    --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \\"
echo "    --registrant 0x0000000000000000000000000000000000000001 --crl certs/test_crl_revoked.der"
