# Stop Building New Identity Systems: How zk-X509 Bridges 4 Billion Existing IDs to Web3

*Privacy-preserving, legally binding, and zero-hardware. Why the future of on-chain identity is already in your pocket.*

![zk-X509 Overview](https://github.com/user-attachments/assets/45670a59-39e4-4df1-b284-24403cfdd6b9)

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
2. A local prover on your machine generates a zero-knowledge proof inside [SP1](https://docs.succinct.xyz/) (a high-performance, Rust-based zkVM by Succinct)
3. The proof goes on-chain — a smart contract verifies it in ~300,000 gas (Groth16)
4. Your wallet is "verified" — the blockchain sees only an anonymous nullifier; which CA issued your cert remains hidden (CA-Membership Hiding via Merkle proof)

**No personal data on-chain. No central server. No hardware. No new credentials needed.**

### Your Private Key Never Leaves the Hardware

Unlike other ZK protocols where secrets must be fed into the circuit, zk-X509 treats the private key as a **black box**. By leveraging OS-level Secure Enclaves (macOS) and TPMs (Windows), the key never exists in general process memory. The ZK proof only verifies the *result* of a hardware-secured signature — the key itself never enters the prover.

### What the ZK Circuit Verifies

- **Certificate chain** — full chain to government root CA, every signature verified
- **Key ownership** — via OS keychain signature; private key never enters the ZK circuit
- **Trustless CRL** — revocation list's CA signature verified inside ZK
- **Registrant binding** — proof locked to your wallet address
- **Auto-expiry** — certificate expiry (`notAfter`) committed on-chain; identity lapses automatically
- **Selective disclosure** — choose which attributes to reveal (country, org, department) per proof; everything else stays hidden

## Real-World Use Cases

- **Sybil-Resistant Airdrops** — No more bot farms. One government ID = one airdrop claim.
- **Compliant DeFi / RWA** — Access institutional pools by proving you are a verified citizen of a specific country — without revealing your name.
- **Private DAO Voting** — Prove you are a real person (1 person, 1 vote) without revealing your off-chain identity.

## Why Not DIDs?

| | DID/Verifiable Credentials | zk-X509 |
|---|---|---|
| **Infrastructure** | Must build new issuers and registries | Leverages 4B+ existing certs |
| **Trust model** | "Who trusts the issuer?" — unclear | Government CAs — established |
| **Revocation** | Issuer-maintained (centralized) | Trustless CRL in ZK |
| **Regulatory standing** | Unresolved | Legally binding |
| **Time to deploy** | 3–5 years | 3–6 months |

> **DID builds *new* trust. zk-X509 bridges *existing* trust. They're complementary.**

## Flexible Identity: One Size Does Not Fit All

Different applications need different rules. A DAO needs "one person, one vote." A DEX needs traders to use multiple wallets. zk-X509 handles both with a single parameter: **`maxWalletsPerCert`**.

| Setting | Use Case | Sybil Resistance |
|---------|----------|-----------------|
| `= 1` | DAO voting, airdrops | Maximum — one person, one wallet |
| `= 3` | DeFi protocols | Strong — trading / custody / cold |
| `= N` | zk-DEX, multi-account | Flexible — all tied to a real person |

The nullifier is derived from a deterministic signature: `SHA-256(Sign(sk, domain) ‖ wallet_index)`. Since only the private key holder can produce the signature, nullifiers cannot be predicted or brute-forced by third parties. The ZK circuit enforces the wallet limit. Regardless of the setting, every wallet is always backed by a real, government-issued certificate.

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

Users reveal the **plaintext** of selected attributes (e.g., "Country: KR") while providing a ZK proof that it matches the value in the original certificate. For hidden fields, the circuit commits a zero-value, revealing absolutely nothing — not even whether the field exists.

**The user decides what to reveal, not the verifier.** Same certificate, different proofs for different apps. Your bank DAO sees your country. Your DEX sees nothing. You control it.

## Auto-Expiry: Identity Follows the Certificate

On-chain identity shouldn't outlive the certificate that created it. zk-X509 commits the certificate's `notAfter` timestamp on-chain. When the cert expires, `isVerified()` automatically returns false. No admin action needed.

## Security: Formal Proofs, Not Claims

Security is formalized under the **Dolev-Yao adversary model** with game-based definitions:

- **Unforgeability** — reduced to RSA/ECDSA hardness + ZK soundness
- **Unlinkability** — guaranteed by the Zero-Knowledge property of the circuit and the unpredictability of private-key-derived nullifiers
- **Double-registration resistance** — ensured by SHA-256 collision resistance in deterministic nullifier generation
- **Front-running immunity** — proofs are bound to your wallet address

Breaking our system means breaking RSA or SHA-256.

## It Actually Works

| Metric | Value |
|--------|-------|
| ZK proving (ECDSA P-256) | ~11.8M SP1 cycles |
| ZK proving (RSA-2048 + CRL) | ~23.2M SP1 cycles |
| On-chain verification | ~300K gas (Groth16) |
| Proving time (GPU, estimated) | ~1–2 minutes |
| On L2 rollups | Negligible gas cost |

Full stack implemented: SP1 zkVM (Rust), Solidity smart contracts, web frontend with MetaMask, and an interactive CLI with NPKI auto-discovery.

## What's Next

- **Client-side proving** — SP1 WASM for fully browser-based proofs
- **Cross-chain deployment** — one identity across multiple L2s
- **Academic publication** — submission to Financial Cryptography (FC)

## Try It

Open source: **[github.com/tokamak-network/zk-X509](https://github.com/tokamak-network/zk-X509)**

```bash
cargo run --release --bin interactive
```

## The Bigger Picture

The blockchain identity space is obsessed with building from scratch. We think that's backwards.

Governments have issued **billions** of cryptographic credentials. The math checks out — RSA signatures verify inside ZK circuits, revocation lists check trustlessly, proofs bind to wallets.

Identity shouldn't be a barrier to entry. It should be an invisible layer of trust. zk-X509 doesn't ask you to trust a new foundation or buy a new device. It simply asks the blockchain to recognize the trust you've already been given — by your own country.

> **zk-X509 is the missing bridge.**

We're not replacing DID or competing with Worldcoin. We're asking: *before you build a new trust system, have you checked if there's already one that works?*

For 4 billion certificates and 20 million Korean users — there is.

---

*zk-X509 is developed by [Tokamak Network](https://tokamak.network). [Full paper](https://github.com/tokamak-network/zk-X509/blob/main/docs/paper.md) | [GitHub](https://github.com/tokamak-network/zk-X509)*
