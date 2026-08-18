#!/usr/bin/env node
/**
 * RobloxUI CLI entry point.
 *
 * Usage:
 *   npx robloxui add <slug...> [options]  Install one or more components
 *   npx robloxui list [options]           Browse available components
 *   npx robloxui search <query>           Search components by text
 *   npx robloxui info <slug>              Show component metadata + install cmd
 *   npx robloxui init [options]           Scaffold an empty Roblox-TS / Luau project
 *   npx robloxui help                     Show help
 */

import { runAddCommand } from "./commands/add";
import { runListCommand } from "./commands/list";
import { runInfoCommand } from "./commands/info";
import { runInitCommand } from "./commands/init";
import type { McpToolName } from "./commands/init";
import { runDoctorCommand } from "./commands/doctor";
import {
  runLoginCommand,
  runLogoutCommand,
  runWhoamiCommand,
} from "./commands/auth";
import { logger } from "./utils/logger";

const HELP_TEXT = `
${"\x1b[1m"}RobloxUI CLI — Roblox UI Component Marketplace${"\x1b[0m"}

${"\x1b[36m"}Usage:${"\x1b[0m"}
  npx robloxui login [options]          Authenticate the CLI (device flow or --token)
  npx robloxui logout                   Sign out (removes saved token)
  npx robloxui whoami                   Show who you're logged in as
  npx robloxui add <slug...> [options]  Install one or more components
  npx robloxui list [options]           Browse available components
  npx robloxui search <query>           Search components by text
  npx robloxui info <slug>              Show component metadata + install command
   npx robloxui init [options]           Scaffold an empty Roblox-TS / Luau project
   npx robloxui doctor                   Check the local development environment
  npx robloxui help                     Show this help message

${"\x1b[36m"}Options (login):${"\x1b[0m"}
  --token <key>         Use a manually-issued API key (skip device flow)

${"\x1b[36m"}Options (add):${"\x1b[0m"}
  -y, --yes              Non-interactive: accept defaults (CI/scripts)
  --force                Overwrite existing files without prompting
  --path <dir>           Override the install directory
  --theme                Install the RobloxUI theme package (robloxui/theme)
  --no-theme             Skip the theme package (components work standalone)

${"\x1b[36m"}Options (init):${"\x1b[0m"}
  -y, --yes              Non-interactive (requires --name and --flavor)
  --name <dir>           Project folder name, or "." for current directory
  --flavor <f>           roblox-ts | luau-wally
   --skip-install         Skip dependency install / theme setup
   --no-bootstrap         Do not install missing mise automatically
  --theme                Include the RobloxUI theme in the scaffold
  --no-theme             Scaffold without the theme
  --mcp-tools <csv>       Wire Studio MCP into one or more of: opencode, claude-code, cursor, vscode (comma-separated)

${"\x1b[36m"}Options (list/search):${"\x1b[0m"}
  --framework <f>        Filter by framework (tsx | luau | both)
  --category <name>      Filter by category
  --limit <n>            Max results (default 30, max 100)

${"\x1b[36m"}Examples:${"\x1b[0m"}
  npx robloxui login                         Authenticate via browser
  npx robloxui login --token rui_xxx         Use a manual API key (CI)
  npx robloxui add button                    Install "button"
  npx robloxui add button card dialog --yes  Install several, non-interactive
  npx robloxui search dialog                 Find components matching "dialog"
  npx robloxui info primary-button           Inspect before installing
  npx robloxui init --name my-game --flavor roblox-ts --yes
  npx robloxui init --name . --flavor luau-wally --yes   # scaffold in cwd

${"\x1b[36m"}Configuration:${"\x1b[0m"}
  RUI_API_URL                   API base URL (default: https://robloxui.pencipta.com/api/v1)
  RUI_SITE_URL                  Site base URL for upgrade hints

${"\x1b[36m"}Project Detection:${"\x1b[0m"}
  The CLI auto-detects your project type by scanning for:
    - rojo.json      → Roblox-TS project
    - wally.toml     → Luau/Wally project

  The RobloxUI theme is optional: components ship their own design tokens.
  Pass --theme (or answer the prompt) to also install the canonical
  robloxui/theme tokens.

  If no config files are found, you'll be prompted to select manually.

${"\x1b[36m"}Free vs Pro:${"\x1b[0m"}
  Free tier: 2 component downloads per day (rolling 24h).
  Pro members ($14/mo or $119/yr): unlimited downloads, full Pro library,
  no attribution, CLI access, and more. See https://robloxui.pencipta.com/pricing

${"\x1b[36m"}Learn more:${"\x1b[0m"} https://robloxui.pencipta.com/docs
`;

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

