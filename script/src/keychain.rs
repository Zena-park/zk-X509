//! Certificate scanner — finds X.509 identities from OS keychain.
//!
//! **macOS Keychain:**
//!   Scans login keychain for identities (certificate + private key pairs).
//!   Private key never leaves the keychain — signing is delegated to Security.framework.

use serde::Serialize;

/// Where the certificate came from.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum CertSource {
    /// macOS Keychain identity (cert + private key managed by OS)
    #[cfg(target_os = "macos")]
    Keychain,
}

impl std::fmt::Display for CertSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            #[cfg(target_os = "macos")]
            CertSource::Keychain => write!(f, "Keychain"),
        }
    }
}

/// Discovered certificate entry from OS keychain.
#[derive(Debug, Clone, Serialize)]
pub struct CertEntry {
    /// Human-readable subject from certificate
    pub subject: String,
    /// Issuer (CA) name
    pub issuer: String,
    /// Serial number (hex)
    pub serial_hex: String,
    /// Certificate validity (not_after)
    pub expires: String,
    /// Certificate source
    pub source: CertSource,
    /// DER-encoded certificate bytes (populated for Keychain entries to avoid re-reading)
    #[serde(skip)]
    pub cert_der: Option<Vec<u8>>,
}

/// Scan all sources and return a unified list.
pub fn scan_certs() -> Vec<CertEntry> {
    let mut entries = Vec::new();

    #[cfg(target_os = "macos")]
    {
        match macos_keychain::scan_identities() {
            Ok(kc_entries) => {
                entries.extend(kc_entries.into_iter().map(|(entry, _)| entry));
            }
            Err(e) => {
                eprintln!("  ⚠ Keychain scan failed: {}", e);
            }
        }
    }

    entries
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
    /// Caches the signing algorithm to avoid re-parsing the certificate on each sign call.
    #[derive(Clone)]
    pub struct KeychainIdentity {
        pub identity: SecIdentity,
        /// Cached signing algorithm (detected from certificate on first use)
        signing_algorithm: Option<security_framework::key::Algorithm>,
    }

    impl std::fmt::Debug for KeychainIdentity {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.debug_struct("KeychainIdentity")
                .field("identity", &"<SecIdentity>")
                .field("signing_algorithm", &self.signing_algorithm.as_ref().map(|_| "<cached>"))
                .finish()
        }
    }

    /// Scan the macOS login keychain for identities (certificate + key pairs).
    pub fn scan_identities() -> Result<Vec<(CertEntry, KeychainIdentity)>, String> {
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
                        let kc_id = KeychainIdentity { identity: identity.clone(), signing_algorithm: None };
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

    /// Convert a SecIdentity into a CertEntry for display.
    fn identity_to_entry(identity: &SecIdentity) -> Result<CertEntry, String> {
        let cert = identity.certificate()
            .map_err(|e| format!("Get certificate: {}", e))?;
        let der_bytes = cert.to_der();

        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&der_bytes)
            .map_err(|e| format!("Parse cert: {:?}", e))?;

        Ok(CertEntry {
            subject: parsed.subject().to_string(),
            issuer: parsed.issuer().to_string(),
            serial_hex: parsed.tbs_certificate.raw_serial_as_string(),
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
        identity: &mut KeychainIdentity,
        prehash: &[u8; 32],
    ) -> Result<Vec<u8>, String> {
        let private_key = identity.identity.private_key()
            .map_err(|e| format!("Get private key handle: {}", e))?;

        // Use cached algorithm or detect from certificate
        let algorithm = match identity.signing_algorithm {
            Some(ref alg) => alg.clone(),
            None => {
                let alg = detect_signing_algorithm(&identity.identity)?;
                identity.signing_algorithm = Some(alg.clone());
                alg
            }
        };

        private_key.create_signature(algorithm, prehash)
            .map_err(|e| format!("Keychain signing failed: {}", e))
    }

    /// Detect the signing algorithm from a keychain identity's certificate.
    fn detect_signing_algorithm(
        identity: &SecIdentity,
    ) -> Result<security_framework::key::Algorithm, String> {
        use security_framework::key::Algorithm;
        use crate::ownership::{OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION, OID_PRIME256V1, OID_SECP384R1};

        let cert = identity.certificate()
            .map_err(|e| format!("Get certificate: {}", e))?;
        let der_bytes = cert.to_der();

        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(&der_bytes)
            .map_err(|e| format!("Parse cert: {:?}", e))?;

        let alg_oid = parsed.tbs_certificate.subject_pki.algorithm.algorithm.to_id_string();

        if alg_oid == OID_EC_PUBLIC_KEY {
            let curve_oid = parsed.tbs_certificate.subject_pki.algorithm
                .parameters.as_ref()
                .and_then(|p| p.as_oid().ok())
                .map(|oid| oid.to_id_string())
                .unwrap_or_default();
            match curve_oid.as_str() {
                OID_PRIME256V1 => Ok(Algorithm::ECDSASignatureDigestX962SHA256),
                // prehash is always 32 bytes (SHA-256), so we use X962SHA256 even for P-384
                OID_SECP384R1 => Ok(Algorithm::ECDSASignatureDigestX962SHA256),
                _ => Err(format!("Unsupported EC curve: {}", curve_oid)),
            }
        } else if alg_oid == OID_RSA_ENCRYPTION {
            Ok(Algorithm::RSASignatureDigestPKCS1v15SHA256)
        } else {
            Err(format!("Unsupported key algorithm: {}", alg_oid))
        }
    }
}
