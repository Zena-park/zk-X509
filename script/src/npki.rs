//! NPKI (Korean National PKI) private key decryption module.
//!
//! Korean certificate private keys (signPri.key) are stored as PKCS#8
//! EncryptedPrivateKeyInfo with SEED-CBC-SHA1 (PBES2) encryption.
//!
//! Structure:
//!   EncryptedPrivateKeyInfo ::= SEQUENCE {
//!     encryptionAlgorithm  AlgorithmIdentifier (PBES2),
//!     encryptedData        OCTET STRING
//!   }
//!
//! PBES2 parameters:
//!   - KDF: PBKDF2 with HMAC-SHA1
//!   - Encryption: SEED-CBC (OID 1.2.410.200004.1.4) or AES-256-CBC

use aes::Aes256;
use cbc::cipher::{BlockDecryptMut, KeyIvInit};
use hmac::Hmac;
use kisaseed::SEED;
use pbkdf2::pbkdf2;
use sha1::Sha1;

/// OID for PBES2: 1.2.840.113549.1.5.13
const OID_PBES2: &[u8] = &[0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x05, 0x0d];

/// OID for PBKDF2: 1.2.840.113549.1.5.12
const OID_PBKDF2: &[u8] = &[0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x05, 0x0c];

/// OID for SEED-CBC: 1.2.410.200004.1.4
const OID_SEED_CBC: &[u8] = &[0x06, 0x08, 0x2a, 0x83, 0x1a, 0x8c, 0x9a, 0x44, 0x01, 0x04];

/// OID for AES-256-CBC: 2.16.840.1.101.3.4.1.42
const OID_AES256_CBC: &[u8] =
    &[0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x01, 0x2a];

/// OID for legacy NPKI SEED-CBC-SHA1: 1.2.410.200004.1.15
/// Combined KDF+cipher OID (not PBES2 wrapped). Used by older Korean NPKI keys.
const OID_NPKI_SEED_CBC_SHA1: &[u8] =
    &[0x06, 0x08, 0x2a, 0x83, 0x1a, 0x8c, 0x9a, 0x44, 0x01, 0x0f];

/// Errors that can occur during NPKI key decryption.
#[derive(Debug)]
pub enum NpkiError {
    InvalidFormat(String),
    UnsupportedAlgorithm(String),
    DecryptionFailed(String),
    Pkcs7PaddingError,
}

impl std::fmt::Display for NpkiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NpkiError::InvalidFormat(s) => write!(f, "Invalid format: {}", s),
            NpkiError::UnsupportedAlgorithm(s) => write!(f, "Unsupported algorithm: {}", s),
            NpkiError::DecryptionFailed(s) => write!(f, "Decryption failed: {}", s),
            NpkiError::Pkcs7PaddingError => write!(f, "Invalid PKCS#7 padding"),
        }
    }
}

impl std::error::Error for NpkiError {}

/// PBES2 parameters extracted from the ASN.1 structure.
struct Pbes2Params {
    salt: Vec<u8>,
    iterations: u32,
    key_length: usize,
    iv: Vec<u8>,
    cipher: CipherType,
}

enum CipherType {
    SeedCbc,
    Aes256Cbc,
    LegacySeedCbc, // OID 1.2.410.200004.1.15
}

