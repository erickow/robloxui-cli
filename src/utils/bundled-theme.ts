/**
 * Resolve bundled theme assets shipped inside the robloxui npm package.
 */

import * as fs from "fs";
import * as path from "path";

/** Root of the published CLI package (contains dist/ and assets/). */
export function getCliPackageRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

export function getBundledThemeDir(): string {
  return path.join(getCliPackageRoot(), "theme", "src");
}

export function readBundledThemeFile(fileName: string): string {
  const filePath = path.join(getBundledThemeDir(), fileName);
  return fs.readFileSync(filePath, "utf-8");
}

export function bundledThemeExists(): boolean {
  const dir = getBundledThemeDir();
  return (
    fs.existsSync(path.join(dir, "index.ts")) &&
    fs.existsSync(path.join(dir, "theme.lua"))
  );
}
