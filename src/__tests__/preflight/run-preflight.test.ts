/**
 * Validates for F04 — Cross-platform preflight and flavor selection.
 *
 *   f04-v01 — "failed prerequisite is actionable": exit nonzero, no mutation.
 *   f04-v02 — "handles spaces and Unicode on each platform": argv and paths
 *             remain intact and Node range matches package metadata.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as cliPackageJson from "../../../package.json";

import {
  runPreflight,
  PREFLIGHT_FAILURE_ID,
  PREFLIGHT_SUMMARY_ID,
} from "../../preflight/run-preflight";
import {
  buildCommand,
  normalizeTarget,
  SUPPORTED_NODE_RANGE,
} from "../../preflight/platform";
import { detectProjectProfile } from "../../detectors/detect-project";

function write(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

const passAdapters = {
  detectProfile: () =>
    detectProjectProfile(process.cwd()),
  isToolAvailable: () => true,
  hasNetwork: () => true,
  hasAuth: () => true,
};

describe("preflight pipeline", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-preflight-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("failed prerequisite is actionable", () => {
    // Insufficient CI input: non-interactive without --yes (approval).
    const result = runPreflight({
      slug: "button",
      cwd: tempDir,
      nonInteractive: true,
      approval: false,
      explicitFlavor: "roblox-ts",
      adapters: { ...passAdapters, platform: "linux" },
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.mutationAllowed).toBe(false);
    expect(result.failureId).toBe(PREFLIGHT_FAILURE_ID);
    const ci = result.failures.find((c) => c.id === "ci-input");
    expect(ci).toBeTruthy();
    expect(ci?.remediation).toContain("--yes");
    // The only failure is the CI-approval gate (every other prerequisite passes).
    expect(result.failures).toHaveLength(1);

    // Preflight must not have created or modified any project files.
    expect(fs.readdirSync(tempDir)).toHaveLength(0);
  });

  it("blocks a bad slug before mutation", () => {
    const result = runPreflight({
      slug: "Bad Slug!",
      cwd: tempDir,
      nonInteractive: true,
      approval: true,
      explicitFlavor: "roblox-ts",
      adapters: { ...passAdapters, platform: "darwin" },
    });
    expect(result.ok).toBe(false);
    expect(result.failures.some((c) => c.id === "slug")).toBe(true);
    expect(result.mutationAllowed).toBe(false);
  });

  it("passes when every prerequisite is satisfied", () => {
    write(tempDir, "rojo.json", JSON.stringify({ tree: {} }));
    const result = runPreflight({
      slug: "primary-button",
      cwd: tempDir,
      nonInteractive: true,
      approval: true,
      explicitFlavor: "roblox-ts",
      adapters: { ...passAdapters, platform: "win32" },
    });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.mutationAllowed).toBe(true);
    expect(result.summaryId).toBe(PREFLIGHT_SUMMARY_ID);
    expect(result.flavor).toBe("roblox-ts");
  });

  it("handles spaces and Unicode on each platform", () => {
    const tricky = path.join(
      "my ünïcödé dir",
      "components",
      "primary button"
    );

    for (const platform of ["win32", "darwin", "linux"] as const) {
      const cmd = buildCommand("rojo", ["serve", tricky], platform);
      // argv stays intact: no shell splitting on spaces / Unicode.
      expect(cmd.args).toEqual(["serve", tricky]);
      expect(cmd.useShell).toBe(false); // real binaries never shell out
      const arg = cmd.args.find((a) => a.includes("ünïcödé"));
      expect(arg).toBe(tricky);
    }

    // Normalized targets preserve meaning per platform.
    expect(normalizeTarget("a/b/c", "win32")).toContain("\\");
    expect(normalizeTarget("a\\b\\c", "linux")).toContain("/");

    // Supported Node range matches the CLI package metadata (AC-17).
    const engines = (cliPackageJson as { engines?: { node?: string } }).engines;
    expect(engines?.node).toBe(SUPPORTED_NODE_RANGE);
     expect(SUPPORTED_NODE_RANGE).toBe(">=20.12");
  });
});
