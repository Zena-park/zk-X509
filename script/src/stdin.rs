//! Shared SP1Stdin builder for the ZK X.509 program.
//!
//! All binaries (main, evm, interactive, server) write the same fields in the
//! same order.  This module provides a single `build_stdin` function so the
//! write sequence is defined in exactly one place.

use sp1_sdk::SP1Stdin;

use crate::merkle::Hash;
use crate::smt;

/// Parameters for building the SP1 stdin.
pub struct StdinParams<'a> {
    pub cert_der: &'a [u8],
    pub ownership_sig: &'a [u8],
    pub nullifier_sig: &'a [u8],
    pub cert_chain: &'a [Vec<u8>],
    pub timestamp: u64,
    pub crl_der: &'a [u8],
    pub registrant: &'a [u8; 20],
    pub wallet_index: u32,
    pub max_wallets: u32,
    pub disclosure_mask: u8,
    pub ca_merkle_proof: &'a Vec<Hash>,
    pub ca_merkle_root: Hash,
    pub registry_address: &'a [u8; 20],
    pub chain_id: u64,
}

/// Build the SP1Stdin from the given parameters.
pub fn build_stdin(p: &StdinParams) -> SP1Stdin {
    let mut stdin = SP1Stdin::new();
    stdin.write(&p.cert_der);
    stdin.write(&p.ownership_sig);
    stdin.write(&p.nullifier_sig);
    stdin.write(&p.cert_chain);
    stdin.write(&p.timestamp);
    stdin.write(&p.crl_der);
    stdin.write(p.registrant);
    stdin.write(&p.wallet_index);
    stdin.write(&p.max_wallets);
    stdin.write(&p.disclosure_mask);
    stdin.write(&p.ca_merkle_proof);
    stdin.write(&p.ca_merkle_root);
    stdin.write(p.registry_address);
    stdin.write(&p.chain_id);
    smt::write_disabled_crl_inputs(&mut stdin);
    stdin
}
