# Client-Side Proving Architecture

## Current Problem

The prover server receives the user's **raw private key** over HTTP. Even with CORS
restrictions and TLS, this is a fundamental trust issue — the server operator can
collect private keys.

## Target Architecture

```
Browser (client-side)
├── 1. Read cert + key files (ArrayBuffer)
├── 2. Run SP1 WASM prover locally
├── 3. Output: proof + public values (no key leaves browser)
└── 4. Submit proof to smart contract via MetaMask

No prover server needed.
```

## Migration Path

### Phase 1: Current (server-side proving)
- Private key sent to localhost prover server
- Acceptable for development/testing
- **NOT acceptable for production**

### Phase 2: Encrypted channel (interim)
- Browser generates ephemeral X25519 keypair
- Prover server publishes its public key at /pubkey
- Key bytes encrypted in browser before sending
- Server decrypts in memory, generates proof, wipes key
- Still requires trust in server, but mitigates network sniffing

### Phase 3: SP1 WASM prover (target)
- SP1 compiles guest program to WASM
- Browser executes proof generation entirely client-side
- No network transmission of private key at all
- Blocked by: SP1 WASM prover maturity, browser performance (~7M cycles)

### Phase 4: TEE-based proving (alternative)
- Prover runs inside Intel SGX / AWS Nitro Enclave
- Remote attestation proves prover code hasn't been modified
- Key is decrypted only inside the enclave
- More complex deployment but immediate availability

## SP1 WASM Status

As of SP1 v6 (March 2026):
- `sp1-zkvm` compiles to RISC-V (not WASM)
- `sp1-sdk` (host-side) could potentially compile to WASM
- No official WASM prover target yet
- Succinct's roadmap includes browser proving but no ETA

## What We Can Do Now

1. **Structure code for easy migration**: The guest program (`program/`) doesn't
   change. Only the host-side (`script/`) calling convention changes.

2. **Abstract the prover interface**: Frontend should not know whether proving
   happens locally or remotely. The `Upload.tsx` → prover API can be swapped.

3. **Minimize key exposure window**: Clear key from memory immediately after use.
   Already done: `setPassword("")` after proof generation.

## Decision

Until SP1 WASM is available, we accept server-side proving with the following
mitigations:
- HTTPS required in production (TLS termination)
- Prover server runs on user's local machine (localhost only)
- CORS restricted to frontend origin
- No key logging (Debug derive removed)
- Key bytes cleared after proof generation
