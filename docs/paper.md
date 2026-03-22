# zk-X509: Privacy-Preserving On-Chain Identity from Legacy PKI via Zero-Knowledge Proofs

**Authors:** Tokamak Network Research Team

**Version:** 4.0 — March 2026

---

## Abstract

The inherent transparency of public blockchains creates a fundamental tension between regulatory compliance and user privacy. Existing on-chain identity solutions either rely on centralized KYC attestors—introducing single points of failure and metadata leakage—or require specialized hardware such as NFC readers or biometric scanners, limiting accessibility. Meanwhile, billions of X.509 digital certificates already form a globally deployed, government-grade trust infrastructure, yet no practical system exists to leverage them for decentralized identity without exposing personal data.

We present **zk-X509**, a fully software-based, privacy-preserving identity system that bridges legacy Public Key Infrastructure (PKI) with public ledgers. Using a RISC-V-based zero-knowledge virtual machine (zkVM), zk-X509 enables users to prove ownership and validity of standard X.509 certificates—targeting the legally binding Korean National PKI (NPKI) comprising millions of active certificates—without revealing private keys or personal identifiers. The zero-knowledge circuit verifies six properties: (1) the full certificate chain from user certificate through intermediate CAs to a trusted root, (2) temporal validity of every certificate in the chain, (3) private key ownership, (4) certificate revocation status against a provided CRL, (5) binding to a specific blockchain address, and (6) generation of a deterministic nullifier for Sybil resistance. The proof commits only the nullifier, a CA root hash, a timestamp, and the registrant's address as public values.

We formalize the security model under a Dolev-Yao adversary and prove four properties via game-based definitions: unforgeability, unlinkability, double-registration resistance, and front-running immunity. Our SP1 zkVM implementation achieves approximately 7.2 million cycles for single-level RSA-2048 verification, and on-chain verification costs approximately 77,000 gas. zk-X509 provides a pragmatic, hardware-free pathway to integrate government-grade trust anchors into decentralized finance while strictly preserving user anonymity.

**Keywords:** Zero-Knowledge Proofs, X.509, Digital Identity, zkVM, Ethereum, Korean NPKI, Privacy-Preserving Authentication, Proof of Personhood

---

## 1. Introduction

### 1.1 Motivation

Digital identity verification on blockchain platforms faces a fundamental tension between **transparency** and **privacy**. Public blockchains provide immutable, auditable records, yet this same transparency renders them unsuitable for storing personal identity data such as names, national IDs, or certificate contents. Recent regulatory actions—including OFAC sanctions on privacy-preserving protocols [1]—have intensified the demand for decentralized "Proof of Personhood" (PoP) systems that satisfy compliance requirements without sacrificing user anonymity.

Existing approaches to on-chain identity fall into three categories, each with significant limitations:

1. **Centralized attestation.** A trusted third party (e.g., KYC provider) verifies identity off-chain and issues an on-chain attestation. This centralizes trust, introduces a single point of failure, and leaks metadata revealing that a particular address was verified by a specific provider.

2. **Hardware-dependent verification.** Systems such as zkPassport [2] require NFC readers to access passport chips, while Worldcoin [3] depends on proprietary biometric scanners (the Orb). These approaches limit accessibility to users with specific hardware.

3. **Direct credential submission.** Users submit identity documents to smart contracts or oracles, permanently recording personal data on an immutable ledger—a fundamental privacy violation.

None of these approaches simultaneously achieves **verifiability** (anyone can check that an address is backed by a valid credential), **privacy** (no personal data is revealed), **decentralization** (no single entity can forge or revoke attestations), and **accessibility** (no specialized hardware required).

### 1.2 Key Insight

We observe that a vast, government-grade trust infrastructure already exists: the X.509 Public Key Infrastructure. Over 4 billion X.509 certificates are active globally, issued by Certificate Authorities (CAs) for purposes ranging from TLS to national identity. Crucially, these certificates embed RSA or ECDSA signatures from trusted CAs, providing a cryptographic chain of trust that can be verified computationally—and therefore inside a zero-knowledge circuit.

### 1.3 Proposed Solution

zk-X509 resolves the transparency-privacy tension by verifying X.509 certificate ownership entirely inside a zkVM. The system proves the following properties without revealing any certificate contents:

1. **Certificate Chain Validity.** The full chain from user certificate through intermediate CAs to a trusted root CA is verified, with each link's RSA signature checked cryptographically.
2. **Temporal Validity.** Every certificate in the chain is checked against the proof generation timestamp.
3. **Private Key Ownership.** The user proves possession of the private key corresponding to the certificate's public key.
4. **Revocation Status.** The CRL is parsed and its CA signature verified inside the zkVM, then the user's serial number is checked against the revoked list—providing trustless revocation checking.
5. **Registrant Binding.** The proof is cryptographically bound to the user's blockchain address, preventing proof theft via front-running.
6. **Nullifier Generation.** A deterministic, privacy-preserving identifier is derived from the certificate for Sybil resistance.

Only four values are revealed publicly: a **nullifier**, a **CA root hash**, a **timestamp**, and the **registrant address**. These are committed as public outputs and verified on-chain by a Solidity smart contract.

### 1.4 Target Application: Korean National PKI

While zk-X509 works with any X.509 certificate, our primary target is the Korean National Public Key Infrastructure (NPKI). Korean digital certificates (공인인증서) are issued by authorized CAs such as the Korea Financial Telecommunications and Clearings Institute (금융결제원) and are used for banking, government services, and e-commerce. Korean NPKI employs a 3-level certificate chain (Root CA → Intermediate CA → User Certificate) with RSA-2048 using SHA-256 or SHA-1 signatures. Certificates are stored as DER-encoded files (`signCert.der`) with encrypted private keys (`signPri.key`) using PBES2 with PBKDF2-HMAC-SHA1 and SEED-CBC or AES-256-CBC encryption.

By enabling these certificates to serve as on-chain identity credentials, zk-X509 bridges an existing ecosystem of millions of active certificates with blockchain-based services, without requiring any modification to the certificate infrastructure.

### 1.5 Contributions

This paper makes the following contributions:

