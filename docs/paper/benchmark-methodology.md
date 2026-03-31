# Benchmark Methodology

## Environment

- **Machine:** MacBook (Apple Silicon)
- **OS:** macOS Darwin 24.4.0
- **Node.js:** v22.17.1
- **Rust:** 1.93.0-dev (SP1 succinct toolchain)
- **Circom:** 2.1.9
- **Foundry/Forge:** latest
- **Date:** 2026-03-23

## zk-X509 (our system)

**Source:** `/Users/zena/tokamak-projects/zk-X509`

### Cycle Count
```bash
# SP1 zkVM execute mode (real execution, no proof generation)
cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
# Output: "Cycles: 17,399,633" (RSA-2048)

cargo run --release -p zk-x509-script --bin zk-x509 -- --execute \
  --cert certs/ec_signCert.der --key certs/ec_signPri.key --ca-cert certs/ec_ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
# Output: "Cycles: 11,803,639" (ECDSA P-256)
```

### Gas Cost
```bash
cd contracts && forge test --gas-report
# register() with Groth16 verifier: ~300K gas
```

### Automated Benchmark Script
```bash
bash script/bench.sh
```

## zk-email-verify

**Source:** https://github.com/zkemail/zk-email-verify
**Fork with results:** https://github.com/Zena-park/zk-email-verify/tree/bench/zk-x509-comparison
**Results file:** `benchmarks/zk-x509-comparison.md`

### Circuit Constraints
```bash
cd packages/circuits
npx snarkjs r1cs info tests/compiled-test-circuits/email-verifier-test.r1cs
# Output:
#   Curve: bn-128
#   # of Wires: 1,233,977
#   # of Constraints: 1,263,698
#   # of Private Inputs: 1,460
#   # of Public Inputs: 17
```

### Test Suite Time
```bash
cd packages/circuits
NODE_OPTIONS=--max_old_space_size=8192 npx jest --runInBand --verbose tests/email-verifier.test.ts
# Output: 9 passed, Time: 95.859s
# Note: this includes circuit compilation + witness generation, NOT Groth16 proof generation
```

### Gas Cost
- Groth16 on-chain verifier: ~250K-300K gas (standard for BN254 Groth16)
- DKIM Registry operations: ~1K-300K gas (from forge test --gas-report)

### Circuit Details
- **System:** Circom 2.1.6 + Groth16 (snarkjs)
- **Main circuit:** `packages/circuits/email-verifier.circom`
- **RSA:** 2048-bit (n=121, k=17 chunks)
- **Hash:** SHA-256 (for email), Poseidon (for pubkey hashing)

## Polygon ID

**Source:** https://github.com/0xPolygonID/contracts
**Fork with results:** https://github.com/Zena-park/contracts/tree/bench/zk-x509-comparison
**Results file:** `benchmarks/zk-x509-comparison.md`

### Test Results
```bash
cd /Users/zena/gitwork/contracts
npm install
npx hardhat test
# Result: partial failure (external dependency issues with ZKP validators)
# ERC20 verification tests failed with TypeError in pack-utils.ts
```

### Data from Documentation
- **System:** Circom + Groth16 (iden3 libraries)
- **Constraints:** ~1M (from Polygon ID documentation)
- **Gas Cost:** ~350K (from deployment examples)
- **Note:** Requires DID issuance infrastructure (iden3 protocol)

## Other Systems (from published papers/docs)

### Semaphore
- **Source:** https://github.com/semaphore-protocol/semaphore
- **System:** Circom + Groth16
- **Constraints:** ~150K (Semaphore v4, estimated from circuit structure: EdDSA key derivation + Poseidon Merkle tree depth ~20)
- **Gas:** ~300K (estimated; Groth16 base ~207K + public inputs overhead. Consistent with community reports of ~300K for signaling)
- **Note:** Group membership proof only, no PKI

### zkPassport
- **Source:** https://github.com/zkpassport/circuits (Noir circuits), https://github.com/zkpassport/zkpassport-packages (SDK)
- **System:** Noir (Ultra Honk / Barretenberg)
- **Gas:** ~300K–500K (estimated from Ultra Honk verifier complexity; no official gas benchmarks published as of 2026-03)
- **Scoped nullifiers:** `H(private_nullifier, service_scope, service_subscope)` per `lib/commitment/scoped-nullifier/src/lib.nr`
- **Chain binding:** `BoundData` struct includes `senderAddress` and `chainId` per `Types.sol`
- **Note:** Requires NFC reader for passport/eID chip

### Worldcoin
- **Source:** https://github.com/worldcoin, https://whitepaper.world.org/
- **System:** Semaphore (zk-SNARKs) — per whitepaper: "Semaphore, a generic, open-source privacy layer for Ethereum applications based on zk-SNARKs"
- **Gas:** ~200K (estimated from Semaphore L2 verification)
- **Note:** Requires Orb biometric scanner (open-source hardware design per whitepaper: "The Orb's design is open sourced")

## Notes

- SP1 "cycles" and Circom "constraints" are not directly comparable units.
  SP1 cycles count RISC-V instructions executed; Circom constraints count R1CS relations.
- Gas costs for Groth16 verification are similar across systems (~250K-350K)
  because they all use the same BN254 pairing check on-chain.
- zk-email and zk-X509 both had ~96s test suite execution times, but this measures
  different things (circuit compilation vs zkVM execution).
