//! Certificate scanner — finds X.509 certificates from filesystem and OS keychain.
//!
//! **File-based (NPKI):**
//!   macOS:   ~/Library/Preferences/NPKI/{CA}/{USER}/{DN}/
//!   Windows: C:\Users\{user}\AppData\LocalLow\NPKI\{CA}\USER\{DN}\
//!   Linux:   ~/.pki/NPKI/{CA}/USER/{DN}/
//!   Each directory contains signCert.der + signPri.key
//!
//! **macOS Keychain:**
//!   Scans login keychain for identities (certificate + private key pairs).
//!   Private key never leaves the keychain — signing is delegated to Security.framework.

use serde::Serialize;
use std::path::PathBuf;

/// Where the certificate came from.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum CertSource {
    /// File-based NPKI certificate (signCert.der + signPri.key)
    File,
    /// macOS Keychain identity (cert + private key managed by OS)
    #[cfg(target_os = "macos")]
    Keychain,
}

impl std::fmt::Display for CertSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CertSource::File => write!(f, "File"),
            #[cfg(target_os = "macos")]
            CertSource::Keychain => write!(f, "Keychain"),
        }
    }
}

/// Discovered certificate entry (from filesystem or keychain).
#[derive(Debug, Clone, Serialize)]
pub struct NpkiCertEntry {
    /// Human-readable subject from certificate
    pub subject: String,
    /// Issuer (CA) name
    pub issuer: String,
    /// Serial number (hex)
    pub serial_hex: String,
    /// Path to signCert.der (File source only; empty for Keychain)
    #[serde(skip)]
    pub cert_path: PathBuf,
    /// Path to signPri.key (File source only; empty for Keychain)
    #[serde(skip)]
    pub key_path: PathBuf,
    /// Certificate validity (not_after)
    pub expires: String,
    /// Certificate source
    pub source: CertSource,
    /// DER-encoded certificate bytes (populated for Keychain entries to avoid re-reading)
    #[serde(skip)]
    pub cert_der: Option<Vec<u8>>,
}

/// Scan all sources (filesystem + keychain) and return a unified list.
pub fn scan_all_certs() -> Vec<NpkiCertEntry> {
    let mut entries = Vec::new();

    // 1. File-based NPKI scan (all platforms)
    entries.extend(scan_npki_certs());

    // 2. macOS Keychain scan
    #[cfg(target_os = "macos")]
    {
        match scan_keychain_certs() {
            Ok(kc_entries) => entries.extend(kc_entries),
            Err(e) => {
                eprintln!("  ⚠ Keychain scan failed: {}", e);
            }
        }
    }

    entries
}

// ── File-based NPKI scanning ─────────────────────────────────────────

/// Scan the filesystem for NPKI certificate directories.
pub fn scan_npki_certs() -> Vec<NpkiCertEntry> {
    let mut entries = Vec::new();

    for base_dir in npki_base_dirs() {
        if !base_dir.exists() {
            continue;
        }
        scan_dir_recursive(&base_dir, &mut entries);
    }

    entries
}

/// Get platform-specific NPKI base directories.
fn npki_base_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(home) = dirs::home_dir() {
        // macOS
        dirs.push(home.join("Library/Preferences/NPKI"));
        // Linux
        dirs.push(home.join(".pki/NPKI"));
        // Windows
        dirs.push(home.join("AppData/LocalLow/NPKI"));
    }

    // Windows (via LOCALAPPDATA env)
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local).join("NPKI"));
    }

    // Also check current directory for test certs
    dirs.push(PathBuf::from("certs"));

    dirs
}

/// Recursively scan a directory for signCert.der + signPri.key pairs.
/// Max depth prevents symlink cycles and excessive traversal.
const MAX_SCAN_DEPTH: usize = 10;

fn scan_dir_recursive(dir: &PathBuf, entries: &mut Vec<NpkiCertEntry>) {
    scan_dir_with_depth(dir, entries, 0);
}

fn scan_dir_with_depth(dir: &PathBuf, entries: &mut Vec<NpkiCertEntry>, depth: usize) {
    if depth > MAX_SCAN_DEPTH {
        return;
    }

    let read_dir = match std::fs::read_dir(dir) {
        Ok(d) => d,
        Err(_) => return,
    };

    for entry in read_dir.flatten() {
        let path = entry.path();
        // Use symlink_metadata to avoid following symlink cycles
        let is_real_dir = entry.file_type()
            .map(|ft| ft.is_dir())
            .unwrap_or(false);
        if is_real_dir {
            scan_dir_with_depth(&path, entries, depth + 1);
        }
    }

    // Check if this directory contains signCert.der + signPri.key
    let cert_path = dir.join("signCert.der");
    let key_path = dir.join("signPri.key");

    if cert_path.exists() && key_path.exists() {
        if let Some(info) = parse_cert_info(&cert_path, &key_path) {
            entries.push(info);
        }
    }
}

