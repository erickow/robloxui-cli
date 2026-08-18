/**
 * Validates for F02 — Rojo detection and safe configuration reuse.
 *
 *   f02-v01 — "conflicting markers require choice": no silent flavor guess and
 *             the stable conflict test ID (`detect__conflict`) is emitted.
 *   f02-v02 — "preserves custom mappings": unknown keys and mappings remain
 *             unchanged except documented additive additions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  detectProjectProfile,
  resolveProfileFlavor,
  CONFLICT_PROMPT_ID,
} from "../../detectors/detect-project";
import {
  inspectRojo,
  buildAdditivePatch,
} from "../../detectors/rojo-config";

function write(dir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(dir, name), content, "utf-8");
}

describe("project profile detection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-profile-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves clean signals without prompting", () => {
    write(tempDir, "rojo.json", JSON.stringify({ tree: { ReplicatedStorage: { Components: { $path: "src/components" } } } }));
    const profile = detectProjectProfile(tempDir);
    expect(profile.flavor).toBe("roblox-ts");
    expect(profile.conflict).toBe(false);
    expect(profile.requiresChoice).toBe(false);
    expect(profile.confidence).toBe("high");
    expect(profile.conflictId).toBe("");
  });

  it("conflicting markers require choice", async () => {
    // EC-01: both Rojo files present.
    write(tempDir, "rojo.json", JSON.stringify({ tree: {} }));
    write(tempDir, "default.project.json", JSON.stringify({ tree: {} }));

    const bothFiles = detectProjectProfile(tempDir);
    expect(bothFiles.conflict).toBe(true);
    expect(bothFiles.requiresChoice).toBe(true);
    expect(bothFiles.flavor).toBeUndefined();
    expect(bothFiles.conflictId).toBe(CONFLICT_PROMPT_ID);

    // EC-05: package.json + wally layout disagree with a rojo signal.
    const conflictDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-profile-cf-"));
    try {
      write(conflictDir, "rojo.json", JSON.stringify({ tree: {} }));
      write(conflictDir, "wally.toml", "[dependencies]\n");
      const mixed = detectProjectProfile(conflictDir);
      expect(mixed.conflict).toBe(true);
      expect(mixed.requiresChoice).toBe(true);
      expect(mixed.conflictId).toBe(CONFLICT_PROMPT_ID);

      // No silent guess: resolution must defer to the caller / prompt.
      let captured: string | undefined;
      const flavor = await resolveProfileFlavor(mixed, async (profile) => {
        captured = profile.conflictId;
        return "roblox-ts";
      });
      expect(flavor).toBe("roblox-ts");
      expect(captured).toBe(CONFLICT_PROMPT_ID);
    } finally {
      fs.rmSync(conflictDir, { recursive: true, force: true });
    }
  });

  it("surfaces malformed rojo and requires choice without writing", () => {
    write(tempDir, "rojo.json", "{ not valid json");
    const profile = detectProjectProfile(tempDir);
    expect(profile.requiresChoice).toBe(true);
    expect(profile.flavor).toBeUndefined();
    expect(profile.rojo.malformed.length).toBe(1);
    expect(profile.rojo.malformed[0].parseError).toBeTruthy();
    // Detection must not have written or removed anything.
    expect(fs.existsSync(path.join(tempDir, "rojo.json"))).toBe(true);
  });

  it("detects all documented markers", () => {
    write(tempDir, "rojo.json", JSON.stringify({ tree: {} }));
    write(tempDir, "wally.toml", "[dependencies]\n");
    write(tempDir, "package.json", "{}");
    write(tempDir, "mise.toml", "[tools]\n");
    const profile = detectProjectProfile(tempDir);
    expect(profile.rojoFiles).toContain("rojo.json");
    expect(profile.wally).toBe(true);
    expect(profile.npm).toBe(true);
    expect(profile.mise).toBe(true);
  });

  it("is idempotent across repeated detections", () => {
    write(tempDir, "wally.toml", "[dependencies]\n");
    const a = detectProjectProfile(tempDir);
    const b = detectProjectProfile(tempDir);
    expect(a).toEqual(b);
  });
});

describe("rojo config safe reuse", () => {
  it("preserves custom mappings", () => {
    const original = {
      name: "my-game",
      globIgnorePaths: ["**/*.spec.ts"],
      tree: {
        $className: "DataModel",
        ReplicatedStorage: {
          $className: "ReplicatedStorage",
          // Unknown / user-owned custom mapping — must be preserved (EC-02).
          CustomLib: { $path: "lib/custom" },
          Packages: { $path: "Packages" },
        },
      },
    };
    const raw = JSON.stringify(original, null, 2);

    const patch = buildAdditivePatch(raw, {
      treePath: ["ReplicatedStorage", "Components"],
      target: "src/client/ui/components",
    });

    const patched = JSON.parse(patch.patchedText) as {
      tree: {
        ReplicatedStorage: {
          CustomLib: { $path: string };
          Packages: { $path: string };
          Components: { $path: string };
        };
      };
    };

    // Documented addition applied.
    expect(patch.changed).toBe(true);
    expect(patch.additions.length).toBe(1);
    expect(patched.tree.ReplicatedStorage.Components.$path).toBe(
      "src/client/ui/components"
    );

    // Custom mapping + unknown structural keys preserved byte-semantically.
    expect(patched.tree.ReplicatedStorage.CustomLib.$path).toBe("lib/custom");
    expect(patched.tree.ReplicatedStorage.Packages.$path).toBe("Packages");

    // Re-applying the same patch is a no-op change (idempotent rerun, EC-20).
    const rePatch = buildAdditivePatch(patch.patchedText, {
      treePath: ["ReplicatedStorage", "Components"],
      target: "src/client/ui/components",
    });
    expect(rePatch.changed).toBe(false);
    expect(rePatch.additions).toEqual([]);
  });

  it("inspects both rojo files and flags ambiguity", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-rojo-inspect-"));
    try {
      fs.writeFileSync(
        path.join(dir, "rojo.json"),
        JSON.stringify({ tree: { A: { $path: "a" } } }),
        "utf-8"
      );
      fs.writeFileSync(
        path.join(dir, "default.project.json"),
        JSON.stringify({ tree: { B: { $path: "b" } } }),
        "utf-8"
      );
      const outcome = inspectRojo(dir);
      expect(outcome.present).toEqual(
        expect.arrayContaining(["rojo.json", "default.project.json"])
      );
      expect(outcome.ambiguous).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
