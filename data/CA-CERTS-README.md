# CA Certificates Collection

Global X.509 CA certificates collected for zk-X509 registry validation.
All certificates are stored in **DER** format. Each folder contains a `SOURCES.txt` with download URLs for re-fetching.

## Summary

| Country | Folder | Certs | Key CAs |
|---------|--------|------:|---------|
| 🇰🇷 Korea | `ca-certs-kr` | 18 | KISA, SignKorea, CrossCert, yessign |
| 🇸🇬 Singapore | `ca-certs-sg` | 9 | NCA (GovTech), Netrust |
| 🇺🇸 United States | `ca-certs-us` | 10 | FCPCA-G2, DoD, FBCA, IdenTrust |
| 🇯🇵 Japan | `ca-certs-jp` | 7 | GPKI, JGCA, JPKI (My Number Card) |
| 🇹🇼 Taiwan | `ca-certs-tw` | 12 | GRCA, GCA, MOICA, XCA, HCA |
| 🇪🇪 Estonia | `ca-certs-ee` | 10 | SK ID Solutions, EE-GovCA, ESTEID |
| 🇮🇳 India | `ca-certs-in` | 4 | CCA India, eMudhra, nCode |
| 🇩🇪 Germany | `ca-certs-de` | 11 | D-Trust, BNotK, gematik TI |
| 🇨🇭 Switzerland | `ca-certs-ch` | 10 | SG-PKI (Root I–VI, E-Root) |
| 🇧🇷 Brazil | `ca-certs-br` | 8 | ICP-Brasil (v5–v13), SERPRO, Certisign |
| 🇦🇪 UAE | `ca-certs-ae` | 0 | Offline (DarkMatter/DigitalTrust shutdown) |
| **Total** | | **99** | |

## Key Algorithms

- **RSA**: US (FPKI), Korea (NPKI), Taiwan, India, Brazil, Germany (D-Trust), Switzerland
- **ECDSA/ECC**: Singapore (NCA), Estonia (SK ID G1E), Japan (JPKI), Germany (gematik, BNotK EC), Switzerland (E-Root), Brazil (v6/v7)
- Many countries issue **both RSA and ECC** variants

## How to Update

Each `ca-certs-XX/SOURCES.txt` contains the original download URLs.
Re-download and convert to DER:

```bash
# PEM to DER
openssl x509 -in cert.pem -inform PEM -outform DER -out cert.der

# Verify DER
openssl x509 -in cert.der -inform DER -noout -subject -dates
```

## Collected

2026-03-31