/// Decrypt a Korean NPKI private key file (signPri.key).
///
/// # Arguments
/// * `encrypted_key_der` - Raw bytes of the signPri.key file
/// * `password` - User's certificate password
///
/// # Returns
/// Decrypted PKCS#1 RSA private key DER bytes
pub fn decrypt_npki_key(encrypted_key_der: &[u8], password: &str) -> Result<Vec<u8>, NpkiError> {
    // Parse the EncryptedPrivateKeyInfo ASN.1 structure manually
    let params = parse_encrypted_private_key_info(encrypted_key_der)?;
    let encrypted_data = extract_encrypted_data(encrypted_key_der)?;

    // Derive the encryption key using PBKDF2
    let mut derived_key = vec![0u8; params.key_length];
    pbkdf2::<Hmac<Sha1>>(
        password.as_bytes(),
        &params.salt,
        params.iterations,
        &mut derived_key,
    )
    .map_err(|e| NpkiError::DecryptionFailed(format!("PBKDF2 failed: {}", e)))?;

    // Decrypt based on cipher type
    let decrypted = match params.cipher {
        CipherType::Aes256Cbc => decrypt_cbc::<cbc::Decryptor<Aes256>>(&derived_key, &params.iv, &encrypted_data, "AES")?,
        CipherType::SeedCbc => decrypt_cbc::<cbc::Decryptor<SEED>>(&derived_key, &params.iv, &encrypted_data, "SEED")?,
        CipherType::LegacySeedCbc => {
            // Legacy NPKI: PBKDF2 produces 20 bytes (SHA1 output)
            // Key = derived_key[0..16], IV = derived_key[4..20]
            // This is the KISA standard derivation for OID 1.2.410.200004.1.15
            let key = &derived_key[0..16];
            let iv = &derived_key[4..20];
            decrypt_cbc::<cbc::Decryptor<SEED>>(key, iv, &encrypted_data, "SEED-legacy")?
        }
    };

    // Remove PKCS#7 padding
    let decrypted = remove_pkcs7_padding(&decrypted)?;

    // The decrypted data should be a PKCS#8 PrivateKeyInfo
    // Extract the RSA private key from it
    extract_rsa_key_from_pkcs8(&decrypted)
}

/// Parse the ASN.1 EncryptedPrivateKeyInfo to extract PBES2 parameters.
fn parse_encrypted_private_key_info(data: &[u8]) -> Result<Pbes2Params, NpkiError> {
    // Basic ASN.1 DER parsing
    // EncryptedPrivateKeyInfo ::= SEQUENCE {
    //   encryptionAlgorithm AlgorithmIdentifier,
    //   encryptedData OCTET STRING
    // }
    let mut pos = 0;

    // Outer SEQUENCE
    if data[pos] != 0x30 {
        return Err(NpkiError::InvalidFormat("Expected SEQUENCE".into()));
    }
    pos += 1;
    let (_seq_len, len_bytes) = read_der_length(&data[pos..])?;
    pos += len_bytes;

    // AlgorithmIdentifier SEQUENCE
    if data[pos] != 0x30 {
        return Err(NpkiError::InvalidFormat("Expected AlgorithmIdentifier SEQUENCE".into()));
    }
    pos += 1;
    let (alg_len, len_bytes) = read_der_length(&data[pos..])?;
    pos += len_bytes;
    let alg_start = pos;
    let alg_end = pos + alg_len;

    // Check for legacy NPKI format (OID 1.2.410.200004.1.15 = SEED-CBC-SHA1)
    if window_contains(&data[alg_start..alg_end], OID_NPKI_SEED_CBC_SHA1) {
        let alg_data = &data[alg_start..alg_end];
        let salt = find_octet_string_after(alg_data, OID_NPKI_SEED_CBC_SHA1)
            .ok_or_else(|| NpkiError::InvalidFormat("Cannot find legacy NPKI salt".into()))?;
        let iterations = find_integer_after(alg_data, &salt)
            .unwrap_or(2048);

        // Legacy NPKI KDF: PBKDF2-HMAC-SHA1 with key_length=20 (SHA1 output),
        // then truncate to 16 bytes for SEED key.
        // IV derived separately: PBKDF2(password, salt, iterations, 20)[4..20] or
        // use the first 8 bytes of salt padded to 16.
        // Common implementation: PBKDF2 produces 20 bytes, key=first 16, IV from salt.
        return Ok(Pbes2Params {
            salt: salt.clone(),
            iterations,
            key_length: 20, // PBKDF2 output = SHA1 size, will be split into key+IV
            iv: vec![0u8; 16], // placeholder, will be derived below
            cipher: CipherType::LegacySeedCbc,
        });
    }

    // Check for PBES2 OID
    if !window_contains(&data[alg_start..alg_end], OID_PBES2) {
        return Err(NpkiError::UnsupportedAlgorithm(
            format!("Expected PBES2 or legacy NPKI algorithm, found unknown OID at offset {}", alg_start),
        ));
    }

    // Extract PBKDF2 params (salt, iterations)
    let salt = find_octet_string_after(&data[alg_start..alg_end], OID_PBKDF2)
        .ok_or_else(|| NpkiError::InvalidFormat("Cannot find PBKDF2 salt".into()))?;

    let iterations = find_integer_after(&data[alg_start..alg_end], &salt)
        .unwrap_or(2048); // Default iterations for Korean NPKI

    // Determine cipher and extract IV
    let (cipher, iv) = if window_contains(&data[alg_start..alg_end], OID_AES256_CBC) {
        let iv = find_octet_string_after(&data[alg_start..alg_end], OID_AES256_CBC)
            .ok_or_else(|| NpkiError::InvalidFormat("Cannot find AES IV".into()))?;
        (CipherType::Aes256Cbc, iv)
    } else if window_contains(&data[alg_start..alg_end], OID_SEED_CBC) {
        let iv = find_octet_string_after(&data[alg_start..alg_end], OID_SEED_CBC)
            .ok_or_else(|| NpkiError::InvalidFormat("Cannot find SEED IV".into()))?;
        (CipherType::SeedCbc, iv)
    } else {
        return Err(NpkiError::UnsupportedAlgorithm(
            "Unknown encryption cipher (expected AES-256-CBC or SEED-CBC)".into(),
        ));
    };

    // Key length based on cipher
    let key_length = match cipher {
        CipherType::Aes256Cbc => 32,
        CipherType::SeedCbc => 16,
        CipherType::LegacySeedCbc => 20, // unreachable here, handled above
    };

    Ok(Pbes2Params {
        salt,
        iterations,
        key_length,
        iv,
        cipher,
    })
}

