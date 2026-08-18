/**
 * Unit tests for the `RobloxUI init` scaffolder.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

vi.mock("../../utils/prompts", () => ({
  selectPrompt: vi.fn(),
  pathPrompt: vi.fn(),
  confirmPrompt: vi.fn(),
  multiSelectPrompt: vi.fn(),
}));
vi.mock("../../setup/post-init", () => ({
  runPostInitSetup: vi.fn(() => ({
    depsInstalled: true,
    themeInstalled: true,
    compiled: true,
    placeBuilt: true,
    pluginInstalled: true,
  })),
  printReadySummary: vi.fn(),
}));
vi.mock("../../utils/toolchain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/toolchain")>();
  return {
    ...actual,
    runToolchainCheck: vi.fn(() => ({
      node: true,
      npm: true,
      rojo: true,
      wally: true,
       mise: true,
    })),
  };
});

import { runInitCommand } from "../../commands/init";
import {
  selectPrompt,
  pathPrompt,
  confirmPrompt,
  multiSelectPrompt,
} from "../../utils/prompts";
import { runPostInitSetup } from "../../setup/post-init";
import { NPM_THEME_PACKAGE, WALLY_THEME_ALIAS } from "../../constants/theme";
import { DEFAULT_COMPONENTS_PATH } from "../../constants/paths";

describe("init command", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-cli-init-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("roblox-ts scaffolding", () => {
    beforeEach(() => {
      vi.mocked(pathPrompt).mockResolvedValue("my-app");
      vi.mocked(selectPrompt).mockResolvedValue("roblox-ts");
      vi.mocked(confirmPrompt).mockResolvedValue(true);
      vi.mocked(multiSelectPrompt).mockResolvedValue([
        "opencode",
        "claude-code",
        "cursor",
        "vscode",
      ]);
    });

    it("creates a complete roblox-ts project skeleton", async () => {
      const exitCode = await runInitCommand(tempDir);
      expect(exitCode).toBe(0);

      const projectDir = path.join(tempDir, "my-app");
      expect(fs.existsSync(path.join(projectDir, "default.project.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "rojo.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "mise.toml"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "aftman.toml"))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, "src", "client", "main.client.tsx"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "src", "client", "ui", "App.tsx"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "src", "client", "ui", "theme", "theme.ts"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "src", "server", "spawn.server.ts"))).toBe(true);
      const skillDir = path.join(projectDir, ".skills", "roblox-ts-development");
      expect(fs.existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(skillDir, "references", "skills.md"))).toBe(true);
      expect(
        fs.existsSync(path.join(projectDir, ".skills", "roblox-store-assets", "SKILL.md"))
      ).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "AGENTS.md"))).toBe(true);
      const agents = fs.readFileSync(path.join(projectDir, "AGENTS.md"), "utf-8");
      expect(agents).toContain("@.skills/roblox-ts-development/SKILL.md");
      expect(agents).toContain("@.skills/roblox-store-assets/SKILL.md");
      expect(fs.existsSync(path.join(projectDir, "opencode.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, ".mcp.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, ".cursor", "mcp.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, ".vscode", "mcp.json"))).toBe(true);
      const mcp = JSON.parse(
        fs.readFileSync(path.join(projectDir, "opencode.json"), "utf-8")
      ) as { mcp: Record<string, { type: string; command: string[] }> };
      expect(mcp.mcp).toHaveProperty("Roblox_Studio");
      expect(mcp.mcp.Roblox_Studio.type).toBe("local");
      expect(mcp.mcp.Roblox_Studio.command.length).toBeGreaterThan(0);
      const claudeMcp = JSON.parse(
        fs.readFileSync(path.join(projectDir, ".mcp.json"), "utf-8")
      ) as { mcpServers: Record<string, { command: string; args: string[] }> };
      expect(claudeMcp.mcpServers).toHaveProperty("Roblox_Studio");
      const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
      expect(skill).toContain("name: roblox-ts-development");
      const skills = fs.readFileSync(path.join(skillDir, "references", "skills.md"), "utf-8");
      expect(skills).toContain("Server-authority model");

      const rojo = fs.readFileSync(
        path.join(projectDir, "default.project.json"),
        "utf-8"
      );
      expect(rojo).toContain("ServerScriptService");
      expect(rojo).toContain("out/server");
    });

    it("maps the standard Roblox services and shared folder", async () => {
      await runInitCommand(tempDir);

      const rojo = fs.readFileSync(
        path.join(tempDir, "my-app", "default.project.json"),
        "utf-8"
      );
      for (const service of [
        "Lighting",
        "ServerStorage",
        "SoundService",
        "StarterGui",
        "StarterPack",
        "StarterCharacterScripts",
      ]) {
        expect(rojo).toContain(service);
      }
      expect(rojo).toContain("out/shared");
      expect(
        fs.existsSync(path.join(tempDir, "my-app", "src", "shared", "index.ts"))
      ).toBe(true);
    });

    it("scaffolds an empty project without sample or demo files", async () => {
      const exitCode = await runInitCommand(tempDir);
      expect(exitCode).toBe(0);

      const projectDir = path.join(tempDir, "my-app");
      expect(fs.existsSync(path.join(projectDir, "src", "server", "village.server.ts"))).toBe(false);
      const spawn = fs.readFileSync(
        path.join(projectDir, "src", "server", "spawn.server.ts"),
        "utf-8"
      );
      expect(spawn).toContain("SpawnLocation");
      const app = fs.readFileSync(
        path.join(projectDir, "src", "client", "ui", "App.tsx"),
        "utf-8"
      );
      expect(app).not.toContain("Welcome to Pinehurst Village");
    });

    it("includes @rbxts/react and theme in package.json", async () => {
      await runInitCommand(tempDir);

      const pkg = JSON.parse(
        fs.readFileSync(path.join(tempDir, "my-app", "package.json"), "utf-8")
      ) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
        scripts: Record<string, string>;
      };
      expect(pkg.dependencies).toHaveProperty(NPM_THEME_PACKAGE);
      expect(pkg.devDependencies).toHaveProperty("@rbxts/react");
      expect(pkg.devDependencies).toHaveProperty("@rbxts/react-roblox");
      expect(pkg.scripts).toHaveProperty("build:place");
    });

    it("vendors the theme as source instead of a Rojo node_modules mapping", async () => {
      await runInitCommand(tempDir);

      const themeFile = path.join(
        tempDir,
        "my-app",
        "src",
        "client",
        "ui",
        "theme",
        "theme.ts"
      );
      expect(fs.existsSync(themeFile)).toBe(true);

      const sample = fs.readFileSync(
        path.join(tempDir, "my-app", "src", "client", "ui", "App.tsx"),
        "utf-8"
      );

      const rojo = fs.readFileSync(
        path.join(tempDir, "my-app", "default.project.json"),
        "utf-8"
      );
      expect(rojo).not.toContain("node_modules/robloxui/theme");
    });

    it("runs post-init setup", async () => {
      await runInitCommand(tempDir);
      expect(runPostInitSetup).toHaveBeenCalledWith(
        path.join(tempDir, "my-app"),
        "roblox-ts",
        { skipInstall: undefined, noBootstrap: undefined, theme: true }
      );
    });
  });

  describe("luau-wally scaffolding", () => {
    beforeEach(() => {
      vi.mocked(pathPrompt).mockResolvedValue("my-app");
      vi.mocked(selectPrompt).mockResolvedValue("luau-wally");
      vi.mocked(confirmPrompt).mockResolvedValue(true);
      vi.mocked(multiSelectPrompt).mockResolvedValue([
        "opencode",
        "claude-code",
        "cursor",
        "vscode",
      ]);
    });

    it("creates luau project with mise and components path", async () => {
      const exitCode = await runInitCommand(tempDir);
      expect(exitCode).toBe(0);

      const projectDir = path.join(tempDir, "my-app");
      expect(fs.existsSync(path.join(projectDir, "wally.toml"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "mise.toml"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, ".skills", "luau-wally-development", "SKILL.md"))).toBe(true);
      expect(
        fs.existsSync(path.join(projectDir, ".skills", "roblox-store-assets", "SKILL.md"))
      ).toBe(true);
      const agents = fs.readFileSync(path.join(projectDir, "AGENTS.md"), "utf-8");
      expect(agents).toContain("@.skills/luau-wally-development/SKILL.md");
      expect(fs.existsSync(path.join(projectDir, "aftman.toml"))).toBe(false);
      expect(
        fs.existsSync(path.join(projectDir, DEFAULT_COMPONENTS_PATH, "SampleButton.luau"))
      ).toBe(false);
    });

    it("maps the standard Roblox services, shared, and server folders", async () => {
      await runInitCommand(tempDir);

      const projectDir = path.join(tempDir, "my-app");
      const rojo = fs.readFileSync(
        path.join(projectDir, "default.project.json"),
        "utf-8"
      );
      for (const service of [
        "Lighting",
        "ServerScriptService",
        "ServerStorage",
        "SoundService",
        "StarterGui",
        "StarterPack",
        "StarterCharacterScripts",
      ]) {
        expect(rojo).toContain(service);
      }
      expect(rojo).toContain("src/shared");
      expect(rojo).toContain("src/server");
      expect(fs.existsSync(path.join(projectDir, "src", "shared", "init.luau"))).toBe(true);
      expect(
        fs.existsSync(path.join(projectDir, "src", "server", "spawn.server.luau"))
      ).toBe(true);
    });

    it("does not declare a theme dependency in wally.toml", async () => {
      await runInitCommand(tempDir);

      const toml = fs.readFileSync(
        path.join(tempDir, "my-app", "wally.toml"),
        "utf-8"
      );
      // The theme ships bundled; it is not a Wally dependency anymore.
      expect(toml).not.toContain(`${WALLY_THEME_ALIAS} =`);
      expect(toml).not.toContain("robloxui-theme");
    });
  });

  describe("non-interactive mode", () => {
    it("scaffolds in cwd when name is '.'", async () => {
      const exitCode = await runInitCommand(tempDir, {
        nonInteractive: true,
        name: ".",
        flavor: "roblox-ts",
      });

      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(tempDir, "default.project.json"))).toBe(true);
    });

    it("skips post-init when --skip-install is set", async () => {
      await runInitCommand(tempDir, {
        nonInteractive: true,
        name: "my-app",
        flavor: "roblox-ts",
        skipInstall: true,
      });

      expect(runPostInitSetup).toHaveBeenCalledWith(
        path.join(tempDir, "my-app"),
        "roblox-ts",
        { skipInstall: true, noBootstrap: undefined, theme: false }
      );
    });
  });

  describe("optional theme", () => {
    it("non-interactive init skips the theme by default", async () => {
      await runInitCommand(tempDir, {
        nonInteractive: true,
        name: "my-app",
        flavor: "roblox-ts",
      });

      const pkg = JSON.parse(
        fs.readFileSync(path.join(tempDir, "my-app", "package.json"), "utf-8")
      ) as { dependencies: Record<string, string> };
      expect(pkg.dependencies).not.toHaveProperty(NPM_THEME_PACKAGE);
      expect(
        fs.existsSync(path.join(tempDir, "my-app", "src", "client", "ui", "theme", "theme.ts"))
      ).toBe(false);
    });

    it("non-interactive init includes the theme with theme: true", async () => {
      await runInitCommand(tempDir, {
        nonInteractive: true,
        name: "my-app",
        flavor: "roblox-ts",
        theme: true,
      });

      const pkg = JSON.parse(
        fs.readFileSync(path.join(tempDir, "my-app", "package.json"), "utf-8")
      ) as { dependencies: Record<string, string> };
      expect(pkg.dependencies).toHaveProperty(NPM_THEME_PACKAGE);
      expect(
        fs.existsSync(path.join(tempDir, "my-app", "src", "client", "ui", "theme", "theme.ts"))
      ).toBe(true);
    });
  });
});
