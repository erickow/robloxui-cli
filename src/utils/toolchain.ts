/**
 * Toolchain detection and optional install helpers for init.
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { logger } from "./logger";
import type { InitFlavor } from "../commands/init";
import { resolveMiseExecutable } from "../setup/mise-adapter";

export interface ToolchainStatus {
  node: boolean;
  npm: boolean;
  rojo: boolean;
  wally: boolean;
  mise: boolean;
}

function commandExists(command: string): boolean {
  try {
    const checkCmd = process.platform === "win32" ? "where.exe" : "which";
    const result = spawnSync(checkCmd, [command], {
      stdio: "pipe",
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/** Resolve project tools through mise-managed PATH entries or the system PATH. */
export function resolveToolCommand(projectDir: string, tool: "rojo" | "wally"): string {
  void projectDir;
  return process.platform === "win32" ? `${tool}.exe` : tool;
}

function runRojo(projectDir: string, args: string[]) {
  const mise = resolveMiseExecutable();
  if (commandExists(mise) || path.isAbsolute(mise)) {
    return spawnSync(mise, ["exec", "--", "rojo", ...args], {
      cwd: projectDir,
      stdio: "pipe",
      timeout: 120_000,
      windowsHide: true,
    });
  }

  return spawnSync(resolveToolCommand(projectDir, "rojo"), args, {
    cwd: projectDir,
    stdio: "pipe",
    timeout: 120_000,
    windowsHide: true,
  });
}

export function detectToolchain(): ToolchainStatus {
  let rojo = false;
  try {
    rojo = runRojo(process.cwd(), ["--version"]).status === 0;
  } catch {
    rojo = false;
  }

  return {
    node: commandExists("node"),
    npm: commandExists("npm"),
    rojo,
    wally: commandExists("wally"),
    mise: (() => {
      const mise = resolveMiseExecutable();
      return commandExists(mise) || path.isAbsolute(mise);
    })(),
  };
}

export function runToolchainCheck(flavor: InitFlavor): ToolchainStatus {
  const status = detectToolchain();

  logger.blank();
  logger.heading("Checking toolchain");

  const rows: Array<[string, boolean, string]> = [
    ["Node.js", status.node, "https://nodejs.org"],
    ["npm", status.npm, "included with Node.js"],
    [
      "Rojo",
      status.rojo,
      "https://rojo.space/docs/v7/getting-started/installation/ (or run mise install)",
    ],
  ];

  if (flavor === "luau-wally") {
    rows.push([
      "Wally",
      status.wally,
      "https://github.com/UpliftGames/wally (or run mise install)",
    ]);
  }

  rows.push([
    "mise",
    status.mise,
    "https://mise.jdx.dev/getting-started.html — pins tools per project",
  ]);

  for (const [name, ok, hint] of rows) {
    if (ok) {
      logger.success(`${name} — found`);
    } else {
      logger.warn(`${name} — not found (${hint})`);
    }
  }

  return status;
}

/** Install the Rojo Studio plugin when the Rojo CLI is available. */
export function installRojoPlugin(projectDir: string): boolean {
  logger.info("Installing Rojo Studio plugin...");

  const result = runRojo(projectDir, ["plugin", "install"]);

  if (result.status === 0) {
    logger.success("Rojo Studio plugin installed.");
    return true;
  }

  logger.warn(
    "Could not auto-install the Rojo plugin. Install manually from Plugin Management or run: rojo plugin install"
  );
  return false;
}

export function runRbxtsc(projectDir: string): boolean {
  logger.info("Compiling TypeScript (rbxtsc)...");
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: projectDir,
    stdio: "pipe",
    timeout: 180_000,
    shell: process.platform === "win32",
    windowsHide: true,
  });

  if (result.status === 0) {
    logger.success("TypeScript compiled to out/");
    return true;
  }

  const stderr = result.stderr?.toString().trim();
  logger.warn("Initial rbxtsc build failed — run npm run build after fixing errors.");
  if (stderr) {
    logger.dim(stderr.slice(0, 500));
  }
  return false;
}

export function buildPlaceFile(
  projectDir: string,
  projectFile = "default.project.json"
): boolean {
  const placePath = path.join(projectDir, "game.rbxl");

  logger.info(`Building place file (${projectFile} → game.rbxl)...`);
  const result = runRojo(projectDir, ["build", projectFile, "-o", placePath]);

  if (result.status === 0 && fs.existsSync(placePath)) {
    logger.success("Created game.rbxl — open this file in Roblox Studio.");
    return true;
  }

  logger.warn("Could not build game.rbxl yet. Run rojo build after compile/sync is ready.");
  return false;
}

export function rojoIsAvailable(projectDir: string): boolean {
  try {
    return runRojo(projectDir, ["--version"]).status === 0;
  } catch {
    return false;
  }
}
