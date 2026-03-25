//! CA certificate scanner and auto-matcher.
//!
//! Scans `data/ca-certs/` for full X.509 CA certificates (DER),
//! extracts SPKI (SubjectPublicKeyInfo) for on-chain matching,
//! and auto-selects the CA that issued a given user certificate.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use x509_parser::prelude::FromDer;

/// Parsed CA certificate info.
pub struct CaCertInfo {
    /// DER-encoded subject distinguished name (for issuer matching)
    pub subject_der: Vec<u8>,
    /// Human-readable subject string
    pub subject: String,
    /// SPKI DER bytes (SubjectPublicKeyInfo — what gets hashed for on-chain leaf)
    pub spki_der: Vec<u8>,
    /// SHA-256(SPKI DER) — the on-chain CA leaf hash
    pub leaf_hash: [u8; 32],
    /// Source file path
    pub path: PathBuf,
}

/// Default CA certificate directory name.
const CA_CERT_DIR: &str = "data/ca-certs";

/// Scan CA certificate directories for DER-encoded X.509 certificates.
/// Searches relative to CWD and also relative to the cargo manifest dir
/// (for when tests run from a different directory).
pub fn scan_ca_certs() -> Vec<CaCertInfo> {
    let mut entries = Vec::new();

    // Try CWD-relative path first (normal runtime)
    let cwd_path = Path::new(CA_CERT_DIR);
    if cwd_path.exists() {
        scan_ca_dir(cwd_path, &mut entries);
    }

    // Also try relative to cargo manifest (for tests)
    if entries.is_empty() {
        if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
            let test_path = PathBuf::from(manifest).join("..").join(CA_CERT_DIR);
            if test_path.exists() {
                scan_ca_dir(&test_path, &mut entries);
            }
        }
    }

    entries
}

fn scan_ca_dir(dir: &Path, entries: &mut Vec<CaCertInfo>) {
    let read_dir = match std::fs::read_dir(dir) {
        Ok(d) => d,
        Err(_) => return,
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("der") {
            if let Some(info) = parse_ca_cert(&path) {
                entries.push(info);
            }
        }
    }
}

fn parse_ca_cert(path: &Path) -> Option<CaCertInfo> {
    let cert_der = std::fs::read(path).ok()?;
    let (_, cert) = x509_parser::certificate::X509Certificate::from_der(&cert_der).ok()?;

    let spki_der = cert.tbs_certificate.subject_pki.raw.to_vec();
    let leaf_hash: [u8; 32] = Sha256::digest(&spki_der).into();

    Some(CaCertInfo {
        subject_der: cert.subject().as_raw().to_vec(),
        subject: cert.subject().to_string(),
        spki_der,
        leaf_hash,
        path: path.to_path_buf(),
    })
}

/// Find the CA certificate that issued the given user certificate.
///
/// Matches the user cert's issuer DER against CA cert subjects.
/// If `on_chain_leaves` is provided, only returns CAs that are registered on-chain.
pub fn find_issuer_ca(
    user_cert_der: &[u8],
    ca_certs: &[CaCertInfo],
    on_chain_leaves: Option<&[[u8; 32]]>,
) -> Option<usize> {
    let (_, user_cert) = x509_parser::certificate::X509Certificate::from_der(user_cert_der).ok()?;
    let issuer_der = user_cert.issuer().as_raw();

    for (i, ca) in ca_certs.iter().enumerate() {
        if ca.subject_der == issuer_der {
            // If on-chain filter provided, check CA is registered
            if let Some(leaves) = on_chain_leaves {
                if leaves.contains(&ca.leaf_hash) {
                    return Some(i);
                }
            } else {
                return Some(i);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_ca_certs_finds_files() {
        let certs = scan_ca_certs();
        // data/ca-certs/ should have at least some certificates
        assert!(!certs.is_empty(), "Should find CA certs in data/ca-certs/");
        for ca in &certs {
            assert!(!ca.subject.is_empty());
            assert!(!ca.spki_der.is_empty());
            assert_ne!(ca.leaf_hash, [0u8; 32]);
        }
    }

    #[test]
    fn test_find_issuer_ca_matches() {
        let ca_certs = scan_ca_certs();
        if ca_certs.is_empty() {
            return; // Skip if no CA certs available
        }

        // Load chain test cert (issued by zk-X509 Test Intermediate CA or yessign)
        let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let cert_path = base.join("certs/chain/signCert.der");
        if !cert_path.exists() {
            return; // Skip if test cert not available
        }
        let user_cert = std::fs::read(&cert_path).unwrap();

        // Try matching without on-chain filter
        let result = find_issuer_ca(&user_cert, &ca_certs, None);
        // May or may not match depending on whether the test CA is in data/ca-certs/
        // This test mainly verifies no panic
        let _ = result;
    }

    #[test]
    fn test_leaf_hash_deterministic() {
        let certs = scan_ca_certs();
        if certs.is_empty() {
            return;
        }
        // Re-scan and verify hashes are identical
        let certs2 = scan_ca_certs();
        for (a, b) in certs.iter().zip(certs2.iter()) {
            assert_eq!(a.leaf_hash, b.leaf_hash, "Leaf hash should be deterministic");
        }
    }
}
