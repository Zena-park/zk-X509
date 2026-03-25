/// Platform backend API client for off-chain registry metadata.

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export interface RegistryMetadata {
  description: string;
  logoUrl: string;
  category: "dao" | "defi" | "corporate" | "other";
  website: string;
  tags: string[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface CaGuide {
  name: string;
  description: string;
  issueUrl: string;
  instructions: string;
}

// ── Registry Metadata ────────────────────────────

export async function getRegistryMetadata(address: string): Promise<RegistryMetadata | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/registries/${address}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function updateRegistryMetadata(
  address: string,
  data: Partial<RegistryMetadata>,
): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/registries/${address}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Announcements ────────────────────────────────

export async function getAnnouncements(address: string): Promise<Announcement[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/registries/${address}/announcements`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function postAnnouncement(
  address: string,
  title: string,
  body: string,
): Promise<Announcement | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/registries/${address}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteAnnouncement(address: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/registries/${address}/announcements/${id}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── CA Guides ────────────────────────────────────

export async function getCaGuides(address: string): Promise<Record<string, CaGuide>> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/registries/${address}/ca-guides`);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

export async function updateCaGuide(
  address: string,
  caHash: string,
  guide: CaGuide,
): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/registries/${address}/ca-guides/${caHash}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guide),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteCaGuide(address: string, caHash: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/registries/${address}/ca-guides/${caHash}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}
