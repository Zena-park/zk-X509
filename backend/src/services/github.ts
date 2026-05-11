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

// ── GitHub API Client ───────────────────────────────

function createGitHubClient(token: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  async function get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    return await res.json() as T;
  }

  async function getRaw(path: string): Promise<Response> {
    return fetch(`${API_BASE}${path}`, { headers });
  }

  async function post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST", headers: jsonHeaders, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    return await res.json() as T;
  }

  async function patch(path: string, body: unknown): Promise<void> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`);
  }

  /** Non-throwing POST — caller inspects status to distinguish
   *  expected non-2xx responses (e.g. 409 conflict on merge-upstream)
   *  from real errors. */
  async function postRaw(path: string, body: unknown): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      method: "POST", headers: jsonHeaders, body: JSON.stringify(body),
    });
  }

  return { get, getRaw, post, postRaw, patch };
}

type GitHubClient = ReturnType<typeof createGitHubClient>;

// ── Repo-scoped helpers ─────────────────────────────

function repoApi(gh: GitHubClient, owner: string, repo: string) {
  const base = `/repos/${owner}/${repo}`;

  return {
    getRef: async (ref: string): Promise<string> => {
      const data = await gh.get<{ object: { sha: string } }>(`${base}/git/ref/${ref}`);
      if (!data?.object?.sha) throw new Error("Invalid ref response: missing SHA");
      return data.object.sha;
    },

    createRef: async (branch: string, sha: string): Promise<void> => {
      await gh.post(`${base}/git/refs`, { ref: `refs/heads/${branch}`, sha });
    },

    createBlob: async (content: string, encoding: "base64" | "utf-8" = "base64"): Promise<string> => {
      const data = await gh.post<{ sha: string }>(`${base}/git/blobs`, { content, encoding });
      return data.sha;
    },

    getCommitTreeSha: async (commitSha: string): Promise<string> => {
      const data = await gh.get<{ tree: { sha: string } }>(`${base}/git/commits/${commitSha}`);
      if (!data?.tree?.sha) throw new Error("Invalid commit response: missing tree SHA");
      return data.tree.sha;
    },

    createTree: async (
      baseTreeSha: string,
      entries: Array<{ path: string; mode: string; type: string; sha: string | null }>,
    ): Promise<string> => {
      const data = await gh.post<{ sha: string }>(`${base}/git/trees`, {
        base_tree: baseTreeSha, tree: entries,
      });
      return data.sha;
    },

    createCommit: async (message: string, treeSha: string, parentSha: string): Promise<string> => {
      const data = await gh.post<{ sha: string }>(`${base}/git/commits`, {
        message, tree: treeSha, parents: [parentSha],
      });
      return data.sha;
    },

    updateRef: async (branch: string, sha: string): Promise<void> => {
      await gh.patch(`${base}/git/refs/heads/${branch}`, { sha, force: false });
    },

    getFileContent: async (path: string, ref: string): Promise<string | null> => {
      const res = await gh.getRaw(`${base}/contents/${path}?ref=${ref}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GET contents ${path}: ${res.status} ${await res.text()}`);
      const data = await res.json() as { content: string };
      return Buffer.from(data.content, "base64").toString("utf-8");
    },
  };
}

// ── High-level operations ───────────────────────────

async function ensureFork(gh: GitHubClient, user: string): Promise<void> {
  const res = await gh.getRaw(`/repos/${user}/${UPSTREAM_REPO}`);
  if (res.ok) return;
  if (res.status !== 404) {
    throw new Error(`Failed to check fork: ${res.status} ${await res.text()}`);
  }

  await gh.post(`/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`, {});

  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 5000)));
    const check = await gh.getRaw(`/repos/${user}/${UPSTREAM_REPO}`);
    if (check.ok) return;
  }
  throw new Error("Fork creation timed out");
}

/** Sync the user's fork main branch with upstream main via
 *  GitHub's merge-upstream endpoint. Without this, the upstream
 *  HEAD SHA we branch off won't exist in the fork's history yet —
 *  GitHub's `POST /git/refs` then returns 422 "Reference update
 *  failed". 409 = sync conflict (fork main diverged); we surface
 *  that with a clearer error rather than the raw 422 from later.
 *  Any other status is treated as best-effort: fork might still
 *  be in sync, and the subsequent createRef will tell us. */
async function syncForkMain(gh: GitHubClient, user: string): Promise<void> {
  const res = await gh.postRaw(
    `/repos/${user}/${UPSTREAM_REPO}/merge-upstream`,
    { branch: "main" },
  );
  if (res.ok) return;
  if (res.status === 409) {
    throw new Error(
      "Fork's main branch has diverged from upstream — resolve manually on GitHub before retrying.",
    );
  }
  // 422 with `branch is not ahead of upstream` is GitHub's
  // already-synced response; that's the happy path. Other 422s
  // (validation, missing branch, etc.) plus any unexpected
  // status get logged before falling through — createRef will
  // re-surface anything truly broken with full context.
  const body = await res.text().catch(() => "");
  if (res.status === 422 && body.includes("not ahead of upstream")) {
    return;
  }
  console.warn(
    `[github] merge-upstream returned ${res.status} for ${user}/${UPSTREAM_REPO}: ${body}`,
  );
}

// ── Main export ─────────────────────────────────────

export async function createCaRegistryPr(
  files: CaRegistryFiles,
  buildTitle: (isNew: boolean) => string,
  buildBody: (isNew: boolean) => string,
): Promise<CaRegistryPrResult> {
  const token = process.env.CA_REGISTRY_GITHUB_TOKEN;
  if (!token) throw new Error("CA_REGISTRY_GITHUB_TOKEN not configured");

  const gh = createGitHubClient(token);
  const { login: user } = await gh.get<{ login: string }>("/user");

  const upstream = repoApi(gh, UPSTREAM_OWNER, UPSTREAM_REPO);
  const fork = repoApi(gh, user, UPSTREAM_REPO);

  // Check upstream service.json + prepare fork in parallel. The
  // fork must exist before we sync its main from upstream, and the
  // sync must complete before reading upstream's HEAD SHA — without
  // the sync the fork's git history can lag the upstream SHA, and
  // `POST /git/refs` later fails with 422 "Reference update failed"
  // because the SHA isn't reachable in the fork.
  const serviceDir = `services/${files.chainId}/${files.registryAddress.toLowerCase()}`;
  const [existingContent] = await Promise.all([
    upstream.getFileContent(`${serviceDir}/service.json`, "main"),
    ensureFork(gh, user),
  ]);
  await syncForkMain(gh, user);
  const mainSha = await upstream.getRef("heads/main");

  const existingService = existingContent ? JSON.parse(existingContent) : null;
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
    fork.createRef(branchName, mainSha),
    fork.getCommitTreeSha(mainSha),
  ]);

  // Build tree entries — all blobs created in a single parallel batch
  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];

  if (files.operation === "remove-ca") {
    for (const hash of Object.keys(files.certs)) {
      treeEntries.push({ path: `${serviceDir}/certs/${hash}.der`, mode: "100644", type: "blob", sha: null });
    }
  }

  const certEntries = files.operation !== "remove-ca" ? Object.entries(files.certs) : [];
  const blobShas = await Promise.all([
    ...certEntries.map(([, b64]) => fork.createBlob(b64, "base64")),
    fork.createBlob(files.serviceJson, "utf-8"),
    fork.createBlob(files.signatureJson, "utf-8"),
  ]);

  certEntries.forEach(([hash], i) => {
    treeEntries.push({ path: `${serviceDir}/certs/${hash}.der`, mode: "100644", type: "blob", sha: blobShas[i] });
  });
  treeEntries.push(
    { path: `${serviceDir}/service.json`, mode: "100644", type: "blob", sha: blobShas[certEntries.length] },
    { path: `${serviceDir}/signature.json`, mode: "100644", type: "blob", sha: blobShas[certEntries.length + 1] },
  );

  // Create tree → commit → update ref
  const newTreeSha = await fork.createTree(baseTreeSha, treeEntries);

  const caNames = Object.keys(files.certs).map((h) => h.slice(0, 12)).join(", ");
  const commitMessage = files.operation === "remove-ca"
    ? `Remove CA certs: ${caNames}`
    : `Add/update CA certs + service metadata`;

  const commitSha = await fork.createCommit(commitMessage, newTreeSha, mainSha);
  await fork.updateRef(branchName, commitSha);

  // Create PR
  const title = buildTitle(isNew);
  const body = buildBody(isNew);
  const pr = await gh.post<{ html_url: string; number: number }>(
    `/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/pulls`,
    { title, body, head: `${user}:${branchName}`, base: "main" },
  );
  if (!pr?.html_url || !pr?.number) throw new Error("Invalid PR response");
  return { prUrl: pr.html_url, prNumber: pr.number, isNew };
}