/** Resolve --theme / --no-theme into an explicit boolean (undefined = unset). */
function parseThemeFlag(flags: Record<string, string | boolean>): boolean | undefined {
  if (flags["theme"] === true) return true;
  if (flags["no-theme"] === true) return false;
  return undefined;
}

/** Split argv into positional args and --flag[=value] pairs. */
function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const name = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      // Short flags like -y
      flags[arg.slice(1)] = true;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (
    args.length === 0 ||
    args[0] === "help" ||
    args[0] === "--help" ||
    args[0] === "-h"
  ) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const command = args[0];
  const parsed = parseArgs(args.slice(1));
  const { positional, flags } = parsed;

  switch (command) {
    case "login": {
      const tokenFlag = flags["token"];
      const token =
        typeof tokenFlag === "string" ? (tokenFlag as string) : undefined;
      const exitCode = await runLoginCommand({ token });
      process.exit(exitCode);
    }

    case "logout": {
      const exitCode = await runLogoutCommand();
      process.exit(exitCode);
    }

    case "whoami": {
      const exitCode = await runWhoamiCommand();
      process.exit(exitCode);
    }

    case "add": {
      if (positional.length === 0) {
        logger.error(
          "Missing component slug. Usage: npx robloxui add <slug...> [--yes] [--force] [--path <dir>]"
        );
        process.exit(1);
      }

      const nonInteractive = flags["y"] === true || flags["yes"] === true;
      const force = flags["force"] === true;
      const pathFlag =
        typeof flags["path"] === "string" ? (flags["path"] as string) : undefined;
      const theme = parseThemeFlag(flags);

      const cwd = process.cwd();
      let finalExit = 0;
      for (const slug of positional) {
        const exitCode = await runAddCommand(slug, cwd, {
          nonInteractive,
          force,
          path: pathFlag,
          theme,
        });
        if (exitCode !== 0) finalExit = exitCode;
      }
      process.exit(finalExit);
    }

    case "list":
    case "search": {
      const query = command === "search" ? positional[0] : undefined;
      if (command === "search" && !query) {
        logger.error("Missing search query. Usage: npx robloxui search <query>");
        process.exit(1);
      }
      const framework =
        typeof flags["framework"] === "string"
          ? (flags["framework"] as string)
          : undefined;
      const category =
        typeof flags["category"] === "string"
          ? (flags["category"] as string)
          : undefined;
      const limit =
        typeof flags["limit"] === "string"
          ? parseInt(flags["limit"] as string, 10)
          : undefined;

      const exitCode = await runListCommand(query, { framework, category, limit });
      process.exit(exitCode);
    }

    case "info": {
      if (positional.length === 0) {
        logger.error("Missing component slug. Usage: npx robloxui info <slug>");
        process.exit(1);
      }
      const exitCode = await runInfoCommand(positional[0]);
      process.exit(exitCode);
    }

    case "init": {
      const nonInteractive = flags["y"] === true || flags["yes"] === true;
      const name =
        typeof flags["name"] === "string" ? (flags["name"] as string) : undefined;
      const flavorRaw =
        typeof flags["flavor"] === "string" ? (flags["flavor"] as string) : undefined;
      const flavor =
        flavorRaw === "roblox-ts" || flavorRaw === "luau-wally"
          ? flavorRaw
          : undefined;
      const skipInstall = flags["skip-install"] === true;
      const noBootstrap = flags["no-bootstrap"] === true;
      const theme = parseThemeFlag(flags);
      const mcpToolsRaw =
        typeof flags["mcp-tools"] === "string"
          ? (flags["mcp-tools"] as string)
          : undefined;
      const mcpTools = mcpToolsRaw
        ? (mcpToolsRaw.split(",").map((s) => s.trim()).filter(Boolean) as McpToolName[])
        : undefined;

      const exitCode = await runInitCommand(process.cwd(), {
        name,
        flavor,
        nonInteractive,
        skipInstall,
        noBootstrap,
        theme,
        mcpTools,
      });
      process.exit(exitCode);
    }

    case "doctor": {
      process.exit(runDoctorCommand(process.cwd()));
    }

    default: {
      logger.error(`Unknown command: ${command}`);
      logger.info("Run 'npx robloxui help' for usage information.");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  logger.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
