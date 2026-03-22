//! NPKI file scanner — finds X.509 certificates on the local filesystem.
//!
//! Korean NPKI certificates are stored at:
//!   macOS:   ~/Library/Preferences/NPKI/{CA}/{USER}/{DN}/
//!   Windows: C:\Users\{user}\AppData\LocalLow\NPKI\{CA}\USER\{DN}\
//!   Linux:   ~/.pki/NPKI/{CA}/USER/{DN}/
//!
//! Each directory contains:
//!   signCert.der  — X.509 certificate (DER)
//!   signPri.key   — Encrypted private key (PKCS#8 + SEED/AES)

use serde::Serialize;
use std::path::PathBuf;

/// Discovered NPKI certificate on the filesystem.
#[derive(Debug, Clone, Serialize)]
pub struct NpkiCertEntry {
    /// Human-readable subject from certificate
    pub subject: String,
    /// Issuer (CA) name
    pub issuer: String,
    /// Serial number (hex)
    pub serial_hex: String,
    /// Path to signCert.der (not serialized to JSON — internal only)
    #[serde(skip)]
    pub cert_path: PathBuf,
    /// Path to signPri.key (not serialized to JSON — internal only)
    #[serde(skip)]
    pub key_path: PathBuf,
    /// Certificate validity (not_after)
    pub expires: String,
}

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
    })
}
