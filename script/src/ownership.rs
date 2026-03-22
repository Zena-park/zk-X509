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

    let mut preimage = Vec::new();
    preimage.extend_from_slice(&serial);
    preimage.extend_from_slice(registrant);
    preimage.extend_from_slice(&wallet_index.to_be_bytes());
    let challenge_hash: [u8; 32] = Sha256::digest(&preimage).into();

    let priv_key = RsaPrivateKey::from_pkcs1_der(key_der)
        .map_err(|e| format!("Parse private key: {}", e))?;
    let scheme = rsa::Pkcs1v15Sign::new::<sha2::Sha256>();
    let signature = priv_key.sign(scheme, &challenge_hash)
        .map_err(|e| format!("Sign failed: {}", e))?;
    // priv_key dropped here

    Ok(signature)
}
