//! ZK X.509 Certificate Verification Program (SP1 Guest)
//!
//! Runs inside the zkVM. Verifies:
//! 1. X.509 certificate is validly signed by a trusted CA
//! 2. User owns the private key corresponding to the certificate
//! 3. Outputs a nullifier (prevents double registration) and CA hash

#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::SolType;
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::pkcs8::DecodePublicKey;
use rsa::traits::PublicKeyParts;
use rsa::{Pkcs1v15Sign, RsaPrivateKey, RsaPublicKey};
use sha2::{Digest, Sha256};
use x509_parser::prelude::*;
use zk_x509_lib::PublicValuesStruct;

pub fn main() {
    // ========================================
    // Step 1: Read inputs from the host (prover)
    // ========================================
    let cert_der: Vec<u8> = sp1_zkvm::io::read();
    let user_priv_key: Vec<u8> = sp1_zkvm::io::read();
    let ca_pub_key: Vec<u8> = sp1_zkvm::io::read();
    let current_timestamp: u64 = sp1_zkvm::io::read();

    // ========================================
    // Step 2: Parse the X.509 certificate
    // ========================================
    let (_, cert) = X509Certificate::from_der(&cert_der)
        .expect("Failed to parse X.509 certificate");

    // ========================================
    // Step 2.5: Verify certificate validity period
    // ========================================
    let not_before = cert.validity().not_before.timestamp();
    let not_after = cert.validity().not_after.timestamp();
    let ts = current_timestamp as i64;

    assert!(ts >= not_before, "Certificate is not yet valid");
    assert!(ts <= not_after, "Certificate has expired");

    // ========================================
    // Step 3: Verify CA signature on the certificate
    // ========================================
    // Parse the CA public key from SPKI DER format.
    // We use the `rsa` crate (pure Rust) instead of x509-parser's
    // verify_signature() which depends on `ring` (incompatible with zkVM).
    let ca_rsa_pub = RsaPublicKey::from_public_key_der(&ca_pub_key)
        .expect("Failed to parse CA public key");

    // The TBS (To Be Signed) certificate data that was signed by the CA
    let tbs_der = cert.tbs_certificate.as_ref();
    let signature_bytes = cert.signature_value.as_ref();

    // Determine the signature scheme from the algorithm OID
    let sig_alg_oid = cert.signature_algorithm.algorithm.to_id_string();
    let scheme = match sig_alg_oid.as_str() {
        // sha256WithRSAEncryption
        "1.2.840.113549.1.1.11" => Pkcs1v15Sign::new::<sha2::Sha256>(),
        // sha1WithRSAEncryption (legacy, still common in Korean NPKI)
        "1.2.840.113549.1.1.5" => Pkcs1v15Sign::new::<sha1::Sha1>(),
        // sha384WithRSAEncryption
        "1.2.840.113549.1.1.12" => Pkcs1v15Sign::new::<sha2::Sha384>(),
        // sha512WithRSAEncryption
        "1.2.840.113549.1.1.13" => Pkcs1v15Sign::new::<sha2::Sha512>(),
        _ => panic!("Unsupported signature algorithm: {}", sig_alg_oid),
    };

    // Hash the TBS data with the appropriate algorithm and verify
    let tbs_hash = match sig_alg_oid.as_str() {
        "1.2.840.113549.1.1.11" => {
            let mut hasher = sha2::Sha256::new();
            hasher.update(tbs_der);
            hasher.finalize().to_vec()
        }
        "1.2.840.113549.1.1.5" => {
            let mut hasher = <sha1::Sha1 as sha1::Digest>::new();
            sha1::Digest::update(&mut hasher, tbs_der);
            sha1::Digest::finalize(hasher).to_vec()
        }
        "1.2.840.113549.1.1.12" => {
            let mut hasher = sha2::Sha384::new();
            hasher.update(tbs_der);
            hasher.finalize().to_vec()
        }
        "1.2.840.113549.1.1.13" => {
            let mut hasher = sha2::Sha512::new();
            hasher.update(tbs_der);
            hasher.finalize().to_vec()
        }
        _ => unreachable!(),
    };

    ca_rsa_pub
        .verify(scheme, &tbs_hash, signature_bytes)
        .expect("CA signature verification failed");

    // ========================================
    // Step 4: Verify ownership (private key matches cert's public key)
    // ========================================
    let priv_key = RsaPrivateKey::from_pkcs1_der(&user_priv_key)
        .expect("Failed to parse RSA private key");

    let derived_pub_key = RsaPublicKey::from(&priv_key);

    let cert_pub_key = RsaPublicKey::from_public_key_der(
            cert.tbs_certificate.subject_pki.raw
        )
        .expect("Failed to parse certificate's public key");

    assert_eq!(
        derived_pub_key.n(), cert_pub_key.n(),
        "Private key does not match certificate's public key"
    );
    assert_eq!(
        derived_pub_key.e(), cert_pub_key.e(),
        "Private key exponent does not match"
    );

    // ========================================
    // Step 5: Generate Nullifier from certificate serial + private key
    // ========================================
    // Include private key hash to prevent brute-force of predictable serial numbers.
    // An attacker who knows the serial range cannot reverse the nullifier without the key.
    let serial_bytes = cert.tbs_certificate.serial.to_bytes_be();
    let priv_key_hash = Sha256::digest(&user_priv_key);
    let mut nullifier_preimage = Vec::with_capacity(serial_bytes.len() + 32);
    nullifier_preimage.extend_from_slice(&serial_bytes);
    nullifier_preimage.extend_from_slice(&priv_key_hash);
    let nullifier: [u8; 32] = Sha256::digest(&nullifier_preimage).into();

    // ========================================
    // Step 6: Hash the CA public key (to identify the issuing authority)
    // ========================================
    let ca_root_hash: [u8; 32] = Sha256::digest(&ca_pub_key).into();

    // ========================================
    // Step 7: Commit public values (only these go on-chain)
    // ========================================
    let bytes = PublicValuesStruct::abi_encode(&PublicValuesStruct {
        nullifier: nullifier.into(),
        caRootHash: ca_root_hash.into(),
        timestamp: current_timestamp,
    });

    sp1_zkvm::io::commit_slice(&bytes);
}
