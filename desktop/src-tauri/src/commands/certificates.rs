use serde::Serialize;
use std::sync::Mutex;
use tauri::State;
use zk_x509_script::keychain::{CertEntry, PlatformIdentity};

/// Stores scanned identities (cert + signing handle) in Tauri managed state.
/// PlatformIdentity is Send but not Sync, so we use Mutex.
pub struct IdentityStore(pub Mutex<Vec<(CertEntry, Box<dyn PlatformIdentity>)>>);

#[derive(Serialize)]
pub struct CertInfo {
    pub index: usize,
    pub subject: String,
    pub issuer: String,
    pub serial: String,
    pub expires: String,
    pub source: String,
}

#[tauri::command]
pub fn scan_certificates(store: State<'_, IdentityStore>) -> Result<Vec<CertInfo>, String> {
    let identities = zk_x509_script::keychain::scan_identities_boxed()?;

    let infos: Vec<CertInfo> = identities
        .iter()
        .enumerate()
        .map(|(i, (entry, _))| CertInfo {
            index: i,
            subject: entry.subject.clone(),
            issuer: entry.issuer.clone(),
            serial: entry.serial_hex.clone(),
            expires: entry.expires.clone(),
            source: entry.source.to_string(),
        })
        .collect();

    let mut guard = store.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    *guard = identities;

    Ok(infos)
}
