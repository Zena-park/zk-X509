/**
 * GitHub API client for creating PRs to zk-x509-ca-registry.
 * Uses platform-owned token from CA_REGISTRY_GITHUB_TOKEN env var.
 * Uses Git Tree API to commit all files in a single commit.
 */

const UPSTREAM_OWNER = "tokamak-network";
const UPSTREAM_REPO = "zk-x509-ca-registry";
const API_BASE = "https://api.github.com";

export interface GitHubPrResult {
  prUrl: string;
  prNumber: number;
}

export interface CaRegistryFiles {
  chainId: string;
  registryAddress: string;
  operation: "add-ca" | "remove-ca" | "update";
  certs: Record<string, string>; // hash -> base64 DER
  serviceJson: string;
  signatureJson: string;
}

export interface CaRegistryPrResult extends GitHubPrResult {
  isNew: boolean;
}

function getToken(): string {
  const token = process.env.CA_REGISTRY_GITHUB_TOKEN;
  if (!token) throw new Error("CA_REGISTRY_GITHUB_TOKEN not configured");
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function jsonHeaders(token: string): Record<string, string> {
  return { ...authHeaders(token), "Content-Type": "application/json" };
}

async function ghGet(token: string, path: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { headers: authHeaders(token) });
}

async function ghPost(token: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
}

async function ghPatch(token: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
}

// ── GitHub API helpers ──────────────────────────────

async function getGitHubUser(token: string): Promise<string> {
  const res = await ghGet(token, "/user");
  if (!res.ok) throw new Error(`GitHub auth failed: ${res.status}`);
  const data = await res.json();
  return data.login;
}