/// Scan a specific directory (used by tests).
#[cfg(test)]
fn scan_dir(dir: &std::path::Path) -> Vec<NpkiCertEntry> {
    let mut entries = Vec::new();
    scan_dir_recursive(&dir.to_path_buf(), &mut entries);
    entries
}

/// Parse certificate DER to extract display info.
fn parse_cert_info(cert_path: &PathBuf, key_path: &PathBuf) -> Option<NpkiCertEntry> {
    let cert_der = std::fs::read(cert_path).ok()?;

    use x509_parser::prelude::FromDer;
    let (_, cert) = x509_parser::certificate::X509Certificate::from_der(&cert_der).ok()?;

    Some(NpkiCertEntry {
        subject: cert.subject().to_string(),
        issuer: cert.issuer().to_string(),
        serial_hex: cert.tbs_certificate.raw_serial_as_string(),
        cert_path: cert_path.clone(),
        key_path: key_path.clone(),
        expires: cert.validity().not_after.to_string(),
        source: CertSource::File,
        cert_der: None,
    })
}

// ── macOS Keychain scanning ──────────────────────────────────────────

#[cfg(target_os = "macos")]
pub mod macos_keychain {
    use super::*;
    use security_framework::identity::SecIdentity;
    use security_framework::item::{ItemClass, ItemSearchOptions, Limit, Reference, SearchResult};
    use security_framework::os::macos::keychain::SecKeychain;

    /// Opaque handle to a macOS keychain identity.
    /// Allows signing without exposing the private key.
    #[derive(Debug, Clone)]
    pub struct KeychainIdentity {
        pub identity: SecIdentity,
    }

    /// Scan the macOS login keychain for identities (certificate + key pairs).
    pub fn scan_identities() -> Result<Vec<(NpkiCertEntry, KeychainIdentity)>, String> {
        let keychain = SecKeychain::default()
            .map_err(|e| format!("Failed to open default keychain: {}", e))?;

        let results = ItemSearchOptions::new()
            .class(ItemClass::identity())
            .keychains(&[keychain])
            .limit(Limit::All)
            .load_refs(true)
            .search()
            .map_err(|e| format!("Keychain search failed: {}", e))?;

        let mut entries = Vec::new();

        for result in &results {
            if let SearchResult::Ref(Reference::Identity(identity)) = result {
                match identity_to_entry(identity) {
                    Ok(entry) => {
                        let kc_id = KeychainIdentity { identity: identity.clone() };
                        entries.push((entry, kc_id));
                    }
                    Err(e) => {
                        // Skip identities we can't parse (e.g., non-X.509)
                        eprintln!("  ⚠ Skipping keychain identity: {}", e);
                    }
                }
            }
        }

        Ok(entries)
    }

    /// Convert a SecIdentity into an NpkiCertEntry for display.
    fn identity_to_entry(identity: &SecIdentity) -> Result<NpkiCertEntry, String> {
        let cert = identity.certificate()
            .map_err(|e| format!("Get certificate: {}", e))?;
        let der_bytes = cert.to_der();

        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&der_bytes)
            .map_err(|e| format!("Parse cert: {:?}", e))?;

        Ok(NpkiCertEntry {
            subject: parsed.subject().to_string(),
            issuer: parsed.issuer().to_string(),
            serial_hex: parsed.tbs_certificate.raw_serial_as_string(),
            cert_path: PathBuf::new(),
            key_path: PathBuf::new(),
            expires: parsed.validity().not_after.to_string(),
            source: CertSource::Keychain,
            cert_der: Some(der_bytes),
        })
    }

    /// Sign a prehashed digest using the keychain identity's private key.
    /// The private key NEVER leaves the keychain.
    ///
    /// Detects the key algorithm (RSA or ECDSA) from the certificate and uses
    /// the appropriate Security.framework algorithm.
    pub fn sign_with_identity(
        identity: &KeychainIdentity,
        prehash: &[u8; 32],
    ) -> Result<Vec<u8>, String> {
        use security_framework::key::Algorithm;

        let private_key = identity.identity.private_key()
            .map_err(|e| format!("Get private key handle: {}", e))?;

        // Detect algorithm from certificate's public key
        let cert = identity.identity.certificate()
            .map_err(|e| format!("Get certificate: {}", e))?;
        let der_bytes = cert.to_der();

        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&der_bytes)
            .map_err(|e| format!("Parse cert: {:?}", e))?;

        use crate::ownership::{OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION, OID_PRIME256V1, OID_SECP384R1};

        let alg_oid = parsed.tbs_certificate.subject_pki.algorithm.algorithm.to_id_string();

        let algorithm = if alg_oid == OID_EC_PUBLIC_KEY {
            let curve_oid = parsed.tbs_certificate.subject_pki.algorithm
                .parameters.as_ref()
                .and_then(|p| p.as_oid().ok())
                .map(|oid| oid.to_id_string())
                .unwrap_or_default();
            match curve_oid.as_str() {
                OID_PRIME256V1 => Algorithm::ECDSASignatureDigestX962SHA256,
                OID_SECP384R1 => Algorithm::ECDSASignatureDigestX962SHA384,
                _ => return Err(format!("Unsupported EC curve: {}", curve_oid)),
            }
        } else if alg_oid == OID_RSA_ENCRYPTION {
            Algorithm::RSASignatureDigestPKCS1v15SHA256
        } else {
            return Err(format!("Unsupported key algorithm: {}", alg_oid));
        };

        private_key.create_signature(algorithm, prehash)
            .map_err(|e| format!("Keychain signing failed: {}", e))
    }
}

