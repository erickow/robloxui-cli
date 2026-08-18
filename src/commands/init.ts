/**
 * `RobloxUI init` command — scaffold a minimal Roblox project pre-wired for
 * RobloxUI components, theme, toolchain, and Roblox Studio connection.
 *
 * The scaffold is intentionally empty: no sample UI or demo world. It ships
 * only a minimal player spawn so the game is playable out of the box, plus an
 * empty client mount ready for `robloxui add`.
 */

import * as fs from "fs";
import * as path from "path";
import {
  selectPrompt,
  pathPrompt,
  confirmPrompt,
  multiSelectPrompt,
} from "../utils/prompts";
import { logger } from "../utils/logger";
import {
  NPM_THEME_PACKAGE,
  NPM_THEME_VERSION,
  WALLY_REGISTRY,
} from "../constants/theme";
import { DEFAULT_COMPONENTS_PATH } from "../constants/paths";
import { readBundledThemeFile, getCliPackageRoot } from "../utils/bundled-theme";
import { runToolchainCheck } from "../utils/toolchain";
import {
  buildToolchainModel,
  MISE_CONFIG_PATH,
  renderMiseToml,
} from "../setup/toolchain";
import { previewCreatePlan, CONFIG_PREVIEW_ID } from "../setup/config-plan";
import { runPostInitSetup, printReadySummary } from "../setup/post-init";

export type InitFlavor = "roblox-ts" | "luau-wally";

export interface InitOptions {
  /** Project folder name, or "." to scaffold in the current directory. */
  name?: string;
  flavor?: InitFlavor;
  /** Skip prompts; requires name and flavor when set. */
  nonInteractive?: boolean;
  /** Skip npm install / wally install / compile / place build. */
  skipInstall?: boolean;
  /** Do not install mise automatically. */
  noBootstrap?: boolean;
  /**
   * Include the RobloxUI theme in the scaffold. Explicit true/false
   * (--theme / --no-theme) wins; interactive runs prompt; non-interactive
   * runs default to skipping it.
   */
  theme?: boolean;
  /** AI tools to wire the Roblox Studio MCP server into (skips the prompt). */
  mcpTools?: McpToolName[];
}

const EMPTY_SHARED_TS = `export {};
`;

const SPAWN_SERVER_LUAU = `local Workspace = game:GetService("Workspace")

local spawn = Instance.new("SpawnLocation")
spawn.Name = "Spawn"
spawn.Neutral = true
spawn.Anchored = true
spawn.Size = Vector3.new(1, 1, 1)
spawn.Position = Vector3.new(0, 10, 0)
spawn.Parent = Workspace
`;

const EMPTY_SHARED_LUAU = `-- Shared modules usable from both client and server
return {}
`;

const SPAWN_SERVER_TS = `import { Workspace } from "@rbxts/services";

const spawn = new Instance("SpawnLocation");
spawn.Name = "Spawn";
spawn.Neutral = true;
spawn.Anchored = true;
spawn.Size = new Vector3(1, 1, 1);
spawn.Position = new Vector3(0, 10, 0);
spawn.Parent = Workspace;
`;

const EMPTY_APP_TSX = `import React from "@rbxts/react";

export function App() {
	return <></>;
}
`;

const MAIN_CLIENT_TSX = `import React from "@rbxts/react";
import { createRoot } from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import { App } from "./ui/App";

const player = Players.LocalPlayer!;
const playerGui = player.WaitForChild("PlayerGui") as PlayerGui;

const root = createRoot(playerGui);
root.render(<App />);
`;

const INIT_CLIENT_LUAU = `local Players = game:GetService("Players")
local App = require(script.Parent.ui.App)

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

App.mount(playerGui)
`;

const EMPTY_APP_LUAU = `local App = {}

function App.mount(parent: Instance)
\tlocal screenGui = Instance.new("ScreenGui")
\tscreenGui.Name = "RobloxUI"
\tscreenGui.ResetOnSpawn = false
\tscreenGui.Parent = parent
end

return App
`;

const SKILLS_BY_FLAVOR: Record<string, string> = {
  "roblox-ts": "roblox-ts-development",
  "luau-wally": "luau-wally-development",
};
const SHARED_SKILLS = ["roblox-store-assets"];

