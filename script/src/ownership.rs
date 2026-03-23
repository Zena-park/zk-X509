//! Signature-based ownership proof.
//!
//! Signs a deterministic challenge with the certificate's private key.
//! Only the signature (not the key) enters the ZK circuit.
//! Nullifier is derived from the cert's public key (no signature needed).
//!
//! Supports both RSA and ECDSA (P-256, P-384) certificates.

use p256::pkcs8::DecodePrivateKey as _;
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::RsaPrivateKey;
use sha2::{Digest, Sha256};

/// OID constants for key type detection
const OID_EC_PUBLIC_KEY: &str = "1.2.840.10045.2.1";
const OID_PRIME256V1: &str = "1.2.840.10045.3.1.7"; // P-256
const OID_SECP384R1: &str = "1.3.132.0.34";         // P-384

/// Sign the ownership challenge: SHA-256(cert_serial ‖ registrant ‖ wallet_index)
///
/// Detects key type from certificate (RSA or ECDSA) and signs accordingly.
/// RSA PKCS#1 v1.5 and ECDSA are both deterministic.
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

    let alg_oid = cert.tbs_certificate.subject_pki.algorithm.algorithm.to_id_string();

    if alg_oid == OID_EC_PUBLIC_KEY {
        sign_ecdsa_ownership(&cert, key_der, &challenge_hash)
    } else {
        sign_rsa_ownership(key_der, &challenge_hash)
    }
}

/// RSA ownership signing (PKCS#1 v1.5 with SHA-256).
fn sign_rsa_ownership(key_der: &[u8], challenge_hash: &[u8; 32]) -> Result<Vec<u8>, String> {
    let priv_key = RsaPrivateKey::from_pkcs1_der(key_der)
        .map_err(|e| format!("Parse RSA private key: {}", e))?;
    let scheme = rsa::Pkcs1v15Sign::new::<sha2::Sha256>();
    let signature = priv_key.sign(scheme, challenge_hash)
        .map_err(|e| format!("RSA sign failed: {}", e))?;
    drop(priv_key);
    Ok(signature)
}

