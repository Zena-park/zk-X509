# zk-X509: Bringing Government-Grade Identity to Blockchain — Without Revealing Who You Are

*Bridge the existing. Don't build from scratch.*

---

## The Problem No One Has Solved

Public blockchains have a fundamental contradiction: they need identity verification for compliance, but their transparency makes it impossible to store personal data safely.

Every "solution" so far has been a compromise:

- **Centralized KYC** (Coinbase, Binance): A third party sees everything. Single point of failure. You're trusting someone not to leak your data — and breaches prove they can't.
- **Hardware-dependent** (Worldcoin's Orb, zkPassport's NFC): You need special devices. Billions of people are excluded. Try explaining to your grandmother why she needs to scan her iris.
- **DID/Verifiable Credentials** (Polygon ID, Veramo): Architecturally promising, but who issues the credentials? Who trusts the issuers? You need 3–5 years to bootstrap an entirely new trust ecosystem — and regulators still don't recognize it.

Meanwhile, the regulatory noose is tightening. The Tornado Cash sanctions, MiCA in Europe, the Travel Rule — all signal the same message: **"privacy" without "compliance" is a dead end.** The industry desperately needs a way to prove "I am a real, unique person" on-chain without revealing *which* person.

## The Insight Everyone Missed

Here's what we noticed: **governments already solved this problem. Two decades ago.**

Over 4 billion X.509 digital certificates are active worldwide right now. Governments issue them. Banks trust them. Courts recognize them. They're sitting on people's computers, in their keychains, on their smart cards.

In South Korea alone, approximately **20 million NPKI certificates** are used daily for banking, tax filing, government services, and e-commerce. These aren't toy credentials — they carry full legal weight under Korea's Electronic Signatures Act. A single Korean NPKI certificate can authorize a $10 million wire transfer.

The trust infrastructure already exists. The cryptographic signatures are already there. We don't need to build a new identity system. **We need to bridge the one that already works.**

## Introducing zk-X509

**zk-X509** lets you prove you own a valid government-issued X.509 certificate on a blockchain — without revealing your name, ID number, or any personal data.

The flow is simple:

```
Your Certificate → Local ZK Prover → On-Chain Proof → Verified Wallet
    (private)        (your machine)     (public)        (anonymous)
```

1. **You have a certificate** — a Korean NPKI cert from your bank, a corporate PKI cert, any X.509 credential
2. **A local prover** on your machine reads it and generates a zero-knowledge proof inside SP1's zkVM
3. **The proof goes on-chain**, where a smart contract verifies it in ~77,000 gas
4. **Your wallet is now "verified"** — but the blockchain only sees an anonymous nullifier and which CA issued your cert

No personal data on-chain. No central server seeing your identity. No hardware required. No new credential issuance needed.

## What the Zero-Knowledge Circuit Actually Proves

Inside the zkVM, six things are verified — all hidden from the outside world:

**1. Full Certificate Chain** — Your cert was signed by a real CA, which was signed by a root CA trusted by the government. Not just one signature — the *entire chain* from your cert to the government root.

**2. Temporal Validity** — Every certificate in the chain is currently valid. No expired certs sneaking through.

**3. Private Key Ownership** — You actually hold the private key matching the certificate. Not just a copy of the cert file — you prove cryptographic ownership.

**4. Trustless CRL Verification** — Your certificate hasn't been revoked. And here's the key difference: the revocation list itself is cryptographically verified inside the ZK circuit. The CA's signature on the CRL is checked. The freshness is validated. No trusting the host. No trusting an oracle. Trustless.

**5. Registrant Binding** — The proof is locked to your specific wallet address. If someone copies your proof from the mempool and tries to front-run you, it fails. The proof only works for your wallet.

**6. Nullifier Generation** — A unique, deterministic ID is derived from your certificate. Register once per cert, no more. This is how Sybil resistance works.

**What goes on-chain:** `nullifier`, `caRootHash`, `timestamp`, `registrant address`. That's it. Zero personal information. Everything else stays in the ZK proof.

## Sybil Resistance: One Person, One Identity

This deserves its own section because it's what makes zk-X509 useful for real applications.

The nullifier is deterministic: same certificate + same private key = same nullifier, every time. The smart contract rejects any nullifier it has seen before. This means:

- **One certificate = one verified wallet.** You can create 1,000 wallets, but only one gets verified.
- **No double voting in DAOs.** One person, one vote — enforced by government-issued cryptography.
- **Fair airdrops.** No farming with multiple wallets. Each verified human gets one share.

And because NPKI certificates are tied to real Korean resident registration numbers, the government has already done the hard work of ensuring one person doesn't have unlimited certificates.

## Why Not Just Use DIDs?

This is the question we get most often. Here's the honest answer:

| | DID/Verifiable Credentials | zk-X509 |
|---|---|---|
| **Existing infrastructure** | Must build new issuers, registries, schemas | Leverages 4B+ existing X.509 certs |
| **Trust model** | "Who trusts the issuer?" — unclear | Government CAs — already established |
| **Revocation** | Issuer-maintained registries (centralized) | Trustless CRL verification in ZK |
| **Regulatory standing** | Unresolved in most jurisdictions | Legally binding (Korea E-Sig Act) |
| **Time to deploy** | 3–5 years (ecosystem bootstrap) | 3–6 months (whitelist existing CAs) |
| **Privacy** | Varies by implementation | Full zero-knowledge, always |

**DID and zk-X509 are complementary, not competing.** DID is for creating *new* trust relationships where no credentials exist. zk-X509 is for bridging *existing* government trust to the blockchain — today, not in 5 years.

Think of it this way: DID asks "how do we build a new identity system?" zk-X509 asks "why build one when governments already did?"

## Real-World Use Cases

