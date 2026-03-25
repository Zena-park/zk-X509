# Platform Backend Design

## Overview

The zk-X509 platform needs off-chain storage for metadata that doesn't
belong on-chain (descriptions, logos, announcements, CA guides).
On-chain data (verification status, CA hashes, registry config) is
queried directly from contracts via RPC.

## Data Split

### On-Chain (contract direct query)
| Data | Contract | Function |
|------|----------|----------|
| Is user verified? | IdentityRegistry | `isVerified(address)` |
| Verification expiry | IdentityRegistry | `verifiedUntil(address)` |
| Registry config | IdentityRegistry | `MAX_WALLETS_PER_CERT()`, `MIN_DISCLOSURE_MASK()` |
| CA list (hashes) | IdentityRegistry | `getCaLeaves()`, `getCaCount()` |
| Registry owner | IdentityRegistry | `owner()` |
| Pause status | IdentityRegistry | `paused()` |
| Registry list | RegistryFactory | `getRegistries()`, `registryInfo()` |
| Registry name | RegistryFactory | `registryInfo().name` |

### Off-Chain (Firebase / local server)
| Data | Purpose |
|------|---------|
| Service description | What this registry is for |
| Logo/icon URL | Visual identity |
| Category | DAO, DeFi, Corporate, etc. |
| CA guide | "Get your certificate from..." per CA |
| Announcements | Admin notices to users |
| Search tags | For filtering/discovery |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Frontend   │────>│  On-Chain (RPC)   │     │  Off-Chain DB │
│  (Next.js)  │     │  - isVerified()   │     │  (Firebase /  │
│             │────>│  - getCaLeaves()  │     │   local JSON) │
│             │     │  - registryInfo() │     │               │
│             │────>│                   │     │  - description│
│             │     └──────────────────┘     │  - logo       │
│             │────────────────────────────>│  - CA guides   │
│             │                              │  - announcements│
└─────────────┘                              └───────────────┘
```

No separate API server. Frontend accesses both directly.

## Firebase Schema (Production)

```
firestore/
  registries/
    {registryAddress}/
      description: string
      logoUrl: string
      category: "dao" | "defi" | "corporate" | "other"
      website: string
      tags: string[]
      createdAt: timestamp
      updatedAt: timestamp

      announcements/
        {announcementId}/
          title: string
          body: string
          createdAt: timestamp

      caGuides/
        {caLeafHash}/
          name: string          // "yessignCA Class 3"
          description: string   // "Korean banking certificate"
          issueUrl: string      // "https://www.yessign.or.kr"
          instructions: string  // "Visit your bank branch..."
```

### Access Rules

```javascript
// Firestore security rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Anyone can read registry metadata
    match /registries/{registryAddr}/{document=**} {
      allow read: if true;
    }
    // Only registry owner can write (verified via wallet signature)
    match /registries/{registryAddr}/{document=**} {
      allow write: if request.auth != null
        && request.auth.token.wallet == getRegistryOwner(registryAddr);
    }
  }
}
```

## Local Development Schema

```
local-db/
  registries.json
```

```json
{
  "0xe7f1...0512": {
    "description": "Local test registry for development",
    "logoUrl": "",
    "category": "other",
    "website": "",
    "tags": ["test", "local"],
    "announcements": [
      {
        "id": "1",
        "title": "Welcome",
        "body": "This is a local test registry.",
        "createdAt": "2026-03-25T00:00:00Z"
      }
    ],
    "caGuides": {
      "0x28a2f0e0...": {
        "name": "yessignCA Class 3",
        "description": "Korean banking certificate (KFTC)",
        "issueUrl": "https://www.yessign.or.kr",
        "instructions": "Visit your bank to issue an NPKI certificate."
      }
    }
  }
}
```

### Local Server

Simple Express server for local development:

```
backend/
  server.ts          # Express server (port 4000)
  db/
    registries.json  # Local JSON file DB
```

```typescript
// GET  /api/registries/:address
// PUT  /api/registries/:address  (owner only)
// GET  /api/registries/:address/announcements
// POST /api/registries/:address/announcements  (owner only)
// GET  /api/registries/:address/ca-guides
// PUT  /api/registries/:address/ca-guides/:caHash  (owner only)
```

## Frontend Integration

```typescript
// lib/platform.ts

// Determine backend URL based on environment
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

// Or use Firebase directly in production
const useFirebase = process.env.NEXT_PUBLIC_USE_FIREBASE === "true";
```

## Registry Discovery Flow

```
User visits platform home (/)
  │
  ├─ On-chain: factory.getRegistries() → list of addresses
  │
  ├─ For each registry:
  │   ├─ On-chain: registryInfo() → name, maxWallets, mask
  │   ├─ On-chain: getCaCount() → CA count
  │   └─ Off-chain: GET /api/registries/:addr → description, logo, category
  │
  ├─ Display as cards with search/filter
  │
  └─ User clicks a registry → /registry/[address]
       │
       ├─ On-chain: full config, CA list, owner
       ├─ Off-chain: description, announcements, CA guides
       │
       ├─ "Which CAs are accepted?"
       │   └─ Show CA list with human-readable names + issue guides
       │
       ├─ "User Dashboard" → /registry/[address]/dashboard
       └─ "Admin Console" → /registry/[address]/admin
```

## Admin Management Flow

```
Registry owner visits /registry/[address]/admin
  │
  ├─ On-chain: addCA(), removeCA(), pause(), etc. (existing)
  │
  └─ Off-chain (NEW):
       ├─ Edit service description, logo, category
       ├─ Post announcements
       └─ Add CA guides ("이 CA는 은행에서 발급받으세요")
```

## Environment Variables

```env
# Frontend
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000   # local
NEXT_PUBLIC_USE_FIREBASE=false                  # true in production

# Firebase (production only)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
```
