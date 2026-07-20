# zk-X509

**Privacy-preserving on-chain identity from X.509 certificates via zero-knowledge proofs.**

Users prove ownership of a valid X.509 certificate (Korean NPKI, government eID, corporate CA, etc.) without revealing personal data. The proof is verified on-chain, enabling Sybil-resistant identity for DAOs, DeFi, and compliance — with no hardware requirements and no new credential infrastructure.

🌐 **Live app:** **[zk-x509.web.app](https://zk-x509.web.app)** — running against the Sepolia deployment below
📖 **Read the story:** [Stop Building New Identity Systems](https://medium.com/@zena_tokamak/68712efaa09e) (English) · [한국어](https://medium.com/@zena_tokamak/727143a942f1)

## Key Features

- **Any X.509 CA** — Korean NPKI (yessign, KICA), Estonian eID, corporate CAs, TLS CAs
- **Zero personal data on-chain** — only nullifier, Merkle root, and hashes
- **Private key never enters zkVM** — ownership proven via signature; key stays in the OS keychain
- **CA anonymity** — Merkle tree hides which CA issued the certificate
- **Cross-DApp unlinkability** — different contracts get different nullifiers
- **Replay defense** — chain ID and contract address bound into the proof
- **CRL revocation checking** — Sorted Merkle Tree non-inclusion proof
- **Selective disclosure** — reveal country, org, etc. individually with a private salt
- **Automatic expiry** — on-chain identity expires when the certificate does

## Live Deployment (Sepolia, chain ID `11155111`)

Web app: <https://zk-x509.web.app> · addresses: [`deployments/11155111.json`](deployments/11155111.json)

| Contract | Address |
|----------|---------|
| RegistryFactory | `0x9e937dF6ac0E85979622519068412A518fa085d9` |
| Registry (`users`, maxWallets 10) | `0x3cF6A96f1970053ffDf957074F988aD53D13ada3` |
| Registry (`relayers`, maxWallets 2) | `0x9fDE6182B1fd10F2eDfE15b704FE95787C170914` |
| SP1 Verifier (Groth16 v6.0.0) | `0x261a1619cC63273de7c64872B769305732761888` |
| Program VKey | `0x0048b091078fa9045ab90a788483ed51c0ec315eea7ca0d8fe118d1ae17b7e13` |

> **vkey must match.** A Groth16 proof verifies on-chain only if your prover's ELF
> produces the `programVKey` above. The released desktop app is built in CI against
> this exact vkey — local builds may differ. Check yours with `cargo run --release --bin vkey`.

## Quick Start

```bash
# Prerequisites: Rust + SP1 zkVM, Foundry
curl -L https://sp1.succinct.xyz | bash && sp1up
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Test certificates
cd certs && bash generate-test-certs.sh && cd ..

# Tests
cargo test -p zk-x509-script --lib      # Rust (51 tests)
cd contracts && forge test && cd ..     # Solidity (125 tests)

# Full local stack: Anvil :8545, prover :8080, backend :4444, frontend :3000
bash script/run-local.sh
```

### Prove against Sepolia

```bash
# Desktop app (cert from OS keychain → proof → submit)
make run

# Or the CLI prover. --rpc-url fetches the registry's on-chain CA list
# so the CA Merkle tree matches the deployed contract.
cargo run --release --bin zk-x509 -- --prove \
  --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der \
  --registrant 0xYOUR_WALLET \
  --chain-id 11155111 \
  --registry-address 0x3cF6A96f1970053ffDf957074F988aD53D13ada3 \
  --rpc-url https://ethereum-sepolia.publicnode.com
```

Swap `--prove` for `--execute` to run the circuit without generating a proof (fast).
Then wrap the proof for the EVM verifier (`evm` binary) and submit with `cast` — see the
[E2E Test Guide](docs/development/e2e-test-guide.md).

### Run the frontend locally

No local node or backend needed — point it at the live Sepolia contracts and the
hosted backend. Create `frontend/.env.local` (git-ignored):

```bash
NEXT_PUBLIC_RPC_URL="https://ethereum-sepolia.publicnode.com"
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_FACTORY_ADDRESS="0x9e937dF6ac0E85979622519068412A518fa085d9"
NEXT_PUBLIC_SP1_VERIFIER_ADDRESS="0x261a1619cC63273de7c64872B769305732761888"
NEXT_PUBLIC_REGISTRY_ADDRESS="0x3cF6A96f1970053ffDf957074F988aD53D13ada3"
NEXT_PUBLIC_BACKEND_URL="https://zk-x509.web.app"
```

```bash
cd frontend && npm install && npm run dev   # → http://localhost:3000
```

To deploy your own instance instead, see
[Deployment Guide §2 (Testnet)](docs/development/deployment-guide.md#2-testnet-sepolia--holesky).

## Project Structure

| Path | Contents |
|------|----------|
| `program/` | SP1 zkVM guest program — cert chain, ownership, nullifier, CRL, Merkle |
| `contracts/` | `IdentityRegistry.sol` (BeaconProxy), `RegistryFactory.sol`, tests |
| `script/` | Host binaries: CLI prover, prover server, interactive CLI, `evm`, `vkey` |
| `lib/` | Shared types (`PublicValuesStruct`) |
| `frontend/` · `desktop/` · `backend/` | Next.js web app · Tauri desktop app · Firebase backend |
| `certs/` · `deployments/` · `docs/` | Test certs · on-chain ledgers · architecture & guides |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/development/architecture.md) | System design and data flow |
| [Testing Guide](docs/development/testing-guide.md) | Unit tests, E2E, interactive mode |
| [E2E Test Guide](docs/development/e2e-test-guide.md) | End-to-end proof + on-chain submit |
| [Deployment Guide](docs/development/deployment-guide.md) | Local, testnet, mainnet, L2 |
| [Prover-Server Guide](docs/development/prover-server-guide.md) | Delegated proving operator setup |
| [Benchmarks](BENCHMARKS.md) | Cycle counts and gas costs |
| [Paper](docs/paper/paper.md) | Research paper |

## Performance

ECDSA P-256 is the cheapest curve at **11.8M SP1 cycles** — 32% below RSA-2048
(17.4M); CRL verification adds ~33%. On-chain registration costs ~90K gas with a
mock verifier, plus the SP1 Groth16 verifier's own cost.
Full cycle counts and methodology: [BENCHMARKS.md](BENCHMARKS.md).

## Security

- **Signature-based nullifier** — private key required, public key insufficient
- **Timestamp-bound ownership** — replay window limited by `maxProofAge`
- **Domain separation** — contract address + chain ID in nullifier domain
- **CRL Merkle Oracle** — non-inclusion proof for revocation checking
- **Disclosure salt** — deterministic private salt prevents brute-force

## License

[MIT](LICENSE)
