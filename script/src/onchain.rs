//! On-chain data reader via JSON-RPC eth_call.
//!
//! Reads CA leaves from the IdentityRegistry contract and builds the
//! Merkle proof automatically. Uses `ureq` (sync HTTP) to avoid
//! tokio runtime conflicts with SP1.

use crate::merkle::{self, Hash};
use sha2::{Digest, Sha256};
use std::time::Duration;

/// keccak256("getCaLeaves()")[:4]
const SELECTOR_GET_CA_LEAVES: &str = "0xae88b426";

/// Fetch MAX_WALLETS_PER_CERT from the on-chain registry.
pub fn fetch_max_wallets(rpc_url: &str, registry: &[u8; 20]) -> Result<u32, String> {
    let data = eth_call(rpc_url, registry, "0x10638be1")?; // MAX_WALLETS_PER_CERT()
    let bytes = hex::decode(data.strip_prefix("0x").unwrap_or(&data))
        .map_err(|e| format!("Invalid hex: {}", e))?;
    if bytes.len() < 32 {
        return Err(format!("Expected 32 bytes, got {}", bytes.len()));
    }
    let val = u32::from_be_bytes(bytes[28..32].try_into().unwrap());
    if val == 0 {
        return Err("MAX_WALLETS_PER_CERT is 0 — contract may not be deployed correctly".to_string());
    }
    Ok(val)
}

/// Fetch on-chain CA list, find user's CA, and return (root, proof).
/// Returns `Err` if the CA is not found or no CAs are registered.
pub fn build_ca_merkle_from_onchain(
    rpc_url: &str,
    registry: &[u8; 20],
    ca_pub_key: &[u8],
) -> Result<(Hash, Vec<Hash>), String> {
    let ca_leaves = fetch_ca_leaves(rpc_url, registry)?;
    if ca_leaves.is_empty() {
        return Err("No CAs registered on-chain".to_string());
    }

    let ca_leaf: Hash = Sha256::digest(ca_pub_key).into();
    let my_index = ca_leaves.iter().position(|h| *h == ca_leaf)
        .ok_or_else(|| format!(
            "Your CA (0x{}) is not registered on-chain. Register it first via addCA().",
            hex::encode(ca_leaf)
        ))?;

    println!("On-chain CAs: {}, your index: {}", ca_leaves.len(), my_index);
    merkle::merkle_root_and_proof(&ca_leaves, my_index)
}

/// Build CA Merkle tree: try on-chain first, fall back to single-CA local mode.
///
/// On-chain errors are logged via `eprintln!` and the function falls back
/// to a single-CA tree (no anonymity set). Callers that need strict on-chain
/// verification should use `build_ca_merkle_from_onchain()` directly.
pub fn build_ca_merkle(
    rpc_url: &str,
    registry: &[u8; 20],
    ca_pub_key: &[u8],
) -> (Hash, Vec<Hash>) {
    match build_ca_merkle_from_onchain(rpc_url, registry, ca_pub_key) {
        Ok(result) => result,
        Err(e) => {
            eprintln!("  ⚠ On-chain CA Merkle failed: {}", e);
            eprintln!("    Falling back to single-CA local mode (proof may not verify on-chain)");
            let (_leaf, root, proof) = crate::merkle::ca_merkle_tree(ca_pub_key, &[])
                .expect("Single-leaf CA Merkle tree cannot fail");
            (root, proof)
        }
    }
}

pub fn fetch_ca_leaves(rpc_url: &str, registry: &[u8; 20]) -> Result<Vec<Hash>, String> {
    let data = eth_call(rpc_url, registry, SELECTOR_GET_CA_LEAVES)?;
    decode_bytes32_array(&data)
}

fn eth_call(rpc_url: &str, registry: &[u8; 20], selector: &str) -> Result<String, String> {
    let to = format!("0x{}", hex::encode(registry));
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{"to": to, "data": selector}, "latest"],
        "id": 1
    });

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .into();
    let resp: serde_json::Value = agent.post(rpc_url)
        .send_json(&body)
        .map_err(|e| format!("RPC request to {} failed: {}", rpc_url, e))?
        .body_mut()
        .read_json()
        .map_err(|e| format!("RPC response parse failed: {}", e))?;

    if let Some(err) = resp.get("error") {
        return Err(format!("RPC error: {}", serde_json::to_string(err).unwrap_or_default()));
    }

    resp.get("result")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing 'result' in RPC response".to_string())
}

