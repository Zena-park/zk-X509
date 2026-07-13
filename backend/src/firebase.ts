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

// Tokamak AI (LiteLLM, OpenAI-compatible) credentials for the /api/chat
// assistant. Both the key and the internal gateway URL are secrets; the model
// name is non-sensitive and read from plain env (LITELLM_MODEL, default in
// services/assistant.ts). Injected into process.env at runtime.
const LITELLM_API_KEY = defineSecret("LITELLM_API_KEY");
const LITELLM_BASE_URL = defineSecret("LITELLM_BASE_URL");

// Store selection is centralized in getRegistryStore(): on Cloud Functions
// (`K_SERVICE` set by the runtime) it defaults to Firestore, since the file
// store has no durable disk here. No env mutation needed at this entry point.
// CORS is handled by the Express `cors({ origin: CORS_ORIGIN })` middleware
// (single source of truth) — do NOT also set onRequest's `cors`, which would
// layer a second, broader policy and produce inconsistent headers.
//
// Cost guardrail: `maxInstances` caps the worst-case fan-out, so a traffic spike
// or abuse of an unauthenticated endpoint can never turn into a runaway bill.
// This matters most for /api/chat (a paid LLM), whose per-IP rate limit lives in
// each instance's memory — without a cap, the ceiling scales with the instance
// count. Do not drop these: they were absent here once, and a redeploy silently
// reverted the running service to the platform default of 100 instances.
// minInstances stays at its default 0, so the service still scales to zero and
// costs nothing while idle; maxInstances only bounds the ceiling. Memory is
// pinned at the 256MiB default so the per-instance burn rate is predictable.
export const api = onRequest(
  {
    secrets: [CA_REGISTRY_GITHUB_TOKEN, LITELLM_API_KEY, LITELLM_BASE_URL],
    region: "us-central1",
    memory: "256MiB",
    maxInstances: 5,
  },
  createApp()
);
