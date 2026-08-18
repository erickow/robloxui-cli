/**
 * Vendors the RobloxUI theme into a project when npm/Wally install is unavailable.
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import {
  NPM_THEME_PACKAGE,
  THEME_IMPORT,
  WALLY_THEME_ALIAS,
} from "../constants/theme";
import { readBundledThemeFile, bundledThemeExists } from "../utils/bundled-theme";

function writeVendorFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

/**
 * Vendor the bundled theme into node_modules so the `robloxui` package is
 * resolvable when the npm registry install fails. The theme is exposed as the
 * `robloxui/theme` subpath of the `robloxui` package.
 */
export function vendorNpmTheme(projectDir: string): boolean {
  if (!bundledThemeExists()) {
    logger.warn("Bundled theme assets not found in the CLI package.");
    return false;
  }

  try {
    const pkgDir = path.join(projectDir, "node_modules", NPM_THEME_PACKAGE);
    writeVendorFile(
      pkgDir,
      "package.json",
      JSON.stringify({ name: NPM_THEME_PACKAGE }).trim()
    );
    writeVendorFile(pkgDir, "theme/src/index.ts", readBundledThemeFile("index.ts"));
    writeVendorFile(pkgDir, "theme/src/theme.lua", readBundledThemeFile("theme.lua"));
    logger.success(`Vendored ${THEME_IMPORT} into node_modules.`);
    return true;
  } catch (err) {
    logger.warn(
      `Failed to vendor npm theme: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

export function npmThemeIsInstalled(projectDir: string): boolean {
  const indexPath = path.join(
    projectDir,
    "node_modules",
    NPM_THEME_PACKAGE,
    "theme",
    "src",
    "index.ts"
  );
  return fs.existsSync(indexPath);
}

/**
 * Copy bundled RuiTheme into Packages/ when wally install fails.
 * Matches the layout Wally produces for the RuiTheme dependency alias.
 */
export function vendorWallyTheme(projectDir: string): boolean {
  if (!bundledThemeExists()) {
    logger.warn("Bundled theme assets not found in the CLI package.");
    return false;
  }

  try {
    const packageDir = path.join(projectDir, "Packages", WALLY_THEME_ALIAS);
    writeVendorFile(packageDir, "init.lua", readBundledThemeFile("theme.lua"));
    logger.success(`Vendored ${WALLY_THEME_ALIAS} into Packages/${WALLY_THEME_ALIAS}/.`);
    return true;
  } catch (err) {
    logger.warn(
      `Failed to vendor Wally theme: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

export function wallyThemeIsInstalled(projectDir: string): boolean {
  const initPath = path.join(projectDir, "Packages", WALLY_THEME_ALIAS, "init.lua");
  if (fs.existsSync(initPath)) {
    return true;
  }

  // Wally _Index layout fallback check.
  const packagesDir = path.join(projectDir, "Packages");
  if (!fs.existsSync(packagesDir)) {
    return false;
  }

  return fs
    .readdirSync(packagesDir)
    .some(
      (entry) =>
        entry.toLowerCase().includes("robloxui-theme") ||
        entry.toLowerCase().includes("ruiteheme")
    );
}
