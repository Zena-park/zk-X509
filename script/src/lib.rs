pub mod ca;
pub mod keychain;
pub mod merkle;
pub mod onchain;
pub mod ownership;
pub mod smt;
pub mod stdin;

pub use stdin::{StdinParams, build_stdin};

/// Default chain ID for local Anvil development.
pub const DEFAULT_CHAIN_ID: u64 = 31337;

/// Default registry address (zero = not configured).
pub const DEFAULT_REGISTRY_ADDRESS: [u8; 20] = [0u8; 20];

/// Parse a hex-encoded Ethereum address (with optional "0x" prefix) into 20 bytes.
pub fn parse_eth_address(s: &str) -> Result<[u8; 20], String> {
    let hex_str = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(hex_str)
        .map_err(|e| format!("Invalid hex address '{}': {}", s, e))?;
    bytes.try_into()
        .map_err(|v: Vec<u8>| format!("Address '{}' must be 20 bytes, got {}", s, v.len()))
}
