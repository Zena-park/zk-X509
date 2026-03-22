//! ZK X.509 Certificate Verification Program (SP1 Guest)
//!
//! Runs inside the zkVM. Verifies:
//! 1. Certificate chain (user cert → intermediate CAs → root CA)
//! 2. User owns the private key corresponding to the certificate
//! 3. All certificates in the chain are temporally valid
//! 4. Outputs a nullifier (prevents double registration) and CA root hash

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

/// Verify an RSA signature on a certificate's TBS data.
fn verify_rsa_signature(
    tbs_der: &[u8],
    signature_bytes: &[u8],
    sig_alg_oid: &str,
    signer_pub_key: &RsaPublicKey,
) {
    let scheme = match sig_alg_oid {
        "1.2.840.113549.1.1.11" => Pkcs1v15Sign::new::<sha2::Sha256>(),
        "1.2.840.113549.1.1.5" => Pkcs1v15Sign::new::<sha1::Sha1>(),
        "1.2.840.113549.1.1.12" => Pkcs1v15Sign::new::<sha2::Sha384>(),
        "1.2.840.113549.1.1.13" => Pkcs1v15Sign::new::<sha2::Sha512>(),
        _ => panic!("Unsupported signature algorithm: {}", sig_alg_oid),
    };

    let tbs_hash = match sig_alg_oid {
        "1.2.840.113549.1.1.11" => {
            let mut h = sha2::Sha256::new();
            h.update(tbs_der);
            h.finalize().to_vec()
        }
        "1.2.840.113549.1.1.5" => {
            let mut h = <sha1::Sha1 as sha1::Digest>::new();
            sha1::Digest::update(&mut h, tbs_der);
            sha1::Digest::finalize(h).to_vec()
        }
        "1.2.840.113549.1.1.12" => {
            let mut h = sha2::Sha384::new();
            h.update(tbs_der);
            h.finalize().to_vec()
        }
        "1.2.840.113549.1.1.13" => {
            let mut h = sha2::Sha512::new();
            h.update(tbs_der);
            h.finalize().to_vec()
        }
        _ => unreachable!(),
    };

    signer_pub_key
        .verify(scheme, &tbs_hash, signature_bytes)
        .expect("RSA signature verification failed");
}

