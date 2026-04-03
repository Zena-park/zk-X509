# zk-X509 Use Cases

## Policy Tools

| Tool | Role |
|------|------|
| **CA Whitelist** | Which CA issued the certificate (country, institution level) |
| **Disclosure Mask** | Which attributes must be disclosed (tier 1: `minDisclosureMask`) |
| **Disclosure Filter** | Required exact values for disclosed fields (tier 2: `requiredCountry`, `requiredOrg`, etc.) |
| **Members Explorer** | Off-chain member browsing with configurable field visibility and filtering |
| **maxWallets** | Wallets per certificate (Sybil resistance strength) |
| **Delegated Proving** | Service verifies user identity directly (KYC/compliance) |
| **Auto Expiry** | On-chain identity lapses when certificate expires |

## Authentication Types

### 1. Identity Verification (Who)
- "This wallet is owned by a real person/entity" → Sybil resistance
- "This wallet belongs to a Korean citizen" → Country filter
- "This wallet belongs to Samsung Electronics" → Org filter
- "This wallet belongs to Samsung Engineering dept" → OrgUnit filter

### 2. Qualification (Eligible)
- "Holds a government-issued certificate" → Public CA whitelist
- "Is a business entity (not individual)" → O field presence
- "Is our employee" → Internal CA whitelist
- "Is a business operating in a specific country" → Country + Org filter

### 3. Access Control (Authorized)
- Employee-only on-chain store → Internal CA only
- Business-only DeFi → O field required + business CA
- Country-restricted service → Country filter
- VIP service → Specific Org value filter

### 4. Regulatory Compliance (Legal)
- KYC → Delegated proving (service verifies identity)
- AML country restriction → Country filter
- Corporate audit → Org disclosure + delegated proving logs

### 5. Voting / Governance
- 1-person-1-vote DAO → maxWallets = 1
- Country-specific voting → Country filter + maxWallets = 1
- Corporate shareholder meeting → Specific Org filter + maxWallets = 1
- Employee voting → Internal CA + maxWallets = 1

### 6. Multi-Wallet Services
- DeFi trading → maxWallets = 3 (trading/custody/cold)
- Corporate treasury → maxWallets = 5 (per-department wallets)

## Service Examples

### DeFi
| Service | Configuration |
|---------|--------------|
| Lending protocol (business only) | mask=0x02, O field presence required |
| Lending protocol (Korean business) | mask=0x03, requiredCountry=KR |
| Exchange (KYC required) | mask=0x01, delegated proving + requiredCountry=KR |
| Staking (Sybil-resistant) | Public CA + maxWallets = 1 |

### DAO / Governance
| Service | Configuration |
|---------|--------------|
| National DAO (Korea) | mask=0x01, requiredCountry=KR, maxWallets=1 |
| Corporate shareholder vote | mask=0x02, requiredOrg=Samsung, maxWallets=1 |
| Global DAO | All government CAs + maxWallets = 1 |

### Enterprise
| Service | Configuration |
|---------|--------------|
| Employee-only store | Internal CA whitelist |
| B2B marketplace | Business CAs only |
| Internal token distribution | `requiredOrgUnit="Engineering"` |

### NFT / Airdrop
| Service | Configuration |
|---------|--------------|
| Country-specific airdrop | Country filter |
| 1-person-1-mint | Public CA + maxWallets = 1 |
| Corporate membership NFT | Internal CA |

### Gaming
| Service | Configuration |
|---------|--------------|
| Region-locked server | Country filter |
| Tournament (1 account) | maxWallets = 1 |

### Real Estate / Finance
| Service | Configuration |
|---------|--------------|
| Tokenized real estate (Korea business) | Country="KR" + O field required |
| STO (security token) | Country filter + delegated proving |
| Insurance | Real-name + auto expiry |

### Public / Government
| Service | Configuration |
|---------|--------------|
| Electronic voting | maxWallets = 1 + country filter |
| Subsidy distribution | Country-specific CA |
| Public procurement bidding | Business CA required |

## Korean NPKI Entity Type Classification

Korean NPKI uses **separate CAs** for different entity types (e.g., yessignCA Class 2 for individuals, Class 3 for businesses). Entity type filtering is achieved via the **CA whitelist** (`addCA()`):

| Entity | How to Filter |
|--------|--------------|
| Individual only | Register only personal CA hashes |
| Business only (sole proprietor + corporation) | Register only business CA hashes |
| Specific company | `requiredOrg` field constraint |

No serialNumber parsing or disclosure-based entity detection is needed — the CA distinction is sufficient.