/** Copy a bundled Agent Skill folder (SKILL.md + references) into the project. */
function writeSkill(targetDir: string, skillName: string): void {
  const skillSrc = path.join(getCliPackageRoot(), "assets", "skills", skillName);
  const skillDest = `.skills/${skillName}`;
  if (!fs.existsSync(skillSrc)) {
    logger.warn(`Skill assets missing for "${skillName}" — skipped.`);
    return;
  }
  const copyDir = (src: string, rel: string) => {
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const relName = rel ? path.join(rel, entry.name) : entry.name;
      const s = path.join(src, entry.name);
      if (entry.isDirectory()) {
        copyDir(s, relName);
      } else {
        const dest = path.join(targetDir, skillDest, relName);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, fs.readFileSync(s));
        logger.success(`Created: .skills/${skillName}/${relName}`);
      }
    }
  };
  copyDir(skillSrc, "");
}

/** Copy the flavor skill plus all shared skills into the project. */
function writeAgentSkills(targetDir: string, flavor: string): void {
  const skillName = SKILLS_BY_FLAVOR[flavor];
  if (skillName) writeSkill(targetDir, skillName);
  for (const shared of SHARED_SKILLS) writeSkill(targetDir, shared);
}

function renderAgentsReadme(flavor: string): string {
  const skillName = SKILLS_BY_FLAVOR[flavor] ?? "roblox-ts-development";
  return `# Agent instructions

This project is a Roblox ${flavor === "luau-wally" ? "Luau/Wally" : "Roblox-TS"} experience built with RobloxUI and Rojo. Read these before proposing code:

## Load the development skill

@.skills/${skillName}/SKILL.md

The skill instructs the agent to read \`references/skills.md\` inside the skill folder for the full code-first practices (scripting, performance, security, persistence, docs index). Follow it when writing or reviewing source in this project.

## Use real assets from the Creator Store

@.skills/roblox-store-assets/SKILL.md

When the game needs 3D models, meshes, textures, audio, animations, VFX, or
gameplay-mechanic templates, follow this skill to find and recommend real assets
and insert them with InsertService. Never invent asset IDs.

## Working with Studio

- Edit source files on disk, then run \`npm run dev\` to compile and sync via Rojo. Source is the source of truth — never hand-edit \`game.rbxl\`.
- ${flavor === "luau-wally" ? "This is a Luau/Wally project (\`wally.toml\`); dependencies are vendored via Wally." : "This is a Roblox-TS project (\`rojo.json\`); TypeScript is compiled to Luau with rbxtsc."}
- Add UI components with \`npx robloxui add <slug>\` instead of hand-writing them.

## Studio MCP

Use the \`Roblox_Studio\` MCP server (wired into the AI tool configs chosen at
scaffold time — \`opencode.json\`, \`.mcp.json\`, \`.cursor/mcp.json\`, or
\`.vscode/mcp.json\`)
to read the game tree, edit and create scripts, insert assets, run Luau, and
playtest in the open Studio session. The server must be enabled once in Studio:
**Assistant → ⋯ → Manage MCP Servers → Enable Studio as MCP server**. Never
fabricate asset IDs — the store skill covers verified sources.
`;
}

const PROJECT_README = `# RobloxUI project

Scaffolded with \`npx robloxui init\` — includes theme, Rojo config, mise toolchain pins, and a minimal player spawn.

## Open in Roblox Studio

1. Open **game.rbxl** in this folder (generated by init when Rojo is available)
2. Run \`npm run dev\` to start the compiler and Rojo together
3. Rojo plugin → **Connect** → press **Play**

If \`game.rbxl\` is missing, run \`npm run build:place\` (after \`npm run build\` for Roblox-TS).

## Daily development

\`\`\`bash
npm run dev          # starts the compiler and Rojo together
\`\`\`

Stop with Ctrl+C. For Luau/Wally projects, the same command starts Rojo with
the generated \`default.project.json\`.

## Toolchain (mise)

\`\`\`bash
mise install         # installs pinned Rojo (+ Wally for Luau projects)
\`\`\`

## AI and Studio MCP

Open this project as the workspace in your MCP-enabled AI client and connect
the Roblox Studio MCP server configured for your team. Keep source files and
Rojo as the source of truth: ask the assistant to edit source, run \`npm run dev\`,
then verify the result in Studio. Never commit MCP credentials or local server
configuration.

During init you pick which AI tools get the Roblox Studio MCP server
(\`opencode.json\`, \`.mcp.json\`, \`.cursor/mcp.json\`, or \`.vscode/mcp.json\`;
default opencode). Enable it once in Studio (**Assistant → ⋯ → Manage MCP Servers
→ Enable Studio as MCP server**), then open the project in that tool — the agent
can read the game tree, edit scripts, insert models, run Luau, and start/stop
playtest directly.

## Add marketplace components

\`\`\`bash
npx robloxui add <component-slug>
\`\`\`

Components install to \`${DEFAULT_COMPONENTS_PATH}/\`.
`;

