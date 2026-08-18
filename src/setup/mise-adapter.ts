/**
 * Isolated mise invocation boundary.
 *
 * Every external `mise` process call goes through this module so unit tests can
 * inject a deterministic runner. The adapter NEVER invokes Aftman (AC-01,
 * EC-06) and always reports an actionable retry command on failure.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logger } from "../utils/logger";

/** Canonical retry command surfaced for every mise failure mode. */
export const MISE_RETRY_COMMAND = "mise install";

export interface MiseRunOptions {
  cwd: string;
}

export interface MiseRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Injectable mise command runner. Defaults to a real `spawnSync`. */
export type MiseRunner = (args: string[], options: MiseRunOptions) => MiseRunResult;

export function resolveMiseExecutable(): string {
  const executable = process.platform === "win32" ? "mise.exe" : "mise";
  const locator = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    [executable],
    { stdio: "ignore", windowsHide: true }
  );
  if (locator.status === 0) return executable;

  const candidates = process.platform === "win32"
    ? [
        path.join(process.env.LOCALAPPDATA ?? "", "mise", "bin", "mise.exe"),
        path.join(
          process.env.LOCALAPPDATA ?? "",
          "Microsoft",
          "WinGet",
          "Packages",
          "jdx.mise_Microsoft.Winget.Source_8wekyb3d8bbwe",
          "mise",
          "bin",
          "mise.exe"
        ),
        path.join(os.homedir(), ".local", "bin", "mise.exe"),
      ]
    : [path.join(os.homedir(), ".local", "bin", "mise")];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? executable;
}

export const defaultMiseRunner: MiseRunner = (args, options) => {
  const result = spawnSync(resolveMiseExecutable(), args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
};

/** True when the mise binary responds to `mise --version`. */
export function miseIsAvailable(runner: MiseRunner = defaultMiseRunner): boolean {
  try {
    const result = runner(["--version"], { cwd: process.cwd() });
    return result.status === 0;
  } catch {
    return false;
  }
}

export type MiseInstallReason = "not-installed" | "download-failed" | "unknown";

export function bootstrapMise(): boolean {
  const result = process.platform === "win32"
    ? spawnSync(
        "winget.exe",
        [
          "install",
          "--id",
          "jdx.mise",
          "--exact",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ],
        { stdio: "pipe", timeout: 180_000, windowsHide: true }
      )
    : spawnSync(
        "sh",
        ["-c", "curl -fsSL https://mise.run | sh"],
        { stdio: "pipe", timeout: 180_000 }
      );

  return result.status === 0 && miseIsAvailable(defaultMiseRunner);
}

export interface MiseInstallResult {
  ok: boolean;
  reason?: MiseInstallReason;
  message: string;
  retryCommand: string;
}

/**
 * Runs `mise install` in the project directory. Never invokes Aftman.
 * Returns an actionable retry command for every failure mode (EC-06, EC-08).
 */
export function runMiseInstall(
  projectDir: string,
  runner: MiseRunner = defaultMiseRunner,
  options: { bootstrap?: boolean } = {}
): MiseInstallResult {
  if (!miseIsAvailable(runner)) {
    if (runner === defaultMiseRunner && options.bootstrap !== false) {
      logger.info("mise is not installed — bootstrapping mise with the official installer...");
      if (!bootstrapMise()) {
        logger.warn("mise could not be installed automatically.");
        return {
          ok: false,
          reason: "not-installed",
          message: "mise prerequisite is missing.",
          retryCommand: MISE_RETRY_COMMAND,
        };
      }
    } else {
      logger.warn("mise is not installed — install mise, then rerun setup.");
      return {
        ok: false,
        reason: "not-installed",
        message: "mise prerequisite is missing.",
        retryCommand: MISE_RETRY_COMMAND,
      };
    }
  }

  logger.info("Installing pinned Rojo (+ Wally) via mise...");
  const result = runner(["install"], { cwd: projectDir });

  if (result.status === 0) {
    logger.success("mise tools installed.");
    return {
      ok: true,
      message: "mise tools installed.",
      retryCommand: MISE_RETRY_COMMAND,
    };
  }

  const stderr = result.stderr.trim();
  logger.warn("mise install did not complete successfully.");
  if (stderr) {
    logger.dim(stderr.slice(0, 500));
  }
  return {
    ok: false,
    reason: "download-failed",
    message: "mise could not download the pinned tool versions.",
    retryCommand: MISE_RETRY_COMMAND,
  };
}
