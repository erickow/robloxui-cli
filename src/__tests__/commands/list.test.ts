/**
 * Unit tests for the `RobloxUI list` / `RobloxUI search` commands.
 *
 * Validates:
 *   - successful list returns exit code 0
 *   - empty results returns exit code 0
 *   - search query + filters are forwarded to the API URL
 *   - network failure and API errors return exit code 1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runListCommand } from "../../commands/list";

describe("list / search command", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns exit code 0 and renders results on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        components: [
          {
            slug: "primary-button",
            name: "PrimaryButton",
            description: "A primary button",
            framework: "both",
            category: "Buttons",
            is_pro: false,
          },
          {
            slug: "card",
            name: "Card",
            description: "A card",
            framework: "tsx",
            category: "Layout",
            is_pro: false,
          },
        ],
        total: 2,
        page: 1,
        limit: 30,
      }),
    });

    const exitCode = await runListCommand();

    expect(exitCode).toBe(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns exit code 0 when no components are found", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        components: [],
        total: 0,
        page: 1,
        limit: 30,
      }),
    });

    const exitCode = await runListCommand("nonexistent-query");
    expect(exitCode).toBe(0);
  });

  it("forwards the search query and filters to the API URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        components: [],
        total: 0,
        page: 1,
        limit: 30,
      }),
    });
    global.fetch = mockFetch;

    await runListCommand("dialog", {
      framework: "tsx",
      category: "Overlays",
      limit: 5,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as URL;
    expect(calledUrl.searchParams.get("search")).toBe("dialog");
    expect(calledUrl.searchParams.get("framework")).toBe("tsx");
    expect(calledUrl.searchParams.get("category")).toBe("Overlays");
    expect(calledUrl.searchParams.get("limit")).toBe("5");
  });

  it("returns exit code 1 on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const exitCode = await runListCommand();
    expect(exitCode).toBe(1);
  });

  it("returns exit code 1 when the API responds with an error status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    });

    const exitCode = await runListCommand();
    expect(exitCode).toBe(1);
  });
});
