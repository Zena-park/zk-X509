//! Remote CA certificate repository client.
//!
//! Fetches CA certificates from a per-service Git repository,
//! verifies them against on-chain hashes, and caches locally.
//!
//! Repository layout (per-service):
//!   services/{chain_id}/{registry_address}/certs/{hash}.der
//!
//! DER filenames are the hex-encoded on-chain hash — no index file needed.
//! Security: the repository is untrusted; integrity verified via SHA-256(SPKI) == on-chain hash.

use crate::ca::CaCertInfo;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Default CA registry repository URL.
const DEFAULT_REPO_URL: &str =
    "https://raw.githubusercontent.com/tokamak-network/zk-x509-ca-registry/main";

/// Fetch and verify CA certificates for a specific registry.
///
/// For each on-chain hash, attempts to find the CA cert in this order:
/// 1. Local cache (`~/.zk-x509/ca-cache/{hash}.der`)
/// 2. Remote repository (`services/{chain_id}/{addr}/certs/{hash}.der`)
///
/// Every fetched cert is verified: `SHA-256(SPKI) == on-chain hash`.
/// Verified certs are cached permanently (same hash = same cert forever).
pub fn fetch_verified_cas(
    chain_id: u64,
    registry_address: &[u8; 20],
    on_chain_hashes: &[[u8; 32]],
    repo_url: Option<&str>,
) -> Vec<CaCertInfo> {
    let repo = repo_url.unwrap_or(DEFAULT_REPO_URL);
    let cache = cache_dir();
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(15)))
        .build()
        .into();
    let mut results = Vec::new();

    for hash in on_chain_hashes {
        // 1. Try cache
        if let Some(ref dir) = cache {
            if let Some(info) = read_cache(dir, hash) {
                results.push(info);
                continue;
            }
        }

        // 2. Try remote
        let url = cert_url(repo, chain_id, registry_address, hash);
        match fetch_der(&agent, &url) {
            Ok(cert_der) => {
                match verify_and_parse(&cert_der, hash) {
                    Ok(info) => {
                        if let Some(ref dir) = cache {
                            write_cache_der(dir, hash, &cert_der);
                        }
                        results.push(info);
                    }
                    Err(e) => {
                        eprintln!("  ⚠ CA 0x{}…: {}", &hex::encode(&hash[..4]), e);
                    }
                }
            }
            Err(e) => {
                eprintln!("  ⚠ CA 0x{}…: {}", &hex::encode(&hash[..4]), e);
            }
        }
    }

    results
}

/// Build the download URL for a CA cert file.
fn cert_url(repo_url: &str, chain_id: u64, registry: &[u8; 20], hash: &[u8; 32]) -> String {
    format!(
        "{}/services/{}/0x{}/certs/0x{}.der",
        repo_url.trim_end_matches('/'),
        chain_id,
        hex::encode(registry),
        hex::encode(hash),
    )
}

/// Download a DER file from a URL.
fn fetch_der(agent: &ureq::Agent, url: &str) -> Result<Vec<u8>, String> {
    let response = agent
        .get(url)
        .call()
        .map_err(|e| format!("fetch failed: {}", e))?;

    let cert_der = response
        .into_body()
        .read_to_vec()
        .map_err(|e| format!("read body: {}", e))?;

    Ok(cert_der)
}

/// Parse a DER cert and verify SHA-256(SPKI) matches the expected on-chain hash.
pub fn verify_and_parse(cert_der: &[u8], expected_hash: &[u8; 32]) -> Result<CaCertInfo, String> {
    let info = CaCertInfo::from_der_bytes(cert_der)
        .ok_or_else(|| "invalid X.509: failed to parse DER".to_string())?;

    if info.leaf_hash != *expected_hash {
        return Err(format!(
            "hash mismatch: expected 0x{}, got 0x{}",
            hex::encode(expected_hash),
            hex::encode(info.leaf_hash),
        ));
    }

    Ok(info)
}

// ── Local cache ────────────────────────────────────────────────────

/// Cache directory using platform conventions:
/// - macOS: `~/Library/Caches/zk-x509/ca-cache/`
/// - Linux: `~/.cache/zk-x509/ca-cache/`
/// - Windows: `{LOCALAPPDATA}/zk-x509/ca-cache/`
/// Returns None if no cache directory can be determined (caching disabled).
fn cache_dir() -> Option<PathBuf> {
    dirs::cache_dir().map(|d| d.join("zk-x509").join("ca-cache"))
}

