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
use rsa::pkcs8::DecodePublicKey;
use rsa::{Pkcs1v15Sign, RsaPublicKey};
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
    // Signature-based ownership: host signs a challenge with the private key,
    // only the signature enters the ZK circuit. Private key never touches zkVM.
    let ownership_sig: Vec<u8> = sp1_zkvm::io::read();
    // Chain: [intermediate_ca_certs..., root_ca_pub_key_spki_der]
    // Single-level: [root_ca_pub_key_spki_der]
    let cert_chain: Vec<Vec<u8>> = sp1_zkvm::io::read();
    let current_timestamp: u64 = sp1_zkvm::io::read();
    // CRL: DER-encoded Certificate Revocation List (empty Vec = skip).
    // When provided, the ZK program verifies the CRL's CA signature
    // and checks the user cert serial is not revoked.
    let crl_der: Vec<u8> = sp1_zkvm::io::read();
    // Wallet address that will call register() — binds proof to a specific sender
    let registrant: [u8; 20] = sp1_zkvm::io::read();
    // Wallet index for multi-wallet registration (0 for single-wallet mode)
    let wallet_index: u32 = sp1_zkvm::io::read();
    // Max wallets per cert (verified inside ZK circuit)
    let max_wallets: u32 = sp1_zkvm::io::read();

    assert!(!cert_chain.is_empty(), "Certificate chain must not be empty");
    assert!(wallet_index < max_wallets, "wallet_index must be < max_wallets");

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

    // Parse root CA public key once (reused in chain verification + CRL verification)
    let root_pub = RsaPublicKey::from_public_key_der(root_ca_pub_key_der)
        .expect("Failed to parse root CA public key");

    // Verify user_cert → first signer
    if intermediates.is_empty() {
        // Single-level: root CA directly signed user cert
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
    // The CRL is verified inside the zkVM:
    //   1. Parse the DER-encoded CRL
    //   2. Assert CRL issuer == user cert issuer (serial numbers are issuer-scoped)
    //   3. Validate CRL freshness (thisUpdate/nextUpdate)
    //   4. Verify the CRL's RSA signature using the matching issuer key
    //   5. Check the user cert serial is not in the revoked list
    if !crl_der.is_empty() {
        let (_, crl) = x509_parser::revocation_list::CertificateRevocationList::from_der(&crl_der)
            .expect("Failed to parse CRL");

        // CRL issuer must match the issuer of the user certificate.
        // CRL serial numbers are issuer-scoped: checking a cert's serial
        // against a CRL from a different issuer is meaningless.
        let crl_issuer = crl.issuer();
        let user_issuer = user_cert.issuer();
        assert!(
            crl_issuer == user_issuer,
            "CRL issuer does not match user certificate issuer"
        );

        // Validate CRL freshness: thisUpdate <= timestamp <= nextUpdate
        let crl_this_update = crl.tbs_cert_list.this_update.timestamp();
        assert!(
            crl_this_update <= ts,
            "CRL is not yet valid at the provided timestamp"
        );
        if let Some(next_update) = crl.tbs_cert_list.next_update {
            assert!(
                ts <= next_update.timestamp(),
                "CRL has expired at the provided timestamp"
            );
        }

        // Verify CRL signature using the user cert's issuer key.
        // For multi-level chains: intermediates[0] is the user cert issuer.
        // For single-level: root CA is the issuer.
        let crl_sig_oid = crl.signature_algorithm.algorithm.to_id_string();

        if let Some(issuer_cert) = intermediates.iter()
            .find(|cert| cert.subject() == crl_issuer)
        {
            let issuer_pub = RsaPublicKey::from_public_key_der(
                issuer_cert.tbs_certificate.subject_pki.raw,
            ).expect("Failed to parse CRL issuer public key");
            verify_rsa_signature(
                crl.tbs_cert_list.as_ref(),
                crl.signature_value.as_ref(),
                &crl_sig_oid,
                &issuer_pub,
            );
        } else {
            // Single-level: CRL signed by root CA. Verify issuer name matches.
            let expected_root_name = user_cert.issuer();
            assert!(
                crl_issuer == expected_root_name,
                "CRL issuer does not match root CA"
            );
            verify_rsa_signature(
                crl.tbs_cert_list.as_ref(),
                crl.signature_value.as_ref(),
                &crl_sig_oid,
                &root_pub,
            );
        }

        // Check user cert serial is not revoked
        let user_serial = user_cert.tbs_certificate.serial.to_bytes_be();
        for revoked in crl.iter_revoked_certificates() {
            assert!(
                user_serial != revoked.raw_serial(),
                "Certificate has been revoked"
            );
        }
    }

    // ========================================
    // Step 5: Verify ownership (signature-based)
    // ========================================
    // Host signs challenge = SHA-256(serial ‖ registrant ‖ wallet_index).
    // ZK circuit verifies signature using the cert's public key.
    // Private key never enters the ZK circuit.
    let serial_bytes = user_cert.tbs_certificate.serial.to_bytes_be();

    let cert_pub_key = RsaPublicKey::from_public_key_der(
        user_cert.tbs_certificate.subject_pki.raw,
    )
    .expect("Failed to parse certificate's public key");

    let mut ownership_preimage = Vec::with_capacity(serial_bytes.len() + 20 + 4);
    ownership_preimage.extend_from_slice(&serial_bytes);
    ownership_preimage.extend_from_slice(&registrant);
    ownership_preimage.extend_from_slice(&wallet_index.to_be_bytes());
    let ownership_hash: [u8; 32] = Sha256::digest(&ownership_preimage).into();

    cert_pub_key
        .verify(Pkcs1v15Sign::new::<sha2::Sha256>(), &ownership_hash, &ownership_sig)
        .expect("Ownership signature verification failed");

    // ========================================
    // Step 6: Generate Nullifier
    // ========================================
    // Nullifier = SHA-256(cert_public_key_der ‖ wallet_index)
    //
    // Uses the certificate's public key (already CA-verified) instead of a signature.
    // Same cert = same public key = same nullifier, regardless of registrant.
    // No additional RSA operation needed — saves ~5.7M cycles.
    let cert_pub_key_raw = user_cert.tbs_certificate.subject_pki.raw;
    let mut nullifier_preimage = Vec::with_capacity(cert_pub_key_raw.len() + 4);
    nullifier_preimage.extend_from_slice(cert_pub_key_raw);
    nullifier_preimage.extend_from_slice(&wallet_index.to_be_bytes());
    let nullifier: [u8; 32] = Sha256::digest(&nullifier_preimage).into();

    // ========================================
    // Step 7: Hash the root CA public key
    // ========================================
    let ca_root_hash: [u8; 32] = Sha256::digest(root_ca_pub_key_der).into();

    // ========================================
    // Step 8: Commit public values
    // ========================================
    // alloy_sol_types re-exports Address from alloy-primitives via `private` module.
    // Using this path ensures version compatibility with the sol! macro output.
    let registrant_addr = alloy_sol_types::private::Address::from_slice(&registrant);

    // Extract certificate expiry as unix timestamp
    let not_after = user_cert.validity().not_after.timestamp() as u64;

    let bytes = PublicValuesStruct::abi_encode(&PublicValuesStruct {
        nullifier: nullifier.into(),
        caRootHash: ca_root_hash.into(),
        timestamp: current_timestamp,
        registrant: registrant_addr,
        walletIndex: wallet_index,
        notAfter: not_after,
    });

    sp1_zkvm::io::commit_slice(&bytes);
}
