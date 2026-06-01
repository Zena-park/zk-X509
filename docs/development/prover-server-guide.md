# Delegated Prover Server — Prover-Server Operator Guide

This guide is for the **prover-server operator** — whoever actually runs the
`prover-server` binary that generates ZK proofs on behalf of users. That can be
the registry owner themselves, or a separate party that runs proving as a service
for one or more registries.

For the *design* (consent protocol, trust model, API contract), see
[design-delegated-proving.md](design-delegated-proving.md). This document is the
practical "how do I run it" companion.

## Two roles — don't conflate them

Delegated proving involves two distinct responsibilities. They may be the same
person or two different parties:

| Role | Who | What they do | Where |
|------|-----|--------------|-------|
| **Prover-server operator** | runs this binary (you) | hosts the prover, holds the ECIES key, generates proofs, keeps compliance logs | this server |
| **Registry owner** (service/CA operator) | owns the IdentityRegistry | enables delegated proving and registers the prover URL on-chain | Admin panel / `setDelegatedProving()` |

This guide covers the **prover-server operator** side. The registry owner's
on-chain steps are summarized in [Coordinating with the registry
owner](#coordinating-with-the-registry-owner) below and in
[deployment-guide.md](deployment-guide.md).

## When this server is needed

A prover server is needed only when a registry has **delegated proving enabled**
(`delegatedProvingRequired = true`). If it is disabled, users prove locally and no
server runs. The flag and the `proverUrl` are set on-chain by the **registry
owner** — not by this server. Until a non-empty `proverUrl` is registered,
end users cannot register and the Admin panel shows a "Prover URL not set"
warning. As the prover-server operator your job is to keep the server reachable
at exactly that URL.

## The binary

| | |
|---|---|
| Source | `script/src/bin/prover-server.rs` |
| Cargo binary | `prover-server` (`script/Cargo.toml`) |
| Endpoints | `POST /api/prove`, `GET /api/pubkey`, `GET /api/health` |

> ⚠️ Do not confuse this with `script/src/bin/server.rs` (the `server` binary).
> That one is the **local / client-side** prover that runs on the user's own
> machine — see [client-side-proving.md](client-side-proving.md). The
> `prover-server` binary is the **operator-hosted** delegated prover.

## Quick start

```bash
cd script
RUST_LOG=info cargo run --release --bin prover-server
```

On startup it prints its ECIES public key and the active URL:

```
ECIES public key: 0x04....
Delegated prover server running at http://localhost:9090
   POST /api/prove   - Generate ZK proof (supports ECIES encryption)
   GET  /api/pubkey  - ECIES public key for encrypting requests
   GET  /api/health  - Server status
```

Verify it is up:

```bash
curl http://localhost:9090/api/health
# {"status":"ok","sp1_version":"v6.0.2","prover_url":"http://localhost:9090"}
```

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PROVER_URL` | This server's **public** URL. Used to reconstruct and verify the consent message. | `http://localhost:9090` |
| `PROVER_PORT` | Port to listen on. | `9090` |
| `PROVER_LOG_DIR` | Directory for compliance logs and the persisted ECIES key. | `./logs` |
| `PROVER_ECIES_KEY` | secp256k1 key (32-byte hex) for decrypting ECIES requests. If unset, a key is generated and persisted to `<PROVER_LOG_DIR>/.ecies_key` (mode `0600`). | auto-generated |

Plus the standard SP1 proving variables (see below).

### ⚠️ `PROVER_URL` must match everywhere

The server verifies each request's consent signature by **reconstructing** the
consent message from `PROVER_URL` (`prover-server.rs:build_consent_message`).
The same value must be identical in all three places:

```
server's PROVER_URL  ==  URL set in Admin panel (setDelegatedProving)  ==  URL users read on-chain
```

If they differ, the reconstructed message won't match the user's signature and
**every request is rejected with 403 Forbidden**. When you put the server behind
a reverse proxy / domain, set `PROVER_URL` to the public HTTPS URL, not the
internal bind address. Agree this exact URL with the registry owner **before**
they call `setDelegatedProving` — see [Coordinating with the registry
owner](#coordinating-with-the-registry-owner).

## Proving backend (SP1 Groth16)

The server generates proofs with `ProverClient::from_env()` in `.groth16()` mode.
Pick a backend with the standard SP1 environment variables:

- **Local (CPU + Docker)** — default. Groth16 wrapping **requires Docker**.
  Expect ~3–5 minutes per proof and ~16 GB RAM. Good for testing, slow for
  production traffic.
- **Succinct prover network (GPU)** — recommended for production:

  ```bash
  export SP1_PROVER=network
  export NETWORK_PRIVATE_KEY=0x...   # your Succinct network key
  ```

  Proving is offloaded to the network's GPUs; the server just submits inputs and
  returns the proof.

> Performance note: the current implementation runs `client.setup(ELF)` per
> request (see the TODO in `prove_handler`). For heavy traffic this is the first
> thing to optimize once the SP1 SDK exposes a thread-safe proving key.

## Request flow (what the server enforces)

1. **Decrypt or read the payload.** Sensitive fields (consent sig, cert + chain,
   ownership/nullifier sigs) arrive either as plaintext or as an ECIES-encrypted
   `encrypted_payload`. Non-sensitive metadata (registrant, registry, chain id,
   CA Merkle proof, etc.) is always plaintext.
2. **Verify consent FIRST**, before any proving work:
   - reconstruct the consent message from `PROVER_URL` + request fields,
   - verify the signature against the certificate's public key
     (RSA-2048/4096, ECDSA P-256/P-384),
   - reject if the timestamp is older than **10 minutes**.
   Invalid consent → `403`, data discarded.
3. **Log compliance** to `<PROVER_LOG_DIR>/compliance-<day>.jsonl`:
   `{registrant, cert_subject, cert_not_after, consent_message, consent_signature}`.
   The full certificate is **not** retained by default — extend `log_compliance`
   if your jurisdiction's KYC/AML rules require more.
4. **Build SP1 stdin and prove** (Groth16), then return:

   ```json
   { "proof": "0x...", "public_values": "0x...", "proving_time_ms": 12345 }
   ```

The private key never reaches the server — only signatures produced by the user's
OS keychain. A malicious server still cannot forge identity: the proof is verified
on-chain, and `registrant == msg.sender` binding means a returned proof only works
for the user's own wallet.

## Optional: end-to-end encryption (ECIES)

To avoid the prover host seeing certificate contents in transit at the HTTP layer:

1. Client fetches the server's key: `GET /api/pubkey` → `{ "pubkey": "0x04..." }`.
2. Client ECIES-encrypts the sensitive payload and sends it as `encrypted_payload`.
3. Server decrypts it in memory using its `PROVER_ECIES_KEY`.

The key is the same one printed at startup and persisted under `PROVER_LOG_DIR`.
Keep that file (and the env var, if you set it) secret and backed up — losing it
means in-flight encrypted requests can't be decrypted.

## Production deployment notes

- **HTTPS is required** (the design assumes TLS to prevent MITM). Terminate TLS at
  a reverse proxy and forward to the server's port; set `PROVER_URL` to the public
  HTTPS URL.
- **Persist `PROVER_LOG_DIR`** on durable storage — it holds both compliance logs
  and the ECIES key.
- **Resource sizing**: local Groth16 needs Docker + ~16 GB RAM per concurrent
  proof; prefer `SP1_PROVER=network` for throughput.
- Run it as a managed service (systemd unit or container) with `RUST_LOG=info`.

Example systemd unit (sketch):

```ini
[Service]
WorkingDirectory=/opt/zk-x509/script
Environment=RUST_LOG=info
Environment=PROVER_URL=https://prover.your-service.com
Environment=PROVER_PORT=9090
Environment=PROVER_LOG_DIR=/var/lib/zk-x509-prover
Environment=SP1_PROVER=network
Environment=NETWORK_PRIVATE_KEY=0x...
ExecStart=/usr/bin/cargo run --release --bin prover-server
Restart=on-failure
```

(For a real deployment, build once with `cargo build --release` and point
`ExecStart` at `target/release/prover-server` instead of `cargo run`.)

## Coordinating with the registry owner

The on-chain registration is the **registry owner's** action, not yours. As the
prover-server operator you hand them a URL and they wire it in. If you run proving
for several registries, repeat this per registry.

1. **You** stand up the server and fix its public HTTPS URL (`PROVER_URL`).
2. **You** share that exact URL with the registry owner.
3. **The registry owner** calls `setDelegatedProving(true, "<your URL>")` from the
   Admin panel (owner-only). Until then the registry shows "Prover URL not set"
   and users can't register.
4. If you ever change the URL (new domain, port), the registry owner must update
   it on-chain too — otherwise consent verification breaks (403). Treat the URL
   as a stable contract between the two roles.

Note the server is **stateless with respect to the registry**: it reads
`registry_address`, `chain_id`, CA Merkle root/proof, etc. from each request, so a
single prover server can serve multiple registries as long as each request carries
a consent signed for that registry. The only per-registry coupling is the
`proverUrl` the owner registers on-chain.

## Checklist (prover-server operator)

- [ ] `cargo run --release --bin prover-server` starts and `/api/health` returns ok
- [ ] `PROVER_URL` is the public HTTPS URL the server is actually reachable at
- [ ] Proving backend chosen (Docker locally, or `SP1_PROVER=network` for GPU)
- [ ] `PROVER_LOG_DIR` is on durable, backed-up storage; ECIES key secured
- [ ] Shared the exact `PROVER_URL` with the registry owner for `setDelegatedProving`
- [ ] Confirmed with the owner that the on-chain `proverUrl` matches; warning gone
- [ ] A test user can register end-to-end (consent → proof → on-chain `register`)
