# CA Guide Auto-Generation & Git Integration Design

## Problem

Currently, when an admin registers a CA via the Admin UI:
1. Upload DER file → compute `SHA-256(SPKI)` hash → call `addCA(hash)` on-chain
2. CA Guide (name, description, issue URL) must be **manually** created via a separate Git PR

This is two separate workflows. The admin has to leave the UI, fork a repo, create files, and submit a PR.

## Goal

Make CA registration a **single workflow**:
1. Admin uploads DER file in Admin UI
2. **Auto-extract** CA metadata from DER (subject, issuer, algorithm, expiry)
3. **Auto-generate** CA Guide from extracted metadata
4. Admin can edit the generated guide if needed
5. On "Register CA" → **simultaneously**:
   - Call `addCA(hash)` on-chain
   - Create a PR to `zk-x509-ca-registry` via GitHub API (DER file + service.json update)
6. Later, admin can **edit guide** in Admin UI → creates another PR to update service.json

## Architecture

```
Admin UI (Frontend)
  │
  │  1. Upload DER file
  │     ├─ Compute SHA-256(SPKI) hash
  │     └─ Parse X.509: extract subject, issuer, algorithm, expiry
  │
  │  2. Auto-generate CA Guide
  │     ├─ name: from Subject CN or O field
  │     ├─ description: "{algorithm} certificate issued by {issuer}"
  │     └─ issue_url: "" (admin fills in)
  │
  │  3. Admin reviews/edits guide (optional)
  │
  │  4. "Register CA" button
  │     ├─ On-chain: addCA(hash) via wallet
  │     └─ Git: GitHub API → create PR to zk-x509-ca-registry
  │
  └─ Later: "Edit Guide" → update service.json via GitHub API PR
```

## X.509 Metadata Extraction (Browser-Side)

DER parsing in the browser using a lightweight library:

### Option A: `@peculiar/x509` (Recommended)

```typescript
import * as x509 from "@peculiar/x509";

function parseCaDer(der: Uint8Array): CaMetadata {
  const cert = new x509.X509Certificate(der);

  // Extract subject fields
  const subject = cert.subject;
  const cn = cert.subjectName.getField("CN")?.[0] || "";
  const org = cert.subjectName.getField("O")?.[0] || "";
  const country = cert.subjectName.getField("C")?.[0] || "";

  // Issuer
  const issuerCn = cert.issuerName.getField("CN")?.[0] || "";

  // Algorithm
  const algorithm = cert.publicKey.algorithm.name; // "RSASSA-PKCS1-v1_5" or "ECDSA"
  const keySize = getKeySize(cert.publicKey); // 2048, 256, 384

  // Validity
  const notAfter = cert.notAfter.toISOString().split("T")[0];

  return {
    name: cn || org || subject,
    description: `${algorithm}-${keySize} CA certificate from ${country}`,
    issuer: issuerCn,
    algorithm: `${algorithm}-${keySize}`,
    expires: notAfter,
    country,
  };
}
```

### Option B: `asn1js` + manual parsing

Lower-level but no large dependency. Only if `@peculiar/x509` is too heavy.

**Decision: Option A** — `@peculiar/x509` is ~50KB gzipped and well-maintained.

## CaFileEntry Extension

Currently:
```typescript
interface CaFileEntry {
  name: string;       // filename
  hash: Uint8Array;
  hashHex: string;
}
```

After:
```typescript
interface CaFileEntry {
  name: string;           // filename
  hash: Uint8Array;
  hashHex: string;
  derBytes: Uint8Array;   // raw DER for Git upload
  // Auto-extracted metadata
  subject: string;        // full subject string
  subjectCn: string;      // Common Name
  subjectOrg: string;     // Organization
  issuer: string;         // issuer string
  algorithm: string;      // "RSA-2048", "ECDSA-P256"
  expires: string;        // "2027-06-15"
  country: string;        // "KR", "EE", etc.
  // Auto-generated guide (editable by admin)
  guide: CaGuide;
}

interface CaGuide {
  name: string;           // auto: subjectCn || subjectOrg
  description: string;    // auto: "{algorithm} CA from {country}"
  issue_url: string;      // empty, admin fills in
  instructions: string;   // empty, admin fills in
}
```

## GitHub API Integration

### Authentication

Admin connects their GitHub account via OAuth or provides a Personal Access Token (PAT).

**Option A: GitHub OAuth App** (better UX)
- Frontend redirects to GitHub OAuth → gets token
- Token stored in browser session (not persisted)
- Scopes: `repo` (for creating PRs on public repos) or `public_repo`

