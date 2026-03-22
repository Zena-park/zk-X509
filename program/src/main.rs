//! ZK X.509 Certificate Verification Program (SP1 Guest)
//!
//! Runs inside the zkVM. Verifies:
//! 1. Certificate chain (user cert → intermediate CAs → root CA)
//! 2. User owns the private key corresponding to the certificate
//! 3. All certificates in the chain are temporally valid
//! 4. Certificate is not in the revocation list (CRL)
//! 5. Outputs a nullifier (prevents double registration) and CA root hash

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

/// Resolve hash algorithm OID to scheme + hash function, then verify RSA signature.
fn verify_rsa_signature(
    tbs_der: &[u8],
    signature_bytes: &[u8],
    sig_alg_oid: &str,
    signer_pub_key: &RsaPublicKey,
) {
    let (scheme, tbs_hash) = match sig_alg_oid {
        "1.2.840.113549.1.1.11" => (
            Pkcs1v15Sign::new::<sha2::Sha256>(),
            Sha256::digest(tbs_der).to_vec(),
        ),
        "1.2.840.113549.1.1.5" => (
            Pkcs1v15Sign::new::<sha1::Sha1>(),
            sha1::Sha1::digest(tbs_der).to_vec(),
        ),
        "1.2.840.113549.1.1.12" => (
            Pkcs1v15Sign::new::<sha2::Sha384>(),
            sha2::Sha384::digest(tbs_der).to_vec(),
        ),
        "1.2.840.113549.1.1.13" => (
            Pkcs1v15Sign::new::<sha2::Sha512>(),
            sha2::Sha512::digest(tbs_der).to_vec(),
        ),
        _ => panic!("Unsupported signature algorithm: {}", sig_alg_oid),
    };

    signer_pub_key
        .verify(scheme, &tbs_hash, signature_bytes)
        .expect("RSA signature verification failed");
}

/// Check that a certificate's validity period covers the given timestamp.
fn assert_cert_valid_at(cert: &X509Certificate, ts: i64, label: &str) {
    assert!(
        ts >= cert.validity().not_before.timestamp(),
        "{} is not yet valid", label
    );
    assert!(
        ts <= cert.validity().not_after.timestamp(),
        "{} has expired", label
    );
}

