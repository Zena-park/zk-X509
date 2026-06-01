# Delegated Proving Design

> **Running the server?** This is the design doc. For practical "how do I run the
> prover server" instructions (build, env vars, SP1 backend, deployment), see the
> [Prover-Server Operator Guide](prover-server-guide.md).

## Problem

Currently, users must run the SP1 prover locally (~5 min CPU). This requires:
- Rust toolchain + SP1 installed
- ~16GB RAM
- Docker for Groth16

Service operators who need to know user identity (KYC/compliance) or want to offer a better UX can run the prover on behalf of users. This is safe because **the private key never enters the prover** — only pre-computed signatures are needed.

## Architecture Overview

The desktop app is the central actor. It communicates directly with the prover server — the browser is only used for the final on-chain submission.

```
Desktop App (keychain)                     Delegated Prover              Browser (frontend)
──────────────────────                     ────────────────              ──────────────────

1. User enters registry address

2. Query on-chain: registry.proverUrl()
   → If empty: local proving (existing flow)
   → If set: delegated proving (this flow)

3. Show consent dialog:
   "This service requires delegated proving.
    Your cert info will be sent to [proverUrl].
    Consent?"
   → User agrees

4. Keychain signs:
   - consent_sig (for prover)
   - ownership_sig (for ZK proof)
   - nullifier_sig (for ZK proof)

5. Send directly to prover ────────────→ POST /api/prove
   (consent + cert + sigs)                Verify consent
                                          Generate ZK proof (GPU)
6. Receive proof ←─────────────────────── {proof, public_values}

7. Display proof for user to copy ─────────────────────────→ Paste into frontend
                                                              register(proof, pv)
                                                              → Smart Contract
```

**Key invariants:**
- Certificate data flows: Desktop App → Prover Server (direct, no browser relay)
- Steps 4-6 only execute after step 3 (consent) succeeds
- Browser never sees certificate contents — only receives proof + public values

## Consent Protocol

Delegated proving involves transmitting personal information (certificate contents) to a third party. The protocol **requires a consent signed by the certificate's private key** before the prover accepts any request.

### Why certificate-signed consent?

The personal information belongs to the **certificate owner**. Therefore, consent must be signed by the **certificate's private key** (via OS keychain), not the wallet key:

| | Wallet signature | Certificate signature |
|---|---|---|
| Proves | "This wallet owner agreed" | **"This certificate owner agreed"** |
| Identity link | Wallet ≠ cert owner (uncertain) | **Cert owner = data subject (direct)** |
| Signing tool | MetaMask (browser) | OS keychain (local app) |
| Verification | `ecrecover` | RSA/ECDSA verify with cert public key |

### Consent message format

```
zk-x509-delegated-proving-consent
Prover: [proverUrl]
Registry: [registryAddress]
Chain ID: [chainId]
Wallet: [registrant]
Timestamp: [unix timestamp]
```

The consent message is signed by the certificate's private key using the OS keychain — the same mechanism used for `ownership_sig` and `nullifier_sig`. The private key never leaves the keychain.

### Flow

**Critical rule: NO certificate data is transmitted until consent signature is complete.**

```
Desktop App (keychain)                                    Delegated Prover
──────────────────────                                    ────────────────

1. User enters registry address + wallet address

2. Query on-chain:
   - registry.delegatedProvingRequired() → bool
   - registry.proverUrl() → string
   
   Three cases:
   a) delegatedProvingRequired == false → local proving (existing flow)
   b) delegatedProvingRequired == true && proverUrl != "" → delegated proving (this flow)
   c) delegatedProvingRequired == true && proverUrl == "" → "Service requires delegated proving but prover is not yet configured. Registration unavailable."

3. Show consent dialog in terminal:
   "This service requires delegated proving."
   "Your certificate information will be sent to [proverUrl]."
   "Do you consent? (y/n)"
   
   User types 'y'

4. Sign consent with cert key (keychain):
   consent_sig = sign(SHA256(consent_message))

5. Sign ownership + nullifier with cert key (keychain)

6. ONLY NOW: send to prover ────────────────────────→ POST /api/prove
   {consent_sig, cert_der, cert_chain,                 
    ownership_sig, nullifier_sig,                       7. Verify consent FIRST:
    registrant, wallet_index, ...}                         - verify sig against cert pubkey
                                                           - check timestamp (10 min)
                                                           - check prover URL matches
                                                        
                                                        8. If invalid → reject
                                                           (discard all data)
                                                        
                                                        9. If valid → generate proof
                                                           Store consent as compliance record
   
   ←────────────────────────────────────────────────── {proof, public_values}

10. Display proof hex for user to paste into frontend → register(proof, pv)
```

