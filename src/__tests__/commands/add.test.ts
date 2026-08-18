/**
 * Unit tests for the `RobloxUI add` command.
 *
 * Validates:
 *   v04 — invalid slug prints error and exits with code 1
 *   v05 — network failure exits with code 1 without writing files
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { runAddCommand } from "../../commands/add";

vi.mock("../../installers/npm-theme-installer", () => ({
  installCanonicalNpmTheme: vi.fn().mockReturnValue({
    package: "robloxui/theme",
    manager: "npm",
    version: "0.1.0",
    manifestBefore: null,
    status: "installed",
    manualCommand: "npm install robloxui",
    retryCommand: "npm install robloxui",
    errors: [],
  }),
}));
vi.mock("../../installers/theme-vendor", () => ({
  vendorWallyTheme: vi.fn().mockReturnValue(true),
}));

import { installCanonicalNpmTheme } from "../../installers/npm-theme-installer";
import { vendorWallyTheme } from "../../installers/theme-vendor";

describe("add command", () => {
  let tempDir: string;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-cli-add-test-"));
    // Create a rojo.json so project detection succeeds automatically
    fs.writeFileSync(path.join(tempDir, "rojo.json"), JSON.stringify({
      name: "test",
      tree: {
        StarterPlayer: {
          StarterPlayerScripts: {
            Components: {
              $path: "src/client/components",
            },
          },
        },
      },
    }), "utf-8");
    fs.mkdirSync(path.join(tempDir, "src", "client", "components"), { recursive: true });

    // Save original fetch
    originalFetch = global.fetch;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("v04: invalid slug shows error and exits 1", () => {
    it("returns exit code 1 when API returns 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Component not found" }),
      });

      const exitCode = await runAddCommand("invalid-slug", tempDir, {
        nonInteractive: true,
      });

      expect(exitCode).toBe(1);

      // Verify no files were written to disk
      const componentFiles = fs.readdirSync(path.join(tempDir, "src", "client", "components"));
      expect(componentFiles).toHaveLength(0);
    });

    it("returns exit code 1 when API returns server error (500)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const exitCode = await runAddCommand("existing-slug", tempDir, {
        nonInteractive: true,
      });

      expect(exitCode).toBe(1);
    });

    it("returns exit code 1 for malformed API response", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ notComponent: "wrong" }),
      });

      const exitCode = await runAddCommand("bad-response", tempDir, {
        nonInteractive: true,
      });

      expect(exitCode).toBe(1);
    });
  });

  describe("v05: network error exits with code 1", () => {
    it("returns exit code 1 when fetch throws a network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

      const exitCode = await runAddCommand("any-component", tempDir, {
        nonInteractive: true,
      });

      expect(exitCode).toBe(1);

      // Verify no files were written
      const componentFiles = fs.readdirSync(path.join(tempDir, "src", "client", "components"));
      expect(componentFiles).toHaveLength(0);
    });

    it("returns exit code 1 when fetch times out", async () => {
      global.fetch = vi.fn().mockRejectedValue(
        new DOMException("The operation was aborted", "AbortError")
      );

      const exitCode = await runAddCommand("any-component", tempDir, {
        nonInteractive: true,
      });

      expect(exitCode).toBe(1);
    });
  });

  describe("successful installation", () => {
    it("writes component files and returns exit code 0 on success", async () => {
      const mockComponent = {
        id: "uuid-1",
        slug: "test-button",
        name: "TestButton",
        description: "A test button component",
        framework: "both" as const,
        category: "Buttons",
        price_cents: 0,
        is_pro: false,
        preview_image_url: "https://example.com/img.png",
        preview_html: null,
        tsx_source_code: 'export function TestButton() { return <Frame />; }',
        luau_source_code: 'local function TestButton() return nil end',
        dependencies: ["react"],
        theme_tokens: ["primaryColor"],
        usage_example: 'import { TestButton } from "./test-button";',
        author: "RobloxUI Team",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ component: mockComponent }),
      });

      const exitCode = await runAddCommand("test-button", tempDir, {
        nonInteractive: true,
        force: true,
      });

      expect(exitCode).toBe(0);

      // Theme is optional: non-interactive runs skip it by default.
      expect(installCanonicalNpmTheme).not.toHaveBeenCalled();
      expect(vendorWallyTheme).not.toHaveBeenCalled();

      // Verify files were written
      const files = fs.readdirSync(path.join(tempDir, "src", "client", "components"));
      expect(files).toContain("test-button.tsx");
      expect(files).toContain("test-button.luau");

      // Verify file contents
      const tsxContent = fs.readFileSync(
        path.join(tempDir, "src", "client", "components", "test-button.tsx"),
        "utf-8"
      );
      expect(tsxContent).toContain("TestButton");

      const luauContent = fs.readFileSync(
        path.join(tempDir, "src", "client", "components", "test-button.luau"),
        "utf-8"
      );
      expect(luauContent).toContain("TestButton");
    });

    it("installs the theme when theme: true is requested", async () => {
      const mockComponent = {
        id: "uuid-1",
        slug: "test-button",
        name: "TestButton",
        description: "A test button component",
        framework: "both" as const,
        category: "Buttons",
        price_cents: 0,
        is_pro: false,
        preview_image_url: "https://example.com/img.png",
        preview_html: null,
        tsx_source_code: 'export function TestButton() { return <Frame />; }',
        luau_source_code: 'local function TestButton() return nil end',
        dependencies: ["react"],
        theme_tokens: ["primaryColor"],
        usage_example: 'import { TestButton } from "./test-button";',
        author: "RobloxUI Team",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ component: mockComponent }),
      });

      const exitCode = await runAddCommand("test-button", tempDir, {
        nonInteractive: true,
        force: true,
        theme: true,
      });

      expect(exitCode).toBe(0);

      // Verify the theme installer was invoked
      expect(installCanonicalNpmTheme).toHaveBeenCalledWith(tempDir);
    });

    it("handles tsx-only components correctly", async () => {
      const mockComponent = {
        id: "uuid-2",
        slug: "header",
        name: "Header",
        description: "A header",
        framework: "tsx" as const,
        category: "Layout",
        price_cents: 0,
        is_pro: false,
        preview_image_url: "https://example.com/img.png",
        preview_html: null,
        tsx_source_code: 'export function Header() { return <Frame />; }',
        luau_source_code: null,
        dependencies: [],
        theme_tokens: [],
        usage_example: null,
        author: "RobloxUI Team",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ component: mockComponent }),
      });

      const exitCode = await runAddCommand("header", tempDir, {
        nonInteractive: true,
        force: true,
        theme: true,
      });

      expect(exitCode).toBe(0);

      expect(installCanonicalNpmTheme).toHaveBeenCalledWith(tempDir);

      const files = fs.readdirSync(path.join(tempDir, "src", "client", "components"));
      expect(files).toContain("header.tsx");
      expect(files).not.toContain("header.luau");
    });
  });
});
