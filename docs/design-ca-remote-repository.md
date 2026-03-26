# CA Remote Repository Design

## Problem

The prover application needs **full CA certificates** (DER-encoded X.509) to:
1. Match the user cert's issuer against CA subjects → auto-select the correct CA
2. Extract SPKI DER bytes → feed into the ZK circuit for Merkle proof

The frontend needs **CA metadata** (name, description, issue instructions) to:
1. Show users which CAs are supported
2. Guide users on how to obtain a certificate

Currently, CA certificates live in `data/ca-certs/` — a local directory bundled with the application. This works for development but breaks in production (can't update, can't per-service, can't distribute).

The on-chain contract stores only `SHA-256(SPKI)` hashes (32 bytes). There is a gap between what's on-chain (hashes) and what the prover/frontend needs (full certs + metadata).

## Design Goals

1. **Zero manual CA management** — user never downloads CA files manually
2. **Per-service isolation** — each registry admin manages their own CAs independently
3. **Verifiable** — fetched CA must match on-chain hash (tamper-proof)
4. **Fast** — prover fetches only the target registry's CAs, not the entire pool
5. **Offline fallback** — cache locally, work without network when possible
6. **Self-service** — registry admin manages via PR
7. **Frontend-ready** — service metadata and CA guides served from the same source

## Decision: PR-Based Git Repository, Per-Service Management

A Git repository where each registry admin owns their service directory. Admin submits PRs to register their service, add/remove CAs, and provide CA guides for users.

No shared CA pool. No `index.json`. DER filenames are the on-chain hash, so the prover can construct download URLs directly.

## Repository Structure

```
tokamak-network/zk-x509-ca-registry/
│
├── README.md                                       # Contributing guide
│
├── services/
│   ├── 11155111/                                    # Chain ID (Sepolia)
│   │   └── 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512/
│   │       ├── service.json                         # Service metadata + CA guides
│   │       └── certs/
│   │           ├── 0x28a2f0e0...abcd1234.der        # Filename = SHA-256(SPKI)
│   │           └── 0x7b3c9d1f...5678efgh.der
│   │
│   ├── 1/                                           # Chain ID (Mainnet)
│   │   └── 0xabcd...1234/
│   │       ├── service.json
│   │       └── certs/
│   │           └── 0x28a2f0e0...abcd1234.der
│   │
│   └── 31337/                                       # Chain ID (Local Anvil)
│       └── 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512/
│           ├── service.json
│           └── certs/
│               └── 0xdeadbeef...00001111.der
│
└── scripts/
    └── validate.py                                  # CI: validate DER + service.json
```

**Key design**: DER filename = on-chain hash hex. No index file needed — on-chain hash directly maps to download URL.

## `service.json`

Used by both the prover (CA hash list) and frontend (service info, CA guides).

```json
{
  "name": "DAO Voting Registry",
  "description": "One person, one vote identity verification for DAO governance",
  "admin": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "website": "https://mydao.org",
  "created_at": "2026-03-26",
  "updated_at": "2026-03-26",
  "cas": {
    "0x28a2f0e0...abcd1234": {
      "name": "yessignCA Class 3",
      "description": "Korean banking certificate issued by KFTC",
      "issue_url": "https://www.yessign.or.kr",
      "instructions": "Visit your bank branch to issue an NPKI certificate."
    },
    "0x7b3c9d1f...5678efgh": {
      "name": "KISA RootCA 4",
      "description": "Korean government root CA",
      "issue_url": "https://www.rootca.or.kr",
      "instructions": "Included automatically with banking certificates."
    }
  }
}
```

**`cas` field**: keys are CA hashes (same as on-chain `caLeaves[]` and DER filenames). Values provide frontend display info + user guidance.

## Admin Workflows

### Register New Service

```
Admin                                    Git Repository
  │
  │  1. Deploy registry on-chain
  │     addCA(hash1), addCA(hash2)
  │
  │  2. Fork zk-x509-ca-registry
  │
  │  3. Create:
  │     services/{chainId}/{addr}/service.json
  │     services/{chainId}/{addr}/certs/{hash1}.der
  │     services/{chainId}/{addr}/certs/{hash2}.der
  │
  │  4. Submit PR ─────────────────────────> PR opened
  │                                          │
  │                                     CI validates:
  │                                     ✓ DER files parseable as X.509
  │                                     ✓ SHA-256(SPKI) matches filename
  │                                     ✓ service.json schema valid
  │                                     ✓ cas keys match cert filenames
  │                                          │
  │                                     Maintainer reviews & merges
  │                                          │
  │  5. Done ◄───────────────────────────────┘
```

### Add/Remove CA

```
Admin
  │
  │  1. On-chain: addCA(newHash)
  │  2. PR: add certs/{newHash}.der + update cas in service.json
  │  3. Merged
```

### Update Service Info

```
Admin
  │
  │  1. PR: update service.json (name, description, CA instructions)
  │  2. Merged — no cert changes needed
```

## Prover Flow

```
Input: chain_id, registry_address, rpc_url

1. On-chain: getCaLeaves(registry) → [h1, h2, h3]

2. For each hash hi:
   a. Cache hit?  ~/.zk-x509/ca-cache/{hi}.der → use it
   b. Cache miss? GET {repo}/services/{chainId}/{addr}/certs/{hi}.der
   c. Verify:     SHA-256(SPKI of downloaded) == hi
   d. Verified  → save to cache
   e. Mismatch  → reject, log warning

3. If any CA missing: fallback to local data/ca-certs/

4. find_issuer_ca(user_cert, verified_cas) → auto-select

5. Build Merkle proof
```

**No index.json fetch needed.** On-chain hash → URL is deterministic:
```
https://raw.githubusercontent.com/tokamak-network/zk-x509-ca-registry/main/services/{chainId}/{addr}/certs/{hash}.der
```

### Resolution Order

```
1. Local cache    ~/.zk-x509/ca-cache/{hash}.der    (instant)
2. Remote repo    GET certs/{hash}.der               (1 HTTP per CA)
3. Local fallback data/ca-certs/*.der                (dev only)
4. Manual prompt  "CA public key path: ___"          (last resort)
```

### Local Cache

```
~/.zk-x509/
└── ca-cache/
    ├── 0x28a2f0e0...1234.der     # Permanent (hash = immutable content)
    └── 0x7b3c9d1f...5678.der
```

DER files cached by hash — never expire (same hash = same cert forever). Shared across services at cache level.

## Frontend Flow

```
User visits /registry/{address}
  │
  ├─ On-chain: getCaLeaves(), registryInfo()
  │
  └─ Git repo: GET services/{chainId}/{address}/service.json
       │
       ├─ Service info: name, description, website
       │
       └─ CA guides per hash:
          "yessignCA Class 3"
          "Visit your bank to issue an NPKI certificate."
          [Issue Certificate →] (link to issue_url)
```

This replaces the need for Firebase/backend to store CA metadata.

## Security Model

The Git repository is **untrusted**. Security relies on on-chain hash verification:

| Attack | Mitigation |
|--------|-----------|
| Repo serves wrong cert | `SHA-256(SPKI) != on-chain hash` → rejected |
| Repo goes offline | Local cache serves previously verified certs |
| MITM on download | Hash verification catches any modification |
| Fake service.json | Doesn't affect prover — only on-chain hashes matter |
| Admin impersonation PR | CODEOWNERS + maintainer review |

## CI Validation

```yaml
on:
  pull_request:
    paths: ['services/**']

jobs:
  validate:
    steps:
      - name: Validate DER files
        # Parse each .der as X.509
        # Verify SHA-256(SPKI) == filename (without 0x prefix and .der)
        # Check cert not expired

      - name: Validate service.json
        # JSON schema check
        # All keys in "cas" have matching .der file in certs/

      - name: Check PR scope
        # PR only modifies files within one services/{chainId}/{addr}/ directory
```

## Code Changes

### New: `script/src/ca_repo.rs`

```rust
//! Remote CA certificate repository client.
//!
//! Fetches CA certificates from the per-service Git repository,
//! verifies against on-chain hashes, and caches locally.
//! DER filenames are the hex-encoded on-chain hash — no index file needed.

const DEFAULT_REPO_URL: &str =
    "https://raw.githubusercontent.com/tokamak-network/zk-x509-ca-registry/main";

/// Fetch and verify CA certificates for a specific registry.
pub fn fetch_verified_cas(
    chain_id: u64,
    registry_address: &[u8; 20],
    on_chain_hashes: &[[u8; 32]],
    repo_url: Option<&str>,
) -> Vec<CaCertInfo> { ... }

/// Build download URL for a CA cert.
fn cert_url(repo_url: &str, chain_id: u64, registry: &[u8; 20], hash: &[u8; 32]) -> String {
    format!("{}/services/{}/0x{}/certs/0x{}.der",
        repo_url, chain_id, hex::encode(registry), hex::encode(hash))
}

/// Verify downloaded cert matches on-chain hash.
fn verify_ca_cert(cert_der: &[u8], expected_hash: &[u8; 32]) -> bool {
    let Ok((_, cert)) = X509Certificate::from_der(cert_der) else { return false };
    let spki_der = cert.tbs_certificate.subject_pki.raw;
    let actual: [u8; 32] = Sha256::digest(spki_der).into();
    actual == *expected_hash
}
```

### Modified: `script/src/ca.rs`

- Add `CaCertInfo::from_der_bytes(der: &[u8]) -> Option<CaCertInfo>`
- Make `path` field `Option<PathBuf>`
- Keep `scan_ca_certs()` as local fallback

### Modified: `interactive.rs`

```rust
// Before:
let ca_certs = zk_x509_script::ca::scan_ca_certs();

// After:
let on_chain_hashes = zk_x509_script::onchain::fetch_ca_leaves(&rpc_url, &registry_bytes)?;
let mut ca_certs = zk_x509_script::ca_repo::fetch_verified_cas(
    chain_id, &registry_bytes, &on_chain_hashes, None,
);
if ca_certs.is_empty() {
    println!("  ⚠ Remote CA fetch failed, trying local fallback...");
    ca_certs = zk_x509_script::ca::scan_ca_certs();
}
```

## Implementation Plan

1. **Create `tokamak-network/zk-x509-ca-registry` repo**
   - `services/31337/0xe7f1.../service.json` + `certs/{hash}.der` for test
   - `scripts/validate.py`
   - CI workflow
   - `README.md` contributing guide

2. **Implement `ca_repo.rs`**
   - `cert_url()` — build URL from chain_id + registry + hash
   - `fetch_ca_cert()` — HTTP GET + hash verify
   - `cache_read()` / `cache_write()`
   - `fetch_verified_cas()` — orchestrate full flow

3. **Update `ca.rs`** — `from_der_bytes()`, optional path

4. **Update `interactive.rs`** — remote fetch first, local fallback

5. **Tests** — hash verification, cache, fallback