### Enforcement layers

| Layer | What it prevents |
|-------|-----------------|
| **Frontend** | Does not send cert data until consent signature exists |
| **Local app** | Consent signing is a separate step from proving signatures |
| **Prover server** | Rejects requests without valid consent — discards cert data unread |
| **Certificate signature** | Only the cert owner can sign — cryptographic proof of data subject's consent |
| **Scoped consent** | Tied to specific prover + registry + chain + timestamp — cannot be reused |

### Three signatures in delegated proving

| Signature | Signed by | Purpose |
|-----------|-----------|---------|
| `consent_sig` | Certificate key (keychain) | "I consent to share my cert with this prover" |
| `ownership_sig` | Certificate key (keychain) | "I own this cert and bind it to this wallet" |
| `nullifier_sig` | Certificate key (keychain) | "Derive my nullifier for this service" |

All three are signed by the same certificate key via the OS keychain. The private key never leaves the keychain at any point.

## API Specification

### POST /api/prove

**Request Body:**
```json
{
  "consent_signature": "0x...",
  "cert_der": "<base64>",
  "cert_chain": ["<base64>", ...],
  "ownership_sig": "0x...",
  "nullifier_sig": "0x...",
  "registrant": "0x...",
  "wallet_index": 0,
  "max_wallets": 1,
  "disclosure_mask": 3,
  "chain_id": 11155111,
  "registry_address": "0x...",
  "ca_merkle_root": "0x...",
  "ca_merkle_proof": ["0x...", ...],
  "crl_data": "<base64 or null>",
  "crl_merkle_root": "0x...",
  "timestamp": 1712000000
}
```

**Response (success):**
```json
{
  "proof": "0x...",
  "public_values": "0x...",
  "proving_time_ms": 12345
}
```

**Response (error):**
```json
{
  "error": "Invalid certificate format"
}
```

**Consent verification on prover side:**

The prover does NOT trust `consent_message` from the client. Instead:
1. Reconstruct the expected consent message from request parameters:
   ```
   zk-x509-delegated-proving-consent
   Prover: [own URL]
   Registry: [registry_address from request]
   Chain ID: [chain_id from request]
   Wallet: [registrant from request]
   Timestamp: [timestamp from request]
   ```
2. Verify `consent_signature` against the certificate's public key (extracted from `cert_der`) over the reconstructed message
3. Check timestamp is within 10 minutes
4. Reject if any check fails — discard all received data

### GET /api/health

Returns prover status (SP1 version, GPU availability, queue depth).

```json
{
  "status": "ok",
  "sp1_version": "v6.0.2",
  "gpu": true,
  "queue_depth": 0
}
```

## Implementation Plan

### Phase 1: Local Signing API

Add signing-only endpoints to `server.rs` so the frontend can request signatures without running a full prove:

- `POST /api/sign/consent` — Sign consent message via keychain
  - Body: `{ cert_index, prover_url, registry_address, chain_id, registrant, timestamp }`
  - Returns: `{ signature, message }`
- `POST /api/sign/ownership` — Sign ownership challenge via keychain
  - Body: `{ cert_index, registrant, wallet_index, timestamp, chain_id }`
  - Returns: `{ signature }`
- `POST /api/sign/nullifier` — Sign nullifier challenge via keychain
  - Body: `{ cert_index, registry_address, chain_id }`
  - Returns: `{ signature }`

All endpoints require `cert_index` to identify which certificate to sign with (from `/certs` list).

### Phase 2: Delegated Prover Server

New binary `script/src/bin/prover-server.rs` (separate from local `server.rs`):

1. **`POST /api/prove`**: Accepts consent + cert + signatures + params, verifies consent, builds SP1 stdin, runs Groth16 proof, returns proof + public values
2. **Reuse existing `build_stdin()` logic** — extract shared function from `interactive.rs` / `evm.rs`
3. **No keychain dependency** — signatures come from the request body
4. **Compliance logging**: Log `(nullifier, registrant, cert_subject, consent_sig)` to file

### Phase 3: Desktop App Integration