const GITIGNORE = `# Roblox / toolchain
/out/
/include/
/Packages/
/node_modules/
*.rbxlx
*.rbxm
*.rbxmx

# Keep the generated place file for Studio open
!game.rbxl

# OS / editor
.DS_Store
Thumbs.db
`;

function renderStudioDevScript(flavor: InitFlavor): string {
  const rojoArgs = flavor === "luau-wally"
    ? '["exec", "--", "rojo", "serve", "-p", "default.project.json"]'
    : '["exec", "--", "rojo", "serve"]';
  const watch = flavor === "roblox-ts"
    ? 'children.push(run(npm, ["run", "watch"]));\n'
    : "";

  return `import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const windows = process.platform === "win32";
const npm = windows ? "npm.cmd" : "npm";
const miseName = windows ? "mise.exe" : "mise";
const miseCandidates = [join(homedir(), ".local", "bin", miseName)];
if (windows) {
  miseCandidates.push(
    join(process.env.LOCALAPPDATA ?? "", "mise", "bin", "mise.exe"),
    join(
      process.env.LOCALAPPDATA ?? "",
      "Microsoft",
      "WinGet",
      "Packages",
      "jdx.mise_Microsoft.Winget.Source_8wekyb3d8bbwe",
      "mise",
      "bin",
      "mise.exe"
    )
  );
}
const mise = miseCandidates.find(existsSync) ?? miseName;

function run(cmd, args) {
  if (windows) {
    // Windows cannot exec .cmd/.bat shims (npm.cmd) directly; route them
    // through cmd.exe without shell:true so args are never re-joined
    // (avoids Node's EINVAL and DEP0190).
    const command = [cmd, ...args]
      .map((arg) => (/\\s/.test(arg) ? \`"\${arg}"\` : arg))
      .join(" ");
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], {
      stdio: "inherit",
      windowsVerbatimArguments: true,
    });
  }
  return spawn(cmd, args, { stdio: "inherit" });
}

const children = [];
${watch}children.push(run(mise, ${rojoArgs}));

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (windows) {
      try {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          windowsHide: true,
        });
      } catch {}
    } else {
      child.kill("SIGTERM");
    }
  }
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
for (const child of children) child.once("exit", (code) => {
  if (!stopping && code !== 0) process.exitCode = code ?? 1;
});
`;
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
  logger.success(`Created: ${relPath}`);
}

function isDirectoryEmpty(dir: string): boolean {
  if (!fs.existsSync(dir)) return true;
  return fs.readdirSync(dir).length === 0;
}

/**
 * Standard DataModel services every Roblox place ships with (baseplate set).
 * Mapping them explicitly keeps the Rojo-built place identical to Studio's
 * default template, so scripts and assets can be added to any of them.
 */
function buildRobloxTsRojoConfig(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      globIgnorePaths: ["**/*.spec.ts", "**/*.spec.tsx"],
      tree: {
        $className: "DataModel",
        Lighting: { $className: "Lighting" },
        ReplicatedStorage: {
          $className: "ReplicatedStorage",
          rbxts_include: {
            $path: "include",
            node_modules: {
              $className: "Folder",
              "@rbxts": { $path: "node_modules/@rbxts" },
            },
          },
          Shared: { $path: "out/shared" },
        },
        ServerScriptService: {
          $className: "ServerScriptService",
          TS: { $path: "out/server" },
        },
        ServerStorage: { $className: "ServerStorage" },
        SoundService: { $className: "SoundService" },
        StarterGui: { $className: "StarterGui" },
        StarterPack: { $className: "StarterPack" },
        StarterPlayer: {
          $className: "StarterPlayer",
          StarterCharacterScripts: { $className: "StarterCharacterScripts" },
          StarterPlayerScripts: {
            $className: "StarterPlayerScripts",
            TS: { $path: "out/client" },
          },
        },
        Workspace: {
          $className: "Workspace",
          Spawn: { $className: "SpawnLocation" },
        },
      },
    },
    null,
    2
  );
}