**Option B: Personal Access Token** (simpler)
- Admin pastes their PAT in settings
- Stored in localStorage
- Simpler to implement

**Decision: Option B for v1** — simpler, no OAuth setup needed. Admin generates a PAT with `public_repo` scope.

### PR Creation Flow

```
1. Fork check: Does admin have a fork of zk-x509-ca-registry?
   └─ If not: GitHub API → fork the repo

2. Create/update branch in fork:
   └─ Branch name: ca-update/{chainId}/{registryAddr}/{timestamp}

3. Commit files to branch:
   ├─ PUT certs/0x{hash}.der  (base64-encoded DER)
   └─ PUT service.json        (updated with new CA entry)

4. Create PR from fork to upstream:
   └─ Title: "Add CA: {caName} for {serviceName}"
   └─ Body: auto-generated with CA details
```

### GitHub API Calls

```typescript
// 1. Fork repo (if needed)
POST /repos/tokamak-network/zk-x509-ca-registry/forks

// 2. Get current service.json (or create new)
GET /repos/{owner}/{fork}/contents/services/{chainId}/{addr}/service.json
// → 404 means new service, create from scratch

// 3. Create/update files via commits
PUT /repos/{owner}/{fork}/contents/services/{chainId}/{addr}/certs/0x{hash}.der
{
  "message": "Add CA cert: {name}",
  "content": "{base64_der}",
  "branch": "ca-update/{chainId}/{addr}/{ts}"
}

PUT /repos/{owner}/{fork}/contents/services/{chainId}/{addr}/service.json
{
  "message": "Update service.json with CA guide",
  "content": "{base64_json}",
  "branch": "ca-update/{chainId}/{addr}/{ts}",
  "sha": "{existing_sha}"  // if updating
}

// 4. Create PR
POST /repos/tokamak-network/zk-x509-ca-registry/pulls
{
  "title": "Add CA: {name} for {serviceName}",
  "head": "{admin_user}:ca-update/{chainId}/{addr}/{ts}",
  "base": "main",
  "body": "## CA Certificate\n- Name: ...\n- Hash: ...\n- Algorithm: ..."
}
```

## UI Changes

### CA Registration Flow (Enhanced)

```
┌─────────────────────────────────────────────────────────┐
│ CA Certificates                                          │
│                                                          │
│  ┌───────────────────────────────────────────────────┐   │
│  │  Drop .der files here or click to browse          │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  Pending CA Certificates (2)                             │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ yessignCA Class 3                                   │ │
│  │ RSA-2048 | Expires: 2027-06-15 | Country: KR        │ │
│  │ Hash: 0x28a2f0e0...1234                             │ │
│  │                                                     │ │
│  │ ── CA Guide (auto-generated, editable) ──           │ │
│  │ Name: [yessignCA Class 3              ]             │ │
│  │ Description: [RSA-2048 CA from KR     ]             │ │
│  │ Issue URL: [https://www.yessign.or.kr ]             │ │
│  │ Instructions: [Visit your bank branch ]             │ │
│  │                                                     │ │
│  │ [ADD TO REGISTRY + CREATE PR]                       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  GitHub Token: [ghp_xxx...] (for PR creation)            │
│  Status: ✓ Connected as @Zena-park                       │
└─────────────────────────────────────────────────────────┘
```

### Guide Edit Flow

