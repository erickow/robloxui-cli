/**
 * npm installer — installs project dependencies and the RobloxUI theme.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import { NPM_THEME_PACKAGE } from "../constants/theme";
import { vendorNpmTheme } from "./theme-vendor";

function runNpmInstall(cwd: string, args: string[]): boolean {
  try {
    const result = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", ...args],
      {
        cwd,
        stdio: "pipe",
        timeout: 180_000,
        shell: process.platform === "win32",
        windowsHide: true,
      }
    );

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim() || "";
      logger.warn(`npm install exited with code ${result.status}`);
      if (stderr) {
        logger.dim(stderr);
      }
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Install the project toolchain while temporarily excluding the theme.
 *
 * The theme is bundled with the CLI because the public package may not exist in
 * the registry yet. Keeping the dependency in package.json preserves the
 * eventual package contract, while this retry lets fresh projects install the
 * rest of their dependencies and use the bundled copy immediately.
 */
function installDependenciesWithoutTheme(
  cwd: string,
  originalLockfile: string | null
): boolean {
  const manifestPath = path.join(cwd, "package.json");
  const lockfilePath = path.join(cwd, "package-lock.json");
  if (!fs.existsSync(manifestPath)) return false;

  let original: string;
  let manifest: Record<string, unknown>;

  try {
    original = fs.readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(original) as Record<string, unknown>;
  } catch {
    return false;
  }

  const currentDependencies = manifest.dependencies;
  if (
    !currentDependencies ||
    typeof currentDependencies !== "object" ||
    !(NPM_THEME_PACKAGE in currentDependencies)
  ) {
    return false;
  }

  const dependencies = {
    ...(currentDependencies as Record<string, unknown>),
  };
  delete dependencies[NPM_THEME_PACKAGE];

  try {
    // A failed install can leave the unavailable theme in package-lock.json.
    // Remove that transient lockfile before retrying without the theme.
    if (fs.existsSync(lockfilePath)) {
      fs.rmSync(lockfilePath);
    }
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, dependencies }, null, 2) + "\n",
      "utf-8"
    );
    return runNpmInstall(cwd, []);
  } finally {
    fs.writeFileSync(manifestPath, original, "utf-8");
    if (originalLockfile !== null) {
      fs.writeFileSync(lockfilePath, originalLockfile, "utf-8");
    }
  }
}

/**
 * Install all npm dependencies from package.json (roblox-ts toolchain + theme).
 */
export function installNpmDependencies(cwd: string): boolean {
  logger.info("Installing npm dependencies...");

  const lockfilePath = path.join(cwd, "package-lock.json");
  const originalLockfile = fs.existsSync(lockfilePath)
    ? fs.readFileSync(lockfilePath, "utf-8")
    : null;

  if (runNpmInstall(cwd, [])) {
    logger.success("npm dependencies installed successfully.");
    return true;
  }

  if (installDependenciesWithoutTheme(cwd, originalLockfile)) {
    logger.success(
      "npm dependencies installed; the bundled theme will be used because the registry package is unavailable."
    );
    return true;
  }

  logger.warn("Could not install npm dependencies automatically.");
  logger.info("  npm install");
  return false;
}

/**
 * Attempt to install the theme (`robloxui` package, `robloxui/theme` subpath)
 * via npm. Returns true on success, false on failure.
 * On failure, prints a warning instead of an error (EC-04).
 */
export function installNpmTheme(cwd: string): boolean {
  logger.info(`Installing ${NPM_THEME_PACKAGE} via npm...`);

  if (runNpmInstall(cwd, [NPM_THEME_PACKAGE])) {
    logger.success(`${NPM_THEME_PACKAGE} installed successfully.`);
    return true;
  }

  logger.warn(
    `Could not install ${NPM_THEME_PACKAGE} from npm — trying bundled fallback...`
  );
  if (vendorNpmTheme(cwd)) {
    return true;
  }

  logger.warn("Theme package not available from npm or bundled assets.");
  printManualThemeInstructions();
  return false;
}

function printManualThemeInstructions(): void {
  logger.info("Run the following command manually when available:");
  logger.info(`  npm install ${NPM_THEME_PACKAGE}`);
}