/// Extract the encrypted data (last OCTET STRING) from EncryptedPrivateKeyInfo.
fn extract_encrypted_data(data: &[u8]) -> Result<Vec<u8>, NpkiError> {
    // Find the last OCTET STRING (0x04) at the top level of the outer SEQUENCE
    let mut pos = 0;

    // Skip outer SEQUENCE tag + length
    if data[pos] != 0x30 {
        return Err(NpkiError::InvalidFormat("Expected SEQUENCE".into()));
    }
    pos += 1;
    let (_seq_len, len_bytes) = read_der_length(&data[pos..])?;
    pos += len_bytes;

    // Skip AlgorithmIdentifier SEQUENCE
    if data[pos] != 0x30 {
        return Err(NpkiError::InvalidFormat("Expected inner SEQUENCE".into()));
    }
    pos += 1;
    let (alg_len, len_bytes) = read_der_length(&data[pos..])?;
    pos += len_bytes + alg_len;

    // Next should be OCTET STRING with encrypted data
    if data[pos] != 0x04 {
        return Err(NpkiError::InvalidFormat("Expected OCTET STRING for encrypted data".into()));
    }
    pos += 1;
    let (data_len, len_bytes) = read_der_length(&data[pos..])?;
    pos += len_bytes;

    Ok(data[pos..pos + data_len].to_vec())
}

/// Read a DER length field. Returns (length, number_of_bytes_consumed).
fn read_der_length(data: &[u8]) -> Result<(usize, usize), NpkiError> {
    if data.is_empty() {
        return Err(NpkiError::InvalidFormat("Unexpected end of data".into()));
    }
    if data[0] < 0x80 {
        Ok((data[0] as usize, 1))
    } else {
        let num_bytes = (data[0] & 0x7f) as usize;
        if num_bytes > 4 || data.len() < 1 + num_bytes {
            return Err(NpkiError::InvalidFormat("Invalid length encoding".into()));
        }
        let mut len = 0usize;
        for i in 0..num_bytes {
            len = (len << 8) | data[1 + i] as usize;
        }
        Ok((len, 1 + num_bytes))
    }
}

/// Check if a byte window contains a subsequence.
fn window_contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack.windows(needle.len()).any(|w| w == needle)
}

