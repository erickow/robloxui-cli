/**
 * Canonical npm theme installation (F05).
 *
 * The theme ships inside the `robloxui` npm package and is consumed through
 * the `robloxui/theme` subpath. This installs `robloxui`, validates that the
 * bundled theme resolves (manifest, lockfile, entry points), reports the
 * installed version, and on failure prints the exact manual + retry commands
 * without committing component success (AC-09, AC-11, AC-15, AC-21, EC-09,
 * EC-10, EC-15, EC-19).
 *
 * Naming contract: the PRD's canonical identifier is `robloxui/theme`, which is
 * the real import specifier exposed by the `robloxui` package. Installing the
 * `robloxui` package (the registry dependency) provides that subpath.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import { NPM_THEME_PACKAGE, THEME_IMPORT } from "../constants/theme";

/** PRD canonical contract identifier (display + result.package). */
export const CANONICAL_THEME_PACKAGE = THEME_IMPORT;

/** Stable prompt/output IDs (F05 UI contract). */
export const THEME_INSTALLING_ID = "theme__installing";
export const THEME_FAILURE_ID = "theme__failure";

export type ThemeInstallStatus = "installed" | "failed";
export type NpmManager = "npm";

export interface ThemeInstallResult {
  /** Canonical contract name — exactly `robloxui/theme`. */
  package: string;
  manager: NpmManager;
  version?: string;
  manifestBefore: string | null;
  status: ThemeInstallStatus;
  /** Exact manual recovery command (working npm invocation). */
  manualCommand: string;
  retryCommand: string;
  errors: string[];
}

export interface NpmRunnerResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Injectable npm runner — defaults to a real spawnSync (argv, no shell). */
export type NpmRunner = (args: string[], cwd: string) => NpmRunnerResult;

export const defaultNpmRunner: NpmRunner = (args, cwd) => {
  // npm ships as npm.cmd on Windows; args here are fixed (no user paths), so
  // the .cmd shim is safe to shell-spawn. Everywhere else, spawn argv-only.
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    args,
    {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
      shell: process.platform === "win32",
      windowsHide: true,
    }
  );
  return {
    status: result.status,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
};

function manualNpmCommand(): string {
  return `npm install ${NPM_THEME_PACKAGE}`;
}

function readManifest(cwd: string): string | null {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return fs.readFileSync(pkgPath, "utf-8");
  } catch {
    return null;
  }
}

function installedThemePath(cwd: string): string {
  return path.join(cwd, "node_modules", NPM_THEME_PACKAGE, "theme");
}

function validateResolvedTheme(cwd: string): string[] {
  const errors: string[] = [];
  const pkgDir = path.join(cwd, "node_modules", NPM_THEME_PACKAGE);
  const themeSrcPath = path.join(installedThemePath(cwd), "src");
  if (!fs.existsSync(themeSrcPath)) {
    errors.push(
      `${THEME_IMPORT} was not resolved into node_modules — registry entry may be invalid (EC-09).`
    );
    return errors;
  }

  const themePkgPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(themePkgPath)) {
    errors.push(`${NPM_THEME_PACKAGE} package.json is missing — invalid package.`);
    return errors;
  }

  let themePkg: { main?: string; types?: string; exports?: unknown };
  try {
    themePkg = JSON.parse(fs.readFileSync(themePkgPath, "utf-8")) as typeof themePkg;
  } catch {
    errors.push(`${NPM_THEME_PACKAGE} package.json is unreadable.`);
    return errors;
  }

  const entry = themePkg.main ?? (themePkg.types ?? "");
  if (!entry) {
    errors.push(`${NPM_THEME_PACKAGE} has no entry point (main/types/exports).`);
  }

  // Manifest must record the dependency.
  const manifestPath = path.join(cwd, "package.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        dependencies?: Record<string, unknown>;
      };
      if (
        !manifest.dependencies ||
        !(NPM_THEME_PACKAGE in manifest.dependencies)
      ) {
        errors.push(
          `package.json does not list ${NPM_THEME_PACKAGE} in dependencies (EC-10).`
        );
      }
    } catch {
      errors.push("project package.json is unreadable.");
    }
  }

  // Lockfile presence (EC-10).
  const lockfile = path.join(cwd, "package-lock.json");
  if (!fs.existsSync(lockfile)) {
    errors.push("package-lock.json missing — dependency tree is not locked.");
  }

  return errors;
}

function readInstalledVersion(cwd: string): string | undefined {
  const themePkgPath = path.join(cwd, "node_modules", NPM_THEME_PACKAGE, "package.json");
  if (!fs.existsSync(themePkgPath)) return undefined;
  try {
    const themePkg = JSON.parse(
      fs.readFileSync(themePkgPath, "utf-8")
    ) as { version?: string };
    return themePkg.version;
  } catch {
    return undefined;
  }
}

/**
 * Install the canonical theme via npm and validate the result.
 *
 * The caller gates component success on `status === "installed"`: a failed
 * install never commits a component as successfully installed (EC-09, EC-15).
 */
export function installCanonicalNpmTheme(
  cwd: string,
  options?: { runner?: NpmRunner }
): ThemeInstallResult {
  const runner = options?.runner ?? defaultNpmRunner;
  const manifestBefore = readManifest(cwd);
  const manualCommand = manualNpmCommand();
  const retryCommand = manualNpmCommand();

  logger.info(`[${THEME_INSTALLING_ID}] npm ${NPM_THEME_PACKAGE}`);
  const result = runner(["install", NPM_THEME_PACKAGE], cwd);

  const failed = (
    partialErrors: string[],
    status: ThemeInstallStatus = "failed"
  ): ThemeInstallResult => {
    if (status === "failed") {
      logger.warn(`[${THEME_FAILURE_ID}] theme install failed — component not committed.`);
      logger.info(`  manual: ${manualCommand}`);
      logger.info(`  retry : ${retryCommand}`);
    }
    return {
      package: CANONICAL_THEME_PACKAGE,
      manager: "npm",
      manifestBefore,
      status,
      manualCommand,
      retryCommand,
      errors: partialErrors,
    };
  };

  if (result.status !== 0) {
    return failed([
      `npm install exited with code ${result.status}${
        result.stderr.trim() ? `: ${result.stderr.trim().slice(0, 200)}` : ""
      }`,
    ]);
  }

  const errors = validateResolvedTheme(cwd);
  if (errors.length > 0) {
    return failed(errors);
  }

  const version = readInstalledVersion(cwd);
  logger.success(
    `${CANONICAL_THEME_PACKAGE} installed${version ? ` (${version})` : ""}.`
  );
  return {
    package: CANONICAL_THEME_PACKAGE,
    manager: "npm",
    version,
    manifestBefore,
    status: "installed",
    manualCommand,
    retryCommand,
    errors: [],
  };
}
