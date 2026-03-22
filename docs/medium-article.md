# zk-X509: Bringing Government-Grade Identity to Blockchain — Without Revealing Who You Are

*Bridge the existing. Don't build from scratch.*

---

## The Problem

Blockchain needs identity for compliance, but its transparency makes storing personal data impossible. Every solution so far is a compromise: centralized KYC leaks data, Worldcoin requires special hardware, and DID systems need 3–5 years to bootstrap new credential infrastructure that regulators don't yet recognize.

The Tornado Cash sanctions, MiCA, and the Travel Rule all say the same thing: **"privacy" without "compliance" is a dead end.**

## The Insight

**Governments already solved this. Two decades ago.**

Over 4 billion X.509 digital certificates are active worldwide. In South Korea alone, **20 million NPKI certificates** are used daily for banking and government services — legally binding under the Electronic Signatures Act. These credentials are sitting on people's computers right now.

We don't need to build a new trust system. **We need to bridge the one that already works.**

## How zk-X509 Works

```
Your Certificate → Local ZK Prover → On-Chain Proof → Verified Wallet
    (private)        (your machine)     (public)        (anonymous)
```

1. You have an X.509 certificate (e.g., Korean NPKI from your bank)
2. A local prover on your machine generates a zero-knowledge proof inside SP1's zkVM
3. The proof goes on-chain — a smart contract verifies it in ~77,000 gas
4. Your wallet is "verified" — the blockchain sees only an anonymous nullifier and which CA issued your cert

**No personal data on-chain. No central server. No hardware. No new credentials needed.**

The ZK circuit verifies and commits, all privacy-preserving:

- **Certificate chain** — full chain to government root CA, every signature verified
- **Key ownership** — via OS keychain signature; private key never enters the ZK circuit
- **Trustless CRL** — revocation list's CA signature verified inside ZK
- **Registrant binding** — proof locked to your wallet address
- **Auto-expiry** — certificate expiry (`notAfter`) committed on-chain; identity lapses automatically
- **Selective disclosure** — choose which attributes to reveal (country, org, department) per proof; everything else stays hidden

## Why Not DIDs?

| | DID/Verifiable Credentials | zk-X509 |
|---|---|---|
| **Infrastructure** | Must build new issuers and registries | Leverages 4B+ existing certs |
| **Trust model** | "Who trusts the issuer?" — unclear | Government CAs — established |
| **Revocation** | Issuer-maintained (centralized) | Trustless CRL in ZK |
| **Regulatory standing** | Unresolved | Legally binding |
| **Time to deploy** | 3–5 years | 3–6 months |

DID builds *new* trust. zk-X509 bridges *existing* trust. They're complementary.

## Flexible Identity: One Size Does Not Fit All

Different applications need different rules. A DAO needs "one person, one vote." A DEX needs traders to use multiple wallets. zk-X509 handles both with a single parameter: **`maxWalletsPerCert`**.

| Setting | Use Case | Sybil Resistance |
|---------|----------|-----------------|
| `= 1` | DAO voting, airdrops | Maximum — one person, one wallet |
| `= 3` | DeFi protocols | Strong — trading / custody / cold |
| `= N` | zk-DEX, multi-account | Flexible — all tied to a real person |

The nullifier is derived from the certificate's public key and wallet index: `SHA-256(cert_public_key ‖ wallet_index)`. The ZK circuit enforces the limit. Regardless of the setting, every wallet is always backed by a real, government-issued certificate.

A single zk-X509 deployment on an L2 can serve multiple protocols — a governance module at `= 1`, a lending protocol at `= 3`, a DEX at `= 10` — all sharing the same identity layer.

## Selective Disclosure: Prove Attributes, Not Identity

This is what transforms zk-X509 from a simple "verified yes/no" tool into a **granular identity layer**.

With a `disclosure_mask` bitmask, users choose which certificate attributes to reveal — per proof, per application:

| Mask | What's Revealed | Use Case |
|------|----------------|----------|
| `0x00` | Nothing — just "verified" | Basic Sybil resistance |
| `0x01` | Country only | "Korean users only" DAO |
| `0x03` | Country + Organization | Corporate DeFi access |
| `0x0F` | All fields | Full attribute verification |

Each disclosed field is hashed (`SHA-256("KR")`) — the verifier checks the hash, not the plaintext. Undisclosed fields commit zero, revealing nothing — not even whether the field exists.

**The user decides what to reveal, not the verifier.** Same certificate, different proofs for different apps. Your bank DAO sees your country. Your DEX sees nothing. You control it.

## Auto-Expiry: Identity Follows the Certificate

On-chain identity shouldn't outlive the certificate that created it. zk-X509 commits the certificate's `notAfter` timestamp on-chain. When the cert expires, `isVerified()` automatically returns false. No admin action needed.

## Security: Formal Proofs, Not Claims

Security is formalized under the **Dolev-Yao adversary model** with game-based definitions:

- **Unforgeability** — reduced to RSA hardness + ZK soundness
- **Unlinkability** — reduced to SHA-256 collision resistance + ZK zero-knowledge property
- **Double-registration resistance** — deterministic nullifiers enforce the configured wallet limit
- **Front-running immunity** — proofs are bound to your wallet address

Breaking our system means breaking RSA or SHA-256.

## It Actually Works

| Metric | Value |
|--------|-------|
| ZK proving (single-level) | ~7.2M SP1 cycles |
| ZK proving (3-level NPKI chain) | ~13M SP1 cycles |
| On-chain verification | ~77K gas (mock) / ~300K gas (Groth16) |
| Proving time (GPU, estimated) | ~1–2 minutes |
| On L2 rollups | Negligible gas cost |

Full stack implemented: SP1 zkVM (Rust), Solidity smart contracts, Axum prover server with NPKI auto-discovery, web frontend with MetaMask. **The private key never even enters the ZK circuit.** The OS keychain signs a challenge, and only the signature goes into the prover. On devices with hardware-backed keystores (macOS Secure Enclave, Windows TPM), the private key may never exist in general process memory at all.

## What's Next

- **Self-service re-registration** — change wallets without admin approval
- **Client-side proving** — SP1 WASM for fully browser-based proofs
- **Cross-chain deployment** — one identity across multiple L2s
- **Academic publication** — submission to Financial Cryptography (FC)

## Try It

Open source: **[github.com/tokamak-network/zk-X509](https://github.com/tokamak-network/zk-X509)**

```bash
cd certs && bash generate-test-certs.sh && cd ..
cargo run --release -p zk-x509-script --bin zk-x509 -- \
  --execute --cert certs/signCert.der --key certs/signPri.key \
  --ca-cert certs/ca_pub.der
```

## The Bigger Picture

The blockchain identity space is obsessed with building from scratch. We think that's backwards.

Governments have issued **billions** of cryptographic credentials. The math checks out — RSA signatures verify inside ZK circuits, revocation lists check trustlessly, proofs bind to wallets.

**zk-X509 is the missing bridge.**

We're not replacing DID or competing with Worldcoin. We're asking: *before you build a new trust system, have you checked if there's already one that works?*

For 4 billion certificates and 20 million Korean users — there is.

---

*zk-X509 is developed by [Tokamak Network](https://tokamak.network). [Full paper](https://github.com/tokamak-network/zk-X509/blob/main/docs/paper.md) | [GitHub](https://github.com/tokamak-network/zk-X509)*