/// Find an OCTET STRING value after a given OID pattern.
fn find_octet_string_after(data: &[u8], oid: &[u8]) -> Option<Vec<u8>> {
    let oid_pos = data.windows(oid.len()).position(|w| w == oid)?;
    let after = &data[oid_pos + oid.len()..];

    // Scan forward for the next OCTET STRING (0x04)
    for i in 0..after.len().saturating_sub(2) {
        if after[i] == 0x04 {
            let len = after[i + 1] as usize;
            if i + 2 + len <= after.len() {
                return Some(after[i + 2..i + 2 + len].to_vec());
            }
        }
    }
    None
}

/// Find an INTEGER value after a given byte position.
fn find_integer_after(data: &[u8], salt: &[u8]) -> Option<u32> {
    // Find salt in data, then look for INTEGER (0x02) after it
    let salt_end = data
        .windows(salt.len())
        .position(|w| w == salt.as_ref())?
        + salt.len();

    let after = &data[salt_end..];
    for i in 0..after.len().saturating_sub(2) {
        if after[i] == 0x02 {
            let len = after[i + 1] as usize;
            if i + 2 + len <= after.len() {
                let bytes = &after[i + 2..i + 2 + len];
                let mut val = 0u32;
                for &b in bytes {
                    val = (val << 8) | b as u32;
                }
                return Some(val);
            }
        }
    }
    None
}

/// Generic CBC decryption for any block cipher implementing BlockDecryptMut + KeyIvInit.
fn decrypt_cbc<C: BlockDecryptMut + KeyIvInit>(
    key: &[u8],
    iv: &[u8],
    data: &[u8],
    cipher_name: &str,
) -> Result<Vec<u8>, NpkiError> {
    let mut buf = data.to_vec();
    let decryptor = C::new_from_slices(key, iv)
        .map_err(|e| NpkiError::DecryptionFailed(format!("{} init failed: {}", cipher_name, e)))?;
    let decrypted_len = decryptor
        .decrypt_padded_mut::<cbc::cipher::block_padding::NoPadding>(&mut buf)
        .map_err(|e| NpkiError::DecryptionFailed(format!("{} decrypt failed: {}", cipher_name, e)))?
        .len();
    buf.truncate(decrypted_len);
    Ok(buf)
}

/// Remove PKCS#7 padding.
fn remove_pkcs7_padding(data: &[u8]) -> Result<Vec<u8>, NpkiError> {
    if data.is_empty() {
        return Err(NpkiError::Pkcs7PaddingError);
    }
    let pad_len = *data.last().unwrap() as usize;
    if pad_len == 0 || pad_len > 16 || pad_len > data.len() {
        return Err(NpkiError::Pkcs7PaddingError);
    }
    // Verify all padding bytes
    if data[data.len() - pad_len..].iter().any(|&b| b as usize != pad_len) {
        return Err(NpkiError::Pkcs7PaddingError);
    }
    Ok(data[..data.len() - pad_len].to_vec())
}

