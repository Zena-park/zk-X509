import { Router } from "express";
import { createCaRegistryPr, type CaRegistryFiles } from "../services/github";
import { verifyFreshOwnerSignature } from "../util/registryAuth";

interface CaGuide {
  name: string;
  description?: string;
  issue_url?: string;
  instructions?: string;
}

const router = Router();

// POST /api/ca-registry/pr
router.post("/pr", async (req, res) => {
  const {
    chainId, registryAddress, adminAddress, serviceName,
    operation, certs, existingCas,
    signature, signatureTimestamp,
  } = req.body as {
    chainId: string;
    registryAddress: string;
    adminAddress: string;
    serviceName: string;
    operation: "add-ca" | "remove-ca" | "update";
    certs: Array<{ hashHex: string; derBase64: string; guide: CaGuide }>;
    existingCas: Record<string, CaGuide>;
    signature: string;
    signatureTimestamp: number;
  };

  // Validate required fields
  if (!chainId || !registryAddress || !adminAddress || !operation || !signature || !signatureTimestamp) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Validate input formats to prevent path traversal + ensure a usable chain
  // id (reject "0" and unsafe-large integers up front, not as a later 503).
  const chainIdNum = Number(chainId);
  if (!/^\d+$/.test(chainId) || !Number.isSafeInteger(chainIdNum) || chainIdNum <= 0) {
    res.status(400).json({ error: "Invalid chainId: must be a positive integer" });
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(registryAddress)) {
    res.status(400).json({ error: "Invalid registryAddress" });
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(adminAddress)) {
    res.status(400).json({ error: "Invalid adminAddress" });
    return;
  }
  if (!["add-ca", "remove-ca", "update"].includes(operation)) {
    res.status(400).json({ error: "Invalid operation" });
    return;
  }
  for (const cert of (certs || [])) {
    if (!/^0x[0-9a-f]{64}$/.test(cert.hashHex)) {
      res.status(400).json({ error: `Invalid cert hash: ${cert.hashHex}` });
      return;
    }
  }

  // Reconstruct the expected message from request parameters — prevents
  // parameter tampering. The signer must be fresh AND the registry's on-chain
  // owner (authorization, not just authentication): without the owner check
  // anyone could pass an adminAddress they control and self-authorize.
  const expectedMessage = [
    "zk-x509-ca-registry",
    `Chain ID: ${chainId}`,
    `Registry: ${registryAddress.toLowerCase()}`,
    `Admin: ${adminAddress.toLowerCase()}`,
    `Operation: ${operation}`,
    `Timestamp: ${signatureTimestamp}`,
  ].join("\n");

  const check = await verifyFreshOwnerSignature({
    message: expectedMessage,
    signature,
    signatureTimestamp,
    chainId: chainIdNum,
    registryAddress,
  });
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }
  // Belt-and-suspenders: adminAddress is bound into the signed message; this
  // yields a clearer error if a client ever sends a mismatched adminAddress.
  if (check.recovered !== adminAddress.toLowerCase()) {
    res.status(403).json({ error: "Signature does not match adminAddress" });
    return;
  }

  if (!process.env.CA_REGISTRY_GITHUB_TOKEN) {
    res.status(503).json({ error: "GitHub integration not configured on server" });
    return;
  }

  try {
    // Build merged CAs — keys must be lowercase hex, name + description only
    const allCas: Record<string, { name: string; description?: string }> = {};
    for (const [k, v] of Object.entries(existingCas)) {
      allCas[k.toLowerCase()] = { name: v.name, ...(v.description ? { description: v.description } : {}) };
    }
    if (operation === "add-ca" || operation === "update") {
      for (const cert of certs) {
        allCas[cert.hashHex.toLowerCase()] = {
          name: cert.guide?.name || "Unknown CA",
          ...(cert.guide?.description ? { description: cert.guide.description } : {}),
        };
      }
    } else if (operation === "remove-ca") {
      for (const cert of certs) {
        delete allCas[cert.hashHex.toLowerCase()];
      }
    }

    // Build service.json (matches service.schema.json)
    // Note: created_at is preserved from existing service.json by createCaRegistryPr
    const today = new Date().toISOString().split("T")[0];
    const serviceObj: Record<string, unknown> = {
      name: serviceName || "Unnamed Service",
      description: serviceName || `Service for ${registryAddress.toLowerCase()}`,
      admin: adminAddress.toLowerCase(),
      created_at: today,
      updated_at: today,
      cas: allCas,
    };
    const serviceJson = JSON.stringify(serviceObj, null, 2);

    // Build signature.json (format required by validate.py)
    const signedAt = new Date(signatureTimestamp * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
    const signatureJson = JSON.stringify({
      message: expectedMessage,
      signature,
      address: adminAddress.toLowerCase(),
      operation,
      timestamp: signatureTimestamp,
      signed_at: signedAt,
    }, null, 2);

    // Build cert map — keys lowercase
    const certMap: Record<string, string> = {};
    for (const cert of certs) {
      if (cert.derBase64) {
        certMap[cert.hashHex.toLowerCase()] = cert.derBase64;
      }
    }

    const files: CaRegistryFiles = {
      chainId,
      registryAddress: registryAddress.toLowerCase(),
      operation,
      certs: certMap,
      serviceJson,
      signatureJson,
    };

    // PR title/body builders — isNew is determined inside createCaRegistryPr
    const buildOpTag = (isNew: boolean) =>
      isNew ? "Register"
      : operation === "add-ca" ? "AddCA"
      : operation === "remove-ca" ? "RemoveCA"
      : "Update";

    const buildTitle = (isNew: boolean) =>
      `[${buildOpTag(isNew)}] ${chainId} ${registryAddress.toLowerCase()} - ${serviceName || "Unnamed Service"}`;

    const buildBody = (isNew: boolean) => {
      const opTag = buildOpTag(isNew);
      return [
        `## ${opTag === "Register" ? "Register Service" : opTag === "AddCA" ? "Add CA" : opTag === "RemoveCA" ? "Remove CA" : "Update"} CA`,
        "",
        `- **Service**: \`${registryAddress.toLowerCase()}\``,
        `- **Chain ID**: ${chainId}`,
        `- **Admin**: \`${adminAddress.toLowerCase()}\``,
        "",
        "### CA Certificates",
        ...certs.map((c) => `- \`${c.hashHex.toLowerCase().slice(0, 20)}...\` — ${c.guide?.name || "Unknown"}`),
        "",
        `Signed by admin at ${signedAt}.`,
      ].join("\n");
    };

    const result = await createCaRegistryPr(files, buildTitle, buildBody);
    res.json(result);
  } catch (e: unknown) {
    console.error("Failed to create CA registry PR:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
