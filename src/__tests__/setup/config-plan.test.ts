/**
 * Validates for F03 — Minimal Rojo configuration generation and validation.
 *
 *   f03-v01 — "creates both flavor plans": preview contains required Rojo and
 *             package-manager mappings for both flavors.
 *   f03-v02 — "repairs missing mapping only": repair is additive; the second
 *             plan is a no-op and custom content is retained (idempotent).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  previewCreatePlan,
  planConfig,
  CONFIG_PREVIEW_ID,
} from "../../setup/config-plan";
import { validateRojoMappings } from "../../setup/config-validator";
import { NPM_THEME_PACKAGE, NPM_THEME_VERSION } from "../../constants/theme";

function write(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

describe("config plan generation", () => {
  it("creates both flavor plans", () => {
    const ts = previewCreatePlan("roblox-ts", "my-game");
    const luau = previewCreatePlan("luau-wally", "my-game");

    expect(CONFIG_PREVIEW_ID).toBe("config__preview");

    // Roblox-TS plan: required Rojo + npm mappings present.
    const tsPaths = ts.create.map((f) => f.path);
    expect(tsPaths).toEqual(
      expect.arrayContaining([
        "default.project.json",
        "rojo.json",
        "package.json",
        "mise.toml",
      ])
    );
    const tsRojo = ts.create.find((f) => f.path === "default.project.json")!.content;
    expect(tsRojo).toContain('"$path": "node_modules/@rbxts"');
    expect(tsRojo).toContain('"$path": "out/client"');
    const tsPkg = ts.create.find((f) => f.path === "package.json")!.content;
    // The theme is optional: the default plan omits the dependency...
    expect(tsPkg).not.toContain(`"${NPM_THEME_PACKAGE}"`);
    // ...while an explicit theme plan includes it.
    const tsTheme = previewCreatePlan("roblox-ts", "my-game", { theme: true });
    const tsThemePkg = tsTheme.create.find((f) => f.path === "package.json")!.content;
    expect(tsThemePkg).toContain(`"${NPM_THEME_PACKAGE}": "^${NPM_THEME_VERSION}"`);
    // Generated Rojo config must be valid for its flavor.
    expect(validateRojoMappings(tsRojo, "roblox-ts").valid).toBe(true);

    // Luau/Wally plan: required Rojo + Wally mappings present.
    const luauPaths = luau.create.map((f) => f.path);
    expect(luauPaths).toEqual(
      expect.arrayContaining(["default.project.json", "wally.toml", "mise.toml"])
    );
    const luauRojo = luau.create.find((f) => f.path === "default.project.json")!
      .content;
    expect(luauRojo).toContain('"$path": "Packages"');
    expect(luauRojo).toContain('"$path": "src/client"');
    const wally = luau.create.find((f) => f.path === "wally.toml")!.content;
    // The theme ships bundled; it is not a Wally dependency anymore.
    expect(wally).not.toContain("robloxui-theme");
    expect(wally).toContain("[package]");
    expect(validateRojoMappings(luauRojo, "luau-wally").valid).toBe(true);
  });

  it("repairs missing mapping only", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-config-plan-"));
    try {
      // Existing roblox-ts Rojo config: has @rbxts + robloxui/theme but is MISSING
      // the TS -> out/client mapping. Also carries a user-owned custom key
      // that must survive the additive repair (EC-02).
      const incompleteRojo = JSON.stringify(
        {
          name: "existing",
          tree: {
            $className: "DataModel",
            ReplicatedStorage: {
              $className: "ReplicatedStorage",
              rbxts_include: {
                $path: "include",
                node_modules: {
                  $className: "Folder",
                  "@rbxts": { $path: "node_modules/@rbxts" },
                  robloxui: { $path: "node_modules/robloxui/theme" },
                },
              },
              Packages: { $path: "Packages" },
              // User-owned custom mapping.
              CustomLib: { $path: "lib/custom" },
            },
            StarterPlayer: {
              $className: "StarterPlayer",
              StarterPlayerScripts: { $className: "StarterPlayerScripts" },
            },
          },
        },
        null,
        2
      );
      write(tempDir, "default.project.json", incompleteRojo);
      write(tempDir, "rojo.json", incompleteRojo);
      // No RobloxUI theme dependency — valid now that the theme is optional.
      write(
        tempDir,
        "package.json",
        JSON.stringify({ dependencies: {} }, null, 2)
      );

      const plan1 = planConfig(tempDir, "roblox-ts", "existing");

      // package.json already satisfies -> unchanged. Rojo configs need repair.
      expect(plan1.errors).toEqual([]);
      expect(plan1.unchanged).toContain("package.json");
      expect(plan1.patch.map((f) => f.path)).toEqual(
        expect.arrayContaining(["default.project.json", "rojo.json"])
      );
      expect(plan1.create.map((f) => f.path)).toEqual(["mise.toml"]);

      // Patched content: TS mapping added, custom mapping retained.
      const patchedDefault = plan1.patch.find(
        (f) => f.path === "default.project.json"
      )!.content;
      expect(patchedDefault).toContain('"$path": "out/client"');
      expect(patchedDefault).toContain('"$path": "lib/custom"');
      expect(validateRojoMappings(patchedDefault, "roblox-ts").valid).toBe(true);

      // Apply the plan to disk.
      for (const file of [...plan1.patch, ...plan1.create]) {
        write(tempDir, file.path, file.content);
      }

      // Second plan must be a no-op (idempotent, EC-20).
      const plan2 = planConfig(tempDir, "roblox-ts", "existing");
      expect(plan2.create).toEqual([]);
      expect(plan2.patch).toEqual([]);
      expect(plan2.errors).toEqual([]);

      // Custom content retained on disk after repair.
      const onDisk = fs.readFileSync(
        path.join(tempDir, "default.project.json"),
        "utf-8"
      );
      expect(onDisk).toContain('"$path": "lib/custom"');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not repair malformed configs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-config-bad-"));
    try {
      write(tempDir, "default.project.json", "{ broken json");
      const plan = planConfig(tempDir, "luau-wally", "x");
      expect(plan.errors.length).toBeGreaterThan(0);
      expect(plan.patch).toEqual([]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
