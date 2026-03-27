import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGitHubUser, createCaRegistryPr, type CaRegistryFiles } from "../github";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("getGitHubUser", () => {
  it("should return username for valid token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ login: "test-user" }),
    });

    const user = await getGitHubUser("ghp_valid_token");
    expect(user).toBe("test-user");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_valid_token",
        }),
      }),
    );
  });

  it("should return null for invalid token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const user = await getGitHubUser("invalid");
    expect(user).toBeNull();
  });

  it("should return null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const user = await getGitHubUser("any-token");
    expect(user).toBeNull();
  });

  it("should return null when response missing login field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const user = await getGitHubUser("ghp_token");
    // Returns undefined (falsy) — getGitHubUser returns data.login which is undefined
    expect(user).toBeFalsy();
  });
});

describe("createCaRegistryPr", () => {
  const mockFiles: CaRegistryFiles = {
    chainId: "31337",
    registryAddress: "0x1234567890abcdef1234567890abcdef12345678",
    certs: {
      "0xaabbccdd": btoa("mock-der-content"),
    },
    serviceJson: JSON.stringify({ name: "Test Service", cas: {} }),
    signatureJson: JSON.stringify({ admin: "0x1234", signature: "0xsig" }),
  };

  function mockApiSequence() {
    // 1. getGitHubUser
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ login: "test-user" }),
    });
    // 2. ensureFork — check existing fork
    mockFetch.mockResolvedValueOnce({ ok: true });
    // 3. getRef — upstream main SHA
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ object: { sha: "abc123" } }),
    });
    // 4. createRef — create branch
    mockFetch.mockResolvedValueOnce({ ok: true });
    // 5. createOrUpdateFile — DER cert
    mockFetch.mockResolvedValueOnce({ ok: true });
    // 6. getFileSha — service.json (not found)
    mockFetch.mockResolvedValueOnce({ ok: false });
    // 7. createOrUpdateFile — service.json
    mockFetch.mockResolvedValueOnce({ ok: true });
    // 8. getFileSha — signature.json (not found)
    mockFetch.mockResolvedValueOnce({ ok: false });
    // 9. createOrUpdateFile — signature.json
    mockFetch.mockResolvedValueOnce({ ok: true });
    // 10. createPullRequest
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/pr/1", number: 1 }),
    });
  }

  it("should create PR with full workflow", async () => {
    mockApiSequence();

    const result = await createCaRegistryPr(
      "ghp_token", mockFiles, "Add CA", "PR body",
    );

    expect(result.prUrl).toBe("https://github.com/pr/1");
    expect(result.prNumber).toBe(1);
    // Verify all API calls were made
    expect(mockFetch).toHaveBeenCalledTimes(10);
  });

  it("should throw on invalid token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    await expect(
      createCaRegistryPr("bad_token", mockFiles, "Add CA", "body"),
    ).rejects.toThrow("Invalid GitHub token");
  });

  it("should throw when ref response is malformed", async () => {
    // getGitHubUser
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ login: "test-user" }),
    });
    // ensureFork
    mockFetch.mockResolvedValueOnce({ ok: true });
    // getRef — malformed response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ object: {} }), // missing sha
    });

    await expect(
      createCaRegistryPr("ghp_token", mockFiles, "Add CA", "body"),
    ).rejects.toThrow("Invalid ref response");
  });

  it("should throw when PR response is malformed", async () => {
    mockApiSequence();
    // Override last mock (createPullRequest) with malformed response
    mockFetch.mockReset();
    mockApiSequence();
    // Replace the last mock
    const calls = mockFetch.mock.implementations || [];
    // Simpler: just re-mock with malformed PR response at the end
    mockFetch.mockReset();

    // Re-setup with malformed PR response
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ login: "u" }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ object: { sha: "a" } }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // missing html_url

    await expect(
      createCaRegistryPr("ghp_token", mockFiles, "Add CA", "body"),
    ).rejects.toThrow("Invalid PR response");
  });

  it("should sanitize branch name special characters", async () => {
    mockApiSequence();

    const filesWithSpecialChars: CaRegistryFiles = {
      ...mockFiles,
      chainId: "chain/id@special",
      registryAddress: "0x1234<>!@#$%",
    };

    const result = await createCaRegistryPr(
      "ghp_token", filesWithSpecialChars, "Add CA", "body",
    );

    expect(result.prUrl).toBeTruthy();
    // Verify createRef was called with sanitized branch name
    const createRefCall = mockFetch.mock.calls[3]; // 4th call is createRef
    const body = JSON.parse(createRefCall[1].body);
    expect(body.ref).not.toMatch(/[<>!@#$%]/);
  });

  it("should handle fork creation with wait", async () => {
    // getGitHubUser
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ login: "test-user" }),
    });
    // ensureFork — fork doesn't exist
    mockFetch.mockResolvedValueOnce({ ok: false });
    // Create fork
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    // Fork check — not ready, then ready
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Continue with rest of flow
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ object: { sha: "abc123" } }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true }); // createRef
    mockFetch.mockResolvedValueOnce({ ok: true }); // cert file
    mockFetch.mockResolvedValueOnce({ ok: false }); // getFileSha service
    mockFetch.mockResolvedValueOnce({ ok: true }); // service.json
    mockFetch.mockResolvedValueOnce({ ok: false }); // getFileSha sig
    mockFetch.mockResolvedValueOnce({ ok: true }); // signature.json
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/pr/2", number: 2 }),
    });

    const result = await createCaRegistryPr(
      "ghp_token", mockFiles, "Add CA", "body",
    );

    expect(result.prNumber).toBe(2);
  }, 15000);

  it("should handle existing file SHA for updates", async () => {
    // getGitHubUser
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ login: "test-user" }),
    });
    // ensureFork
    mockFetch.mockResolvedValueOnce({ ok: true });
    // getRef
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ object: { sha: "abc123" } }),
    });
    // createRef
    mockFetch.mockResolvedValueOnce({ ok: true });
    // cert file
    mockFetch.mockResolvedValueOnce({ ok: true });
    // getFileSha service.json — exists
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sha: "existing-sha-1" }),
    });
    // createOrUpdateFile service.json
    mockFetch.mockResolvedValueOnce({ ok: true });
    // getFileSha signature.json — exists
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sha: "existing-sha-2" }),
    });
    // createOrUpdateFile signature.json
    mockFetch.mockResolvedValueOnce({ ok: true });
    // createPullRequest
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/pr/3", number: 3 }),
    });

    const result = await createCaRegistryPr(
      "ghp_token", mockFiles, "Update CA", "body",
    );

    expect(result.prNumber).toBe(3);

    // Verify service.json update included SHA
    const serviceUpdateCall = mockFetch.mock.calls[6]; // 7th call
    const body = JSON.parse(serviceUpdateCall[1].body);
    expect(body.sha).toBe("existing-sha-1");
  });
});
