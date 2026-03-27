//! Certificate scanner — finds X.509 identities from OS certificate stores.
//!
//! **macOS Keychain:**
//!   Scans login keychain for identities (certificate + private key pairs).
//!   Private key never leaves the keychain — signing is delegated to Security.framework.
//!
//! **Windows Certificate Store:**
//!   Scans MY store for certificates with associated private keys.
//!   Private key never leaves the store — signing is delegated to CNG/CAPI.

use serde::Serialize;

/// Where the certificate came from.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub enum CertSource {
    /// macOS Keychain identity (cert + private key managed by OS)
    #[cfg(target_os = "macos")]
    Keychain,
    /// Windows Certificate Store identity
    #[cfg(target_os = "windows")]
    CertStore,
}

impl std::fmt::Display for CertSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            #[cfg(target_os = "macos")]
            CertSource::Keychain => write!(f, "Keychain"),
            #[cfg(target_os = "windows")]
            CertSource::CertStore => write!(f, "CertStore"),
        }
    }
}

/// Discovered certificate entry from OS certificate store.
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
    /// DER-encoded certificate bytes (populated to avoid re-reading)
    #[serde(skip)]
    pub cert_der: Option<Vec<u8>>,
}

// ── Platform-agnostic trait ─────────────────────────────────────────

/// Opaque handle to an OS-managed identity (certificate + private key).
/// Implementations must ensure the private key NEVER leaves the OS store.
pub trait PlatformIdentity: std::fmt::Debug {
    /// Sign a 32-byte prehash using the identity's private key.
    /// The private key stays in the OS-managed store.
    fn sign_prehash(&mut self, prehash: &[u8; 32]) -> Result<Vec<u8>, String>;

    /// Get the DER-encoded certificate bytes.
    fn cert_der(&self) -> Result<Vec<u8>, String>;

    /// Clone into a boxed trait object.
    fn clone_box(&self) -> Box<dyn PlatformIdentity>;
}

impl Clone for Box<dyn PlatformIdentity> {
    fn clone(&self) -> Self {
        self.clone_box()
    }
}

/// Scan the OS certificate store and return discovered identities.
///
/// Returns (CertEntry, identity_handle) pairs for each platform.
/// The identity handle type varies by platform.
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

    #[cfg(target_os = "windows")]
    {
        match windows_certstore::scan_identities() {
            Ok(cs_entries) => {
                entries.extend(cs_entries.into_iter().map(|(entry, _)| entry));
            }
            Err(e) => {
                eprintln!("  ⚠ Certificate Store scan failed: {}", e);
            }
        }
    }

    entries
}