/// ECDSA ownership signing. Detects curve from certificate, signs with PKCS#8 DER key.
fn sign_ecdsa_ownership(
    cert: &x509_parser::certificate::X509Certificate,
    key_der: &[u8],
    challenge_hash: &[u8; 32],
) -> Result<Vec<u8>, String> {
    let curve_oid = cert.tbs_certificate.subject_pki.algorithm
        .parameters.as_ref()
        .and_then(|p| p.as_oid().ok())
        .map(|oid| oid.to_id_string())
        .unwrap_or_default();

    match curve_oid.as_str() {
        OID_PRIME256V1 => {
            use p256::ecdsa::{SigningKey, signature::hazmat::PrehashSigner};
            let sk = SigningKey::from_pkcs8_der(key_der)
                .map_err(|e| format!("Parse P-256 private key: {}", e))?;
            let sig: p256::ecdsa::Signature = sk.sign_prehash(challenge_hash)
                .map_err(|e| format!("P-256 sign failed: {}", e))?;
            Ok(sig.to_der().as_bytes().to_vec())
        }
        OID_SECP384R1 => {
            use p384::ecdsa::{SigningKey, signature::hazmat::PrehashSigner};
            let sk = SigningKey::from_pkcs8_der(key_der)
                .map_err(|e| format!("Parse P-384 private key: {}", e))?;
            let sig: p384::ecdsa::Signature = sk.sign_prehash(challenge_hash)
                .map_err(|e| format!("P-384 sign failed: {}", e))?;
            Ok(sig.to_der().as_bytes().to_vec())
        }
        _ => Err(format!("Unsupported EC curve: {}", curve_oid)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load_test_cert_and_key() -> (Vec<u8>, Vec<u8>) {
        let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let cert = std::fs::read(base.join("certs/signCert.der"))
            .expect("Run certs/generate-test-certs.sh first");
        let key = std::fs::read(base.join("certs/signPri.key"))
            .expect("Run certs/generate-test-certs.sh first");
        (cert, key)
    }

    fn load_ec_test_cert_and_key() -> (Vec<u8>, Vec<u8>) {
        let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let cert = std::fs::read(base.join("certs/ec_signCert.der"))
            .expect("Run certs/generate-test-certs.sh first (ECDSA P-256)");
        let key = std::fs::read(base.join("certs/ec_signPri.key"))
            .expect("Run certs/generate-test-certs.sh first (ECDSA P-256)");
        (cert, key)
    }

    fn load_ec384_test_cert_and_key() -> (Vec<u8>, Vec<u8>) {
        let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let cert = std::fs::read(base.join("certs/ec384_signCert.der"))
            .expect("Run certs/generate-test-certs.sh first (ECDSA P-384)");
        let key = std::fs::read(base.join("certs/ec384_signPri.key"))
            .expect("Run certs/generate-test-certs.sh first (ECDSA P-384)");
        (cert, key)
    }

    // ===== RSA Tests =====

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

    // ===== ECDSA P-256 Tests =====

    #[test]
    fn test_ec_sign_ownership_deterministic() {
        let (cert, key) = load_ec_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig1 = sign_ownership(&cert, &key, &registrant, 0).unwrap();
        let sig2 = sign_ownership(&cert, &key, &registrant, 0).unwrap();
        assert_eq!(sig1, sig2, "ECDSA with deterministic nonce must be deterministic");
    }

    #[test]
    fn test_ec_sign_ownership_different_registrant() {
        let (cert, key) = load_ec_test_cert_and_key();
        let reg_a = [0xAAu8; 20];
        let reg_b = [0xBBu8; 20];

        let sig_a = sign_ownership(&cert, &key, &reg_a, 0).unwrap();
        let sig_b = sign_ownership(&cert, &key, &reg_b, 0).unwrap();
        assert_ne!(sig_a, sig_b, "Different registrants must produce different EC signatures");
    }

    #[test]
    fn test_ec_sign_ownership_verifiable() {
        use p256::ecdsa::{VerifyingKey, Signature, signature::hazmat::PrehashVerifier};

        let (cert, key) = load_ec_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_bytes = sign_ownership(&cert, &key, &registrant, 0).unwrap();

        // Verify with the cert's public key
        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&cert).unwrap();
        let spki_raw = parsed.tbs_certificate.subject_pki.subject_public_key.data;
        let vk = VerifyingKey::from_sec1_bytes(&spki_raw).unwrap();

        let serial = parsed.tbs_certificate.serial.to_bytes_be();
        let mut preimage = Vec::with_capacity(serial.len() + 20 + 4);
        preimage.extend_from_slice(&serial);
        preimage.extend_from_slice(&registrant);
        preimage.extend_from_slice(&0u32.to_be_bytes());
        let challenge_hash: [u8; 32] = Sha256::digest(&preimage).into();

        let sig = Signature::from_der(&sig_bytes).unwrap();
        vk.verify_prehash(&challenge_hash, &sig)
            .expect("EC signature must be verifiable with cert's public key");
    }

    // ===== ECDSA P-384 Tests =====

    #[test]
    fn test_ec384_sign_ownership_deterministic() {
        let (cert, key) = load_ec384_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig1 = sign_ownership(&cert, &key, &registrant, 0).unwrap();
        let sig2 = sign_ownership(&cert, &key, &registrant, 0).unwrap();
        assert_eq!(sig1, sig2, "ECDSA P-384 must be deterministic");
    }

    #[test]
    fn test_ec384_sign_ownership_verifiable() {
        use p384::ecdsa::{VerifyingKey, Signature, signature::hazmat::PrehashVerifier};

        let (cert, key) = load_ec384_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_bytes = sign_ownership(&cert, &key, &registrant, 0).unwrap();

        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&cert).unwrap();
        let spki_raw = parsed.tbs_certificate.subject_pki.subject_public_key.data;
        let vk = VerifyingKey::from_sec1_bytes(&spki_raw).unwrap();

        let serial = parsed.tbs_certificate.serial.to_bytes_be();
        let mut preimage = Vec::with_capacity(serial.len() + 20 + 4);
        preimage.extend_from_slice(&serial);
        preimage.extend_from_slice(&registrant);
        preimage.extend_from_slice(&0u32.to_be_bytes());
        let challenge_hash: [u8; 32] = Sha256::digest(&preimage).into();

        let sig = Signature::from_der(&sig_bytes).unwrap();
        vk.verify_prehash(&challenge_hash, &sig)
            .expect("EC384 signature must be verifiable with cert's public key");
    }
}
