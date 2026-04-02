# Delegated Proving Design

## Problem

Currently, users must run the SP1 prover locally (~5 min CPU). This requires:
- Rust toolchain + SP1 installed
- ~16GB RAM
- Docker for Groth16

Service operators who need to know user identity (KYC/compliance) or want to offer a better UX can run the prover on behalf of users. This is safe because **the private key never enters the prover** — only pre-computed signatures are needed.

## Architecture Overview

```
Browser (frontend)     Local App (keychain)     Delegated Prover        Smart Contract
──────────────────     ────────────────────     ────────────────        ──────────────

1. Get cert list ─────→ /certs
                 ←───── cert list

2. Select cert, choose delegated proving

3. Consent dialog shown to user
   User clicks [Agree]
   Request consent sig ──→ /sign/consent
                     ←──── consent_sig (cert key)

4. Request sigs ──────→ /sign/ownership
                 ←───── ownership_sig
                ──────→ /sign/nullifier
                 ←───── nullifier_sig

5. Send all to prover ──────────────────→ POST /api/prove
   (consent + cert + sigs)                Verify consent → prove
                       ←──────────────── proof + public_values

6. Submit to chain ─────────────────────────────────────────→ register(proof, pv)
```

**Key invariant: Steps 4-5 only execute after step 3 (consent) succeeds.**

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
Local App (keychain)                 Browser (frontend)              Delegated Prover
────────────────────                 ──────────────────              ────────────────

1. GET /certs ←──────────────────── Request cert list
   Return cert list ─────────────→ Show cert selection

2. User selects certificate
   
3. Frontend shows consent dialog:
   "Your certificate information will
    be sent to [proverUrl]. Consent?"
   
   User clicks [Agree]

4. POST /sign/consent ←────────── Request consent signature
   {proverUrl, registry,            (consent message constructed
    chainId, registrant,              by frontend, signed by
    timestamp}                        cert key in keychain)
   
   Sign with cert key (keychain)
   Return consent_sig ───────────→ Consent signature received

5. POST /sign/ownership ←──────── Request proving signatures
   POST /sign/nullifier ←──────── 
   Return sigs ──────────────────→ All signatures ready

6. ONLY NOW: send everything ─────────────────────────────→ POST /api/prove
   {consent_sig, consent_message,                            
    cert_der, cert_chain,                                    7. Verify consent FIRST:
    ownership_sig, nullifier_sig,                               - verify cert_sig against
    registrant, wallet_index, ...}                                cert public key
                                                                - check timestamp (10 min)
                                                                - check prover URL matches
                                                             
                                                             8. If invalid → reject
                                                                (discard all data)
                                                             
                                                             9. If valid → generate proof
                                                                Store consent as
                                                                compliance record
   
                                  ←─────────────────────────── {proof, public_values}

10. register(proof, pv) ──→ Smart Contract
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

### Phase 3: Frontend Integration

1. **Service metadata**: Add optional `proverUrl` to backend registry metadata
2. **Prover selection UI**: If service has `proverUrl`, show delegated proving option alongside local
3. **Consent flow**: Consent dialog → sign with cert key → proceed only after consent
4. **Delegated proving flow**: Get signatures from local app → send to delegated prover → receive proof → submit to contract

## Prover Selection (User Choice)

The user must **explicitly choose** which prover to use. This is a critical trust decision — the selected prover will see the user's certificate contents (name, organization, country).

### Options presented to the user:

| Option | Privacy | Speed | Who sees identity |
|--------|---------|-------|-------------------|
| **Local** (my device) | Maximum | ~5 min CPU | Nobody |
| **Service prover** (operated by this service) | Service sees identity | Fast (GPU) | Service operator |
| **Custom prover URL** (user-specified) | Depends on trust | Varies | Prover operator |

### UX flow:

1. User clicks "Register" on a service page
2. **Prover selection dialog** appears:
   - "Generate proof on my device (private, slower)"
   - "Use [Service Name]'s prover (faster, service will see your certificate)" — only shown if service has `proverUrl`
   - "Use custom prover URL" (advanced)
3. If delegated prover selected → **consent dialog**:

   > **Personal Information Disclosure Consent**
   >
   > By using [Service Name]'s prover at `[proverUrl]`, the following information from your certificate will be sent to the prover:
   > - Certificate subject (name, organization, country, etc.)
   > - Certificate chain (issuing CA information)
   > - Certificate validity period
   > - Your wallet address
   >
   > **Your private key will NOT be sent.**
   >
   > The prover operator may store this information for compliance purposes.
   >
   > [Cancel] [Sign Consent]

4. User clicks [Sign Consent] → local app signs consent message with certificate key (keychain prompt appears)
5. Consent signature received → frontend proceeds with ownership/nullifier signing → sends all to prover
6. Consent record (signed message + signature) stored locally for user reference

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

| File | Change |
|------|--------|
| `script/src/bin/server.rs` | Add `POST /api/prove`, signing endpoints |
| `script/src/lib.rs` | Extract shared `build_stdin()` from interactive/evm |
| `frontend/components/DashboardContent.tsx` | Add delegated proving flow |
| `frontend/lib/platform.ts` | Add `proverUrl` to metadata |
| `backend/db/registries.json` | Add optional `proverUrl` field |
