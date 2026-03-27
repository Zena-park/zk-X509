/**
 * GitHub API client for creating PRs to zk-x509-ca-registry.
 *
 * Workflow: fork → branch → commit files → create PR.
 * Admin provides a GitHub Personal Access Token (PAT) with `public_repo` scope.
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
  /** DER files to add: hash → base64-encoded DER bytes */
  certs: Record<string, string>;
  /** Updated service.json content */
  serviceJson: string;
  /** Signature JSON content */
  signatureJson: string;
}

/** Check if token is valid and get username. */
export async function getGitHubUser(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/user`, {
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.login;
  } catch {
    return null;
  }
}

/**
 * Create a PR to add/update/remove CA in the ca-registry.
 *
 * Steps:
 * 1. Ensure fork exists
 * 2. Create branch from upstream main
 * 3. Commit files to branch
 * 4. Create PR from fork to upstream
 */
export async function createCaRegistryPr(
  token: string,
  files: CaRegistryFiles,
  title: string,
  body: string,
): Promise<GitHubPrResult> {
  const user = await getGitHubUser(token);
  if (!user) throw new Error("Invalid GitHub token");

  // 1. Ensure fork
  await ensureFork(token, user);

  // 2. Get upstream main SHA
  const mainSha = await getRef(token, UPSTREAM_OWNER, UPSTREAM_REPO, "heads/main");

  // 3. Create branch in fork
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9-_.]/g, "-");
  const branchName = `ca-update/${sanitize(files.chainId)}/${sanitize(files.registryAddress.slice(0, 10))}/${Date.now()}`;
  await createRef(token, user, UPSTREAM_REPO, branchName, mainSha);

  // 4. Commit files
  const serviceDir = `services/${files.chainId}/${files.registryAddress.toLowerCase()}`;

  // Commit DER files
  for (const [hash, base64Der] of Object.entries(files.certs)) {
    await createOrUpdateFile(
      token, user, UPSTREAM_REPO, branchName,
      `${serviceDir}/certs/${hash}.der`,
      base64Der,
      `Add CA cert: ${hash.slice(0, 16)}...`,
    );
  }

  // Commit service.json
  const existingSha = await getFileSha(token, user, UPSTREAM_REPO, branchName, `${serviceDir}/service.json`);
  await createOrUpdateFile(
    token, user, UPSTREAM_REPO, branchName,
    `${serviceDir}/service.json`,
    btoa(files.serviceJson),
    "Update service.json with CA guide",
    existingSha,
  );

  // Commit signature.json
  const sigSha = await getFileSha(token, user, UPSTREAM_REPO, branchName, `${serviceDir}/signature.json`);
  await createOrUpdateFile(
    token, user, UPSTREAM_REPO, branchName,
    `${serviceDir}/signature.json`,
    btoa(files.signatureJson),
    "Add admin signature",
    sigSha,
  );

  // 5. Create PR
  const pr = await createPullRequest(
    token, user, branchName, title, body,
  );

  return pr;
}

// ── GitHub API helpers ──────────────────────────────

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ensureFork(token: string, user: string): Promise<void> {
  // Check if fork exists
  const res = await fetch(`${API_BASE}/repos/${user}/${UPSTREAM_REPO}`, {
    headers: authHeaders(token),
  });
  if (res.ok) return; // Fork already exists

  // Create fork
  const forkRes = await fetch(`${API_BASE}/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
  });
  if (!forkRes.ok) {
    throw new Error(`Failed to fork: ${forkRes.status} ${await forkRes.text()}`);
  }

  // Wait for fork to be ready with exponential backoff
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 5000)));
    const check = await fetch(`${API_BASE}/repos/${user}/${UPSTREAM_REPO}`, {
      headers: authHeaders(token),
    });
    if (check.ok) return;
  }
  throw new Error("Fork creation timed out");
}

async function getRef(token: string, owner: string, repo: string, ref: string): Promise<string> {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/ref/${ref}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to get ref: ${res.status}`);
  const data = await res.json();
  if (!data?.object?.sha) throw new Error("Invalid ref response: missing SHA");
  return data.object.sha;
}

async function createRef(token: string, owner: string, repo: string, branch: string, sha: string): Promise<void> {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
  if (!res.ok) throw new Error(`Failed to create branch: ${res.status} ${await res.text()}`);
}

async function getFileSha(
  token: string, owner: string, repo: string, branch: string, path: string,
): Promise<string | undefined> {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return undefined;
  const data = await res.json();
  return data.sha;
}

async function createOrUpdateFile(
  token: string, owner: string, repo: string, branch: string,
  path: string, contentBase64: string, message: string, sha?: string,
): Promise<void> {
  const body: Record<string, unknown> = {
    message,
    content: contentBase64,
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to commit ${path}: ${res.status} ${await res.text()}`);
}

async function createPullRequest(
  token: string, user: string, branch: string, title: string, body: string,
): Promise<GitHubPrResult> {
  const res = await fetch(`${API_BASE}/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      body,
      head: `${user}:${branch}`,
      base: "main",
    }),
  });
  if (!res.ok) throw new Error(`Failed to create PR: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data?.html_url || !data?.number) throw new Error("Invalid PR response");
  return { prUrl: data.html_url, prNumber: data.number };
}
