//! Signature-based ownership proof.
//!
//! Signs a deterministic challenge with the certificate's private key.
//! Only the signature (not the key) enters the ZK circuit.
//! Nullifier is derived from the cert's public key (no signature needed).

use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::RsaPrivateKey;
use sha2::{Digest, Sha256};

/// Sign the ownership challenge: SHA-256(cert_serial ‖ registrant ‖ wallet_index)
///
/// RSA PKCS#1 v1.5 is deterministic.
pub fn sign_ownership(
    cert_der: &[u8],
    key_der: &[u8],
    registrant: &[u8; 20],
    wallet_index: u32,
) -> Result<Vec<u8>, String> {
    use x509_parser::prelude::FromDer;
    let (_, cert) = x509_parser::certificate::X509Certificate::from_der(cert_der)
        .map_err(|e| format!("Parse cert: {:?}", e))?;
    let serial = cert.tbs_certificate.serial.to_bytes_be();

    let mut preimage = Vec::with_capacity(serial.len() + 20 + 4);
    preimage.extend_from_slice(&serial);
    preimage.extend_from_slice(registrant);
    preimage.extend_from_slice(&wallet_index.to_be_bytes());
    let challenge_hash: [u8; 32] = Sha256::digest(&preimage).into();

    let mut priv_key = RsaPrivateKey::from_pkcs1_der(key_der)
        .map_err(|e| format!("Parse private key: {}", e))?;
    let scheme = rsa::Pkcs1v15Sign::new::<sha2::Sha256>();
    let signature = priv_key.sign(scheme, &challenge_hash)
        .map_err(|e| format!("Sign failed: {}", e))?;
    // priv_key dropped here. Note: Rust's default drop does NOT zero memory.
    // For production, consider using a custom allocator or mlock+madvise.
    // The rsa crate's ZeroizeOnDrop (if enabled) would handle this automatically.
    drop(priv_key);

    Ok(signature)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_test_cert_and_key() -> (Vec<u8>, Vec<u8>) {
        // Tests run from workspace root, but certs are relative to project root
        let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let cert = std::fs::read(base.join("certs/signCert.der"))
            .expect("Run certs/generate-test-certs.sh first");
        let key = std::fs::read(base.join("certs/signPri.key"))
            .expect("Run certs/generate-test-certs.sh first");
        (cert, key)
    }

    #[test]
    fn test_sign_ownership_deterministic() {
        let (cert, key) = load_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig1 = sign_ownership(&cert, &key, &registrant, 0).unwrap();
        let sig2 = sign_ownership(&cert, &key, &registrant, 0).unwrap();
        assert_eq!(sig1, sig2, "RSA PKCS#1 v1.5 must be deterministic");
    }

    #[test]
    fn test_sign_ownership_different_registrant() {
        let (cert, key) = load_test_cert_and_key();
        let reg_a = [0xAAu8; 20];
        let reg_b = [0xBBu8; 20];

        let sig_a = sign_ownership(&cert, &key, &reg_a, 0).unwrap();
        let sig_b = sign_ownership(&cert, &key, &reg_b, 0).unwrap();
        assert_ne!(sig_a, sig_b, "Different registrants must produce different signatures");
    }

    #[test]
    fn test_sign_ownership_different_wallet_index() {
        let (cert, key) = load_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_0 = sign_ownership(&cert, &key, &registrant, 0).unwrap();
        let sig_1 = sign_ownership(&cert, &key, &registrant, 1).unwrap();
        assert_ne!(sig_0, sig_1, "Different wallet indices must produce different signatures");
    }

    #[test]
    fn test_sign_ownership_verifiable() {
        use rsa::pkcs8::DecodePublicKey;
        use rsa::RsaPublicKey;

        let (cert, key) = load_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig = sign_ownership(&cert, &key, &registrant, 0).unwrap();

        // Verify with the cert's public key
        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&cert).unwrap();
        let pub_key = RsaPublicKey::from_public_key_der(
            parsed.tbs_certificate.subject_pki.raw
        ).unwrap();

        let serial = parsed.tbs_certificate.serial.to_bytes_be();
        let mut preimage = Vec::with_capacity(serial.len() + 20 + 4);
        preimage.extend_from_slice(&serial);
        preimage.extend_from_slice(&registrant);
        preimage.extend_from_slice(&0u32.to_be_bytes());
        let challenge_hash: [u8; 32] = Sha256::digest(&preimage).into();

        let scheme = rsa::Pkcs1v15Sign::new::<sha2::Sha256>();
        pub_key.verify(scheme, &challenge_hash, &sig)
            .expect("Signature must be verifiable with cert's public key");
    }
}
