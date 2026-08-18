/**
 * Unit tests for npm theme installer.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  installNpmDependencies,
  installNpmTheme,
} from "../../installers/npm-installer";
import * as child_process from "child_process";
import { NPM_THEME_PACKAGE, NPM_THEME_VERSION } from "../../constants/theme";

vi.mock("child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("../../installers/theme-vendor", () => ({
  vendorNpmTheme: vi.fn(),
}));

import { vendorNpmTheme } from "../../installers/theme-vendor";

describe("npm-installer", () => {
  beforeEach(() => {
    vi.mocked(vendorNpmTheme).mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("npm install failure", () => {
    it("returns false when npm and bundled fallback both fail", () => {
      const mockSpawnSync = vi.mocked(child_process.spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 1,
        error: undefined,
        stdout: Buffer.from(""),
        stderr: Buffer.from("npm ERR! 404"),
        signal: null,
        pid: 12345,
        output: [],
      } as unknown as ReturnType<typeof child_process.spawnSync>);

      vi.mocked(vendorNpmTheme).mockReturnValue(false);

      const result = installNpmTheme("/fake/project");

      expect(result).toBe(false);
      expect(vendorNpmTheme).toHaveBeenCalledWith("/fake/project");
    });

    it("returns true when bundled fallback succeeds after npm failure", () => {
      const mockSpawnSync = vi.mocked(child_process.spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 1,
        error: undefined,
        stdout: Buffer.from(""),
        stderr: Buffer.from("npm ERR! 404"),
        signal: null,
        pid: 12345,
        output: [],
      } as unknown as ReturnType<typeof child_process.spawnSync>);

      vi.mocked(vendorNpmTheme).mockReturnValue(true);

      const result = installNpmTheme("/fake/project");

      expect(result).toBe(true);
    });

    it("does not throw on failure", () => {
      const mockSpawnSync = vi.mocked(child_process.spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 1,
        error: undefined,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
        signal: null,
        pid: 12345,
        output: [],
      } as unknown as ReturnType<typeof child_process.spawnSync>);

      expect(() => installNpmTheme("/fake/project")).not.toThrow();
    });
  });

  describe("successful install", () => {
    it("returns true when npm install succeeds", () => {
      const mockSpawnSync = vi.mocked(child_process.spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from("added 1 package"),
        stderr: Buffer.from(""),
        signal: null,
        pid: 12345,
        output: [],
      } as unknown as ReturnType<typeof child_process.spawnSync>);

      const result = installNpmTheme("/fake/project");

      expect(result).toBe(true);
      expect(vendorNpmTheme).not.toHaveBeenCalled();
    });
  });

  it("installs project dependencies without an unavailable theme package", () => {
    const mockSpawnSync = vi.mocked(child_process.spawnSync);
    mockSpawnSync
      .mockReturnValueOnce({
        status: 1,
        error: undefined,
        stdout: Buffer.from(""),
        stderr: Buffer.from("npm ERR! 404"),
      } as unknown as ReturnType<typeof child_process.spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        error: undefined,
        stdout: Buffer.from("added dependencies"),
        stderr: Buffer.from(""),
      } as unknown as ReturnType<typeof child_process.spawnSync>);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-npm-test-"));
    const manifest = {
      name: "test-project",
      dependencies: { [NPM_THEME_PACKAGE]: `^${NPM_THEME_VERSION}`, "roblox-ts": "^3.0.0" },
    };
    const manifestPath = path.join(tempDir, "package.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

    try {
      expect(installNpmDependencies(tempDir)).toBe(true);
      expect(JSON.parse(fs.readFileSync(manifestPath, "utf-8"))).toEqual(manifest);
      expect(mockSpawnSync).toHaveBeenCalledTimes(2);
      expect(mockSpawnSync.mock.calls[1]?.[1]).toEqual(["install"]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