### DAO Governance
One person, one vote. No plutocracy, no Sybil attacks. Deploy with `maxWalletsPerCert = 1` and every verified member gets exactly one vote, backed by a government certificate.

### DeFi Compliance
Protocols that need to prove their users are real humans (for regulatory reasons) without collecting KYC data. Users prove they hold a valid certificate, the protocol sees only "verified: yes" — no names, no IDs.

### Decentralized Exchanges
Traders may need multiple wallets (trading, custody, cold storage) under a single verified identity. Deploy with `maxWalletsPerCert = N` to allow multiple wallets per certificate while still ensuring each wallet is tied to a real person.

### Fair Airdrops
Distribute tokens to verified humans, not bot farms. The nullifier ensures each certificate gets one allocation, regardless of how many wallets the holder controls.

### Government Services on L2
Public services deployed on L2 rollups can verify citizen identity without building new infrastructure. Citizens already have the certificates — they just need to generate a proof.

## Security: Not Just Claims — Proofs

We formalized the security analysis under the standard **Dolev-Yao adversary model** with game-based definitions. Four properties, each with a mathematical proof:

- **Unforgeability**: You can't fake a proof without a real CA-signed certificate. Reduced to the hardness of factoring RSA moduli + ZK soundness.
- **Unlinkability**: On-chain nullifiers can't be linked back to certificate holders. Reduced to SHA-256 preimage resistance.
- **Double-registration resistance**: One certificate = one registration. Enforced by deterministic nullifiers + on-chain deduplication.
- **Front-running immunity**: Proofs are bound to your wallet address. Copy them from the mempool? Useless — they only work for the original sender.

This isn't "we think it's secure." This is "here are the formal definitions, here are the reduction proofs, here's why breaking our system means breaking RSA or SHA-256."

## Performance: It Actually Works

This isn't a theoretical paper. We have a complete, working implementation:

| Metric | Value |
|--------|-------|
| ZK proving (single-level, CPU) | ~7.2M SP1 cycles |
| ZK proving (3-level NPKI chain, CPU) | ~13M SP1 cycles |
| On-chain verification | ~77K gas (mock) / ~300K gas (Groth16) |
| Proving time (CPU) | ~10 minutes |
| Proving time (GPU, estimated) | ~1–2 minutes |
| On L2 rollups | Negligible gas cost |

The full stack: SP1 zkVM guest program (Rust), Solidity smart contracts (Foundry), Axum prover server with NPKI auto-discovery, and a web frontend with MetaMask integration.

**Key architectural decision: the private key never leaves your machine.** The prover server runs locally, reads certificates directly from your NPKI directory, and only the proof travels to the blockchain. Not even the password leaves localhost.

## The Architecture

```
┌─────────────────────────────────────────────────┐
│              User's Machine (localhost)           │
│                                                   │
│  NPKI Directory ──→ Prover Server (Rust/Axum)    │
│  ~/Library/NPKI/    - Auto-discovers certs        │
│  signCert.der       - Decrypts key (SEED/AES)    │
│  signPri.key        - Generates ZK proof (SP1)   │
│                         │                         │
│  Web Browser ←──────────┘                         │
│  (cert selection + proof display)                 │
└─────────────────┬───────────────────────────────┘
                  │ ZK Proof + Public Values
                  ▼
┌─────────────────────────────────────────────────┐
│              Blockchain (L1 or L2)               │
│                                                   │
│  IdentityRegistry.sol                            │
│  - Verify registrant == msg.sender               │
│  - Check timestamp freshness                      │
│  - Verify CA whitelist                            │
│  - Check nullifier uniqueness                     │
│  - Verify ZK proof (SP1 Verifier)                │
│  → Wallet marked as verified                      │
└─────────────────────────────────────────────────┘
```

## What's Next

- **Configurable registration policy**: `maxWalletsPerCert` parameter so each L2 deployment can choose its Sybil resistance level (strict 1:1 for DAOs, flexible 1:N for DeFi)
- **Self-service re-registration**: Change your wallet without admin approval — prove you own the cert, swap the address
- **Client-side proving**: When SP1 supports WASM, proof generation moves entirely into the browser
- **On-chain CRL oracle**: Merkle root of revoked serials for even stronger revocation guarantees
- **Cross-chain deployment**: Same proof, multiple chains — one identity across the entire L2 ecosystem
- **Academic publication**: We're preparing a submission to Financial Cryptography (FC) with formal security proofs

## Try It

The code is open source: **[github.com/tokamak-network/zk-X509](https://github.com/tokamak-network/zk-X509)**

```bash
# Generate test certificates
cd certs && bash generate-test-certs.sh && cd ..

# Run ZK verification (execute mode, ~15 seconds)
cargo run --release -p zk-x509-script --bin zk-x509 -- \
  --execute --cert certs/signCert.der --key certs/signPri.key \
  --ca-cert certs/ca_pub.der
```

## The Bigger Picture

The blockchain identity space is obsessed with building new credential systems from scratch. We think that's backwards.

Governments have already issued **billions** of cryptographic credentials. They're on people's computers right now. The math checks out — RSA signatures can be verified inside a ZK circuit. The revocation lists can be checked trustlessly. The proofs can be bound to specific wallets.

The only missing piece was a system to do it all privately and put it on-chain.

**zk-X509 is that missing piece.**

We're not replacing DID. We're not competing with Worldcoin. We're asking a different question: *before you build a new trust system, have you checked if there's already one that works?*

For 4 billion certificates and 20 million Korean users — there is.

---

*zk-X509 is developed by [Tokamak Network](https://tokamak.network). For technical details, see our [full paper](https://github.com/tokamak-network/zk-X509/blob/main/docs/paper.md). For questions and contributions, visit our [GitHub](https://github.com/tokamak-network/zk-X509).*
