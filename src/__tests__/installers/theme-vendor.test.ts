import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  vendorNpmTheme,
  vendorWallyTheme,
  npmThemeIsInstalled,
  wallyThemeIsInstalled,
} from "../../installers/theme-vendor";
import { bundledThemeExists, getBundledThemeDir } from "../../utils/bundled-theme";

describe("theme-vendor", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-theme-vendor-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("bundled theme assets exist in the CLI package", () => {
    expect(bundledThemeExists()).toBe(true);
    expect(fs.existsSync(path.join(getBundledThemeDir(), "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(getBundledThemeDir(), "theme.lua"))).toBe(true);
  });

  it("vendors npm theme into node_modules/robloxui/theme", () => {
    const ok = vendorNpmTheme(tempDir);
    expect(ok).toBe(true);
    expect(npmThemeIsInstalled(tempDir)).toBe(true);
  });

  it("vendors Wally theme into Packages/RuiTheme", () => {
    const ok = vendorWallyTheme(tempDir);
    expect(ok).toBe(true);
    expect(wallyThemeIsInstalled(tempDir)).toBe(true);
  });
});