function buildLuauRojoConfig(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      tree: {
        $className: "DataModel",
        Lighting: { $className: "Lighting" },
        ReplicatedStorage: {
          $className: "ReplicatedStorage",
          Packages: { $path: "Packages" },
          Shared: { $path: "src/shared" },
        },
        ServerScriptService: {
          $className: "ServerScriptService",
          Server: { $path: "src/server" },
        },
        ServerStorage: { $className: "ServerStorage" },
        SoundService: { $className: "SoundService" },
        StarterGui: { $className: "StarterGui" },
        StarterPack: { $className: "StarterPack" },
        StarterPlayer: {
          $className: "StarterPlayer",
          StarterCharacterScripts: { $className: "StarterCharacterScripts" },
          StarterPlayerScripts: {
            $className: "StarterPlayerScripts",
            Client: { $path: "src/client" },
          },
        },
        Workspace: {
          $className: "Workspace",
          Spawn: { $className: "SpawnLocation" },
        },
      },
    },
    null,
    2
  );
}

function buildPackageJson(projectName: string, includeTheme: boolean): string {
  return JSON.stringify(
    {
      name: projectName,
      version: "0.1.0",
      private: true,
      scripts: {
        build: "rbxtsc",
        watch: "rbxtsc -w",
        dev: "node scripts/studio-dev.mjs",
        studio: "node scripts/studio-dev.mjs",
        "build:place": "mise exec -- rojo build default.project.json -o game.rbxl",
        serve: "mise exec -- rojo serve",
      },
      ...(includeTheme
        ? { dependencies: { [NPM_THEME_PACKAGE]: NPM_THEME_VERSION } }
        : { dependencies: {} }),
      devDependencies: {
        "roblox-ts": "3.0.0",
        "@rbxts/types": "1.0.941",
        "@rbxts/services": "1.6.0",
        "@rbxts/react": "17.3.7-ts.2",
        "@rbxts/react-roblox": "17.3.7-ts.2",
        "@rbxts/compiler-types": "3.0.0-types.0",
      },
    },
    null,
    2
  );
}

function buildTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        allowSyntheticDefaultImports: true,
        downlevelIteration: true,
        jsx: "react",
        jsxFactory: "React.createElement",
        jsxFragmentFactory: "React.Fragment",
        module: "commonjs",
        moduleDetection: "force",
        moduleResolution: "Node",
        noLib: true,
        outDir: "out",
        rootDir: "src",
        resolveJsonModule: true,
        strict: true,
        target: "ESNext",
        typeRoots: ["node_modules/@rbxts"],
      },
    },
    null,
    2
  );
}

function buildWallyToml(projectName: string): string {
  const wallyName = sanitizeWallyPackageName(projectName);
  return [
    `[package]`,
    `name = "${wallyName}"`,
    `version = "0.1.0"`,
    `registry = "${WALLY_REGISTRY}"`,
    `realm = "shared"`,
    ``,
  ].join("\n");
}

function sanitizeWallyPackageName(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `local/${slug || "roblox-ui"}`;
}

/** AI tools that can consume a project-scoped Roblox Studio MCP config. */
export type McpToolName = "opencode" | "claude-code" | "cursor" | "vscode";
export const MCP_TOOL_NAMES: McpToolName[] = [
  "opencode",
  "claude-code",
  "cursor",
  "vscode",
];

interface RojoStudioMcp {
  command: string;
  args: string[];
}

/**
 * Locate the Roblox Studio MCP helper for the current OS. Studio ships the
 * server only on Windows and macOS (see https://create.roblox.com/docs/studio/mcp).
 * Returns null on unsupported platforms.
 */
function studioMcpCommand(): RojoStudioMcp | null {
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/c", "%LOCALAPPDATA%\\Roblox\\mcp.bat"] };
  }
  if (process.platform === "darwin") {
    return {
      command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP",
      args: [],
    };
  }
  return null;
}

interface McpConfigEntry {
  relPath: string;
  content: string;
}

/**
 * Build the project-scoped MCP config for a given tool. Each tool reads a
 * different file with its own schema:
 *   - opencode:   opencode.json     -> { mcp: { <name>: { type: local, command } } }
 *   - claude-code:.mcp.json        -> { mcpServers: { <name>: { command, args } } }
 *   - cursor:     .cursor/mcp.json -> { mcpServers: { <name>: { command, args } } }
 *   - vscode:     .vscode/mcp.json -> { servers:    { <name>: { command, args } } }
 */
