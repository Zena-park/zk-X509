# zk-X509 Cycle Benchmarks

Measured on SP1 zkVM v6.0.1 (execute mode), macOS, single-level certificate chain.

## Results

| Configuration | Cycles | vs RSA baseline |
|--------------|-------:|:---:|
| **RSA-2048** (single-level, full disclosure) | 17,399,633 | — |
| RSA-2048 (no disclosure, mask=0x00) | 17,384,766 | −0.1% |
| RSA-2048 + CRL verification | 23,163,293 | +33.1% |
| **ECDSA P-256** (single-level, full disclosure) | 11,803,639 | −32.2% |
| **ECDSA P-384** (single-level, full disclosure) | 47,775,211 | +174.6% |

## Analysis

### Signature Algorithm Impact
- **P-256 is 32% cheaper than RSA-2048** — recommended for new deployments
- **P-384 is 2.7× more expensive than RSA-2048** — the larger field (384-bit vs 256-bit)
  causes ~4× more elliptic curve operations; only use when required by policy (e.g., CNSA Suite)
- The dominant cost is signature verification (ownership + nullifier + chain), not hashing

### CRL Verification
- Adds ~5.8M cycles (+33%) for a small test CRL (<1KB, 1 revoked entry)
- Real-world CRLs with thousands of entries would cost significantly more
- CRL is optional — omit for deployments using on-chain revocation (`revokeIdentity()`)

### Selective Disclosure
- Full disclosure (4 fields) vs none: ~15K cycles difference (0.1%)
- Negligible cost — disclosure mask has no meaningful performance impact

### Cost Breakdown (RSA single-level, estimated)
| Operation | Estimated Cycles | % of Total |
|-----------|--------:|:---:|
| RSA signature verify (ownership) | ~5.7M | 33% |
| RSA signature verify (chain) | ~5.7M | 33% |
| Nullifier signature verify | ~5.7M | 33% |
| SHA-256 hashing (all) | ~200K | 1% |
| Merkle proof verification | ~40K | <1% |
| Selective disclosure | ~15K | <1% |
| X.509 parsing + other | ~100K | <1% |

## Reproducing

```bash
# 1. Generate test certificates
cd certs && bash generate-test-certs.sh && bash generate-test-crl.sh && cd ..

# 2. Run all benchmarks
bash script/bench.sh
```

Benchmarks use SP1 `--execute` mode (real zkVM execution with cycle counting,
no proof generation). This is NOT a mock — the program runs inside the actual
RISC-V zkVM with accurate cycle measurement.

## Environment
- SP1 zkVM: v6.0.1
- Certs: RSA-2048, ECDSA P-256, ECDSA P-384
- Chain: single-level (user cert → root CA)
- CRL: test CRL (<1KB, RSA-SHA256 signed)
- Date: 2026-03-23