- A **system architecture** for a complete ZK-based X.509 verification pipeline supporting full certificate chain verification, CRL checking, and registrant binding for front-running immunity.
- A **working implementation** using the SP1 zkVM for zero-knowledge computation, with Solidity smart contracts for on-chain verification and a web-based frontend for end-user interaction.
- A **formal security analysis** with game-based definitions under the Dolev-Yao adversary model, establishing unforgeability, unlinkability, double-registration resistance, and front-running immunity.
- A **performance evaluation** demonstrating practical feasibility: ~7.2M SP1 cycles for single-level RSA-2048 verification and ~77K gas for on-chain registration.

### 1.6 Paper Organization

Section 2 provides background on X.509, zkVMs, and related work. Section 3 presents the system architecture and formal protocol specification. Section 4 details the implementation. Section 5 formalizes the security analysis with game-based definitions. Section 6 compares with alternative approaches. Section 7 discusses limitations and future work. Section 8 concludes.

---

## 2. Background and Related Work

### 2.1 X.509 Certificates and Certificate Chains

X.509 is the ITU-T standard for public key certificates, defined in RFC 5280 [4]. An X.509 certificate binds a public key to an identity through a digital signature from a Certificate Authority. The certificate structure (ASN.1 DER encoding) contains:

- **TBSCertificate** (To-Be-Signed): Subject name, issuer name, serial number, validity period, subject public key, and extensions.
- **SignatureAlgorithm**: OID identifying the signature scheme (e.g., `sha256WithRSAEncryption`).
- **SignatureValue**: The CA's digital signature over the DER-encoded TBSCertificate.

In practice, most PKI deployments use multi-level certificate chains. A user certificate is signed by an intermediate CA, which is in turn signed by a root CA. Verification requires traversing the entire chain, verifying each signature and validity period. Korean NPKI uses a 3-level hierarchy: KISA Root CA → Authorized CA (e.g., 금융결제원) → User Certificate.

### 2.2 Zero-Knowledge Proofs and zkVMs