pub fn main() {
    // ========================================
    // Step 1: Read inputs from the host (prover)
    // ========================================
    let cert_der: Vec<u8> = sp1_zkvm::io::read();
    let user_priv_key: Vec<u8> = sp1_zkvm::io::read();
    // Chain: [intermediate_ca_certs..., root_ca_pub_key_spki_der]
    // Single-level: [root_ca_pub_key_spki_der]
    let cert_chain: Vec<Vec<u8>> = sp1_zkvm::io::read();
    let current_timestamp: u64 = sp1_zkvm::io::read();
    // CRL: revoked serial numbers (empty = skip). Host is responsible for
    // providing an authentic CRL; the ZK proof attests that the serial was
    // not in *this specific list*. The CRL hash is NOT committed to public
    // values, so on-chain consumers should verify CRL freshness separately.
    let revoked_serials: Vec<Vec<u8>> = sp1_zkvm::io::read();
    // Wallet address that will call register() — binds proof to a specific sender
    let registrant: [u8; 20] = sp1_zkvm::io::read();

    assert!(!cert_chain.is_empty(), "Certificate chain must not be empty");

    let ts = current_timestamp as i64;

    // ========================================
    // Step 2: Parse the user certificate
    // ========================================
    let (_, user_cert) = X509Certificate::from_der(&cert_der)
        .expect("Failed to parse user certificate");

    assert_cert_valid_at(&user_cert, ts, "User certificate");

    // ========================================
    // Step 3: Verify certificate chain
    // ========================================
    // Unified chain verification loop. Avoids duplicate parsing.
    //
    // `signers[i]` verifies `subjects[i]`:
    //   subjects = [user_cert, chain[0], chain[1], ..., chain[n-2]]
    //   signers  = [chain[0],  chain[1], ..., chain[n-2], chain[n-1] (root pub key)]

    let root_ca_pub_key_der = cert_chain.last().unwrap();
    let chain_len = cert_chain.len();

    // Parse all intermediate certs once
    let intermediates: Vec<X509Certificate> = cert_chain[..chain_len - 1]
        .iter()
        .enumerate()
        .map(|(i, der)| {
            let (_, cert) = X509Certificate::from_der(der)
                .unwrap_or_else(|_| panic!("Failed to parse chain certificate [{}]", i));
            assert_cert_valid_at(&cert, ts, "Chain certificate");
            cert
        })
        .collect();

    // Verify user_cert → first signer
    if intermediates.is_empty() {
        // Single-level: root CA directly signed user cert
        let root_pub = RsaPublicKey::from_public_key_der(root_ca_pub_key_der)
            .expect("Failed to parse root CA public key");
        let oid = user_cert.signature_algorithm.algorithm.to_id_string();
        verify_rsa_signature(
            user_cert.tbs_certificate.as_ref(),
            user_cert.signature_value.as_ref(),
            &oid,
            &root_pub,
        );
    } else {
        // user_cert signed by intermediates[0]
        let first_pub = RsaPublicKey::from_public_key_der(
            intermediates[0].tbs_certificate.subject_pki.raw,
        ).expect("Failed to parse intermediate CA [0] public key");
        let oid = user_cert.signature_algorithm.algorithm.to_id_string();
        verify_rsa_signature(
            user_cert.tbs_certificate.as_ref(),
            user_cert.signature_value.as_ref(),
            &oid,
            &first_pub,
        );

        // intermediates[i] signed by intermediates[i+1]
        for i in 0..intermediates.len() - 1 {
            let next_pub = RsaPublicKey::from_public_key_der(
                intermediates[i + 1].tbs_certificate.subject_pki.raw,
            ).unwrap_or_else(|_| panic!("Failed to parse intermediate CA [{}] public key", i + 1));
            let oid = intermediates[i].signature_algorithm.algorithm.to_id_string();
            verify_rsa_signature(
                intermediates[i].tbs_certificate.as_ref(),
                intermediates[i].signature_value.as_ref(),
                &oid,
                &next_pub,
            );
        }

        // Last intermediate signed by root CA
        let root_pub = RsaPublicKey::from_public_key_der(root_ca_pub_key_der)
            .expect("Failed to parse root CA public key");
        let last = intermediates.last().unwrap();
        let oid = last.signature_algorithm.algorithm.to_id_string();
        verify_rsa_signature(
            last.tbs_certificate.as_ref(),
            last.signature_value.as_ref(),
            &oid,
            &root_pub,
        );
    }

    // ========================================
    // Step 4: Check certificate revocation (CRL)
    // ========================================
    // Placed AFTER chain verification so we only check revocation for
    // certificates whose authenticity has been proven.
    if !revoked_serials.is_empty() {
        let user_serial = user_cert.tbs_certificate.serial.to_bytes_be();
        for revoked in &revoked_serials {
            assert!(
                user_serial != revoked.as_slice(),
                "Certificate has been revoked"
            );
        }
    }

    // ========================================
    // Step 5: Verify ownership (private key matches cert's public key)
    // ========================================
    let priv_key = RsaPrivateKey::from_pkcs1_der(&user_priv_key)
        .expect("Failed to parse RSA private key");

    let derived_pub_key = RsaPublicKey::from(&priv_key);

    let cert_pub_key = RsaPublicKey::from_public_key_der(
        user_cert.tbs_certificate.subject_pki.raw,
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
    // Step 6: Generate Nullifier
    // ========================================
    let serial_bytes = user_cert.tbs_certificate.serial.to_bytes_be();
    let priv_key_hash = Sha256::digest(&user_priv_key);
    let mut nullifier_preimage = Vec::with_capacity(serial_bytes.len() + 32);
    nullifier_preimage.extend_from_slice(&serial_bytes);
    nullifier_preimage.extend_from_slice(&priv_key_hash);
    let nullifier: [u8; 32] = Sha256::digest(&nullifier_preimage).into();

    // ========================================
    // Step 7: Hash the root CA public key
    // ========================================
    let ca_root_hash: [u8; 32] = Sha256::digest(root_ca_pub_key_der).into();

    // ========================================
    // Step 8: Commit public values
    // ========================================
    // Convert [u8; 20] to alloy Address type
    let registrant_addr = alloy_sol_types::private::Address::from_slice(&registrant);

    let bytes = PublicValuesStruct::abi_encode(&PublicValuesStruct {
        nullifier: nullifier.into(),
        caRootHash: ca_root_hash.into(),
        timestamp: current_timestamp,
        registrant: registrant_addr,
    });

    sp1_zkvm::io::commit_slice(&bytes);
}
