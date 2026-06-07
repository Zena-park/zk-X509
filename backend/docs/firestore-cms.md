# zk-X509 CMS — Firestore backend (operations runbook)

The backend's **CMS metadata** layer (registry descriptions, explorer settings,
announcements, CA guides) can run on either of two stores behind one interface
(`src/stores/RegistryStore.ts`):

| `REGISTRY_STORE` | Store | Use |
|------------------|-------|-----|
| `file` (default) | `db/registries.json` | local dev, zero setup, self-host |
| `firestore`      | Cloud Firestore `registries/{address}` | serverless production |

The REST API (`/api/registries/**`) is identical for both — the frontend is
unchanged. **Out of scope / untouched:** `ca-registry.ts` + `services/github.ts`
(GitHub PR flow), the CA registry itself (GitHub `zk-x509-ca-registry` + on-chain),
and zk-X509 core (circuits/contracts/lib).

## Local development

Default (file store, no Firebase needed):

```bash
cd backend
npm run dev          # REGISTRY_STORE defaults to "file"
```

Against the Firestore emulator:

```bash
# 1) start emulators (Firestore on :8080, Functions :5001, Hosting :5000)
firebase emulators:start

# 2) point the backend at the emulator + Firestore store
cd backend
REGISTRY_STORE=firestore FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev

# 3) (optional) seed the emulator from the existing JSON
REGISTRY_STORE=firestore FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed
```

The Admin SDK auto-detects `FIRESTORE_EMULATOR_HOST`, so no credentials are
needed locally.

## One-time migration (file → Firestore)

`npm run seed` reads `db/registries.json` and writes each entry to
`registries/{lowercased-address}`. It is **idempotent** (full-document
overwrite), so it can be re-run safely.

```bash
# emulator
REGISTRY_STORE=firestore FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed
# real project (Application Default Credentials)
GOOGLE_CLOUD_PROJECT=<project-id> npm run seed
```

## Prerequisites — one-time project setup (account owner)

These steps require Firebase **account/billing permissions**, so they are done
**by the account owner**, not in CI/automation:

1. **Create the Firebase project** (or reuse an existing one) and point
   `.firebaserc` at it. The committed default id is `zk-x509-backend`; if you
   create a different id, update `.firebaserc` (`projects.default`) or run
   `firebase use <project-id>`.
   ```bash
   firebase login
   firebase projects:create zk-x509-backend   # or: firebase use <existing-id>
   ```
2. **Enable Cloud Firestore** in **Native mode** (Firebase console → Firestore
   → Create database).
3. **Upgrade to the Blaze plan.** 2nd-gen Cloud Functions (and their outbound
   network calls — ethers RPC, GitHub) require Blaze. At this traffic the cost
   is effectively ~$0 (see *Cost* below); Spark only suffices for the local
   emulator, not a deployed function.
4. **Set the GitHub secret** for the CA-registry PR flow:
   ```bash
   firebase functions:secrets:set CA_REGISTRY_GITHUB_TOKEN
   ```

Everything below (config, code, migration, emulator verification) is already in
the repo; only the four account-owner steps above are external.

## Deploy (Firebase)

Hosting rewrites `/api/**` and `/health` to a single 2nd-gen HTTPS function
(`api`) that serves the whole Express app (`src/firebase.ts` → `createApp()`).

After the one-time prerequisites above (project selected, Firestore + Blaze
enabled, secret set):

```bash
# (first run only, if not already migrated) seed Firestore from the JSON
GOOGLE_CLOUD_PROJECT=<project-id> npm --prefix backend run seed

# deploy rules + function + hosting
firebase deploy --only firestore:rules,functions,hosting
```

The deployed function defaults to `REGISTRY_STORE=firestore` (the file store has
no durable disk on Functions). `CORS_ORIGIN` and `CA_REGISTRY_GITHUB_REPO` are
set as function env/config; `CA_REGISTRY_GITHUB_TOKEN` comes from Secret Manager
(`defineSecret`, injected into `process.env` at runtime — `ca-registry.ts` reads
it unchanged).

## Security rules

`firestore.rules`: `registries` is **read: public, write: false**. The CMS is
public content, so reads are open; the only writer is the backend via the Admin
SDK, which bypasses rules.

> ⚠️ The rule blocks tampering through the Firestore **client SDK** only. It does
> **not** authenticate the backend's own REST write endpoints
> (`PUT`/`POST`/`DELETE` on `/api/registries/**`), which remain unauthenticated
> exactly as before this migration (see the `TODO` at the top of
> `routes/registries.ts`). Adding wallet-signature auth on those endpoints is a
> separate follow-up.

## Caching

GET responses send `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
With Firebase Hosting/CDN in front of the function this collapses most repeat
reads to cache hits, cutting Firestore read ops (and cost) substantially while
keeping edits visibly fresh within ~1 minute.

## Cost

- **Spark (free tier)** is sufficient for testnet: the CMS is tiny (one small
  doc per registry, ~18 today) and low-traffic; with caching the daily Firestore
  reads stay well under free-tier limits.
- **Blaze (pay-as-you-go)** is required for production Cloud Functions outbound
  networking and beyond free quotas. At this traffic the effective cost is
  ~$0/month; the `Cache-Control` headers keep read ops (the main cost driver)
  near zero.