export function buildMcpConfigForTool(
  tool: McpToolName,
  mcp: RojoStudioMcp
): McpConfigEntry {
  const entry = { command: mcp.command, args: mcp.args };
  switch (tool) {
    case "opencode":
      return {
        relPath: "opencode.json",
        content: JSON.stringify(
          {
            $schema: "https://opencode.ai/config.json",
            mcp: { Roblox_Studio: { type: "local", command: [mcp.command, ...mcp.args] } },
          },
          null,
          2
        ),
      };
    case "claude-code":
      return {
        relPath: ".mcp.json",
        content: JSON.stringify({ mcpServers: { Roblox_Studio: entry } }, null, 2),
      };
    case "cursor":
      return {
        relPath: ".cursor/mcp.json",
        content: JSON.stringify({ mcpServers: { Roblox_Studio: entry } }, null, 2),
      };
    case "vscode":
      return {
        relPath: ".vscode/mcp.json",
        content: JSON.stringify({ servers: { Roblox_Studio: entry } }, null, 2),
      };
  }
}

/** Write Roblox Studio MCP config for each selected tool (OS-aware). */
function writeMcpConfigs(targetDir: string, tools: McpToolName[]): void {
  const mcp = studioMcpCommand();
  if (!mcp) {
    logger.info("Roblox Studio MCP not written — Studio runs only on Windows/macOS.");
    return;
  }
  for (const tool of tools) {
    const cfg = buildMcpConfigForTool(tool, mcp);
    writeFile(targetDir, cfg.relPath, cfg.content);
  }
}

function scaffoldRobloxTs(
  targetDir: string,
  projectName: string,
  includeTheme: boolean
): void {
  const rojoConfig = buildRobloxTsRojoConfig(projectName);
  writeFile(targetDir, "default.project.json", rojoConfig);
  writeFile(targetDir, "rojo.json", rojoConfig);
  writeFile(targetDir, MISE_CONFIG_PATH, renderMiseToml(buildToolchainModel("roblox-ts")));
  writeFile(targetDir, "package.json", buildPackageJson(projectName, includeTheme));
  writeFile(targetDir, "tsconfig.json", buildTsConfig());
  writeFile(targetDir, ".gitignore", GITIGNORE);
  writeFile(targetDir, "README.md", PROJECT_README);
  writeFile(targetDir, "AGENTS.md", renderAgentsReadme("roblox-ts"));
  writeAgentSkills(targetDir, "roblox-ts");
  writeFile(targetDir, "scripts/studio-dev.mjs", renderStudioDevScript("roblox-ts"));
  writeFile(targetDir, "src/client/main.client.tsx", MAIN_CLIENT_TSX);
  writeFile(targetDir, "src/client/ui/App.tsx", EMPTY_APP_TSX);
  if (includeTheme) {
    writeFile(targetDir, "src/client/ui/theme/theme.ts", readBundledThemeFile("index.ts"));
  }
  writeFile(targetDir, "src/shared/index.ts", EMPTY_SHARED_TS);
  writeFile(targetDir, "src/server/spawn.server.ts", SPAWN_SERVER_TS);
  writeFile(targetDir, `${DEFAULT_COMPONENTS_PATH}/.gitkeep`, "");
}

function scaffoldLuauWally(targetDir: string, projectName: string): void {
  writeFile(targetDir, "wally.toml", buildWallyToml(projectName));
  writeFile(targetDir, "default.project.json", buildLuauRojoConfig(projectName));
  writeFile(targetDir, MISE_CONFIG_PATH, renderMiseToml(buildToolchainModel("luau-wally")));
  writeFile(targetDir, ".gitignore", GITIGNORE);
  writeFile(targetDir, "README.md", PROJECT_README);
  writeFile(targetDir, "AGENTS.md", renderAgentsReadme("luau-wally"));
  writeAgentSkills(targetDir, "luau-wally");
  writeFile(targetDir, "scripts/studio-dev.mjs", renderStudioDevScript("luau-wally"));
  writeFile(targetDir, "src/client/init.client.luau", INIT_CLIENT_LUAU);
  writeFile(targetDir, "src/client/ui/App.luau", EMPTY_APP_LUAU);
  writeFile(targetDir, "src/shared/init.luau", EMPTY_SHARED_LUAU);
  writeFile(targetDir, "src/server/spawn.server.luau", SPAWN_SERVER_LUAU);
  writeFile(targetDir, `${DEFAULT_COMPONENTS_PATH}/.gitkeep`, "");
}