/// Scan the OS certificate store and return identities with signing handles.
///
/// Platform-agnostic version: returns boxed trait objects.
pub fn scan_identities_boxed() -> Result<Vec<(CertEntry, Box<dyn PlatformIdentity>)>, String> {
    #[cfg(target_os = "macos")]
    {
        let ids = macos_keychain::scan_identities()?;
        Ok(ids.into_iter()
            .map(|(e, id)| (e, Box::new(id) as Box<dyn PlatformIdentity>))
            .collect())
    }
    #[cfg(target_os = "windows")]
    {
        let ids = windows_certstore::scan_identities()?;
        Ok(ids.into_iter()
            .map(|(e, id)| (e, Box::new(id) as Box<dyn PlatformIdentity>))
            .collect())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err("No certificate store available on this platform".to_string())
    }
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

    impl PlatformIdentity for KeychainIdentity {
        fn sign_prehash(&mut self, prehash: &[u8; 32]) -> Result<Vec<u8>, String> {
            sign_with_identity(self, prehash)
        }

        fn cert_der(&self) -> Result<Vec<u8>, String> {
            let cert = self.identity.certificate()
                .map_err(|e| format!("Get certificate: {}", e))?;
            Ok(cert.to_der())
        }

        fn clone_box(&self) -> Box<dyn PlatformIdentity> {
            Box::new(self.clone())
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

// ── Windows Certificate Store scanning ───────────────────────────────

#[cfg(target_os = "windows")]
pub mod windows_certstore {
    use super::*;

    /// Opaque handle to a Windows certificate store identity.
    /// Uses CNG (Cryptography Next Generation) for signing.
    /// The private key NEVER leaves the certificate store.
    #[derive(Clone)]
    pub struct CertStoreIdentity {
        /// DER-encoded certificate bytes
        cert_der: Vec<u8>,
        /// Serialized certificate context for re-opening (thumbprint)
        thumbprint: Vec<u8>,
    }

    impl std::fmt::Debug for CertStoreIdentity {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.debug_struct("CertStoreIdentity")
                .field("thumbprint", &hex::encode(&self.thumbprint))
                .finish()
        }
    }

    impl PlatformIdentity for CertStoreIdentity {
        fn sign_prehash(&mut self, prehash: &[u8; 32]) -> Result<Vec<u8>, String> {
            sign_with_certstore(self, prehash)
        }

        fn cert_der(&self) -> Result<Vec<u8>, String> {
            Ok(self.cert_der.clone())
        }

        fn clone_box(&self) -> Box<dyn PlatformIdentity> {
            Box::new(self.clone())
        }
    }

    /// Simple RAII guard for a certificate store handle.
    struct StoreHandle(*mut std::ffi::c_void);

    impl Drop for StoreHandle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { windows_sys::Win32::Security::Cryptography::CertCloseStore(self.0, 0); }
            }
        }
    }

    /// Scan the Windows MY certificate store for identities with private keys.
    pub fn scan_identities() -> Result<Vec<(CertEntry, CertStoreIdentity)>, String> {
        use windows_sys::Win32::Security::Cryptography::*;
        use std::ptr;

        let mut entries = Vec::new();

        // Open the "MY" certificate store (personal certificates)
        let store_name = wide_string("MY");
        let store = unsafe {
            CertOpenStore(
                CERT_STORE_PROV_SYSTEM_W,
                0,
                0,
                CERT_SYSTEM_STORE_CURRENT_USER,
                store_name.as_ptr() as *const _,
            )
        };
        if store.is_null() {
            return Err("Failed to open MY certificate store".to_string());
        }
        let _store_guard = StoreHandle(store);

        // Enumerate certificates
        let mut cert_ctx: *const CERT_CONTEXT = ptr::null();
        loop {
            cert_ctx = unsafe {
                CertEnumCertificatesInStore(store, cert_ctx)
            };
            if cert_ctx.is_null() {
                break;
            }

            // Check if certificate has an associated private key
            if !has_private_key(cert_ctx) {
                continue;
            }

            // Extract DER bytes
            let der_bytes = unsafe {
                let ctx = &*cert_ctx;
                std::slice::from_raw_parts(
                    ctx.pbCertEncoded,
                    ctx.cbCertEncoded as usize,
                ).to_vec()
            };

            // Get thumbprint for later re-opening
            let thumbprint = match get_thumbprint(cert_ctx) {
                Ok(t) => t,
                Err(_) => continue,
            };

            // Parse certificate
            match parse_cert_entry(&der_bytes) {
                Ok(entry) => {
                    let identity = CertStoreIdentity {
                        cert_der: der_bytes,
                        thumbprint,
                    };
                    entries.push((entry, identity));
                }
                Err(e) => {
                    eprintln!("  ⚠ Skipping certificate: {}", e);
                }
            }
        }

        Ok(entries)
    }

    /// Parse DER bytes into a CertEntry.
    fn parse_cert_entry(der_bytes: &[u8]) -> Result<CertEntry, String> {
        use x509_parser::prelude::FromDer;
        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(der_bytes)
            .map_err(|e| format!("Parse cert: {:?}", e))?;

        Ok(CertEntry {
            subject: parsed.subject().to_string(),
            issuer: parsed.issuer().to_string(),
            serial_hex: parsed.tbs_certificate.raw_serial_as_string(),
            expires: parsed.validity().not_after.to_string(),
            source: CertSource::CertStore,
            cert_der: Some(der_bytes.to_vec()),
        })
    }

    /// Check if a certificate context has an associated private key.
    fn has_private_key(cert_ctx: *const CERT_CONTEXT) -> bool {
        use windows_sys::Win32::Security::Cryptography::*;
        let mut key_spec: u32 = 0;
        let mut must_free: i32 = 0;
        let mut key_handle: usize = 0;

        let result = unsafe {
            CryptAcquireCertificatePrivateKey(
                cert_ctx,
                CRYPT_ACQUIRE_ONLY_NCRYPT_KEY_FLAG | CRYPT_ACQUIRE_SILENT_FLAG,
                std::ptr::null(),
                &mut key_handle,
                &mut key_spec,
                &mut must_free,
            )
        };

        if result != 0 && key_handle != 0 && must_free != 0 {
            unsafe { NCryptFreeObject(key_handle); }
        }

        result != 0 && key_handle != 0
    }

    /// Get certificate thumbprint (SHA-1 hash) for later re-identification.
    fn get_thumbprint(cert_ctx: *const CERT_CONTEXT) -> Result<Vec<u8>, String> {
        use windows_sys::Win32::Security::Cryptography::*;
        let mut size: u32 = 20; // SHA-1 hash size
        let mut thumb = vec![0u8; size as usize];

        let result = unsafe {
            CertGetCertificateContextProperty(
                cert_ctx,
                CERT_SHA1_HASH_PROP_ID,
                thumb.as_mut_ptr() as *mut _,
                &mut size,
            )
        };

        if result == 0 {
            return Err("Failed to get certificate thumbprint".to_string());
        }
        thumb.truncate(size as usize);
        Ok(thumb)
    }

    /// RAII guard for Windows certificate store resources.
    /// Ensures store, cert context, and key handle are freed on drop.
    struct StoreGuard {
        store: *mut std::ffi::c_void,
        cert_ctx: *const CERT_CONTEXT,
        key_handle: usize,
        must_free_key: bool,
    }

    impl Drop for StoreGuard {
        fn drop(&mut self) {
            use windows_sys::Win32::Security::Cryptography::*;
            unsafe {
                if self.must_free_key && self.key_handle != 0 {
                    NCryptFreeObject(self.key_handle);
                }
                if !self.cert_ctx.is_null() {
                    CertFreeCertificateContext(self.cert_ctx);
                }
                if !self.store.is_null() {
                    CertCloseStore(self.store, 0);
                }
            }
        }
    }

    /// Sign a prehash using the certificate's private key via CNG.
    /// The private key NEVER leaves the certificate store.
    fn sign_with_certstore(
        identity: &CertStoreIdentity,
        prehash: &[u8; 32],
    ) -> Result<Vec<u8>, String> {
        use windows_sys::Win32::Security::Cryptography::*;
        use std::ptr;

        // Re-open the certificate from the store using thumbprint
        let store_name = wide_string("MY");
        let store = unsafe {
            CertOpenStore(
                CERT_STORE_PROV_SYSTEM_W,
                0,
                0,
                CERT_SYSTEM_STORE_CURRENT_USER,
                store_name.as_ptr() as *const _,
            )
        };
        if store.is_null() {
            return Err("Failed to open certificate store".to_string());
        }

        let mut guard = StoreGuard {
            store,
            cert_ctx: ptr::null(),
            key_handle: 0,
            must_free_key: false,
        };

        // Find certificate by thumbprint
        // CRYPT_INTEGER_BLOB.pbData is declared *mut, but CertFindCertificateInStore only reads it.
        // Use a mutable copy to avoid relying on the API not mutating pbData
        // and to avoid potential aliasing violations if it does.
        let mut thumbprint_buf = identity.thumbprint.clone();
        let hash_blob = CRYPT_INTEGER_BLOB {
            cbData: thumbprint_buf.len() as u32,
            pbData: thumbprint_buf.as_mut_ptr(),
        };

        let cert_ctx = unsafe {
            CertFindCertificateInStore(
                store,
                X509_ASN_ENCODING | PKCS_7_ASN_ENCODING,
                0,
                CERT_FIND_SHA1_HASH,
                &hash_blob as *const _ as *const _,
                ptr::null(),
            )
        };

        if cert_ctx.is_null() {
            return Err("Certificate not found in store".to_string());
        }
        guard.cert_ctx = cert_ctx;

        // Acquire CNG private key handle
        let mut key_handle: usize = 0;
        let mut key_spec: u32 = 0;
        let mut must_free: i32 = 0;

        let result = unsafe {
            CryptAcquireCertificatePrivateKey(
                cert_ctx,
                CRYPT_ACQUIRE_ONLY_NCRYPT_KEY_FLAG | CRYPT_ACQUIRE_SILENT_FLAG,
                ptr::null(),
                &mut key_handle,
                &mut key_spec,
                &mut must_free,
            )
        };

        if result == 0 {
            return Err("Failed to acquire private key".to_string());
        }
        guard.key_handle = key_handle;
        guard.must_free_key = must_free != 0;

        // Detect algorithm from certificate
        let alg_info = detect_algorithm(&identity.cert_der)?;

        // Sign using CNG (guard handles cleanup on error)
        ncrypt_sign(key_handle, prehash, &alg_info)
    }

    /// Algorithm info for CNG signing.
    enum AlgInfo {
        Rsa,
        EcdsaP256,
        EcdsaP384,
    }

    /// Detect the key algorithm from a DER certificate.
    fn detect_algorithm(cert_der: &[u8]) -> Result<AlgInfo, String> {
        use crate::ownership::{OID_EC_PUBLIC_KEY, OID_RSA_ENCRYPTION, OID_PRIME256V1, OID_SECP384R1};
        use x509_parser::prelude::FromDer;

        let (_, parsed) = x509_parser::certificate::X509Certificate::from_der(cert_der)
            .map_err(|e| format!("Parse cert: {:?}", e))?;

        let alg_oid = parsed.tbs_certificate.subject_pki.algorithm.algorithm.to_id_string();

        if alg_oid == OID_EC_PUBLIC_KEY {
            let curve_oid = parsed.tbs_certificate.subject_pki.algorithm
                .parameters.as_ref()
                .and_then(|p| p.as_oid().ok())
                .map(|oid| oid.to_id_string())
                .unwrap_or_default();
            match curve_oid.as_str() {
                OID_PRIME256V1 => Ok(AlgInfo::EcdsaP256),
                OID_SECP384R1 => Ok(AlgInfo::EcdsaP384),
                _ => Err(format!("Unsupported EC curve: {}", curve_oid)),
            }
        } else if alg_oid == OID_RSA_ENCRYPTION {
            Ok(AlgInfo::Rsa)
        } else {
            Err(format!("Unsupported key algorithm: {}", alg_oid))
        }
    }

    /// Sign using NCrypt (CNG).
    fn ncrypt_sign(
        key_handle: usize,
        prehash: &[u8; 32],
        alg_info: &AlgInfo,
    ) -> Result<Vec<u8>, String> {
        use windows_sys::Win32::Security::Cryptography::*;
        use std::ptr;

        match alg_info {
            AlgInfo::Rsa => {
                // PKCS#1 v1.5 SHA-256
                let alg_id = wide_string("SHA256");
                let padding = BCRYPT_PKCS1_PADDING_INFO {
                    pszAlgId: alg_id.as_ptr(),
                };

                // Query signature size
                let mut sig_len: u32 = 0;
                let status = unsafe {
                    NCryptSignHash(
                        key_handle,
                        &padding as *const _ as *const _,
                        prehash.as_ptr(),
                        prehash.len() as u32,
                        ptr::null_mut(),
                        0,
                        &mut sig_len,
                        BCRYPT_PAD_PKCS1,
                    )
                };
                if status != 0 {
                    return Err(format!("NCryptSignHash size query failed: 0x{:08x}", status));
                }

                let mut signature = vec![0u8; sig_len as usize];
                let status = unsafe {
                    NCryptSignHash(
                        key_handle,
                        &padding as *const _ as *const _,
                        prehash.as_ptr(),
                        prehash.len() as u32,
                        signature.as_mut_ptr(),
                        sig_len,
                        &mut sig_len,
                        BCRYPT_PAD_PKCS1,
                    )
                };
                if status != 0 {
                    return Err(format!("NCryptSignHash failed: 0x{:08x}", status));
                }
                signature.truncate(sig_len as usize);
                Ok(signature)
            }
            AlgInfo::EcdsaP256 | AlgInfo::EcdsaP384 => {
                // ECDSA — no padding info needed
                // Query signature size
                let mut sig_len: u32 = 0;
                let status = unsafe {
                    NCryptSignHash(
                        key_handle,
                        ptr::null(),
                        prehash.as_ptr(),
                        prehash.len() as u32,
                        ptr::null_mut(),
                        0,
                        &mut sig_len,
                        0,
                    )
                };
                if status != 0 {
                    return Err(format!("NCryptSignHash size query failed: 0x{:08x}", status));
                }

                let mut signature = vec![0u8; sig_len as usize];
                let status = unsafe {
                    NCryptSignHash(
                        key_handle,
                        ptr::null(),
                        prehash.as_ptr(),
                        prehash.len() as u32,
                        signature.as_mut_ptr(),
                        sig_len,
                        &mut sig_len,
                        0,
                    )
                };
                if status != 0 {
                    return Err(format!("NCryptSignHash failed: 0x{:08x}", status));
                }
                signature.truncate(sig_len as usize);

                // CNG returns ECDSA signatures in P1363 format (r || s).
                // Convert to DER-encoded ASN.1 format for compatibility with ZK circuit.
                p1363_to_der(&signature)
            }
        }
    }

    /// Convert ECDSA P1363 signature (r || s) to DER-encoded ASN.1.
    fn p1363_to_der(p1363: &[u8]) -> Result<Vec<u8>, String> {
        if p1363.is_empty() || p1363.len() % 2 != 0 {
            return Err("Invalid P1363 signature length".to_string());
        }
        let half = p1363.len() / 2;
        let r = &p1363[..half];
        let s = &p1363[half..];

        fn encode_integer(val: &[u8]) -> Vec<u8> {
            if val.is_empty() {
                return vec![0x02, 0x01, 0x00]; // INTEGER 0
            }
            // Strip leading zeros but keep one if high bit is set
            let stripped = val.iter().position(|&b| b != 0).unwrap_or(val.len() - 1);
            let val = &val[stripped..];
            let needs_padding = val[0] & 0x80 != 0;
            let content_len = val.len() + if needs_padding { 1 } else { 0 };
            let mut encoded = vec![0x02]; // INTEGER tag
            encode_der_length(&mut encoded, content_len);
            if needs_padding {
                encoded.push(0x00);
            }
            encoded.extend_from_slice(val);
            encoded
        }

        /// Encode a DER length field (supports lengths >= 128).
        fn encode_der_length(buf: &mut Vec<u8>, len: usize) {
            if len < 128 {
                buf.push(len as u8);
            } else {
                let len_be = len.to_be_bytes();
                let start = len_be.iter().position(|&b| b != 0).unwrap_or(len_be.len() - 1);
                let len_bytes = &len_be[start..];
                buf.push(0x80 | len_bytes.len() as u8);
                buf.extend_from_slice(len_bytes);
            }
        }

        let r_enc = encode_integer(r);
        let s_enc = encode_integer(s);
        let total_len = r_enc.len() + s_enc.len();

        let mut der = vec![0x30]; // SEQUENCE tag
        encode_der_length(&mut der, total_len);
        der.extend(r_enc);
        der.extend(s_enc);
        Ok(der)
    }

    /// Convert a Rust string to a null-terminated UTF-16 wide string.
    fn wide_string(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }
}
