import { Router } from "express";
import { createCaRegistryPr, type CaRegistryFiles } from "../services/github";

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
    signature, signatureTimestamp, signatureMessage,
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
    signatureMessage: string;
  };

  // Validate required fields
  if (!chainId || !registryAddress || !adminAddress || !operation || !signature || !signatureTimestamp || !signatureMessage) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  if (!process.env.CA_REGISTRY_GITHUB_TOKEN) {
    res.status(503).json({ error: "GitHub integration not configured on server" });
    return;
  }

  try {
    // Build merged CAs — keys must be lowercase hex
    const allCas: Record<string, CaGuide> = {};
    for (const [k, v] of Object.entries(existingCas)) {
      allCas[k.toLowerCase()] = v;
    }
    if (operation === "add-ca" || operation === "update") {
      for (const cert of certs) {
        allCas[cert.hashHex.toLowerCase()] = cert.guide;
      }
    } else if (operation === "remove-ca") {
      for (const cert of certs) {
        delete allCas[cert.hashHex.toLowerCase()];
      }
    }

    // Determine if this is a first-time registration
    const isNew = Object.keys(existingCas).length === 0;

    // Build service.json (matches service.schema.json)
    const today = new Date().toISOString().split("T")[0];
    const serviceObj: Record<string, unknown> = {
      name: serviceName || "Unnamed Service",
      description: serviceName || `Service for ${registryAddress.toLowerCase()}`,
      admin: adminAddress.toLowerCase(),
      created_at: today,
      updated_at: today,
      cas: allCas,
    };
    // On updates, created_at is immutable — omit so we don't overwrite
    // But for the file content we must include it; the existing value is preserved
    // by the Git commit (we only update changed fields)
    const serviceJson = JSON.stringify(serviceObj, null, 2);

    // Build signature.json (format required by validate.py)
    const signedAt = new Date(signatureTimestamp * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
    const signatureJson = JSON.stringify({
      message: signatureMessage,
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

    // PR title: [Operation] chainId 0xAddress - serviceName
    const opTag = isNew ? "Register"
      : operation === "add-ca" ? "AddCA"
      : operation === "remove-ca" ? "RemoveCA"
      : "Update";
    const prTitle = `[${opTag}] ${chainId} ${registryAddress.toLowerCase()} - ${serviceName || "Unnamed Service"}`;

    const caNames = certs.map((c) => c.guide?.name || c.hashHex.slice(0, 16)).join(", ");
    const prBody = [
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

    const result = await createCaRegistryPr(files, prTitle, prBody);
    res.json(result);
  } catch (e: unknown) {
    console.error("Failed to create CA registry PR:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
