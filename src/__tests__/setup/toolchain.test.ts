/**
 * Validates for F01 — Mise toolchain generation and Aftman migration.
 *
 *   f01-v01 — "renders mise pins": both flavors produce deterministic mise.toml
 *             with the expected pins and no Aftman text (AC-01, AC-02, AC-03).
 *   f01-v02 — "reports missing and failed mise": missing mise and download
 *             failures are actionable; Aftman is never invoked and a retry
 *             command is printed (EC-06, EC-07, EC-08).
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  buildToolchainModel,
  renderMiseToml,
  buildToolchainPreview,
  planAftmanMigration,
  reportMissingMise,
  MISE_CONFIG_PATH,
} from "../../setup/toolchain";
import {
  runMiseInstall,
  miseIsAvailable,
  type MiseRunner,
  type MiseRunResult,
} from "../../setup/mise-adapter";

const okVersion: MiseRunResult = { status: 0, stdout: "mise 2024", stderr: "" };

describe("mise toolchain", () => {
  it("renders mise pins", () => {
    const tsModel = buildToolchainModel("roblox-ts");
    const luauModel = buildToolchainModel("luau-wally");

    const tsToml = renderMiseToml(tsModel);
    const luauToml = renderMiseToml(luauModel);

    // Roblox-TS pins Rojo only.
    expect(tsToml).toContain('"ubi:rojo-rbx/rojo" = "7.4.4"');
    expect(tsToml.toLowerCase()).not.toContain("wally");

    // Luau/Wally pins Rojo + Wally.
    expect(luauToml).toContain('"ubi:rojo-rbx/rojo" = "7.4.4"');
    expect(luauToml).toContain('"ubi:UpliftGames/wally" = "0.3.2"');

    // No Aftman references anywhere in the generated config (AC-01).
    expect(tsToml.toLowerCase()).not.toContain("aftman");
    expect(luauToml.toLowerCase()).not.toContain("aftman");

    // Deterministic: identical models render identically.
    expect(renderMiseToml(buildToolchainModel("roblox-ts"))).toEqual(tsToml);
    expect(renderMiseToml(buildToolchainModel("luau-wally"))).toEqual(luauToml);

    // Preview exposes stable IDs and writes to mise.toml.
    const preview = buildToolchainPreview(tsModel);
    expect(preview.id).toBe("mise__preview");
    expect(preview.confirmId).toBe("mise__confirm");
    expect(preview.files[0].path).toBe(MISE_CONFIG_PATH);
    expect(preview.files[0].content).toBe(tsToml);
  });

  it("reports missing and failed mise", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-mise-test-"));
    try {
      // mise not installed: `mise --version` fails -> not-installed.
      const missingRunner: MiseRunner = () => ({
        status: 127,
        stdout: "",
        stderr: "command not found",
      });
      expect(miseIsAvailable(missingRunner)).toBe(false);

      const missing = runMiseInstall(tmpDir, missingRunner);
      expect(missing.ok).toBe(false);
      expect(missing.reason).toBe("not-installed");
      expect(missing.retryCommand).toContain("mise install");
      // Never recommends or references Aftman (EC-06).
      expect(JSON.stringify(missing).toLowerCase()).not.toContain("aftman");

      // mise installed but `mise install` fails -> download-failed (EC-08).
      const failRunner: MiseRunner = (args) =>
        args[0] === "--version"
          ? okVersion
          : { status: 1, stdout: "", stderr: "network unreachable" };
      const failed = runMiseInstall(tmpDir, failRunner);
      expect(failed.ok).toBe(false);
      expect(failed.reason).toBe("download-failed");
      expect(failed.retryCommand).toContain("mise install");
      expect(JSON.stringify(failed).toLowerCase()).not.toContain("aftman");

      // Happy path: mise install succeeds.
      const successRunner: MiseRunner = (args) =>
        args[0] === "--version"
          ? okVersion
          : { status: 0, stdout: "installed", stderr: "" };
      const ok = runMiseInstall(tmpDir, successRunner);
      expect(ok.ok).toBe(true);

      // Missing-toolchain report is nonzero with a retry command.
      const report = reportMissingMise();
      expect(report.exitCode).not.toBe(0);
      expect(report.retryCommand).toContain("mise install");

      // Legacy aftman.toml is detected but never touched (EC-07).
      const migration = planAftmanMigration(buildToolchainModel("luau-wally"), true);
      expect(migration.detected).toBe(true);
      expect(migration.touched).toBe(false);
      expect(migration.equivalentPreview).toContain(
        '"ubi:UpliftGames/wally" = "0.3.2"'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