/// Scan macOS keychain and return NpkiCertEntry list (without identity handles).
#[cfg(target_os = "macos")]
fn scan_keychain_certs() -> Result<Vec<NpkiCertEntry>, String> {
    let identities = macos_keychain::scan_identities()?;
    Ok(identities.into_iter().map(|(entry, _)| entry).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Project root for test cert paths.
    fn project_root() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
    }

    /// Create a fake NPKI directory structure with real test certs.
    fn setup_fake_npki(tmp: &std::path::Path) {
        let base = project_root();

        // Create CA/USER/DN/ structure
        let user_dir = tmp.join("TestCA/USER/TestDN");
        fs::create_dir_all(&user_dir).unwrap();

        // Copy real test cert + create a dummy key file
        fs::copy(base.join("certs/signCert.der"), user_dir.join("signCert.der")).unwrap();
        fs::write(user_dir.join("signPri.key"), b"dummy-key").unwrap();
    }

    #[test]
    fn test_scan_finds_cert_in_npki_structure() {
        let tmp = tempfile::tempdir().unwrap();
        setup_fake_npki(tmp.path());

        let entries = scan_dir(tmp.path());
        assert_eq!(entries.len(), 1, "Should find exactly one cert");
        assert!(!entries[0].subject.is_empty(), "Subject must not be empty");
        assert!(!entries[0].serial_hex.is_empty());
        assert!(entries[0].cert_path.ends_with("signCert.der"));
        assert!(entries[0].key_path.ends_with("signPri.key"));
        assert_eq!(entries[0].source, CertSource::File);
    }

    #[test]
    fn test_scan_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let entries = scan_dir(tmp.path());
        assert!(entries.is_empty(), "Empty dir should return no certs");
    }

    #[test]
    fn test_scan_missing_key_skips() {
        let tmp = tempfile::tempdir().unwrap();
        let base = project_root();

        // Only cert, no key
        fs::copy(base.join("certs/signCert.der"), tmp.path().join("signCert.der")).unwrap();

        let entries = scan_dir(tmp.path());
        assert!(entries.is_empty(), "Missing key should be skipped");
    }

    #[test]
    fn test_scan_multiple_certs() {
        let tmp = tempfile::tempdir().unwrap();
        let base = project_root();

        // Two separate cert directories
        let dir1 = tmp.path().join("CA1/USER/DN1");
        let dir2 = tmp.path().join("CA2/USER/DN2");
        fs::create_dir_all(&dir1).unwrap();
        fs::create_dir_all(&dir2).unwrap();

        fs::copy(base.join("certs/signCert.der"), dir1.join("signCert.der")).unwrap();
        fs::write(dir1.join("signPri.key"), b"dummy").unwrap();

        fs::copy(base.join("certs/ec_signCert.der"), dir2.join("signCert.der")).unwrap();
        fs::write(dir2.join("signPri.key"), b"dummy").unwrap();

        let entries = scan_dir(tmp.path());
        assert_eq!(entries.len(), 2, "Should find two certs");
    }

    #[test]
    fn test_scan_depth_limit() {
        let tmp = tempfile::tempdir().unwrap();
        let base = project_root();

        // Create deeply nested directory (beyond MAX_SCAN_DEPTH)
        let mut deep = tmp.path().to_path_buf();
        for i in 0..=MAX_SCAN_DEPTH + 2 {
            deep = deep.join(format!("level{}", i));
        }
        fs::create_dir_all(&deep).unwrap();
        fs::copy(base.join("certs/signCert.der"), deep.join("signCert.der")).unwrap();
        fs::write(deep.join("signPri.key"), b"dummy").unwrap();

        let entries = scan_dir(tmp.path());
        assert!(entries.is_empty(), "Should not find certs beyond max depth");
    }
}