pub fn main() {
    // ========================================
    // Step 1: Read inputs from the host (prover)
    // ========================================
    let cert_der: Vec<u8> = sp1_zkvm::io::read();
    let user_priv_key: Vec<u8> = sp1_zkvm::io::read();
    // Certificate chain: [intermediate_ca_1, intermediate_ca_2, ..., root_ca_pub_key]
    // For single-level: just [root_ca_pub_key]
    // For Korean NPKI: [intermediate_ca_cert_der, root_ca_pub_key_spki_der]
    let cert_chain: Vec<Vec<u8>> = sp1_zkvm::io::read();
    let current_timestamp: u64 = sp1_zkvm::io::read();

    assert!(!cert_chain.is_empty(), "Certificate chain must not be empty");

    let ts = current_timestamp as i64;

    // ========================================
    // Step 2: Parse the user certificate
    // ========================================
    let (_, user_cert) = X509Certificate::from_der(&cert_der)
        .expect("Failed to parse user certificate");

    // Verify user cert validity period
    assert!(
        ts >= user_cert.validity().not_before.timestamp(),
        "User certificate is not yet valid"
    );
    assert!(
        ts <= user_cert.validity().not_after.timestamp(),
        "User certificate has expired"
    );

    // ========================================
    // Step 3: Verify certificate chain
    // ========================================
    // Walk the chain from user cert up to root CA.
    //
    // Chain layout (cert_chain vec):
    //   - Last element: Root CA public key (SPKI DER, not a full cert)
    //   - Other elements: Intermediate CA certificates (full X.509 DER)
    //
    // Verification order:
    //   user_cert --signed_by--> chain[0] --signed_by--> chain[1] ... --signed_by--> chain[last]
    //
    // For single-level (no intermediates): cert_chain = [root_ca_pub_key]
    //   user_cert --signed_by--> root_ca_pub_key

    let root_ca_pub_key_der = cert_chain.last().unwrap();
    let chain_len = cert_chain.len();

    if chain_len == 1 {
        // Single-level: user cert signed directly by root CA
        let root_pub = RsaPublicKey::from_public_key_der(root_ca_pub_key_der)
            .expect("Failed to parse root CA public key");

        let sig_oid = user_cert.signature_algorithm.algorithm.to_id_string();
        verify_rsa_signature(
            user_cert.tbs_certificate.as_ref(),
            user_cert.signature_value.as_ref(),
            &sig_oid,
            &root_pub,
        );
    } else {
        // Multi-level chain: verify each link
        // First: user_cert signed by chain[0] (first intermediate)
        let (_, first_intermediate) = X509Certificate::from_der(&cert_chain[0])
            .expect("Failed to parse intermediate CA certificate");

        // Verify intermediate cert validity
        assert!(
            ts >= first_intermediate.validity().not_before.timestamp(),
            "Intermediate CA certificate is not yet valid"
        );
        assert!(
            ts <= first_intermediate.validity().not_after.timestamp(),
            "Intermediate CA certificate has expired"
        );

        // Verify user cert was signed by first intermediate
        let intermediate_pub = RsaPublicKey::from_public_key_der(
            first_intermediate.tbs_certificate.subject_pki.raw,
        )
        .expect("Failed to parse intermediate CA public key");

        let sig_oid = user_cert.signature_algorithm.algorithm.to_id_string();
        verify_rsa_signature(
            user_cert.tbs_certificate.as_ref(),
            user_cert.signature_value.as_ref(),
            &sig_oid,
            &intermediate_pub,
        );

        // Verify intermediate chain links (chain[0] signed by chain[1], etc.)
        for i in 0..chain_len - 2 {
            let (_, current_cert) = X509Certificate::from_der(&cert_chain[i])
                .expect("Failed to parse chain certificate");
            let (_, next_cert) = X509Certificate::from_der(&cert_chain[i + 1])
                .expect("Failed to parse next chain certificate");

            // Verify next cert validity
            assert!(
                ts >= next_cert.validity().not_before.timestamp(),
                "Chain certificate is not yet valid"
            );
            assert!(
                ts <= next_cert.validity().not_after.timestamp(),
                "Chain certificate has expired"
            );

            let next_pub = RsaPublicKey::from_public_key_der(
                next_cert.tbs_certificate.subject_pki.raw,
            )
            .expect("Failed to parse chain CA public key");

            let oid = current_cert.signature_algorithm.algorithm.to_id_string();
            verify_rsa_signature(
                current_cert.tbs_certificate.as_ref(),
                current_cert.signature_value.as_ref(),
                &oid,
                &next_pub,
            );
        }

        // Last link: last intermediate signed by root CA public key
        let (_, last_intermediate) = X509Certificate::from_der(&cert_chain[chain_len - 2])
            .expect("Failed to parse last intermediate certificate");

        let root_pub = RsaPublicKey::from_public_key_der(root_ca_pub_key_der)
            .expect("Failed to parse root CA public key");

        let oid = last_intermediate.signature_algorithm.algorithm.to_id_string();
        verify_rsa_signature(
            last_intermediate.tbs_certificate.as_ref(),
            last_intermediate.signature_value.as_ref(),
            &oid,
            &root_pub,
        );
    }

    // ========================================
    // Step 4: Verify ownership (private key matches cert's public key)
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
    // Step 5: Generate Nullifier
    // ========================================
    let serial_bytes = user_cert.tbs_certificate.serial.to_bytes_be();
    let priv_key_hash = Sha256::digest(&user_priv_key);
    let mut nullifier_preimage = Vec::with_capacity(serial_bytes.len() + 32);
    nullifier_preimage.extend_from_slice(&serial_bytes);
    nullifier_preimage.extend_from_slice(&priv_key_hash);
    let nullifier: [u8; 32] = Sha256::digest(&nullifier_preimage).into();

    // ========================================
    // Step 6: Hash the root CA public key
    // ========================================
    let ca_root_hash: [u8; 32] = Sha256::digest(root_ca_pub_key_der).into();

    // ========================================
    // Step 7: Commit public values
    // ========================================
    let bytes = PublicValuesStruct::abi_encode(&PublicValuesStruct {
        nullifier: nullifier.into(),
        caRootHash: ca_root_hash.into(),
        timestamp: current_timestamp,
    });

    sp1_zkvm::io::commit_slice(&bytes);
}
