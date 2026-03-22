# zk-X509: Bringing Government-Grade Identity to Blockchain — Without Revealing Who You Are

## The Problem: Blockchain Identity is Broken

Public blockchains have a fundamental contradiction: they need identity verification for compliance, but their transparency makes it impossible to store personal data safely. Every "solution" so far has been a compromise:

- **Centralized KYC** (e.g., Coinbase, Binance): A third party sees everything. Single point of failure. You're trusting someone not to leak your data.
- **Hardware-dependent** (e.g., Worldcoin's Orb, zkPassport's NFC): You need special devices. Billions of people are excluded.
- **DID/Verifiable Credentials** (e.g., Polygon ID): Promising architecture, but who issues the credentials? Who trusts the issuers? It takes 3–5 years to bootstrap an entirely new trust ecosystem.

Meanwhile, regulators are cracking down. The Tornado Cash sanctions showed that "privacy" without "compliance" is a dead end. The industry desperately needs a way to prove "I am a real, unique person" on-chain without revealing *which* person.

## The Insight: Government Already Solved This

Here's what we noticed: **over 4 billion X.509 digital certificates are already active worldwide.** Governments issue them. Banks trust them. They're legally binding.

In South Korea alone, approximately 20 million NPKI (National PKI) certificates are used for banking, government services, and e-commerce. These certificates carry legal weight under Korea's Electronic Signatures Act. They've been deployed for over two decades.

The trust infrastructure already exists. We don't need to build a new one. We need to **bridge it to the blockchain.**

## Introducing zk-X509

**zk-X509** is a system that lets you prove you own a valid government-issued X.509 certificate on a blockchain — without revealing your name, ID number, or any personal data.

Here's how it works:

1. **You have a certificate** (e.g., a Korean NPKI certificate from your bank)
2. **A local prover** on your machine reads the certificate and generates a zero-knowledge proof inside SP1's zkVM
3. **The proof goes on-chain**, where a smart contract verifies it
4. **Your wallet is now "verified"** — but the blockchain only sees a nullifier (anonymous ID) and which CA issued your cert

That's it. No personal data on-chain. No central server seeing your identity. No hardware required.

## What Happens Inside the Zero-Knowledge Circuit

The ZK circuit verifies six things, all hidden from the outside world:

1. **Certificate chain** — Your cert was signed by a real CA, which was signed by a root CA trusted by the government
2. **Temporal validity** — Every certificate in the chain is currently valid
3. **Private key ownership** — You actually hold the key matching the certificate (not just a copy of the cert)
4. **CRL verification** — Your certificate hasn't been revoked (and the revocation list itself is cryptographically verified — no trusting the host)
5. **Registrant binding** — The proof is locked to your specific wallet address (no one can steal your proof from the mempool)
6. **Nullifier generation** — A unique, deterministic ID is derived from your certificate so you can't register twice

The only public outputs: `nullifier`, `caRootHash`, `timestamp`, `registrant address`. Zero personal information.

## Why Not Just Use DIDs?

This is the question we get most often. Here's the honest comparison:

| | DID/Verifiable Credentials | zk-X509 |
|---|---|---|
| **Existing infrastructure** | Must build new issuers, registries, schemas | Leverages 4B+ existing X.509 certs |
| **Trust model** | "Who trusts the issuer?" — unclear | Government CAs — already established |
| **Revocation** | Issuer-maintained registries (centralized) | Trustless CRL verification in ZK |
| **Regulatory standing** | Unresolved | Legally binding (e.g., Korea E-Sig Act) |
| **Time to deploy** | 3–5 years | 3–6 months |
| **Privacy** | Varies by implementation | Full zero-knowledge |

**DID and zk-X509 are complementary, not competing.** DID is great for creating *new* trust relationships where no credentials exist. zk-X509 is for bridging *existing* government trust to the blockchain — today, not in 5 years.

## Security: Formal Analysis Under Dolev-Yao

We don't just claim security — we prove it with game-based definitions under the standard Dolev-Yao adversary model:

- **Unforgeability**: You can't fake a proof without a real CA-signed certificate (reduced to RSA hardness + ZK soundness)
- **Unlinkability**: On-chain nullifiers can't be linked back to certificate holders (reduced to SHA-256 preimage resistance)
- **Double-registration resistance**: One certificate = one wallet, enforced by deterministic nullifiers
- **Front-running immunity**: Proofs are bound to your wallet address — copying them from the mempool is useless

## Performance: It Actually Works

This isn't a theoretical paper. We have a working implementation:

| Metric | Value |
|--------|-------|
| ZK proving (single-level, CPU) | ~7.2M SP1 cycles |
| ZK proving (3-level chain, CPU) | ~13M SP1 cycles |
| On-chain verification | ~77K gas (mock) / ~300K gas (Groth16) |
| Proving time (CPU) | ~10 minutes |
| Proving time (GPU, estimated) | ~1–2 minutes |

The entire stack is implemented: SP1 zkVM guest program (Rust), Solidity smart contracts (Foundry), local prover server (Axum), and a web frontend with MetaMask integration.

## The Architecture

```
User's Machine                          Blockchain
┌─────────────┐                    ┌──────────────────┐
│  NPKI Certs  │──→ Local Prover ──→│ IdentityRegistry │
│  (on disk)   │   (Rust/SP1)      │   (Solidity)     │
└─────────────┘        │           └──────────────────┘
                       │                    ↑
                  ZK Proof              MetaMask TX
                       │                    │
                  Web Frontend ─────────────┘
```

Key architectural decision: **the private key never leaves your machine.** The prover server runs locally, reads certificates directly from your NPKI directory, and only the proof goes to the blockchain.

## What's Next

- **Client-side proving**: When SP1 supports WASM, proof generation moves entirely into the browser
- **On-chain CRL oracle**: Merkle root of revoked serials for stronger revocation guarantees
- **Cross-chain deployment**: Same proof, multiple chains
- **ECDSA support**: Beyond RSA to modern certificate algorithms
- **Academic publication**: We're preparing a submission to Financial Cryptography (FC)

## Try It

The code is open source: [github.com/tokamak-network/zk-X509](https://github.com/tokamak-network/zk-X509)

```bash
# Generate test certificates
cd certs && bash generate-test-certs.sh && cd ..

# Run ZK verification (execute mode, ~15 seconds)
cargo run --release -p zk-x509-script --bin zk-x509 -- \
  --execute --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der
```

## The Bigger Picture

The blockchain identity space is obsessed with building new credential systems from scratch. We think that's backwards.

Governments have already issued billions of cryptographic credentials. They're sitting on everyone's computers right now. The math checks out — RSA signatures can be verified inside a ZK circuit. The only missing piece was a system to do it privately and put it on-chain.

**zk-X509 is that missing piece.**

We're not replacing DID. We're not competing with Worldcoin. We're saying: before you build a new trust system, check if there's already one that works. For 4 billion certificates, there is.

---

*zk-X509 is developed by Tokamak Network. For technical details, see our [full paper](https://github.com/tokamak-network/zk-X509/blob/main/docs/paper.md).*
