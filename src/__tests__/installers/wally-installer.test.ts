/**
 * Luau theme installer tests.
 *
 * The theme is not published to Wally; the CLI vendors the bundled copy into
 * `Packages/RuiTheme/init.lua`. `installWallyTheme` is idempotent and requires
 * no Wally binary, no `wally.toml` dependency, and no `wally install`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { installWallyTheme } from "../../installers/wally-installer";
import { WALLY_THEME_ALIAS } from "../../constants/theme";

describe("wally theme installer", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-wally-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("vendors the bundled theme into Packages/RuiTheme when missing", () => {
    const ok = installWallyTheme(tempDir);
    expect(ok).toBe(true);

    const initPath = path.join(tempDir, "Packages", WALLY_THEME_ALIAS, "init.lua");
    expect(fs.existsSync(initPath)).toBe(true);
    expect(fs.readFileSync(initPath, "utf-8").trim().length).toBeGreaterThan(0);
  });

  it("is a no-op when the theme is already present", () => {
    const initPath = path.join(tempDir, "Packages", WALLY_THEME_ALIAS, "init.lua");
    fs.mkdirSync(path.dirname(initPath), { recursive: true });
    fs.writeFileSync(initPath, "-- existing theme\n", "utf-8");

    const ok = installWallyTheme(tempDir);
    expect(ok).toBe(true);
    expect(fs.readFileSync(initPath, "utf-8")).toBe("-- existing theme\n");
  });
});