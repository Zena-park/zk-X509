import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGitHubUser } from "../github";

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
});
