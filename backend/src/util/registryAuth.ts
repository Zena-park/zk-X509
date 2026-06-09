import { verifyMessage } from "ethers";
import { getRegistryOwner } from "./onchain";

/**
 * Owner-signature authorization for registry CMS writes.
 *
 * A write is authorized only when it carries a fresh wallet signature whose
 * signer is the registry's *on-chain* owner. Recovering the signer is not
 * enough on its own — the signer must equal `IdentityRegistry.owner()`, so a
 * caller can't authorize themselves by signing with an arbitrary key.
 */

const FRESH_WINDOW_S = 600; // ±10 minutes

export interface SignedRequest {
  chainId: unknown;
  signature: unknown;
  signatureTimestamp: unknown;
  /** Operation id, bound into the signed message (e.g. "update-metadata"). */
  operation: string;
  /** Optional resource the op targets (announcement id / CA hash), also bound. */
  target?: string;
}

export type AuthResult =
  | { ok: true; owner: string; chainId: number }
  | { ok: false; status: number; error: string };

/**
 * Canonical message the client signs and the server reconstructs.
 * NOTE: must stay byte-identical to `signAdminAction` in
 * `frontend/lib/platform.ts` — change both together.
 */
export function buildAuthMessage(p: {
  chainId: number;
  registryAddress: string;
  operation: string;
  target?: string;
  signatureTimestamp: number;
}): string {
  const lines = [
    "zk-x509-registry-admin",
    `Chain ID: ${p.chainId}`,
    `Registry: ${p.registryAddress.toLowerCase()}`,
    `Operation: ${p.operation}`,
  ];
  if (p.target) lines.push(`Target: ${p.target}`);
  lines.push(`Timestamp: ${p.signatureTimestamp}`);
  return lines.join("\n");
}

export type OwnerCheck =
  | { ok: true; recovered: string; owner: string }
  | { ok: false; status: number; error: string };

/**
 * Shared gate: validate freshness, recover the signer of `message`, and require
 * it to equal the registry's on-chain owner. Callers build their own canonical
 * message (formats differ per endpoint) and pass it in — this centralizes the
 * freshness window, on-chain owner check, and the HTTP status/error mapping.
 */
export async function verifyFreshOwnerSignature(params: {
  message: string;
  signature: unknown;
  signatureTimestamp: unknown;
  chainId: number;
  registryAddress: string;
}): Promise<OwnerCheck> {
  const { message, signature, signatureTimestamp, chainId, registryAddress } = params;

  if (typeof signature !== "string" || signature.length === 0) {
    return { ok: false, status: 401, error: "Missing signature" };
  }
  if (typeof signatureTimestamp !== "number" || !Number.isSafeInteger(signatureTimestamp)) {
    return { ok: false, status: 400, error: "Invalid signatureTimestamp: must be an integer" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - signatureTimestamp) > FRESH_WINDOW_S) {
    return { ok: false, status: 401, error: "Signature expired (>10 min)" };
  }

  let recovered: string;
  try {
    recovered = verifyMessage(message, signature).toLowerCase();
  } catch {
    return { ok: false, status: 400, error: "Invalid signature" };
  }

  const owner = await getRegistryOwner(chainId, registryAddress);
  if (!owner) {
    return { ok: false, status: 503, error: "Unable to verify registry owner on-chain" };
  }
  if (recovered !== owner) {
    return { ok: false, status: 403, error: "Signer is not the registry owner" };
  }
  return { ok: true, recovered, owner };
}

/**
 * Authorize a CMS write against `registryAddress`. Returns `{ ok: true }` only
 * when the signature is fresh and its signer is the on-chain registry owner.
 */
export async function authorizeRegistryOwner(registryAddress: string, req: SignedRequest): Promise<AuthResult> {
  // Fast-fail on a missing signature first, so an unsigned request gets a
  // clear 401 regardless of its other fields.
  if (typeof req.signature !== "string" || req.signature.length === 0) {
    return { ok: false, status: 401, error: "Missing signature" };
  }
  const chainId = typeof req.chainId === "number" ? req.chainId : Number(req.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return { ok: false, status: 400, error: "Invalid chainId" };
  }
  const message = buildAuthMessage({
    chainId,
    registryAddress,
    operation: req.operation,
    target: req.target,
    signatureTimestamp: req.signatureTimestamp as number,
  });
  const check = await verifyFreshOwnerSignature({
    message,
    signature: req.signature,
    signatureTimestamp: req.signatureTimestamp,
    chainId,
    registryAddress,
  });
  if (!check.ok) return check;
  return { ok: true, owner: check.owner, chainId };
}
