# zk-X509

**Privacy-preserving on-chain identity from X.509 certificates via zero-knowledge proofs.**

Users prove ownership of a valid X.509 certificate (Korean NPKI, government eID, corporate CA, etc.) without revealing personal data. The proof is verified on-chain, enabling Sybil-resistant identity for DAOs, DeFi, and compliance — with no hardware requirements and no new credential infrastructure.

## Key Features

- **Any X.509 CA** — Korean NPKI (yessign, KICA), Estonian eID, corporate CAs, TLS CAs
- **Zero personal data on-chain** — only nullifier, Merkle root, and hashes
- **Private key never enters zkVM** — ownership proven via signature, key stays in OS keychain
- **CA anonymity** — Merkle tree hides which CA issued the certificate
- **Cross-DApp unlinkability** — different contracts get different nullifiers
- **Cross-chain replay defense** — chain_id bound into proof
- **CRL revocation checking** — Sorted Merkle Tree non-inclusion proof
- **Selective disclosure** — reveal country, org, etc. individually with private salt
- **Automatic expiry** — on-chain identity expires when certificate does

## Quick Start

### Prerequisites

```bash
# Rust + SP1 zkVM
curl -L https://sp1.succinct.xyz | bash && sp1up

# Foundry (Forge + Anvil)
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

### Generate test certificates

```bash
cd certs && bash generate-test-certs.sh && cd ..
```

### Run tests

```bash
# Rust tests (46 tests)
cargo test -p zk-x509-script --lib

# Solidity tests (40 tests)
cd contracts && forge test && cd ..
```

### Local environment (Anvil + contracts + server + frontend)

```bash
bash script/run-local.sh
# → Anvil on :8545, Server on :8080, Frontend on :3000
```

### Execute mode (fast, no proof)

```bash
cargo run --release --bin zk-x509 -- --execute \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0x0000000000000000000000000000000000000001
```

### Generate ZK proof (~2 min)

```bash
cargo run --release --bin zk-x509 -- --prove \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0xYOUR_WALLET --chain-id 31337 --registry-address 0xCONTRACT
```

## Project Structure

```
zk-X509/
├── program/          # SP1 zkVM guest program (Rust)
│   └── src/main.rs   # ZK circuit: cert chain, ownership, nullifier, CRL, Merkle
├── contracts/        # Solidity smart contracts
│   ├── src/IdentityRegistry.sol
│   └── test/IdentityRegistry.t.sol
├── script/           # Host scripts (prover, server, CLI tools)
│   ├── src/bin/main.rs        # CLI prover
│   ├── src/bin/server.rs      # HTTP prover server
│   ├── src/bin/interactive.rs # Interactive NPKI CLI
│   ├── src/bin/evm.rs         # Groth16/PLONK proof generation
│   ├── src/ownership.rs       # Signature generation
│   ├── src/merkle.rs          # CA Merkle tree
│   ├── src/smt.rs             # CRL Sorted Merkle Tree
│   └── src/npki.rs            # Korean NPKI key decryption
├── lib/              # Shared types (PublicValuesStruct)
├── frontend/         # Next.js web frontend
├── certs/            # Test certificates + generation scripts
├── docs/             # Documentation
│   ├── paper.md                  # Research paper
│   ├── testing-guide.md          # How to test
│   ├── deployment-guide.md       # How to deploy
│   ├── architecture.md           # System architecture
│   ├── crl-merkle-oracle-design.md
│   └── benchmark-methodology.md
└── BENCHMARKS.md     # Performance measurements
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design and data flow |
| [Testing Guide](docs/testing-guide.md) | Unit tests, E2E, interactive mode |
| [Deployment Guide](docs/deployment-guide.md) | Local, testnet, mainnet, L2 |
| [Benchmarks](BENCHMARKS.md) | Cycle counts and gas costs |
| [Paper](docs/paper.md) | Research paper (IEEE Blockchain target) |

## Performance

| Configuration | SP1 Cycles | Proof Time |
|--------------|--------:|----------:|
| ECDSA P-256 (single-level) | 11.8M | ~102s CPU |
| RSA-2048 (single-level) | 17.4M | ~102s CPU |
| ECDSA P-384 (single-level) | 47.8M | — |
| RSA-2048 + CRL | 23.2M | — |

On-chain gas: ~300K (Groth16), ~77K (mock verifier)

## Security

See [SECURITY_TODO.md](SECURITY_TODO.md) for the full security tracker.

Key protections:
- **Signature-based nullifier** — private key required, public key insufficient
- **Timestamp-bound ownership** — replay window limited by maxProofAge
- **Domain separation** — contract address + chain ID in nullifier domain
- **CRL Merkle Oracle** — non-inclusion proof for revocation checking
- **Disclosure salt** — deterministic private salt prevents brute-force

## License

[MIT](LICENSE)