/// Try reading a cached CA cert by hash.
fn read_cache(cache_dir: &Path, hash: &[u8; 32]) -> Option<CaCertInfo> {
    let path = cache_dir.join(format!("0x{}.der", hex::encode(hash)));
    let cert_der = std::fs::read(&path).ok()?;
    let info = CaCertInfo::from_der_bytes(&cert_der)?;

    // Double-check hash (cache corruption protection)
    if info.leaf_hash != *hash {
        eprintln!("  ⚠ Cache corrupted for 0x{}…, removing", &hex::encode(&hash[..4]));
        let _ = std::fs::remove_file(&path);
        return None;
    }

    Some(info)
}

/// Write raw DER bytes to cache.
fn write_cache_der(cache_dir: &Path, hash: &[u8; 32], cert_der: &[u8]) {
    if let Err(e) = std::fs::create_dir_all(cache_dir) {
        eprintln!("  ⚠ Cannot create cache dir: {}", e);
        return;
    }
    let path = cache_dir.join(format!("0x{}.der", hex::encode(hash)));
    if let Err(e) = std::fs::write(&path, cert_der) {
        eprintln!("  ⚠ Cannot write cache: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cert_url_format() {
        let registry = [0xab; 20];
        let hash = [0xcd; 32];
        let url = cert_url("https://example.com/repo", 11155111, &registry, &hash);
        assert!(url.starts_with("https://example.com/repo/services/11155111/0x"));
        assert!(url.ends_with(".der"));
        assert!(url.contains("/certs/0x"));
    }

    #[test]
    fn test_verify_and_parse_real_cert() {
        // Load a real CA cert from data/ca-certs/
        let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let ca_dir = base.join("data/ca-certs");
        let entries: Vec<_> = std::fs::read_dir(&ca_dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("der"))
            .collect();

        if entries.is_empty() {
            return; // Skip if no CA certs available
        }

        let cert_der = std::fs::read(entries[0].path()).unwrap();

        // Compute expected hash
        let (_, cert) = x509_parser::certificate::X509Certificate::from_der(&cert_der).unwrap();
        let spki = cert.tbs_certificate.subject_pki.raw.to_vec();
        use sha2::Digest;
        use x509_parser::prelude::FromDer;
        let expected: [u8; 32] = sha2::Sha256::digest(&spki).into();

        // Should succeed with correct hash
        let result = verify_and_parse(&cert_der, &expected);
        assert!(result.is_ok(), "verify_and_parse should succeed with correct hash");
        let info = result.unwrap();
        assert_eq!(info.leaf_hash, expected);
        assert!(!info.subject.is_empty());

        // Should fail with wrong hash
        let wrong_hash = [0x00; 32];
        let result = verify_and_parse(&cert_der, &wrong_hash);
        assert!(result.is_err(), "verify_and_parse should fail with wrong hash");
        assert!(result.unwrap_err().contains("hash mismatch"));
    }

    #[test]
    fn test_verify_and_parse_invalid_der() {
        let garbage = b"not a certificate";
        let hash = [0x00; 32];
        let result = verify_and_parse(garbage, &hash);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid X.509"));
    }

    #[test]
    fn test_cache_roundtrip() {
        let base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let ca_dir = base.join("data/ca-certs");
        let entries: Vec<_> = std::fs::read_dir(&ca_dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("der"))
            .collect();

        if entries.is_empty() {
            return;
        }

        let cert_der = std::fs::read(entries[0].path()).unwrap();
        let info = CaCertInfo::from_der_bytes(&cert_der).unwrap();

        // Write to unique temp cache (avoid collisions in parallel CI)
        let tmp_cache = std::env::temp_dir().join(format!(
            "zk-x509-test-cache-{}",
            std::process::id()
        ));
        write_cache_der(&tmp_cache, &info.leaf_hash, &cert_der);

        // Read back
        let cached = read_cache(&tmp_cache, &info.leaf_hash);
        assert!(cached.is_some(), "Should read cached cert");
        let cached = cached.unwrap();
        assert_eq!(cached.leaf_hash, info.leaf_hash);
        assert_eq!(cached.subject, info.subject);

        // Cleanup
        let _ = std::fs::remove_dir_all(&tmp_cache);
    }
}
