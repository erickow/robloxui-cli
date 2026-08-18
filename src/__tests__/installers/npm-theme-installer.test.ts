/**
 * Validates for F05 — Reliable npm robloxui/theme installation.
 *
 *   f05-v01 — "installs robloxui/theme and reports version": manifest,
 *             lockfile, exports, and reported version are valid.
 *   f05-v02 — "invalid registry entry is actionable": no component success;
 *             exact manual npm + retry commands are printed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  installCanonicalNpmTheme,
  CANONICAL_THEME_PACKAGE,
  THEME_FAILURE_ID,
  type NpmRunner,
} from "../../installers/npm-theme-installer";
import { NPM_THEME_PACKAGE, NPM_THEME_VERSION } from "../../constants/theme";

function write(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

function fakeThemePackage(): string {
  return JSON.stringify(
    {
      name: NPM_THEME_PACKAGE,
      version: NPM_THEME_VERSION,
      main: "./theme/src/index.ts",
      types: "./theme/src/index.ts",
      exports: { "./theme": "./theme/src/index.ts" },
    },
    null,
    2
  );
}

describe("npm canonical theme installer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-npm-theme-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("installs robloxui/theme and reports version", () => {
    // Simulate a project whose manifest already references the theme and a
    // resolved theme package + lockfile (the runner is mocked).
    write(
      tempDir,
      "package.json",
      JSON.stringify(
        { name: "app", dependencies: { [NPM_THEME_PACKAGE]: `^${NPM_THEME_VERSION}` } },
        null,
        2
      )
    );
    write(tempDir, "package-lock.json", JSON.stringify({ lockfileVersion: 3 }));
    write(tempDir, `node_modules/${NPM_THEME_PACKAGE}/package.json`, fakeThemePackage());
    write(tempDir, `node_modules/${NPM_THEME_PACKAGE}/theme/src/index.ts`, "export const theme = {}");
    write(tempDir, `node_modules/${NPM_THEME_PACKAGE}/theme/src/theme.lua`, "local theme = {}");

    const successRunner: NpmRunner = () => ({
      status: 0,
      stdout: "added 1 package",
      stderr: "",
    });

    const result = installCanonicalNpmTheme(tempDir, { runner: successRunner });

    expect(result.status).toBe("installed");
    expect(result.package).toBe(CANONICAL_THEME_PACKAGE); // exact contract
    expect(result.package).toBe("robloxui/theme");
    expect(result.version).toBe(NPM_THEME_VERSION);
    expect(result.manager).toBe("npm");
    expect(result.errors).toEqual([]);
    expect(result.manifestBefore).toContain(NPM_THEME_PACKAGE);
    // Manual + retry commands are exact npm invocations.
    expect(result.manualCommand).toContain("npm install");
    expect(result.retryCommand).toContain("npm install");
  });

  it("invalid registry entry is actionable", () => {
    write(tempDir, "package.json", JSON.stringify({ name: "app" }));

    // Registry failure (EC-09): npm install exits nonzero.
    const failRunner: NpmRunner = () => ({
      status: 1,
      stdout: "",
      stderr: "npm ERR! 404 Not Found",
    });

    const result = installCanonicalNpmTheme(tempDir, { runner: failRunner });

    // No component success.
    expect(result.status).toBe("failed");
    expect(result.version).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    // Exact manual npm + retry commands are surfaced.
    expect(result.manualCommand).toBe(result.retryCommand);
    expect(result.manualCommand).toMatch(/npm install robloxui$/);
    expect(THEME_FAILURE_ID).toBe("theme__failure");
  });

  it("flags a resolved package that lacks entry points", () => {
    write(
      tempDir,
      "package.json",
      JSON.stringify({ dependencies: { [NPM_THEME_PACKAGE]: `^${NPM_THEME_VERSION}` } })
    );
    write(tempDir, "package-lock.json", "{}");
    // Resolved package with the theme files but no main/types/exports.
    write(
      tempDir,
      `node_modules/${NPM_THEME_PACKAGE}/package.json`,
      JSON.stringify({ name: NPM_THEME_PACKAGE, version: NPM_THEME_VERSION })
    );
    write(tempDir, `node_modules/${NPM_THEME_PACKAGE}/theme/src/index.ts`, "export const theme = {}");

    const result = installCanonicalNpmTheme(tempDir, {
      runner: () => ({ status: 0, stdout: "", stderr: "" }),
    });

    expect(result.status).toBe("failed");
    expect(result.errors.some((e) => e.includes("entry point"))).toBe(true);
  });
});
