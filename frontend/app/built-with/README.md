# Built with zk-X509 — project listing

A directory of projects that use zk-X509 for on-chain identity, at `/built-with`.
Each project renders as a branded card (logo, accent color, layout template,
idle animation) so listings read distinctly rather than as a uniform grid.

## Files

| File | Role |
| --- | --- |
| `projects.ts` | **Single source of truth** — the `PROJECTS` array + `Project` type, `CATEGORIES`, `CARD_STYLES`, `CARD_ANIMATIONS`. Editing a listing = editing this file. |
| `page.tsx` | The `/built-with` page: header, network + category filters, card grid, "Sign listing / Open PR / Guide" CTA. |
| `ProjectCard.tsx` | Card rendering — logo tile, accent tint, per-template background, idle animation. Accent is validated to a `#rrggbb` hex before use (never raw style text). |
| `sign/page.tsx` | `/built-with/sign` — fill a form, sign the entry with a wallet, copy the ready-to-paste entry. Reuses `ProjectCard` for a live preview. |
| `listingSignature.ts` | `canonicalListingMessage()` — the exact deterministic message an owner signs. Shared by the in-app signer and the CI verifier. |
| `listings.test.ts` | Verifies every owned entry's `signature` recovers to its `owner`; also blocks duplicate names. |
| `../../.github/workflows/verify-listings.yml` | Runs `listings.test.ts` on PRs touching `built-with/**`. |
| `../../.github/PULL_REQUEST_TEMPLATE/add-project.md` | Listing PR checklist. |
| `../../public/logos/{pay,pro,relayers}.svg` | Seed project logos. |

## How a listing is added or changed

1. **Sign listing** (`/built-with/sign`, optional but required if you set an
   `owner`): connect wallet → fill the form → `signer.signMessage(canonical)` →
   copy the generated entry. Off-chain, no gas, no backend.
2. **Open PR**: the button deep-links to the `projects.ts` GitHub editor
   (`/edit/main/...`). Paste the entry, commit; GitHub forks + opens a PR for
   contributors without write access.
3. **CI**: for any entry that sets `owner`, the signature must recover to that
   address over the entry's canonical content. Changing any field invalidates
   the old signature, so an edit to someone else's listing fails CI unless the
   owner re-signs. Entries with no `owner` are maintainer-curated and exempt.

## ⚠️ Before going public — review checklist

This was built for internal/local review. Revisit these before the page is
public:

- [ ] **Repo must be public for "Open PR" to work.** The repo is currently
      **private**, so the GitHub edit deep-link (and the footer GitHub link on
      the landing page) 404 for anyone without collaborator access. The whole
      PR-based listing flow only works once the repo is public, or you switch to
      a backend submission form.
- [ ] **Replace localhost URLs.** The seed entries (Pay/Pro/Relayers) point at
      `http://localhost:4001/4003/4004`. Swap for real public domains (or drop
      `url` until deployed).
- [ ] **Owner addresses on seed entries.** Seed entries are currently
      maintainer-curated (no `owner`). Decide whether the official apps should be
      signed/owned, and by which wallet.
- [ ] **Permissionless vs curated.** Current model is curated (PR + maintainer
      review) with optional per-entry wallet ownership. If self-serve listing
      demand grows, consider a real registry (on-chain or Firestore + wallet
      auth) instead of a static file.
- [ ] **PR title can't be pre-filled** via the edit deep-link (GitHub limitation)
      — only guided via copy + PR template. Acceptable, but note it.
- [ ] **Edit deep-link opens the whole file**, not the specific entry. Fine at a
      few projects; if the list grows large, add per-card edit anchors (mind that
      line numbers drift).
- [ ] **Logo hosting.** Seed logos live in `public/logos/`. External listings use
      arbitrary `logo` URLs (`<img>`); consider size/CSP/onerror handling if the
      list opens up.
- [ ] **Navbar label.** "Built with" appears in both `defaultNavLinks` and the
      registry-scoped nav in `components/Navbar.tsx`.
