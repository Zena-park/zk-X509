//! Signature-based ownership proof and nullifier generation.
//!
//! Signs a deterministic challenge with the certificate's private key.
//! Only the signature (not the key) enters the ZK circuit.
//!
//! Nullifier is derived from a deterministic signature of a fixed domain string,
//! ensuring that only the private key holder can compute it (prevents linkability
//! attacks from public key observers).
//!
//! Supports both RSA and ECDSA (P-256, P-384) certificates.

// DecodePrivateKey trait is needed for SigningKey::from_pkcs8_der() on both curves.
// p256 and p384 share the same pkcs8 crate, so importing once covers both.
use p256::pkcs8::DecodePrivateKey as _;
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::RsaPrivateKey;
use sha2::{Digest, Sha256};

/// OID constants for key type detection.
/// String format is fine here (host-side, not zkVM) — readability over cycle savings.
/// The zkVM program (program/src/main.rs) uses raw OID bytes for zero-alloc comparison.
pub const OID_RSA_ENCRYPTION: &str = "1.2.840.113549.1.1.1";
pub const OID_EC_PUBLIC_KEY: &str = "1.2.840.10045.2.1";
pub const OID_PRIME256V1: &str = "1.2.840.10045.3.1.7"; // P-256
pub const OID_SECP384R1: &str = "1.3.132.0.34";         // P-384

use zk_x509_lib::NULLIFIER_DOMAIN;

/// Sign a prehash with the certificate's private key (shared logic).
/// Accepts a pre-parsed cert to avoid redundant DER parsing.
fn sign_with_parsed_cert(
    cert: &x509_parser::certificate::X509Certificate,
    key_der: &[u8],
    prehash: &[u8; 32],
) -> Result<Vec<u8>, String> {
    let alg_oid = cert.tbs_certificate.subject_pki.algorithm.algorithm.to_id_string();

    if alg_oid == OID_EC_PUBLIC_KEY {
        sign_ecdsa_ownership(cert, key_der, prehash)
    } else if alg_oid == OID_RSA_ENCRYPTION {
        sign_rsa_ownership(key_der, prehash)
    } else {
        Err(format!("Unsupported key algorithm: {}", alg_oid))
    }
}

/// Parse cert once, then sign a prehash.
fn parse_and_sign(cert_der: &[u8], key_der: &[u8], prehash: &[u8; 32]) -> Result<Vec<u8>, String> {
    use x509_parser::prelude::FromDer;
    let (_, cert) = x509_parser::certificate::X509Certificate::from_der(cert_der)
        .map_err(|e| format!("Parse cert: {:?}", e))?;
    sign_with_parsed_cert(&cert, key_der, prehash)
}

/// Compute the ownership challenge hash:
///   SHA-256(serial ‖ registrant[20] ‖ wallet_index[u32 BE] ‖ timestamp[u64 BE] ‖ chain_id[u64 BE])
///
/// Shared between file-based signing and keychain signing.
pub fn ownership_challenge_hash(
    cert_der: &[u8],
    registrant: &[u8; 20],
    wallet_index: u32,
    timestamp: u64,
    chain_id: u64,
) -> Result<[u8; 32], String> {
    use x509_parser::prelude::FromDer;
    let (_, cert) = x509_parser::certificate::X509Certificate::from_der(cert_der)
        .map_err(|e| format!("Parse cert: {:?}", e))?;
    let serial = cert.tbs_certificate.serial.to_bytes_be();

    let mut hasher = Sha256::new();
    hasher.update(&serial);
    hasher.update(registrant);
    hasher.update(&wallet_index.to_be_bytes());
    hasher.update(&timestamp.to_be_bytes());
    hasher.update(&chain_id.to_be_bytes());
    Ok(hasher.finalize().into())
}

/// Compute the nullifier challenge hash:
///   SHA-256(NULLIFIER_DOMAIN ‖ registry_address ‖ chain_id)
///
/// Shared between file-based signing and keychain signing.
pub fn nullifier_challenge_hash(
    registry_address: &[u8; 20],
    chain_id: u64,
) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(NULLIFIER_DOMAIN);
    hasher.update(registry_address);
    hasher.update(&chain_id.to_be_bytes());
    hasher.finalize().into()
}

/// Sign the ownership challenge:
///   SHA-256(serial ‖ registrant[20] ‖ wallet_index[u32 BE] ‖ timestamp[u64 BE] ‖ chain_id[u64 BE])
///
/// chain_id (EIP-155) prevents cross-chain replay attacks.
pub fn sign_ownership(
    cert_der: &[u8],
    key_der: &[u8],
    registrant: &[u8; 20],
    wallet_index: u32,
    timestamp: u64,
    chain_id: u64,
) -> Result<Vec<u8>, String> {
    let challenge_hash = ownership_challenge_hash(cert_der, registrant, wallet_index, timestamp, chain_id)?;
    parse_and_sign(cert_der, key_der, &challenge_hash)
}

