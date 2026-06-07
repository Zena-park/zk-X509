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

Off-chain metadata is served by a small **backend REST API** (`backend/`,
Express) backed by a pluggable store — a local JSON file in dev, **Cloud
Firestore** in production — deployed as a **Firebase Cloud Function behind
Firebase Hosting** (`/api/**` → the `api` function). The frontend calls this
REST API (`lib/platform.ts`); it does **not** access Firestore directly. The
store is selected by `REGISTRY_STORE=file|firestore` so the same REST contract
runs both locally (no Firebase setup) and in production. See
`backend/docs/firestore-cms.md` for the operations runbook.

## Firebase Schema (Production)

One document per registry under `registries/{registryAddress}` (doc id =
**lowercased** address). To keep the REST responses byte-for-byte identical to
the file store, `announcements` is an **embedded array** and `caGuides` an
**embedded map** on the document (not subcollections) — the documents are tiny
(one per registry) so a full-document read/write is cheap and atomic.

```
firestore/
  registries/
    {lowercasedRegistryAddress}/        // one document
      description: string
      logoUrl: string
      category: "dao" | "defi" | "corporate" | "other"
      website: string
      tags: string[]
      listed: boolean
      explorerEnabled: boolean
      explorerVisibleFields: string[]
      explorerFilterableFields: string[]
      announcements: [                  // embedded array
        { id: string, title: string, body: string, createdAt: string }
      ]
      caGuides: {                        // embedded map, key = caLeafHash
        "<caHash>": {
          name: string,                 // "yessignCA Class 3"
          description: string,          // "Korean banking certificate"
          issue_url: string,            // "https://www.yessign.or.kr"
          instructions: string          // "Visit your bank branch..."
        }
      }
```

> Note: field names mirror the existing REST contract (`issue_url`, no
> `createdAt`/`updatedAt` on the registry doc). The earlier draft used
> subcollections + `issueUrl` + timestamps; the implemented schema above
> supersedes it to preserve the frontend contract unchanged.

### Access Rules

```javascript
// Firestore security rules (firestore.rules)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /registries/{address} {
      allow read: if true;    // public CMS content
      allow write: if false;  // writes only via the backend (Admin SDK), never the client SDK
    }
    match /{document=**} { allow read, write: if false; }
  }
}
```

Writes go exclusively through the backend REST API (Admin SDK, which bypasses
rules); `write: if false` blocks any direct client-SDK tampering. **The REST
write endpoints themselves are currently unauthenticated** (preserved from the
file-store backend — see the `TODO` in `routes/registries.ts`). Owner
wallet-signature auth on those endpoints is a planned **follow-up**, after which
the rule comment above (owner-gated writes) becomes the end state.

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

// The frontend always talks to the backend REST API — never Firestore directly.
// In production this URL points at the Firebase-hosted function (/api/**);
// locally it's the Express dev server.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
```

> The earlier `NEXT_PUBLIC_USE_FIREBASE` / direct-Firestore-from-frontend idea
> was dropped: the backend owns Firestore (via the Admin SDK) so the REST
> contract — and the frontend — stay unchanged whether the store is the local
> file or Firestore. The `firebase` switch now lives entirely in the backend
> (`REGISTRY_STORE`).

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