A zero-knowledge proof allows a prover to convince a verifier that a statement is true without revealing any information beyond the truth of the statement [5]. Formally, a ZK proof system $(P, V)$ for a language $L$ satisfies three properties: **completeness** (honest provers convince honest verifiers), **soundness** (no cheating prover can convince on false statements), and **zero-knowledge** (the verifier learns nothing beyond the statement's truth).

Modern zkVMs extend this to arbitrary computation: a prover executes a program inside a virtual machine and produces a succinct proof that the computation was performed correctly. **SP1** (Succinct Processor 1) is a RISC-V-based zkVM developed by Succinct Labs [6]. It compiles standard Rust to RISC-V instructions executed inside the zkVM, enabling complex operations such as ASN.1 parsing and RSA verification. SP1 provides precompiled accelerators for SHA-256 and RSA modular exponentiation, and supports on-chain verification via Groth16 [7] or PLONK proof systems.

### 2.3 RSA Verification in Zero-Knowledge

RSA signature verification—the dominant operation in X.509 certificate validation—requires modular exponentiation with a 2048-bit modulus: computing $s^e \mod n$ where $s$ is the signature, $e$ is the public exponent, and $n$ is the modulus. Naive implementation in a ZK circuit is prohibitively expensive due to the cost of big-integer arithmetic. SP1 mitigates this through precompiled accelerators that implement modular arithmetic natively in the proof system, reducing the cycle count from tens of millions to approximately 5.5 million for RSA-2048.

### 2.4 Related Work

We survey existing approaches to privacy-preserving on-chain identity and position zk-X509 relative to them.

**zkPassport** [2] generates ZK proofs of passport data read via NFC. While similar in spirit to zk-X509, it requires NFC hardware and is limited to passports. zk-X509 is purely software-based and works with any X.509 certificate.

**Worldcoin** [3] uses iris biometric scanning with a proprietary device (the Orb) to generate unique identity proofs. The hardware dependency and biometric data collection raise both accessibility and privacy concerns that zk-X509 avoids entirely.

**Polygon ID** uses W3C Verifiable Credentials with ZK proofs. However, it requires credential issuance by specific DID providers, creating a dependency on new infrastructure rather than leveraging existing PKI.

**Semaphore** [8] enables anonymous group membership proofs but provides no mechanism for certificate-based identity verification. It solves a different problem: anonymous signaling within a pre-defined group.

**zk-email** [9] proves ownership of emails by verifying DKIM signatures in ZK. This is the closest analog to zk-X509 in approach (verifying existing cryptographic signatures in ZK), but is limited to email and does not provide the government-grade trust level of PKI certificates.

**Soulbound Tokens (SBTs)** [10] propose non-transferable tokens as identity primitives. However, SBTs require a trusted issuer and provide no mechanism for privacy-preserving credential verification.

| System | Credential | Hardware | Trust Model | Chain Verification | CRL | Privacy |
|--------|-----------|----------|-------------|-------------------|-----|---------|
| zkPassport [2] | Passport | NFC required | Government CA | N/A | N/A | Full ZK |
| Worldcoin [3] | Biometric | Orb required | Worldcoin Foundation | N/A | N/A | Partial |
| Polygon ID | W3C VC | None | DID Issuers | No | No | Full ZK |
| Semaphore [8] | Group key | None | Group admin | N/A | N/A | Full ZK |
| zk-email [9] | Email DKIM | None | Email providers | No | No | Full ZK |
| **zk-X509** | **X.509 cert** | **None** | **Government CAs** | **Yes** | **Yes** | **Full ZK** |

zk-X509 is, to our knowledge, the first system to bring existing X.509 PKI certificates into the blockchain ecosystem using zero-knowledge proofs, combining government-grade trust with full certificate chain verification, revocation checking, full privacy, and no hardware requirements.

---

## 3. System Architecture

### 3.1 Overview

The zk-X509 system comprises four components arranged in a layered architecture:

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                        │
│   Browser: NPKI cert selection, wallet connect, TX submission  │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP POST (cert, key, password, registrant)
┌───────────────────────▼──────────────────────────────────────┐
│                 Prover Server (Rust/Axum)                     │
│   Localhost daemon: scan NPKI → decrypt key → prove → return  │
└───────────────────────┬──────────────────────────────────────┘
                        │ SP1 stdin (cert, chain, key, timestamp,
                        │            crl_der, registrant)
┌───────────────────────▼──────────────────────────────────────┐
│               SP1 zkVM Guest Program (Rust)                   │
│   1. Parse & validate chain  2. Check CRL  3. Verify key     │
│   4. Compute nullifier + CA hash                              │
│   Output: (nullifier, caRootHash, timestamp, registrant)      │
└───────────────────────┬──────────────────────────────────────┘
                        │ ZK Proof + Public Values
┌───────────────────────▼──────────────────────────────────────┐
│              Ethereum Smart Contract (Solidity)               │
│   IdentityRegistry: verify registrant → verify timestamp →   │
│   check CA → check nullifier → verify proof → register       │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Formal Protocol Specification

We define the registration protocol formally. Let $\mathcal{P}$ denote the prover (user), $\mathcal{S}$ the prover server (localhost daemon on $\mathcal{P}$'s machine), $\mathcal{Z}$ the SP1 zkVM, and $\mathcal{V}$ the on-chain verifier (smart contract).

**Notation.**
- $\text{cert}$: DER-encoded user certificate
- $\text{sk}$: User's RSA private key (PKCS#1 DER)
- $\text{chain}$: Certificate chain $[\text{cert}_{\text{inter}_1}, \ldots, \text{cert}_{\text{inter}_k}, \text{pk}_{\text{root}}]$ where $\text{pk}_{\text{root}}$ is the root CA's public key (SPKI DER)
- $\text{CRL}$: DER-encoded Certificate Revocation List (signed by the issuing CA)
- $\text{addr}$: $\mathcal{P}$'s Ethereum address (20 bytes)
- $t$: Current Unix timestamp
- $\mathcal{H}$: SHA-256

**Protocol.**

```
Step 1.  P → S:   (cert_index, password, addr)
                   via HTTP POST to localhost
                   cert_index identifies an NPKI certificate discovered
                   by the server's filesystem scanner

Step 2.  S:        (cert, sk_enc) ← ReadFromNPKIDirectory(cert_index)
                   sk' ← PBES2_Decrypt(sk_enc, password)  // SEED-CBC or AES-256-CBC
                   CRL ← FetchCRL(cert.issuer)             // from CA distribution point

Step 3.  S → Z:   (cert, sk', chain, t, CRL, addr)
                   via SP1 stdin

Step 4.  Z:        // Parse and validate user certificate
                   cert_parsed ← ParseDER(cert)
                   Assert: t ∈ [cert_parsed.notBefore, cert_parsed.notAfter]

                   // Verify certificate chain
                   For i = 0 to k-1:
                     inter_i ← ParseDER(chain[i])
                     Assert: t ∈ [inter_i.notBefore, inter_i.notAfter]

                   // Verify signatures along the chain
                   If k = 0:  (single-level)
                     Assert: RSA.Verify(pk_root, cert_parsed.tbs, cert_parsed.sig)
                   Else:      (multi-level)
                     Assert: RSA.Verify(inter_0.pk, cert_parsed.tbs, cert_parsed.sig)
                     For i = 0 to k-2:
                       Assert: RSA.Verify(inter_{i+1}.pk, inter_i.tbs, inter_i.sig)
                     Assert: RSA.Verify(pk_root, inter_{k-1}.tbs, inter_{k-1}.sig)

                   // Verify and check CRL (trustless)
                   If CRL ≠ ∅:
                     crl_parsed ← ParseDER(CRL)
                     Assert: crl_parsed.issuer = cert_parsed.issuer
                     Assert: crl_parsed.thisUpdate ≤ t ≤ crl_parsed.nextUpdate
                     issuer_pk ← FindIssuerKey(intermediates, pk_root, crl_parsed.issuer)
                     Assert: RSA.Verify(issuer_pk, crl_parsed.tbs, crl_parsed.sig)
                     Assert: cert_parsed.serial ∉ crl_parsed.revokedCertificates

                   // Verify key ownership
                   pk_derived ← DerivePublicKey(sk')
                   Assert: pk_derived.n = cert_parsed.pk.n
                   Assert: pk_derived.e = cert_parsed.pk.e

                   // Compute public outputs
                   nullifier ← H(cert_parsed.serial ‖ H(sk'))
                   caRootHash ← H(pk_root)

                   // Commit public values
                   Commit(nullifier, caRootHash, t, addr)

Step 5.  Z → S:   (π, pubvals)
                   where π is the ZK proof, pubvals = ABI(nullifier, caRootHash, t, addr)

Step 6.  S → P:   (π, pubvals) via HTTP response

Step 7.  P → V:   register(π, pubvals)
                   via Ethereum transaction signed by addr

Step 8.  V:        // On-chain verification (ascending gas cost)
                   (nullifier, caRootHash, t_proof, registrant) ← ABI.Decode(pubvals)
                   Assert: registrant = msg.sender           // front-running check
                   Assert: t_proof ≤ block.timestamp          // no future proofs
                   Assert: block.timestamp - t_proof ≤ 3600   // freshness (1 hour)
                   Assert: validCARoots[caRootHash] = true    // CA whitelist
                   Assert: nullifiers[nullifier] = false       // no double-reg
                   Assert: verifiedUsers[msg.sender] = false   // no multi-reg
                   SP1Verifier.verify(vkey, pubvals, π)       // ZK proof check
                   nullifiers[nullifier] ← true
                   verifiedUsers[msg.sender] ← true
                   Emit UserRegistered(msg.sender, nullifier, caRootHash)
```

### 3.3 Public Values Structure

The shared data structure between the ZK circuit and the smart contract is:

```solidity
struct PublicValuesStruct {
    bytes32 nullifier;    // H(serial ‖ H(private_key))
    bytes32 caRootHash;   // H(root CA public key SPKI DER)
    uint64  timestamp;    // Unix timestamp at proof generation
    address registrant;   // Wallet address bound to this proof
}
```

This struct is ABI-encoded using `alloy-sol-types` in Rust and ABI-decoded in Solidity, ensuring binary compatibility across the stack.

### 3.4 ZK Guest Program

The guest program executes inside the SP1 zkVM and performs all sensitive computations. It receives six inputs via SP1 stdin:

| Input | Type | Visibility | Purpose |
|-------|------|-----------|---------|
| `cert_der` | `Vec<u8>` | Private | DER-encoded user X.509 certificate |
| `user_priv_key` | `Vec<u8>` | Private | PKCS#1 RSA private key |
| `cert_chain` | `Vec<Vec<u8>>` | Private | Chain: $[\text{inter}_1, \ldots, \text{inter}_k, \text{pk}_{\text{root}}]$ |
| `current_timestamp` | `u64` | Public (via output) | Unix timestamp |
| `crl_der` | `Vec<u8>` | Private | DER-encoded CRL (empty = skip) |
| `registrant` | `[u8; 20]` | Public (via output) | Wallet address |

All private inputs remain hidden within the ZK proof. Only the four public values are revealed.

**Certificate Parsing.** We use the `x509-parser` crate (v0.16) with `default-features = false` to parse DER-encoded certificates. Disabling default features avoids the `ring` cryptography library, which contains platform-specific assembly incompatible with the RISC-V zkVM target.

**Certificate Chain Verification.** The `cert_chain` input contains intermediate CA certificates followed by the root CA's public key as the final element. The guest program verifies the signature chain: user cert → intermediate CAs → root CA. For single-level PKI (no intermediates), the chain contains only the root CA public key. For Korean NPKI's 3-level hierarchy, the chain contains one intermediate CA certificate and the root CA public key. Each intermediate certificate's temporal validity is also checked.

**CA Signature Verification.** The pure-Rust `rsa` crate (v0.9) verifies each RSA signature in the chain. The process for each link: (1) extract the `signatureAlgorithm` OID, (2) select the hash function (SHA-256, SHA-1, SHA-384, or SHA-512), (3) hash the TBSCertificate bytes, (4) verify using the signer's RSA public key with PKCS#1 v1.5 padding.

**Trustless Certificate Revocation Checking.** The `crl_der` input contains a full DER-encoded Certificate Revocation List. Unlike systems that rely on the host to provide pre-filtered revocation data, zk-X509 performs **trustless CRL verification** entirely inside the zkVM:

1. **Parse** the DER-encoded CRL using `x509_parser::revocation_list`.
2. **Issuer matching**: Assert that the CRL's issuer matches the user certificate's issuer (serial numbers are issuer-scoped; checking against a CRL from a different issuer is meaningless).
3. **Freshness validation**: Assert $\text{thisUpdate} \leq t \leq \text{nextUpdate}$, ensuring the CRL is current at the proof generation time.
4. **Signature verification**: Verify the CRL's RSA signature using the matching issuer's public key (intermediate CA for multi-level chains, root CA for single-level).
5. **Revocation check**: Assert that the user certificate's serial number is not in the CRL's revoked certificates list.

This design ensures that a malicious host cannot supply a forged or tampered CRL—the ZK proof cryptographically attests that the CRL was signed by the legitimate issuing CA and was fresh at proof time. The CRL data is not committed to public values; the proof attests only that revocation was checked against a valid, CA-signed CRL.

**Key Ownership Verification.** The user's RSA private key is parsed from PKCS#1 DER format. The public key is derived, and its modulus $n$ and exponent $e$ are compared with the certificate's embedded public key.

**Nullifier Generation.** The nullifier is computed as:

$$\text{nullifier} = \mathcal{H}(\text{serial} \| \mathcal{H}(\text{sk}))$$

Including the private key hash prevents brute-force attacks on predictable serial numbers (see Section 5.5).

### 3.5 Smart Contract

The `IdentityRegistry` contract manages on-chain state:

```
State Variables:
  sp1Verifier    : ISP1Verifier (immutable)  — On-chain proof verifier
  programVKey    : bytes32 (immutable)       — ZK program verification key
  validCARoots   : mapping(bytes32 => bool)  — Whitelisted CA root hashes
  nullifiers     : mapping(bytes32 => bool)  — Used nullifiers
  verifiedUsers  : mapping(address => bool)  — Verified wallet addresses
  owner          : address                   — Contract administrator
  paused         : bool                      — Emergency stop flag
```

The `register()` function performs checks in ascending gas cost order, then calls the external verifier, then updates state:

1. **Registrant binding**: `registrant == msg.sender` — prevents front-running
2. **Timestamp freshness**: `block.timestamp - proofTimestamp ≤ 1 hour`
3. **CA whitelist**: `validCARoots[caRootHash] == true`
4. **Nullifier uniqueness**: `nullifiers[nullifier] == false`
5. **Address uniqueness**: `verifiedUsers[msg.sender] == false`
6. **Proof validity**: `sp1Verifier.verifyProof(programVKey, publicValues, proof)` — external call
7. **State update**: `nullifiers[nullifier] = true; verifiedUsers[msg.sender] = true`

The contract additionally provides administrative functions:
- **`revokeUser(address, bytes32 reason)`**: Allows the owner to revoke a previously verified user (e.g., upon certificate expiration or compromise), emitting a `UserRevoked` event with a reason code.
- **`pause()` / `unpause()`**: Emergency stop mechanism to halt registrations if a vulnerability is discovered.
- **`transferOwnership(address)` / `acceptOwnership()`**: Two-step ownership transfer requiring the new owner to explicitly accept, preventing accidental transfers to incorrect addresses.

### 3.6 NPKI Integration

**Certificate Discovery.** The prover server includes an NPKI filesystem scanner that automatically discovers certificate/key pairs in platform-specific directories: `~/Library/Preferences/NPKI` (macOS), `~/.pki/NPKI` (Linux), and `%APPDATA%\NPKI` (Windows). For each discovered pair (`signCert.der` + `signPri.key`), the scanner extracts metadata (subject, issuer, serial number, expiry) for display in the frontend's certificate selection UI. This eliminates the need for manual file upload.

**Private Key Decryption.** Korean NPKI private keys are stored in PKCS#8 EncryptedPrivateKeyInfo format using PBES2 with PBKDF2-HMAC-SHA1 key derivation. Two encryption ciphers are supported:

- **SEED-CBC** (OID 1.2.410.200004.1.4): The Korean national block cipher, widely used in legacy NPKI certificates. Supported via the `kisaseed` crate.
- **AES-256-CBC** (OID 2.16.840.1.101.3.4.1.42): Used in newer NPKI certificates.

The decryption module: (1) parses the ASN.1 encryption parameters, (2) derives the key via PBKDF2, (3) decrypts using the appropriate cipher, and (4) strips PKCS#7 padding to yield the raw PKCS#1 DER private key. A generic `decrypt_cbc<C>()` function handles both ciphers uniformly.

---

## 4. Implementation

### 4.1 Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| ZK Prover | SP1 zkVM (Succinct) | v6.0.1 |
| ZK Guest Language | Rust (RISC-V target) | stable |
| Smart Contracts | Solidity + Foundry | ^0.8.20 / v1.5.1 |
| Prover Server | Rust + Axum | 0.7 |
| Frontend | Next.js + React + ethers.js | 16 / 19 / 6 |
| X.509 Parsing | x509-parser (no_std) | 0.16 |
| RSA Verification | rsa (pure Rust) | 0.9 |

### 4.2 Repository Structure

```
zk-X509/
├── lib/              # Shared types (PublicValuesStruct)
├── program/          # SP1 Guest program (zkVM)
├── script/           # SP1 Host (CLI, HTTP server, NPKI decrypt)
├── contracts/        # Solidity (IdentityRegistry, tests, deploy scripts)
├── frontend/         # Next.js web UI
├── certs/            # Test certificate generator (OpenSSL scripts)
└── docs/             # Documentation and this paper
```

### 4.3 Performance Evaluation

#### 4.3.1 Off-Chain Cost: ZK Proving

Measured on Apple M-series CPU using the SP1 CPU prover with a single-level certificate chain (user cert + root CA):

| Operation | SP1 Cycles | Proportion |
|-----------|-----------|-----------|
| X.509 DER parsing (user cert) | ~200,000 | 2.8% |
| Certificate validity check | ~1,000 | <0.1% |
| RSA-2048 signature verification (SHA-256) | ~5,500,000 | 76.4% |
| RSA public key comparison (key ownership) | ~100,000 | 1.4% |
| Nullifier + CA hash computation (SHA-256 ×3) | ~1,400,000 | 19.4% |
| **Total (single-level)** | **~7,200,000** | **100%** |

RSA signature verification dominates at 76.4% of total cycles, consistent with the known computational cost of 2048-bit modular exponentiation. SP1's precompiled RSA accelerator reduces this from what would otherwise be tens of millions of cycles in a naive implementation.

**Multi-level chain cost.** For a 3-level Korean NPKI chain (Root CA → Intermediate CA → User), the cost approximately doubles due to the additional RSA signature verification and intermediate certificate parsing:

| Chain Depth | Estimated SP1 Cycles | RSA Verifications |
|------------|---------------------|-------------------|
| 1 (direct root signing) | ~7,200,000 | 1 |
| 2 (1 intermediate) | ~13,000,000 | 2 |
| 3 (2 intermediates) | ~18,800,000 | 3 |

#### 4.3.2 On-Chain Cost: Verification

Gas measurements on Ethereum (Foundry test environment):

| Operation | Gas | Notes |
|-----------|-----|-------|
| Contract deployment | ~1,338,947 | IdentityRegistry + MockVerifier |
| `register()` | 77,527 | With mock verifier |
| `register()` (estimated) | ~300,000 | With Groth16 on-chain verifier |
| `addCARoot()` | 26,078 | Owner only |
| `revokeUser()` | ~8,500 | Owner only |
| `isVerified()` | ~2,600 | View function |

The ~77K gas cost with a mock verifier rises to an estimated ~300K with the Groth16 on-chain verifier. This remains well within practical limits for Ethereum L1 and is negligible on L2 rollups.

#### 4.3.3 End-to-End Latency

| Phase | Time |
|-------|------|
| NPKI key decryption (PBES2) | < 1 second |
| SP1 execute (no proof, CPU) | ~15 seconds |
| SP1 prove (CPU, single-level) | ~10 minutes |
| SP1 prove (GPU, estimated) | ~1–2 minutes |
| On-chain verification | 1 block confirmation |

### 4.4 Testing

The system includes three levels of testing:

1. **Smart contract unit tests** (Foundry): 9 test cases covering registration, double-registration prevention, registrant mismatch, unsupported CA, timestamp validation (future and stale proofs), user revocation, pause/unpause, and two-step ownership management.
2. **SP1 execute mode**: Runs the ZK program without proof generation for fast iteration (~15 seconds), validating circuit logic.
3. **End-to-end integration**: Anvil local chain + contract deployment + prover server + frontend registration, verified with `cast` commands.

### 4.5 Supported Signature Algorithms

| OID | Algorithm | Status |
|-----|-----------|--------|
| 1.2.840.113549.1.1.11 | sha256WithRSAEncryption | Supported |
| 1.2.840.113549.1.1.5 | sha1WithRSAEncryption | Supported (legacy NPKI) |
| 1.2.840.113549.1.1.12 | sha384WithRSAEncryption | Supported |
| 1.2.840.113549.1.1.13 | sha512WithRSAEncryption | Supported |
| 1.2.840.10045.4.3.2 | ecdsa-with-SHA256 | Not yet supported |

SHA-1 support is included specifically for backward compatibility with legacy Korean NPKI certificates that predate the SHA-256 migration.

---

## 5. Security Analysis

### 5.1 System Model

The system involves three entity types:

- **Prover** ($\mathcal{P}$): The user who owns an X.509 certificate and wishes to register on-chain. $\mathcal{P}$ runs the prover server as a localhost daemon on their own machine.
- **Verifier** ($\mathcal{V}$): The Ethereum smart contract (`IdentityRegistry`) that verifies proofs and manages registration state.
- **Certificate Authority** ($\text{CA}$): A trusted authority (e.g., 금융결제원) whose root public key hash is whitelisted in $\mathcal{V}$.

**Localhost assumption.** The prover server operates as a local daemon on the user's physical machine. Private keys transit only within the local loopback interface (`127.0.0.1`), never over the public network. This ensures that the private key exposure surface is limited to the user's own operating system, equivalent to the trust model of any local application that reads certificate files (e.g., a web browser using client certificates).

### 5.2 Adversary Model

We adopt the **Dolev-Yao** adversary model [11]. The adversary $\mathcal{A}$ has the following capabilities:

- $\mathcal{A}$ can observe all transactions on the public blockchain, including proof bytes, public values, and transaction metadata (sender address, gas price, nonce).
- $\mathcal{A}$ can submit arbitrary transactions to the smart contract, including crafted proofs and replayed data from other users' transactions.
- $\mathcal{A}$ can monitor the mempool and attempt to front-run pending transactions by submitting competing transactions with higher gas prices.
- $\mathcal{A}$ can attempt to forge certificates or generate proofs with invalid inputs.

**Trust assumptions.** We assume:

- **A1 (Local security):** $\mathcal{A}$ cannot compromise the user's local machine (i.e., cannot read files from the user's filesystem or inspect process memory).
- **A2 (CA integrity):** The CA's private signing key has not been compromised.
- **A3 (Cryptographic hardness):** RSA is secure under the factoring assumption; SHA-256 is collision-resistant and preimage-resistant.
- **A4 (ZK soundness):** The SP1 proof system is computationally sound: no PPT adversary can generate a valid proof for a false statement with non-negligible probability.

### 5.3 Security Definitions

We formalize four security properties using game-based definitions. In each game, $\mathcal{A}$ interacts with a challenger $\mathcal{C}$ that simulates the system.

#### Definition 1 (Unforgeability)

Consider the game $\text{Exp}_{\mathcal{A}}^{\text{forge}}$:

```
Game Exp_A^forge:
  1. C deploys IdentityRegistry with verification key vkey
     and whitelists a set of CA root hashes {h_1, ..., h_n}
  2. A is given: vkey, {h_1, ..., h_n}, the contract address,
     and access to the public blockchain
  3. A is NOT given: any valid certificate or private key
  4. A outputs: (π*, pubvals*)
  5. A wins if: V.register(π*, pubvals*) succeeds
```

**zk-X509 is unforgeable** if for all PPT adversaries $\mathcal{A}$:

$$\Pr[\text{Exp}_{\mathcal{A}}^{\text{forge}} = 1] \leq \text{negl}(\lambda)$$

#### Definition 2 (Unlinkability)

Consider the game $\text{Exp}_{\mathcal{A}}^{\text{link}}$:

```
Game Exp_A^link:
  1. C generates two valid certificates (cert_0, sk_0) and (cert_1, sk_1)
     both signed by the same CA
  2. C generates registrations for both, producing nullifiers n_0 and n_1
  3. C flips a random bit b ∈ {0, 1}
  4. A is given: n_b, n_{1-b} (in random order), and the caRootHash
  5. A is NOT given: the certificates, private keys, or serial numbers
  6. A outputs: b'
  7. A wins if: b' = b
```

**zk-X509 is unlinkable** if for all PPT adversaries $\mathcal{A}$:

$$\left| \Pr[\text{Exp}_{\mathcal{A}}^{\text{link}} = 1] - \frac{1}{2} \right| \leq \text{negl}(\lambda)$$

#### Definition 3 (Double-Registration Resistance)

Consider the game $\text{Exp}_{\mathcal{A}}^{\text{double}}$:

```
Game Exp_A^double:
  1. C deploys IdentityRegistry and whitelists CA roots
  2. A is given: one valid certificate (cert, sk) and two addresses addr_1, addr_2
  3. A outputs: two registration transactions tx_1 = (π_1, pubvals_1) from addr_1
                and tx_2 = (π_2, pubvals_2) from addr_2
  4. A wins if: both V.register(tx_1) and V.register(tx_2) succeed
```

**zk-X509 is double-registration resistant** if for all PPT adversaries $\mathcal{A}$:

$$\Pr[\text{Exp}_{\mathcal{A}}^{\text{double}} = 1] \leq \text{negl}(\lambda)$$

#### Definition 4 (Front-Running Immunity)

Consider the game $\text{Exp}_{\mathcal{A}}^{\text{front}}$:

```
Game Exp_A^front:
  1. An honest user P generates a valid registration tx = (π, pubvals) for addr_P
  2. A observes tx in the mempool before it is mined
  3. A outputs: tx' = (π', pubvals') from addr_A ≠ addr_P
     where A may copy, modify, or replay any data from tx
  4. A wins if: V.register(tx') succeeds using any data derived from tx
```

**zk-X509 is front-running immune** if for all PPT adversaries $\mathcal{A}$:

$$\Pr[\text{Exp}_{\mathcal{A}}^{\text{front}} = 1] \leq \text{negl}(\lambda)$$

### 5.4 Security Proofs

#### Theorem 1 (Unforgeability)

*Under assumptions A2 (CA integrity), A3 (RSA hardness, SHA-256 collision resistance), and A4 (ZK soundness), zk-X509 satisfies unforgeability (Definition 1).*

**Proof.** Suppose $\mathcal{A}$ wins $\text{Exp}^{\text{forge}}$ with non-negligible probability. Then $\mathcal{A}$ produces $(\pi^*, \text{pubvals}^*)$ such that the contract's `register()` succeeds. By assumption A4 (soundness), the proof $\pi^*$ attests that the ZK circuit executed correctly on some witness $(cert, sk, chain, t, CRL, addr)$. The circuit verifies:

(a) The certificate chain terminates at a root CA whose hash matches a whitelisted `caRootHash`. Since $\mathcal{A}$ does not possess a valid certificate signed by a whitelisted CA, $\mathcal{A}$ must either forge the CA's RSA signature (contradicting A3 via the hardness of factoring [12]) or find a second preimage for `caRootHash` to substitute a different CA (contradicting A3 via SHA-256 collision resistance).

(b) The private key $sk$ derives the same public key as the certificate's embedded key. Without a certificate from a whitelisted CA, $\mathcal{A}$ cannot satisfy this check.

In both cases, $\mathcal{A}$'s success contradicts one of the assumptions. Therefore $\Pr[\text{Exp}_{\mathcal{A}}^{\text{forge}} = 1] \leq \text{negl}(\lambda)$. $\square$

#### Theorem 2 (Unlinkability)

*Under assumption A3 (SHA-256 preimage resistance), zk-X509 satisfies unlinkability (Definition 2).*

**Proof.** The nullifier is $n = \mathcal{H}(\text{serial} \| \mathcal{H}(sk))$. Even if $\mathcal{A}$ knows the serial number space (e.g., sequential within a CA), computing $n$ from a serial requires knowledge of $\mathcal{H}(sk)$. Since $sk$ has at least 2048 bits of entropy (RSA-2048 private key), $\mathcal{H}(sk)$ is a 256-bit value that $\mathcal{A}$ cannot compute without $sk$ (preimage resistance of SHA-256). Therefore, $\mathcal{A}$ cannot distinguish $n_0$ from $n_1$ and cannot link either nullifier to a specific serial number. $\mathcal{A}$'s advantage is:

$$\left| \Pr[b' = b] - \frac{1}{2} \right| \leq \text{Adv}_{\mathcal{A}}^{\text{pre}}(\mathcal{H}) \leq \text{negl}(\lambda)$$

where $\text{Adv}^{\text{pre}}$ is the preimage-finding advantage against SHA-256. $\square$

**Caveat.** The `caRootHash` reveals which CA issued the certificate. In the Korean NPKI context, this narrows the anonymity set to users of a particular CA (one of ~5–6 authorized CAs) but does not identify individuals. This is an inherent trade-off: the CA whitelist is necessary for trust.

#### Theorem 3 (Double-Registration Resistance)

*Under assumption A4 (ZK soundness) and the determinism of SHA-256, zk-X509 satisfies double-registration resistance (Definition 3).*

**Proof.** For a single certificate with serial number $s$ and private key $sk$, the nullifier is deterministic: $n = \mathcal{H}(s \| \mathcal{H}(sk))$. Any valid proof for this certificate must commit the same nullifier $n$ (by A4, the proof cannot commit a different nullifier without the circuit producing it). After $tx_1$ succeeds, the contract sets `nullifiers[n] = true`. When $tx_2$ is submitted, since $tx_2$ must also commit nullifier $n$ (same certificate), the check `nullifiers[n] == false` fails, and $tx_2$ reverts. $\square$

#### Theorem 4 (Front-Running Immunity)

*Under assumption A4 (ZK soundness) and A1 (local security), zk-X509 satisfies front-running immunity (Definition 4).*

**Proof.** The honest user's proof $\pi$ commits `registrant = addr_P` as a public value. The contract verifies `registrant == msg.sender`. $\mathcal{A}$ has two strategies:

(a) **Replay the proof.** $\mathcal{A}$ submits $(\pi, \text{pubvals})$ from $\text{addr}_A$. Since $\text{pubvals}$ contains `registrant = addr_P` and $\text{msg.sender} = \text{addr}_A \neq \text{addr}_P$, the registrant check fails.

(b) **Modify pubvals.** $\mathcal{A}$ changes `registrant` to $\text{addr}_A$ in the public values. Since `pubvals` is an input to `SP1Verifier.verifyProof()`, altering it invalidates the proof verification (the proof was generated for the original public values).

(c) **Generate a new proof.** $\mathcal{A}$ would need to execute the ZK circuit with $sk$ as a witness to produce a valid proof binding to $\text{addr}_A$. By A1, $\mathcal{A}$ does not have $sk$.

All strategies fail. $\square$

### 5.5 Additional Attack Analysis

#### 5.5.1 Timestamp Manipulation

**Attack.** The prover supplies a false timestamp to make an expired certificate appear valid.

**Mitigation.** The timestamp is committed as a public value and verified on-chain:
- `proofTimestamp ≤ block.timestamp` (rejects future proofs)
- `block.timestamp - proofTimestamp ≤ 3600` (rejects stale proofs)

This bounds the manipulation window to 1 hour, insufficient to exploit typical certificate validity periods of 1+ years. An adversary would need to advance the blockchain's clock, which requires controlling block production—infeasible on Ethereum's proof-of-stake consensus.

#### 5.5.2 CRL Integrity and Freshness

The CRL is verified trustlessly inside the zkVM: its RSA signature is checked against the issuing CA's public key, and its temporal validity ($\text{thisUpdate} \leq t \leq \text{nextUpdate}$) is enforced. This prevents two attacks:

- **Forged CRL**: $\mathcal{A}$ cannot supply a CRL not signed by the legitimate CA (RSA signature verification inside zkVM).
- **Stale CRL**: $\mathcal{A}$ cannot supply an expired CRL (freshness check inside zkVM).

**Residual limitation.** The host selects *which* valid CRL to provide. If the CA has issued a newer CRL revoking the user's certificate, a malicious host could still provide the older (but still temporally valid) CRL that does not yet contain the revocation. This is bounded by the CRL's validity window (typically 24–72 hours for Korean NPKI). The CRL data is not committed to public values, so on-chain consumers cannot independently verify which CRL was used. For stronger guarantees, a CRL oracle (Section 7.2) could maintain an on-chain Merkle root of revoked serials.

#### 5.5.3 Private Key Exposure

**Architecture.** The private key **never transits from the browser to the prover server**. The prover server runs as a localhost daemon that directly scans the user's NPKI certificate directories (e.g., `~/Library/Preferences/NPKI` on macOS, `~/.pki/NPKI` on Linux). The frontend sends only a certificate selection index and decryption password—not the key bytes themselves. The server reads the encrypted private key from the local filesystem and decrypts it in-process.

**Mitigations:**
- Private key bytes never appear in any HTTP request or response
- CORS restricted to `localhost:3000` (prevents cross-origin requests)
- Password is the only sensitive data transmitted, over the loopback interface only
- No `Debug` derive on key-holding structs (prevents accidental logging)
- Password cleared from frontend memory after proof generation

**Residual risk.** The decrypted private key exists in the prover server's process memory during proof generation. This is mitigated by assumption A1 and is equivalent to the trust model of any local application that reads private key files (e.g., a web browser using client certificates).

#### 5.5.4 Smart Contract Security

- **Reentrancy.** The `register()` function performs all validation checks and the external `verifyProof()` call before updating state (lines 96–117 of the contract). While the state updates occur after the external call, `verifyProof` is a pure verification function that either returns successfully or reverts—it has no callback mechanism or state-modifying side effects. The verifier contract (`ISP1Verifier`) is immutably set at deployment, preventing substitution with a malicious contract.
- **Access control.** Administrative functions (`addCARoot`, `removeCARoot`, `revokeUser`, `pause`, `unpause`) are protected by the `onlyOwner` modifier. Ownership transfer uses a two-step pattern (`transferOwnership` → `acceptOwnership`) to prevent accidental transfers.
- **Emergency stop.** The `pause()` function halts all registrations, providing an escape hatch if a critical vulnerability is discovered.
- **Integer overflow.** Solidity ^0.8.x provides built-in overflow/underflow checks.

### 5.6 Privacy Properties Summary

| Property | Status | Guarantee |
|----------|--------|-----------|
| Certificate subject (name, ID) | Hidden | ZK zero-knowledge property |
| Certificate serial number | Hidden | Hashed with private key in nullifier |
| Private key | Hidden | ZK zero-knowledge property |
| CA identity | Partially revealed | caRootHash reveals issuing CA (~5–6 CAs in NPKI) |
| Wallet-to-certificate link | Unlinkable | Theorem 2 |
| Proof-to-address binding | Enforced | Theorem 4 |
| Double registration | Prevented | Theorem 3 |
| Multiple certs per wallet | Prevented | `verifiedUsers` mapping |

---

## 6. Comparison with Alternative Approaches

| Criterion | zk-X509 | zkKYC | SBT [10] | zkPassport [2] | zk-email [9] |
|-----------|---------|-------|----------|---------------|-------------|
| Privacy | Full ZK | Attestor sees data | Issuer sees data | Full ZK | Full ZK |
| Verifiability | On-chain, trustless | Trust attestor | Trust issuer | On-chain, trustless | On-chain, trustless |
| Hardware required | None | None | None | NFC reader | None |
| Trust anchor | Government CAs | KYC provider | Token issuer | Government (passport) | Email providers |
| Chain verification | Full multi-level | N/A | N/A | N/A | N/A |
| Revocation checking | Trustless CRL in ZK | Off-chain | Issuer policy | N/A | N/A |
| Front-running defense | Registrant binding | N/A | N/A | Varies | Varies |
| Double-reg prevention | Nullifier | Database check | Issuer policy | Nullifier | Nullifier |
| Existing infrastructure | Billions of certs | Requires KYC provider | Requires issuer | NFC passport | DKIM email |

zk-X509's unique position is the combination of **no hardware requirement**, **government-grade trust** with full certificate chain verification, **revocation checking**, **front-running protection**, and **full zero-knowledge privacy**, leveraging an infrastructure base of billions of existing certificates.

---

## 7. Limitations and Future Work

### 7.1 Client-Side Proving

The current architecture requires a localhost prover server. While the private key never leaves the local machine (assumption A1), moving proof generation entirely into the browser via WebAssembly would eliminate even the inter-process transfer. SP1's WASM support is under active development and would enable a fully browser-contained proving flow, strengthening the trust model.

### 7.2 On-Chain CRL Commitment

CRL verification is already trustless: the zkVM verifies the CRL's CA signature and freshness. However, the CRL data is not committed to public values, so on-chain consumers cannot verify *which* CRL was used. A stronger approach would be a dedicated CRL oracle contract that maintains a Merkle root of revoked serial numbers, updated periodically by a trusted operator or DAO. The ZK circuit could then commit the CRL's Merkle root as an additional public value, enabling on-chain verification that the most recent CRL was used.

### 7.3 Multi-Signature Governance

The single-owner access control for CA management represents a centralization point. Replacing it with a multi-signature wallet (e.g., Gnosis Safe) and timelock would distribute trust and prevent unilateral CA whitelist modifications. This is an engineering improvement that does not affect the core protocol.

### 7.4 Cross-Chain Deployment

The ZK proof is chain-agnostic. Deploying `IdentityRegistry` on multiple chains with the same verification key would enable cross-chain identity from a single proof generation. Standardizing the public values format could enable interoperability across different ZK identity systems.

### 7.5 ECDSA Support

The current implementation supports only RSA-based signatures. Adding ECDSA support (specifically secp256r1, commonly used in modern X.509 certificates) would extend compatibility beyond the RSA-centric Korean NPKI ecosystem.

### 7.6 Formal Verification

Formal verification of the Solidity smart contract (e.g., using Certora or Halmos) and the ZK circuit logic would provide stronger assurance beyond the game-based security analysis presented here.

---

## 8. Conclusion

zk-X509 demonstrates that legacy PKI infrastructure can be bridged to blockchain identity systems without compromising user privacy. By executing full X.509 certificate chain verification—including multi-level CA signature verification, temporal validity, CRL checking, key ownership proof, and registrant binding—inside a zero-knowledge virtual machine, the system achieves on-chain verifiability with off-chain privacy.

The security analysis under the Dolev-Yao model establishes four properties with game-based definitions and proofs: unforgeability (reduced to RSA hardness and ZK soundness), unlinkability (reduced to SHA-256 preimage resistance), double-registration resistance (via deterministic nullifiers and ZK soundness), and front-running immunity (via registrant binding). The implementation demonstrates practical feasibility: ~7.2M SP1 cycles for single-level verification and ~77K gas for on-chain registration.

For the Korean market specifically, zk-X509 offers a compelling path: the nation's existing PKI ecosystem, with millions of active certificates and a multi-level CA hierarchy, can immediately serve as the trust anchor for blockchain-based identity verification—enabling DeFi compliance, DAO governance, and government service integration—without exposing a single byte of personal data.

---

## References

[1] U.S. Department of the Treasury. "U.S. Treasury Sanctions Notorious Virtual Currency Mixer Tornado Cash." Office of Foreign Assets Control, August 2022.

[2] zkPassport. "Prove your identity with your passport, without revealing who you are." https://zkpassport.id/

[3] Worldcoin Foundation. "Worldcoin Whitepaper." 2023.

[4] Cooper, D., Santesson, S., Farrell, S., Boeyen, S., Housley, R., and Polk, W. "Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile." RFC 5280, IETF, May 2008.

[5] Goldwasser, S., Micali, S., and Rackoff, C. "The Knowledge Complexity of Interactive Proof Systems." SIAM Journal on Computing, 18(1):186–208, 1989.

[6] Succinct Labs. "SP1: A RISC-V Zero-Knowledge Virtual Machine." https://docs.succinct.xyz/

[7] Groth, J. "On the Size of Pairing-based Non-interactive Arguments." EUROCRYPT, pp. 305–326, 2016.

[8] Semaphore. "A zero-knowledge protocol for anonymous signaling on Ethereum." https://semaphore.pse.dev/

[9] zk-email. "Prove you received an email without revealing its contents." https://prove.email/

[10] Weyl, E.G., Ohlhaver, P., and Buterin, V. "Decentralized Society: Finding Web3's Soul." SSRN, May 2022.

[11] Dolev, D. and Yao, A. "On the Security of Public Key Protocols." IEEE Transactions on Information Theory, 29(2):198–208, 1983.

[12] Rivest, R., Shamir, A., and Adleman, L. "A Method for Obtaining Digital Signatures and Public-Key Cryptosystems." Communications of the ACM, 21(2):120–126, 1978.