/// Sign the nullifier domain: H(NULLIFIER_DOMAIN ‖ registry_address ‖ chain_id).
/// registry_address + chain_id ensures cross-DApp and cross-chain nullifier unlinkability.
pub fn sign_nullifier(
    cert_der: &[u8],
    key_der: &[u8],
    registry_address: &[u8; 20],
    chain_id: u64,
) -> Result<Vec<u8>, String> {
    let message_hash = nullifier_challenge_hash(registry_address, chain_id);
    parse_and_sign(cert_der, key_der, &message_hash)
}

/// RSA ownership signing (PKCS#1 v1.5 with SHA-256).
///
/// RsaPrivateKey implements ZeroizeOnDrop (rsa 0.9.10), so key material
/// is zeroized on drop. The key is explicitly dropped immediately after signing.
/// The keychain-based flow (production) never calls this — only test/file-based paths.
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
            drop(sk); // SigningKey implements ZeroizeOnDrop — zeroed on drop
            Ok(sig.to_der().as_bytes().to_vec())
        }
        OID_SECP384R1 => {
            use p384::ecdsa::{SigningKey, signature::hazmat::PrehashSigner};
            let sk = SigningKey::from_pkcs8_der(key_der)
                .map_err(|e| format!("Parse P-384 private key: {}", e))?;
            let sig: p384::ecdsa::Signature = sk.sign_prehash(challenge_hash)
                .map_err(|e| format!("P-384 sign failed: {}", e))?;
            drop(sk); // SigningKey implements ZeroizeOnDrop — zeroed on drop
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

        let sig1 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        let sig2 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        assert_eq!(sig1, sig2, "RSA PKCS#1 v1.5 must be deterministic");
    }

    #[test]
    fn test_sign_ownership_different_registrant() {
        let (cert, key) = load_test_cert_and_key();
        let reg_a = [0xAAu8; 20];
        let reg_b = [0xBBu8; 20];

        let sig_a = sign_ownership(&cert, &key, &reg_a, 0, 1700000000, 31337).unwrap();
        let sig_b = sign_ownership(&cert, &key, &reg_b, 0, 1700000000, 31337).unwrap();
        assert_ne!(sig_a, sig_b, "Different registrants must produce different signatures");
    }

    #[test]
    fn test_sign_ownership_different_wallet_index() {
        let (cert, key) = load_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_0 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        let sig_1 = sign_ownership(&cert, &key, &registrant, 1, 1700000000, 31337).unwrap();
        assert_ne!(sig_0, sig_1, "Different wallet indices must produce different signatures");
    }

    #[test]
    fn test_sign_ownership_different_timestamp() {
        let (cert, key) = load_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_t1 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        let sig_t2 = sign_ownership(&cert, &key, &registrant, 0, 1700000001, 31337).unwrap();
        assert_ne!(sig_t1, sig_t2, "Different timestamps must produce different signatures (replay defense)");
    }

    #[test]
    fn test_sign_ownership_verifiable() {
        use rsa::pkcs8::DecodePublicKey;
        use rsa::RsaPublicKey;

        let (cert, key) = load_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();

        // Verify with the cert's public key
        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&cert).unwrap();
        let pub_key = RsaPublicKey::from_public_key_der(
            parsed.tbs_certificate.subject_pki.raw
        ).unwrap();

        let serial = parsed.tbs_certificate.serial.to_bytes_be();
        let mut hasher = Sha256::new();
        hasher.update(&serial);
        hasher.update(&registrant);
        hasher.update(&0u32.to_be_bytes());
        hasher.update(&1700000000u64.to_be_bytes());
        hasher.update(&31337u64.to_be_bytes());
        let challenge_hash: [u8; 32] = hasher.finalize().into();

        let scheme = rsa::Pkcs1v15Sign::new::<sha2::Sha256>();
        pub_key.verify(scheme, &challenge_hash, &sig)
            .expect("Signature must be verifiable with cert's public key");
    }

    // ===== ECDSA P-256 Tests =====

    #[test]
    fn test_ec_sign_ownership_deterministic() {
        let (cert, key) = load_ec_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig1 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        let sig2 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        assert_eq!(sig1, sig2, "ECDSA with deterministic nonce must be deterministic");
    }

    #[test]
    fn test_ec_sign_ownership_different_registrant() {
        let (cert, key) = load_ec_test_cert_and_key();
        let reg_a = [0xAAu8; 20];
        let reg_b = [0xBBu8; 20];

        let sig_a = sign_ownership(&cert, &key, &reg_a, 0, 1700000000, 31337).unwrap();
        let sig_b = sign_ownership(&cert, &key, &reg_b, 0, 1700000000, 31337).unwrap();
        assert_ne!(sig_a, sig_b, "Different registrants must produce different EC signatures");
    }

    #[test]
    fn test_ec_sign_ownership_different_wallet_index() {
        let (cert, key) = load_ec_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_0 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        let sig_1 = sign_ownership(&cert, &key, &registrant, 1, 1700000000, 31337).unwrap();
        assert_ne!(sig_0, sig_1, "Different wallet indices must produce different EC signatures");
    }

    #[test]
    fn test_ec_sign_ownership_verifiable() {
        use p256::ecdsa::{VerifyingKey, Signature, signature::hazmat::PrehashVerifier};

        let (cert, key) = load_ec_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_bytes = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();

        // Verify with the cert's public key
        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&cert).unwrap();
        let spki_raw = parsed.tbs_certificate.subject_pki.subject_public_key.data;
        let vk = VerifyingKey::from_sec1_bytes(&spki_raw).unwrap();

        let serial = parsed.tbs_certificate.serial.to_bytes_be();
        let mut hasher = Sha256::new();
        hasher.update(&serial);
        hasher.update(&registrant);
        hasher.update(&0u32.to_be_bytes());
        hasher.update(&1700000000u64.to_be_bytes());
        hasher.update(&31337u64.to_be_bytes());
        let challenge_hash: [u8; 32] = hasher.finalize().into();

        let sig = Signature::from_der(&sig_bytes).unwrap();
        vk.verify_prehash(&challenge_hash, &sig)
            .expect("EC signature must be verifiable with cert's public key");
    }

    // ===== ECDSA P-384 Tests =====

    #[test]
    fn test_ec384_sign_ownership_deterministic() {
        let (cert, key) = load_ec384_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig1 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        let sig2 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        assert_eq!(sig1, sig2, "ECDSA P-384 must be deterministic");
    }

    #[test]
    fn test_ec384_sign_ownership_different_wallet_index() {
        let (cert, key) = load_ec384_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_0 = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        let sig_1 = sign_ownership(&cert, &key, &registrant, 1, 1700000000, 31337).unwrap();
        assert_ne!(sig_0, sig_1, "Different wallet indices must produce different EC384 signatures");
    }

    #[test]
    fn test_ec384_sign_ownership_verifiable() {
        use p384::ecdsa::{VerifyingKey, Signature, signature::hazmat::PrehashVerifier};

        let (cert, key) = load_ec384_test_cert_and_key();
        let registrant = [0x70u8; 20];

        let sig_bytes = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();

        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&cert).unwrap();
        let spki_raw = parsed.tbs_certificate.subject_pki.subject_public_key.data;
        let vk = VerifyingKey::from_sec1_bytes(&spki_raw).unwrap();

        let serial = parsed.tbs_certificate.serial.to_bytes_be();
        let mut hasher = Sha256::new();
        hasher.update(&serial);
        hasher.update(&registrant);
        hasher.update(&0u32.to_be_bytes());
        hasher.update(&1700000000u64.to_be_bytes());
        hasher.update(&31337u64.to_be_bytes());
        let challenge_hash: [u8; 32] = hasher.finalize().into();

        let sig = Signature::from_der(&sig_bytes).unwrap();
        vk.verify_prehash(&challenge_hash, &sig)
            .expect("EC384 signature must be verifiable with cert's public key");
    }

    // ===== Nullifier signature tests =====

    #[test]
    fn test_nullifier_sig_deterministic() {
        let (cert, key) = load_test_cert_and_key();
        let sig1 = sign_nullifier(&cert, &key, &[0u8; 20], 31337).unwrap();
        let sig2 = sign_nullifier(&cert, &key, &[0u8; 20], 31337).unwrap();
        assert_eq!(sig1, sig2, "Nullifier signature must be deterministic (RSA)");
    }

    #[test]
    fn test_nullifier_sig_ec_deterministic() {
        let (cert, key) = load_ec_test_cert_and_key();
        let sig1 = sign_nullifier(&cert, &key, &[0u8; 20], 31337).unwrap();
        let sig2 = sign_nullifier(&cert, &key, &[0u8; 20], 31337).unwrap();
        assert_eq!(sig1, sig2, "Nullifier signature must be deterministic (P-256)");
    }

    #[test]
    fn test_nullifier_sig_differs_from_ownership() {
        let (cert, key) = load_test_cert_and_key();
        let registrant = [0x70u8; 20];
        let ownership = sign_ownership(&cert, &key, &registrant, 0, 1700000000, 31337).unwrap();
        let nullifier = sign_nullifier(&cert, &key, &[0u8; 20], 31337).unwrap();
        assert_ne!(ownership, nullifier, "Nullifier sig must differ from ownership sig");
    }

    #[test]
    fn test_nullifier_sig_independent_of_registrant() {
        let (cert, key) = load_ec_test_cert_and_key();
        // sign_nullifier doesn't take registrant — same cert always produces same sig
        let sig = sign_nullifier(&cert, &key, &[0u8; 20], 31337).unwrap();
        // Compare with a second call — still same (no registrant dependency)
        let sig2 = sign_nullifier(&cert, &key, &[0u8; 20], 31337).unwrap();
        assert_eq!(sig, sig2);
    }
}
