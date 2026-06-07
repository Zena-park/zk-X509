import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createApp } from "./app";

/// Firebase Cloud Functions (2nd gen) entry. The whole Express app is served by
/// a single HTTPS function; Firebase Hosting rewrites `/api/**` to it (see
/// firebase.json). The local/self-hosted entry stays in `server.ts`.

// CA-registry GitHub token comes from Secret Manager (not committed env). It is
// injected into process.env at runtime for the declared secrets, so the
// existing ca-registry.ts / services/github.ts read it via process.env
// unchanged.
const CA_REGISTRY_GITHUB_TOKEN = defineSecret("CA_REGISTRY_GITHUB_TOKEN");

// Store selection is centralized in getRegistryStore(): on Cloud Functions
// (`K_SERVICE` set by the runtime) it defaults to Firestore, since the file
// store has no durable disk here. No env mutation needed at this entry point.
// CORS is handled by the Express `cors({ origin: CORS_ORIGIN })` middleware
// (single source of truth) — do NOT also set onRequest's `cors`, which would
// layer a second, broader policy and produce inconsistent headers.
export const api = onRequest(
  { secrets: [CA_REGISTRY_GITHUB_TOKEN], region: "us-central1" },
  createApp()
);