export async function runInitCommand(
  cwd: string,
  options: InitOptions = {}
): Promise<number> {
  logger.heading("RobloxUI — scaffold a new project");

  const defaultName =
    path.basename(cwd) !== cwd && path.basename(cwd) !== "."
      ? path.basename(cwd)
      : "my-roblox-ui";

  let projectName: string;
  let flavor: InitFlavor;

  if (options.nonInteractive) {
    projectName = options.name ?? defaultName;
    if (!options.flavor) {
      logger.error("Non-interactive init requires --flavor (roblox-ts | luau-wally).");
      return 1;
    }
    flavor = options.flavor;
  } else {
    projectName = options.name ?? (await pathPrompt("Project name", defaultName));
    flavor = (options.flavor ??
      (await selectPrompt<InitFlavor>("Choose your project flavor:", [
        "roblox-ts",
        "luau-wally",
      ]))) as InitFlavor;
  }

  // Theme is optional: explicit --theme/--no-theme wins, interactive runs
  // prompt, non-interactive runs skip it.
  let includeTheme: boolean;
  if (typeof options.theme === "boolean") {
    includeTheme = options.theme;
  } else if (options.nonInteractive) {
    includeTheme = false;
  } else {
    includeTheme = await confirmPrompt(
      "Include the RobloxUI theme (robloxui/theme)?",
      false
    );
  }

  runToolchainCheck(flavor);

  const initInPlace = projectName === "." || projectName === "./";
  const targetDir = initInPlace ? path.resolve(cwd) : path.resolve(cwd, projectName);
  const displayName = initInPlace ? path.basename(targetDir) : projectName;

  if (fs.existsSync(targetDir) && !isDirectoryEmpty(targetDir)) {
    logger.error(`Directory is not empty: ${targetDir}`);
    logger.info(
      "Pick a different project name, delete existing files, or use an empty folder."
    );
    return 1;
  }

  // F03 — preview planned files and require confirmation before any write
  // (AC-05). Non-interactive mode is an explicit approval flag.
  const plan = previewCreatePlan(flavor, displayName, { theme: includeTheme });
  logger.blank();
  logger.info(`[${CONFIG_PREVIEW_ID}] Planned files for ${flavor}:`);
  for (const line of plan.diff) {
    logger.dim(`  ${line}`);
  }

  if (!options.nonInteractive) {
    const approved = await confirmPrompt("Proceed with these changes?", true);
    if (!approved) {
      logger.info("Aborted — no files were written. Re-run `robloxui init` to try again.");
      return 0;
    }
  }

  fs.mkdirSync(targetDir, { recursive: true });

  logger.blank();
  logger.info(`Scaffolding ${flavor} project in ${targetDir}`);

  if (flavor === "roblox-ts") {
    scaffoldRobloxTs(targetDir, displayName, includeTheme);
  } else {
    scaffoldLuauWally(targetDir, displayName);
  }

  // Ask which AI tools get the Roblox Studio MCP server. Explicit --mcp-tools
  // wins; non-interactive defaults to opencode; interactive multi-select uses
  // arrow keys (Space toggles, A selects all, Enter confirms) with all checked.
  let mcpTools: McpToolName[] | undefined = options.mcpTools;
  if (mcpTools === undefined) {
    if (options.nonInteractive) {
      mcpTools = ["opencode"];
    } else {
      mcpTools = await multiSelectPrompt<McpToolName>(
        "Wire the Roblox Studio MCP server into which AI tools?",
        MCP_TOOL_NAMES,
        { id: "mcp-tools", checkAll: true }
      );
    }
  }
  if (mcpTools.length > 0) {
    writeMcpConfigs(targetDir, mcpTools);
  }

  const postInit = runPostInitSetup(targetDir, flavor, {
    skipInstall: options.skipInstall,
    noBootstrap: options.noBootstrap,
    theme: includeTheme,
  });

  printReadySummary(flavor, targetDir, postInit);

  logger.success(`Done! Project "${displayName}" is ready for Roblox Studio.`);
  return 0;
}