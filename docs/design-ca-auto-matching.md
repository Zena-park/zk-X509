# CA Auto-Matching Design

## Problem

The interactive CLI currently prompts:
```
CA public key path [certs/ca_pub.der]:
```

Users must manually provide the CA public key file, which is error-prone and
requires knowing which CA issued their certificate. This is especially
problematic for keychain-based certificates where users may not have the
CA file locally.

## Solution

Automatically match the user's certificate issuer against on-chain registered
CAs by cross-referencing `data/ca-certs/` directory with the on-chain CA leaf
hashes.

## Data Flow

```
data/ca-certs/*.der          On-Chain Registry
  (full X.509 certs)         (SHA-256 hashes of SPKI DER)
        |                            |
        v                            v
  Extract SPKI DER           fetch_ca_leaves()
        |                            |
        v                            v
  SHA-256(SPKI) ──── match ──── ca_leaves[]
        |
        v
  Filter: only on-chain registered CAs
        |
        v
  Match issuer of user cert against filtered CA subjects
        |
        v
  Auto-select ca_pub_key (SPKI DER) ── no user prompt needed
```

## Key Formats

| File | Format | Size |
|------|--------|------|
| `data/ca-certs/*.der` | Full X.509 Certificate (DER) | ~1-1.5 KB |
| `certs/ca_pub.der` | SubjectPublicKeyInfo (SPKI DER) | ~294 B |
| On-chain CA leaf | `SHA-256(SPKI DER)` | 32 B |

## Implementation

### 1. `onchain.rs` — Add `fetch_ca_leaves()` as public

Already exists but is private. Make it public so interactive.rs can use it.

### 2. `keychain.rs` or new `ca.rs` — CA directory scanner

```rust
/// Scan data/ca-certs/ directory for full CA certificates.
/// Returns Vec<(issuer_subject, spki_der, cert_der)>.
fn scan_ca_certs(dir: &Path) -> Vec<CaCertInfo>

/// Filter CA certs against on-chain registered leaves.
/// Returns only CAs whose SHA-256(SPKI) is in the on-chain list.
fn filter_registered_cas(
    ca_certs: &[CaCertInfo],
    on_chain_leaves: &[Hash],
) -> Vec<CaCertInfo>

/// Find the CA that issued the given user certificate.
fn find_issuer_ca(
    user_cert_der: &[u8],
    registered_cas: &[CaCertInfo],
) -> Option<CaCertInfo>
```

### 3. `interactive.rs` — Remove manual CA prompt

```
Before:  CA public key path [certs/ca_pub.der]: ________
After:   Auto-matched CA: yessignCA Class 3 (on-chain verified)
```

Fallback: if auto-matching fails (RPC down, CA not found), fall back
to manual prompt.

## CA Certificate Distribution

CA certificates are publicly available at:
- **Gist**: https://gist.github.com/Zena-park/19d7507e8547b61b1466c286b241fcbb
- **Local**: `data/ca-certs/` (DER format, git tracked)

The gist contains PEM-encoded certificates. The local directory contains
DER-encoded certificates. Both are equivalent; the CLI reads from
`data/ca-certs/` locally and falls back to gist download if not present.

When the repo goes public, `data/ca-certs/` will be the primary source.

## Scope

- `data/ca-certs/` directory: full X.509 CA certificates (DER)
- On-chain: `getCaLeaves()` returns `SHA-256(SPKI DER)[]`
- Matching: extract SPKI from cert, hash, compare
- User cert issuer → CA subject matching for auto-selection