```
┌─────────────────────────────────────────────────────────┐
│ CA Guides                                                │
│                                                          │
│  On-chain CAs (3):                                       │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 0x28a2...1234                                       │ │
│  │ Name: [yessignCA Class 3              ]             │ │
│  │ Description: [Korean banking cert     ]             │ │
│  │ Issue URL: [https://www.yessign.or.kr ]             │ │
│  │ Instructions: [Visit your bank...     ]             │ │
│  │                                                     │ │
│  │ [UPDATE GUIDE → CREATE PR]                          │ │
│  │ Last updated: from Git repo (read-only display)     │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Unified Flow: On-Chain + Git (Register / Edit / Remove)

All CA operations sync **both on-chain and Git** in a single workflow.
The UI shows a **persistent modal/dialog** that cannot be dismissed until all steps complete.

### CA Register Flow

```
┌──────────────────────────────────────────────────────────┐
│  Register CA — Step-by-Step                     [1/4]    │
│                                                          │
│  Step 1: On-Chain Transaction                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ⏳ Waiting for addCA() transaction...              │  │
│  │    TX: 0xabc...123                                 │  │
│  │    Please confirm in your wallet.                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Step 2: Transaction Confirmed                    [2/4]  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ✓ CA registered on-chain!                          │  │
│  │    Block: 12345678                                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Step 3: Sign for Git Repository                  [3/4]  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ⏳ Please sign to verify your admin identity.      │  │
│  │    This signature proves you are the registry      │  │
│  │    admin and authorizes the CA guide update.       │  │
│  │                                                    │  │
│  │    Message: "zk-x509-ca-registry\n                │  │
│  │             Chain ID: 31337\n                      │  │
│  │             Registry: 0xe7f1...\n                  │  │
│  │             Operation: add-ca\n                    │  │
│  │             Timestamp: 1711468800"                 │  │
│  │                                                    │  │
│  │    [Sign with Wallet]                              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Step 4: Creating Git PR                          [4/4]  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ⏳ Creating PR to zk-x509-ca-registry...          │  │
│  │    Uploading: 0x28a2...1234.der                    │  │
│  │    Updating: service.json                          │  │
│  │    Adding: signature.json                          │  │
│  │                                                    │  │
│  │ ✓ PR Created!                                      │  │
│  │    https://github.com/tokamak-network/             │  │
│  │    zk-x509-ca-registry/pull/42                     │  │
│  │                                                    │  │
│  │    [View PR] [Close]                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ⚠ Do not close this dialog until all steps complete.    │
└──────────────────────────────────────────────────────────┘
```

### CA Remove Flow

```
Step 1: removeCA(index) on-chain TX → wait for confirmation
Step 2: Sign for Git (operation: "remove-ca")
Step 3: Git PR → remove DER file + update service.json (remove ca entry)
```

### CA Guide Edit Flow (No on-chain TX)

```
Step 1: Sign for Git (operation: "update")
Step 2: Git PR → update service.json only
```

### Signature Format

Matches `zk-x509-ca-registry` admin.py format (already defined in the repo):

```
Message:
  zk-x509-ca-registry
  Chain ID: {chainId}
  Registry: {registryAddress}
  Admin: {adminAddress}
  Operation: {add-ca|remove-ca|update}
  Timestamp: {unix_timestamp}
```

The signature is stored as `signature.json` in the service directory:
```json
{
  "admin": "0xf39F...",
  "operation": "add-ca",
  "timestamp": 1711468800,
  "signature": "0xabc...",
  "chain_id": "31337",
  "registry": "0xe7f1..."
}
```

### Error Handling

| Error | Recovery |
|-------|---------|
| On-chain TX fails | Show error, allow retry. No Git PR created. |
| User rejects wallet signature | Show "Signature required" message, allow retry. |
| GitHub API fails (rate limit, auth) | Show error + manual fallback link to create PR manually. |
| PR creation fails | Show error details + "Copy files" button for manual submission. |

### Modal Behavior

- **Non-dismissable** during steps 1-3 (no close button, no backdrop click)
- Close button appears only after all steps complete or on fatal error
- Each step shows clear status: pending (⏳), success (✓), error (✗)
- If browser is closed mid-process: on-chain TX may succeed without Git PR. On next visit, show "Pending Git sync" notification for CAs registered on-chain but not in Git.

## Implementation Plan

### Phase 1: X.509 Parsing + Auto-Fill Guide
1. Add `@peculiar/x509` dependency
2. Extend `CaFileEntry` with parsed metadata + guide
3. Update `processFiles()` to parse DER and auto-generate guide
4. Show extracted info + editable guide fields in the pending CA list

### Phase 2: GitHub API PR Creation
1. Add GitHub token input in Admin settings
2. Implement `lib/github.ts` — fork, branch, commit, PR creation
3. On "ADD TO REGISTRY":
   - `addCA(hash)` on-chain
   - Create PR to ca-registry (DER + service.json)
4. Show PR link after creation

### Phase 3: Guide Editing via PR
1. Load existing guide from Git repo (already done in PR #55)
2. Admin edits fields in UI
3. "UPDATE GUIDE" → creates PR with updated service.json
4. Show PR link

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `@peculiar/x509` | X.509 DER parsing in browser | ~50KB gzipped |
| GitHub API | PR creation | native fetch, no extra dep |

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| GitHub token in browser | localStorage, admin's own token, `public_repo` scope only |
| Token theft via XSS | CSP headers, no eval, sanitized inputs |
| Malicious DER upload | X.509 parsing validates structure; on-chain hash is the authority |
| PR spam | GitHub rate limits + CI validation on ca-registry repo |
