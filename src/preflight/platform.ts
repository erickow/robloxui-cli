/**
 * Cross-platform path and executable abstraction (F04).
 *
 * Commands are always constructed as argv + absolute paths and spawned without
 * a shell, so paths containing spaces, Unicode, or platform separators never
 * split or inject (decision f04-d01, AC-16, EC-16).
 */

import * as path from "path";

export type Platform = "win32" | "darwin" | "linux";

/** Current process platform narrowed to the supported set. */
export function currentPlatform(): Platform {
  return process.platform === "win32"
    ? "win32"
    : process.platform === "darwin"
      ? "darwin"
      : "linux";
}

/**
 * Supported Node.js range. Must match `packages/cli/package.json` `engines.node`
 * and the documented prerequisites — no new runtime minimum is introduced
 * (AC-17, EC-17).
 */
export const SUPPORTED_NODE_RANGE = ">=20.12";

export interface SpawnCommand {
  executable: string;
  args: string[];
  /** Shell is only enabled for `.cmd`/`.bat` shims on Windows. */
  useShell: boolean;
}

/**
 * Build an argv-safe command. Because `args` is an array and the shell is
 * disabled for real binaries, spaces and Unicode in any path survive intact.
 */
export function buildCommand(
  executable: string,
  args: string[],
  platform: Platform = currentPlatform()
): SpawnCommand {
  const isCmdLike = /\.(cmd|bat)$/i.test(executable);
  return {
    executable,
    args: [...args],
    useShell: platform === "win32" && isCmdLike,
  };
}

/** Resolve command shims without invoking a shell. */
export function executableForPlatform(
  executable: string,
  platform: Platform = currentPlatform()
): string {
  if (platform !== "win32" || /\.(cmd|bat|exe)$/i.test(executable)) {
    return executable;
  }

  // npm is distributed as a .cmd shim on Windows. Native tools such as mise,
  // Rojo, and Wally are resolved by CreateProcess through PATH.
  return executable.toLowerCase() === "npm" ? "npm.cmd" : executable;
}

/** Quote a path for *display only* — never for execution (execution uses argv). */
export function quoteForDisplay(value: string): string {
  return value.includes(" ") ? `"${value}"` : value;
}

/** Normalize a target directory for the platform without changing its meaning. */
export function normalizeTarget(target: string, platform: Platform = currentPlatform()): string {
  const normalized = path.normalize(target);
  return platform === "win32" ? normalized.replace(/\//g, "\\") : normalized.replace(/\\/g, "/");
}

/** True when a resolved path escapes the project root (EC-16 safety check). */
export function escapesRoot(resolvedTarget: string, root: string): boolean {
  const rel = path.relative(root, resolvedTarget);
  return rel.startsWith("..") || path.isAbsolute(rel) && !resolvedTarget.startsWith(root);
}
