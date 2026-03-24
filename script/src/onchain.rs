//! On-chain data reader via JSON-RPC eth_call.
//!
//! Reads CA leaves from the IdentityRegistry contract and builds the
//! Merkle proof automatically. Uses `ureq` (sync HTTP) to avoid
//! tokio runtime conflicts with SP1.

use crate::merkle::{self, Hash};
use sha2::{Digest, Sha256};
use std::time::Duration;

/// Fetch on-chain CA list, find user's CA, and return (root, proof).
/// Panics with a clear message if the CA is not registered on-chain.
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
    Ok(merkle::merkle_root_and_proof(&ca_leaves, my_index))
}

/// Fetch the on-chain CA leaf hashes from IdentityRegistry.getCaLeaves().
fn fetch_ca_leaves(rpc_url: &str, registry: &[u8; 20]) -> Result<Vec<Hash>, String> {
    let data = eth_call(rpc_url, registry, "0xae88b426")?; // getCaLeaves()
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
fn decode_bytes32_array(hex_str: &str) -> Result<Vec<Hash>, String> {
    let raw = hex::decode(hex_str.strip_prefix("0x").unwrap_or(hex_str))
        .map_err(|e| format!("Invalid hex: {}", e))?;

    if raw.len() < 64 {
        return Ok(vec![]);
    }

    let len_bytes: [u8; 8] = raw[56..64].try_into()
        .map_err(|_| "Invalid array length encoding")?;
    let count = u64::from_be_bytes(len_bytes) as usize;

    let data_start = 64;
    let expected_len = data_start + count * 32;
    if raw.len() < expected_len {
        return Err(format!(
            "ABI data too short: expected {} bytes for {} elements, got {}",
            expected_len, count, raw.len()
        ));
    }

    let mut leaves = Vec::with_capacity(count);
    for i in 0..count {
        let offset = data_start + i * 32;
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&raw[offset..offset + 32]);
        leaves.push(hash);
    }
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
        // count=2 but only 1 element of data
        let hex = format!(
            "0x{}{}{}",
            "0000000000000000000000000000000000000000000000000000000000000020",
            "0000000000000000000000000000000000000000000000000000000000000002",
            "1111111111111111111111111111111111111111111111111111111111111111",
        );
        assert!(decode_bytes32_array(&hex).is_err());
    }
}
