# zk-X509 Use Cases

## Policy Tools

| Tool | Role |
|------|------|
| **CA Whitelist** | Which CA issued the certificate (country, institution level) |
| **Disclosure Filter** | Which attributes to require and what values to match *(planned, #56 — not yet implemented)* |
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
| Lending protocol (business only) | O field filter + country restriction |
| Exchange (KYC required) | Delegated proving + country filter |
| Staking (Sybil-resistant) | Public CA + maxWallets = 1 |

### DAO / Governance
| Service | Configuration |
|---------|--------------|
| National DAO (Korea) | Country="KR" + maxWallets = 1 |
| Corporate shareholder vote | Org filter + maxWallets = 1 |
| Global DAO | All government CAs + maxWallets = 1 |

### Enterprise
| Service | Configuration |
|---------|--------------|
| Employee-only store | Internal CA whitelist |
| B2B marketplace | Business CAs only |
| Internal token distribution | OrgUnit filter for departments |

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

Korean NPKI certificates are issued by the same CA for individuals, sole proprietors, and corporations. Classification uses disclosure fields:

| Entity | O Field | CN Field | Detection |
|--------|---------|----------|-----------|
| Individual | absent (`0x0`) | (not disclosed) | `org == bytes32(0)` |
| Sole Proprietor | business name (e.g., `0x홍길동떡집...`) | personal name | `org != bytes32(0)` and `org != cn` (both must be disclosed) |
| Corporation | company name (e.g., `0x삼성전자...`) | company name/representative | `org != bytes32(0)` and CN starts with org value |

**Note:** All disclosure values are UTF-8 right-padded to bytes32. Entity type detection requires both O and CN fields to be disclosed (`minDisclosureMask >= 0x0A`). Individual vs business distinction requires only O field (`minDisclosureMask bit 1`). No serialNumber parsing needed.
