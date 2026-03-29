# TODO: Remove File-Based NPKI Support

**Branch:** `refactor/remove-file-npki` (create from `main` after platform merge)
**Priority:** Medium
**Context:** Paper now describes keychain-only model. Code should match.

## What to Remove

### 1. `script/src/keychain.rs` — File scanning functions
- `scan_npki_certs()` — filesystem scanner
- `npki_base_dirs()` — platform-specific NPKI directories
- `scan_dir_recursive()` / `scan_dir_with_depth()` — recursive directory walker
- `parse_cert_info()` — file-based cert parser
- `CertSource::File` variant
- `NpkiCertEntry.cert_path` / `key_path` fields (only used for file source)
- Related tests: `test_scan_finds_cert_in_npki_structure`, `test_scan_empty_dir`, `test_scan_missing_key_skips`, `test_scan_multiple_certs`, `test_scan_depth_limit`
- Keep: `scan_all_certs()` (rename to `scan_keychain_certs()`), `CertSource::Keychain`, macOS keychain module

### 2. `script/src/npki_decrypt.rs` (or similar) — PBES2 decryption module
- PBES2 password-based decryption (PBKDF2-HMAC-SHA1)
- SEED-CBC cipher support (`kisaseed` crate dependency)
- AES-256-CBC cipher support
- `decrypt_cbc<C>()` generic function
- ASN.1 encryption parameter parsing

### 3. `Cargo.toml` — Remove dependencies
- `kisaseed` crate (SEED cipher)
- Any PBES2/PBKDF2 related crates used only for file decryption

### 4. HTTP API — Remove password parameter
- `POST /prove` endpoint: remove `password` field from request body
- Frontend: remove password input field from certificate selection UI

### 5. Frontend — Remove file upload UI
- Remove any "upload certificate file" or "enter password" UI elements
- Certificate list should only show keychain-discovered entries

## What to Keep
- `scan_all_certs()` → rename to `scan_certs()`, keychain-only
- `macos_keychain` module (the core)
- `sign_with_identity()` function
- `KeychainIdentity` struct
- `CertSource::Keychain`

## Testing After Removal
- [ ] `cargo test` passes with file-based tests removed
- [ ] Keychain scan still discovers macOS certificates
- [ ] Proof generation works with keychain-only flow
- [ ] Frontend shows keychain certs without password prompt