Modify `interactive.rs` to support delegated proving:

1. After registry address input, query on-chain `delegatedProvingRequired` and `proverUrl`
2. If delegated required: show consent dialog in terminal → sign consent → send to prover → receive proof
3. If not required: existing local proving flow (unchanged)
4. Display proof hex for user to paste into frontend

### Phase 4: Contract + Frontend

1. **Contract**: `delegatedProvingRequired` (bool) + `proverUrl` (string) fields + `setDelegatedProving()` setter (owner-only)
2. **Frontend admin page**: UI for service operator to configure delegated proving settings
3. **Frontend registry detail**: Show delegated proving status to users

## Proving Mode Selection (Automatic)

The proving mode is **determined by the service's on-chain configuration**, not by user choice:

| `delegatedProvingRequired` | `proverUrl` | Behavior |
|:-:|:-:|---|
| `false` | (ignored) | **Local proving** — desktop app generates proof locally |
| `true` | non-empty | **Delegated proving** — desktop app sends to prover server after consent |
| `true` | empty | **Unavailable** — "Prover not yet configured, registration unavailable" |

### Desktop app UX (interactive CLI):

```
Registry: 0xABC...123
Service: DeFi Lending Protocol

⚠ This service requires delegated proving for compliance.
  Your certificate information will be sent to:
  https://prover.defi-lending.com

  The following data will be shared with the prover:
  - Certificate subject (name, organization, country)
  - Certificate chain and validity period
  - Your wallet address

  Your private key will NOT be sent.
  The prover may store this information for compliance purposes.

  Do you consent? (y/n): y

Signing consent... ✓
Signing ownership... ✓
Signing nullifier... ✓
Sending to prover... ✓
Generating proof (this may take a few minutes)...
Proof received! (12.3 seconds)

Proof:         0x1234...
Public Values: 0x5678...

Paste these into the frontend to complete registration.
```

### Trust model:

- **Proof cannot be faked**: Even a malicious prover must produce a valid ZK proof (verified on-chain). A wrong proof → smart contract reverts.
- **Proof cannot be stolen**: `registrant == msg.sender` binding means only the user's wallet can submit the proof.
- **Identity is exposed to the chosen prover**: This is the trade-off. Users who need privacy should use local proving.
- **Each registry's proof is scoped**: `registryAddress` binding means a proof for service A cannot be replayed on service B. The prover for service A only sees data intended for service A.

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Private key exposure | Key never leaves keychain. Only signatures are transmitted |
| Malicious prover returns fake proof | Smart contract verifies proof on-chain. Invalid proof → revert |
| Prover sees identity | **User's explicit choice**. Warning displayed before sending. Local proving available for full privacy |
| Man-in-the-middle | HTTPS required. Registrant binding (`registrant == msg.sender`) prevents proof theft |
| Replay attack | Timestamp freshness check (`maxProofAge`) on-chain |
| User sends to wrong prover | Prover selection UI clearly shows prover identity. Custom URL requires manual input |

## Service Operator Setup

1. Deploy prover server with SP1 + GPU
2. Set `proverUrl` in registry metadata (optional — services without it only support local proving)
3. Users connecting to this service see delegated proving option alongside local proving
4. Server logs `(nullifier, registrant, cert_subject)` for compliance

## Files to Modify

| File | Change | Status |
|------|--------|--------|
| `script/src/bin/server.rs` | Signing-only API (`/api/sign/*`) | ✅ Done |
| `script/src/bin/prover-server.rs` | Delegated prover server binary | ✅ Done |
| `script/src/keychain.rs` | Add `Send` bound to `PlatformIdentity` | ✅ Done |
| `script/Cargo.toml` | Add `base64` dep, `prover-server` binary | ✅ Done |
| `contracts/src/IdentityRegistry.sol` | `delegatedProvingRequired` + `proverUrl` + `setDelegatedProving()` | ✅ Done |
| `script/src/bin/interactive.rs` | Query on-chain config, consent flow, send to prover | ✅ Done |
| `frontend/components/AdminContent.tsx` | UI for configuring delegated proving | ✅ Done |
| `frontend/app/registry/[address]/page.tsx` | Show delegated proving status | ✅ Done |
| `frontend/app/create/page.tsx` | Delegated proving toggle in create flow | ✅ Done |
| `frontend/lib/contract.ts` | ABI entries for new fields | ✅ Done |