async function ensureFork(token: string, user: string): Promise<void> {
  const res = await ghGet(token, `/repos/${user}/${UPSTREAM_REPO}`);
  if (res.ok) return;

  const forkRes = await ghPost(token, `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, {});
  if (!forkRes.ok) {
    throw new Error(`Failed to fork: ${forkRes.status} ${await forkRes.text()}`);
  }

  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 5000)));
    const check = await ghGet(token, `/repos/${user}/${UPSTREAM_REPO}`);
    if (check.ok) return;
  }
  throw new Error("Fork creation timed out");
}

async function getRef(token: string, owner: string, repo: string, ref: string): Promise<string> {
  const res = await ghGet(token, `/repos/${owner}/${repo}/git/ref/${ref}`);
  if (!res.ok) throw new Error(`Failed to get ref: ${res.status}`);
  const data = await res.json();
  if (!data?.object?.sha) throw new Error("Invalid ref response: missing SHA");
  return data.object.sha;
}

async function createRef(token: string, owner: string, repo: string, branch: string, sha: string): Promise<void> {
  const res = await ghPost(token, `/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`, sha,
  });
  if (!res.ok) throw new Error(`Failed to create branch: ${res.status} ${await res.text()}`);
}

/** Create a blob and return its SHA */
async function createBlob(token: string, owner: string, repo: string, content: string, encoding: "base64" | "utf-8" = "base64"): Promise<string> {
  const res = await ghPost(token, `/repos/${owner}/${repo}/git/blobs`, { content, encoding });
  if (!res.ok) throw new Error(`Failed to create blob: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.sha;
}

/** Get the tree SHA for a commit */
async function getCommitTreeSha(token: string, owner: string, repo: string, commitSha: string): Promise<string> {
  const res = await ghGet(token, `/repos/${owner}/${repo}/git/commits/${commitSha}`);
  if (!res.ok) throw new Error(`Failed to get commit: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data?.tree?.sha) throw new Error("Invalid commit response: missing tree SHA");
  return data.tree.sha;
}

/** Create a tree with entries on top of a base tree */
async function createTree(
  token: string, owner: string, repo: string,
  baseTreeSha: string,
  entries: Array<{ path: string; mode: string; type: string; sha: string | null }>,
): Promise<string> {
  const res = await ghPost(token, `/repos/${owner}/${repo}/git/trees`, {
    base_tree: baseTreeSha,
    tree: entries,
  });
  if (!res.ok) throw new Error(`Failed to create tree: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.sha;
}

/** Create a commit */
async function createCommit(
  token: string, owner: string, repo: string,
  message: string, treeSha: string, parentSha: string,
): Promise<string> {
  const res = await ghPost(token, `/repos/${owner}/${repo}/git/commits`, {
    message, tree: treeSha, parents: [parentSha],
  });
  if (!res.ok) throw new Error(`Failed to create commit: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.sha;
}

/** Update a branch ref to point to a new commit */
async function updateRef(token: string, owner: string, repo: string, branch: string, sha: string): Promise<void> {
  const res = await ghPatch(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    sha, force: false,
  });
  if (!res.ok) throw new Error(`Failed to update ref: ${res.status} ${await res.text()}`);
}

async function createPullRequest(
  token: string, user: string, branch: string, title: string, body: string,
): Promise<GitHubPrResult> {
  const res = await ghPost(token, `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`, {
    title, body, head: `${user}:${branch}`, base: "main",
  });
  if (!res.ok) throw new Error(`Failed to create PR: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data?.html_url || !data?.number) throw new Error("Invalid PR response");
  return { prUrl: data.html_url, prNumber: data.number };
}

/** Fetch existing service.json from upstream main */
async function getExistingServiceJson(
  token: string, chainId: string, registryAddress: string,
): Promise<Record<string, unknown> | null> {
  const path = `services/${chainId}/${registryAddress.toLowerCase()}/service.json`;
  const res = await ghGet(token, `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/contents/${path}?ref=main`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to check upstream service.json: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return JSON.parse(content);
}

// ── Main export ─────────────────────────────────────

export async function createCaRegistryPr(
  files: CaRegistryFiles,
  buildTitle: (isNew: boolean) => string,
  buildBody: (isNew: boolean) => string,
): Promise<CaRegistryPrResult> {
  const token = getToken();
  const user = await getGitHubUser(token);

  // Check upstream, prepare fork, and get main ref — all in parallel
  const [existingService, , mainSha] = await Promise.all([
    getExistingServiceJson(token, files.chainId, files.registryAddress),
    ensureFork(token, user),
    getRef(token, UPSTREAM_OWNER, UPSTREAM_REPO, "heads/main"),
  ]);
  const isNew = existingService === null;

  // Preserve created_at from existing service.json on updates
  if (!isNew && existingService?.created_at) {
    const serviceObj = JSON.parse(files.serviceJson);
    serviceObj.created_at = existingService.created_at;
    files.serviceJson = JSON.stringify(serviceObj, null, 2);
  }

  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_.]/g, "-");
  const branchName = `ca-update/${sanitize(files.chainId)}/${sanitize(files.registryAddress.slice(0, 10))}/${Date.now()}`;

  // Create branch and get base tree in parallel
  const [, baseTreeSha] = await Promise.all([
    createRef(token, user, UPSTREAM_REPO, branchName, mainSha),
    getCommitTreeSha(token, user, UPSTREAM_REPO, mainSha),
  ]);

  const serviceDir = `services/${files.chainId}/${files.registryAddress.toLowerCase()}`;

  // Build tree entries — all blobs created in a single parallel batch
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];

  if (files.operation === "remove-ca") {
    for (const hash of Object.keys(files.certs)) {
      treeEntries.push({
        path: `${serviceDir}/certs/${hash}.der`,
        mode: "100644",
        type: "blob",
        sha: null,
      });
    }
  }

  // Create all blobs in one Promise.all (certs + service.json + signature.json)
  const certEntries = files.operation !== "remove-ca" ? Object.entries(files.certs) : [];
  const blobPromises = [
    ...certEntries.map(([, base64Der]) => createBlob(token, user, UPSTREAM_REPO, base64Der, "base64")),
    createBlob(token, user, UPSTREAM_REPO, Buffer.from(files.serviceJson).toString("base64"), "base64"),
    createBlob(token, user, UPSTREAM_REPO, Buffer.from(files.signatureJson).toString("base64"), "base64"),
  ];
  const blobShas = await Promise.all(blobPromises);

  // Map blob SHAs to tree entries
  certEntries.forEach(([hash], i) => {
    treeEntries.push({ path: `${serviceDir}/certs/${hash}.der`, mode: "100644", type: "blob", sha: blobShas[i] });
  });
  const serviceJsonSha = blobShas[certEntries.length];
  const signatureJsonSha = blobShas[certEntries.length + 1];

  treeEntries.push(
    { path: `${serviceDir}/service.json`, mode: "100644", type: "blob", sha: serviceJsonSha },
    { path: `${serviceDir}/signature.json`, mode: "100644", type: "blob", sha: signatureJsonSha },
  );

  // Create tree → commit → update ref (3 sequential calls)
  const newTreeSha = await createTree(token, user, UPSTREAM_REPO, baseTreeSha, treeEntries);

  const caNames = Object.keys(files.certs).map((h) => h.slice(0, 12)).join(", ");
  const commitMessage = files.operation === "remove-ca"
    ? `Remove CA certs: ${caNames}`
    : `Add/update CA certs + service metadata`;

  const commitSha = await createCommit(token, user, UPSTREAM_REPO, commitMessage, newTreeSha, mainSha);
  await updateRef(token, user, UPSTREAM_REPO, branchName, commitSha);

  // Create PR
  const title = buildTitle(isNew);
  const body = buildBody(isNew);
  const pr = await createPullRequest(token, user, branchName, title, body);
  return { ...pr, isNew };
}
