//! On-chain data reader via JSON-RPC eth_call.
//!
//! Reads CA leaves and Merkle root from the IdentityRegistry contract
//! without requiring a full Ethereum client library.
//! Uses `ureq` (sync HTTP) to avoid tokio runtime conflicts with SP1.

use crate::merkle::Hash;

/// Fetch the on-chain CA leaf hashes from IdentityRegistry.getCaLeaves().
pub fn fetch_ca_leaves(rpc_url: &str, registry: &[u8; 20]) -> Result<Vec<Hash>, String> {
    let data = eth_call(rpc_url, registry, "0xae88b426")?; // getCaLeaves()
    decode_bytes32_array(&data)
}

/// Fetch the on-chain caMerkleRoot from IdentityRegistry.caMerkleRoot().
pub fn fetch_ca_merkle_root(rpc_url: &str, registry: &[u8; 20]) -> Result<Hash, String> {
    let data = eth_call(rpc_url, registry, "0xe0aeacc1")?; // caMerkleRoot()
    let bytes = hex::decode(data.strip_prefix("0x").unwrap_or(&data))
        .map_err(|e| format!("Invalid hex in root: {}", e))?;
    if bytes.len() != 32 {
        return Err(format!("Expected 32 bytes for root, got {}", bytes.len()));
    }
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&bytes);
    Ok(hash)
}

fn eth_call(rpc_url: &str, registry: &[u8; 20], selector: &str) -> Result<String, String> {
    let to = format!("0x{}", hex::encode(registry));
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{"to": to, "data": selector}, "latest"],
        "id": 1
    });

    let resp: serde_json::Value = ureq::post(rpc_url)
        .send_json(&body)
        .map_err(|e| format!("RPC request failed: {}", e))?
        .body_mut()
        .read_json()
        .map_err(|e| format!("RPC response parse failed: {}", e))?;

    if let Some(err) = resp.get("error") {
        return Err(format!("RPC error: {}", err));
    }

    resp["result"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing result in RPC response".to_string())
}

/// Decode ABI-encoded bytes32[] from hex string.
fn decode_bytes32_array(hex_str: &str) -> Result<Vec<Hash>, String> {
    let raw = hex::decode(hex_str.strip_prefix("0x").unwrap_or(hex_str))
        .map_err(|e| format!("Invalid hex: {}", e))?;

    if raw.len() < 64 {
        return Ok(vec![]);
    }

    let len_bytes = &raw[32..64];
    let count = u64::from_be_bytes(len_bytes[24..32].try_into().unwrap()) as usize;

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
}