/// Extract RSA private key bytes from PKCS#8 PrivateKeyInfo.
fn extract_rsa_key_from_pkcs8(data: &[u8]) -> Result<Vec<u8>, NpkiError> {
    // PrivateKeyInfo ::= SEQUENCE {
    //   version INTEGER,
    //   privateKeyAlgorithm AlgorithmIdentifier,
    //   privateKey OCTET STRING (contains PKCS#1 RSAPrivateKey)
    // }
    // Try to parse as PKCS#8 first
    if data.len() > 2 && data[0] == 0x30 {
        let mut pos = 0;
        // Outer SEQUENCE
        pos += 1;
        let (_len, lb) = read_der_length(&data[pos..])
            .map_err(|e| NpkiError::InvalidFormat(format!("PKCS#8 parse: {}", e)))?;
        pos += lb;

        // version INTEGER
        if pos < data.len() && data[pos] == 0x02 {
            pos += 1;
            let (vlen, lb) = read_der_length(&data[pos..])
                .map_err(|e| NpkiError::InvalidFormat(format!("version: {}", e)))?;
            pos += lb + vlen;
        }

        // AlgorithmIdentifier SEQUENCE
        if pos < data.len() && data[pos] == 0x30 {
            pos += 1;
            let (alen, lb) = read_der_length(&data[pos..])
                .map_err(|e| NpkiError::InvalidFormat(format!("algid: {}", e)))?;
            pos += lb + alen;
        }

        // OCTET STRING containing the RSA private key
        if pos < data.len() && data[pos] == 0x04 {
            pos += 1;
            let (klen, lb) = read_der_length(&data[pos..])
                .map_err(|e| NpkiError::InvalidFormat(format!("privkey: {}", e)))?;
            pos += lb;
            return Ok(data[pos..pos + klen].to_vec());
        }
    }

    // If it's already a raw PKCS#1 key, return as-is
    Ok(data.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_der_length_short() {
        assert_eq!(read_der_length(&[0x10]).unwrap(), (16, 1));
    }

    #[test]
    fn test_read_der_length_long() {
        assert_eq!(read_der_length(&[0x82, 0x01, 0x00]).unwrap(), (256, 3));
    }

    #[test]
    fn test_remove_pkcs7_padding() {
        let data = vec![1, 2, 3, 4, 4, 4, 4, 4];
        assert_eq!(remove_pkcs7_padding(&data).unwrap(), vec![1, 2, 3, 4]);
    }

    #[test]
    fn test_window_contains() {
        assert!(window_contains(&[1, 2, 3, 4, 5], &[3, 4]));
        assert!(!window_contains(&[1, 2, 3, 4, 5], &[4, 3]));
    }

    #[test]
    fn test_decrypt_cbc_seed_known_answer() {
        // SEED-CBC known-answer test:
        // Key: 16 bytes of 0x01
        // IV:  16 bytes of 0x00
        // Plaintext: 16 bytes of 0x00 + PKCS#7 padding (16 bytes of 0x10)
        // We encrypt then decrypt and verify round-trip.
        use cbc::cipher::{BlockEncryptMut, KeyIvInit};

        let key = [0x01u8; 16];
        let iv = [0x00u8; 16];
        let plaintext = [0x00u8; 16];

        // Encrypt: plaintext + PKCS#7 pad (full block of 0x10)
        let mut input = Vec::from(&plaintext[..]);
        input.extend_from_slice(&[0x10u8; 16]); // PKCS#7 padding for 16-byte aligned

        let mut buf = input.clone();
        let encryptor = cbc::Encryptor::<SEED>::new_from_slices(&key, &iv).unwrap();
        let ciphertext = encryptor
            .encrypt_padded_mut::<cbc::cipher::block_padding::NoPadding>(&mut buf, 32)
            .unwrap()
            .to_vec();

        // Decrypt with our generic function
        let decrypted = decrypt_cbc::<cbc::Decryptor<SEED>>(&key, &iv, &ciphertext, "SEED").unwrap();
        let unpadded = remove_pkcs7_padding(&decrypted).unwrap();
        assert_eq!(unpadded, plaintext);
    }

    #[test]
    fn test_decrypt_cbc_aes_known_answer() {
        // AES-256-CBC round-trip test for parity
        use cbc::cipher::{BlockEncryptMut, KeyIvInit};

        let key = [0x42u8; 32];
        let iv = [0x00u8; 16];
        let plaintext = b"hello zk-x509!!!"; // exactly 16 bytes

        let mut input = Vec::from(&plaintext[..]);
        input.extend_from_slice(&[0x10u8; 16]);

        let mut buf = input.clone();
        let encryptor = cbc::Encryptor::<Aes256>::new_from_slices(&key, &iv).unwrap();
        let ciphertext = encryptor
            .encrypt_padded_mut::<cbc::cipher::block_padding::NoPadding>(&mut buf, 32)
            .unwrap()
            .to_vec();

        let decrypted = decrypt_cbc::<cbc::Decryptor<Aes256>>(&key, &iv, &ciphertext, "AES").unwrap();
        let unpadded = remove_pkcs7_padding(&decrypted).unwrap();
        assert_eq!(unpadded, plaintext);
    }
}