/// Decode ABI-encoded bytes32[] from hex string.
/// Validates offset word == 0x20 and length word upper bytes == 0.
fn decode_bytes32_array(hex_str: &str) -> Result<Vec<Hash>, String> {
    let raw = hex::decode(hex_str.strip_prefix("0x").unwrap_or(hex_str))
        .map_err(|e| format!("Invalid hex: {}", e))?;

    if raw.len() < 64 {
        return Err(format!(
            "ABI data too short: expected at least 64 bytes (offset + length), got {}",
            raw.len()
        ));
    }

    // Validate offset word == 0x20
    if raw[31] != 0x20 || raw[..31].iter().any(|&b| b != 0) {
        return Err("Invalid ABI offset: expected 0x20".to_string());
    }

    // Validate upper 24 bytes of length word are zero
    if raw[32..56].iter().any(|&b| b != 0) {
        return Err("Array length overflow: upper bytes non-zero".to_string());
    }

    let len_bytes: [u8; 8] = raw[56..64].try_into()
        .map_err(|_| "Invalid array length encoding".to_string())?;
    let count_u64 = u64::from_be_bytes(len_bytes);
    let count: usize = usize::try_from(count_u64)
        .map_err(|_| format!("Array count {} exceeds platform usize", count_u64))?;

    let data_start = 64;
    let expected_len = count.checked_mul(32)
        .and_then(|n| n.checked_add(data_start))
        .ok_or_else(|| format!("Array length overflow: count={}", count))?;
    if raw.len() < expected_len {
        return Err(format!(
            "ABI data too short: expected {} bytes for {} elements, got {}",
            expected_len, count, raw.len()
        ));
    }

    let leaves = raw[data_start..expected_len]
        .chunks_exact(32)
        .map(|chunk| chunk.try_into().unwrap())
        .collect();
    Ok(leaves)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_empty_array() {
        let hex = "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000";
        let result = decode_bytes32_array(hex).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_decode_single_element() {
        let hex = format!(
            "0x{}{}{}",
            "0000000000000000000000000000000000000000000000000000000000000020",
            "0000000000000000000000000000000000000000000000000000000000000001",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
        let result = decode_bytes32_array(&hex).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], [0xaa; 32]);
    }

    #[test]
    fn test_decode_two_elements() {
        let hex = format!(
            "0x{}{}{}{}",
            "0000000000000000000000000000000000000000000000000000000000000020",
            "0000000000000000000000000000000000000000000000000000000000000002",
            "1111111111111111111111111111111111111111111111111111111111111111",
            "2222222222222222222222222222222222222222222222222222222222222222",
        );
        let result = decode_bytes32_array(&hex).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], [0x11; 32]);
        assert_eq!(result[1], [0x22; 32]);
    }

    #[test]
    fn test_decode_truncated_data() {
        let hex = format!(
            "0x{}{}{}",
            "0000000000000000000000000000000000000000000000000000000000000020",
            "0000000000000000000000000000000000000000000000000000000000000002",
            "1111111111111111111111111111111111111111111111111111111111111111",
        );
        assert!(decode_bytes32_array(&hex).is_err());
    }

    #[test]
    fn test_decode_too_short_rejects() {
        // Only 32 bytes (missing length word)
        assert!(decode_bytes32_array("0x0000000000000000000000000000000000000000000000000000000000000020").is_err());
        // Empty hex
        assert!(decode_bytes32_array("0x").is_err());
    }

    #[test]
    fn test_decode_huge_count_overflow_rejects() {
        // count = 0x0800000000000000 → count * 32 overflows usize on 64-bit
        let hex = format!(
            "0x{}{}",
            "0000000000000000000000000000000000000000000000000000000000000020",
            "0800000000000000000000000000000000000000000000000000000000000000",
        );
        let result = decode_bytes32_array(&hex);
        assert!(result.is_err());
        // Verify it's an overflow error, not a truncation error
        let err = result.unwrap_err();
        assert!(err.contains("overflow") || err.contains("exceeds"), "unexpected error: {}", err);
    }

    #[test]
    fn test_decode_invalid_offset_rejects() {
        // offset = 0x40 instead of 0x20
        let hex = format!(
            "0x{}{}",
            "0000000000000000000000000000000000000000000000000000000000000040",
            "0000000000000000000000000000000000000000000000000000000000000000",
        );
        assert!(decode_bytes32_array(&hex).is_err());
    }
}
