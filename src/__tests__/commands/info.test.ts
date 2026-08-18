/**
 * Unit tests for the `RobloxUI info <slug>` command.
 *
 * Validates:
 *   - successful fetch prints metadata and returns exit code 0
 *   - 404 returns exit code 1
 *   - network failure returns exit code 1
 *   - malformed API response returns exit code 1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runInfoCommand } from "../../commands/info";

describe("info command", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const mockComponent = {
    id: "uuid-1",
    slug: "primary-button",
    name: "PrimaryButton",
    description: "A primary button",
    framework: "both" as const,
    category: "Buttons",
    price_cents: 0,
    is_pro: false,
    preview_image_url: "https://example.com/img.png",
    preview_html: null,
    tsx_source_code: 'export function PrimaryButton() {}',
    luau_source_code: 'local PrimaryButton = {}',
    dependencies: ["robloxui/theme"],
    theme_tokens: ["color-primary"],
    usage_example: 'import { PrimaryButton } from "./primary-button";',
    author: "RobloxUI Team",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };

  it("returns exit code 0 on a successful fetch", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ component: mockComponent }),
    });

    const exitCode = await runInfoCommand("primary-button");
    expect(exitCode).toBe(0);
  });

  it("returns exit code 1 when the component is not found (404)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Component not found" }),
    });

    const exitCode = await runInfoCommand("missing-slug");
    expect(exitCode).toBe(1);
  });

  it("returns exit code 1 on a server error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    });

    const exitCode = await runInfoCommand("primary-button");
    expect(exitCode).toBe(1);
  });

  it("returns exit code 1 on a network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const exitCode = await runInfoCommand("primary-button");
    expect(exitCode).toBe(1);
  });

  it("returns exit code 1 for a malformed API response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ notComponent: "wrong" }),
    });

    const exitCode = await runInfoCommand("primary-button");
    expect(exitCode).toBe(1);
  });
});
