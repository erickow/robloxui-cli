/**
 * Minimal, flavor-specific configuration generation and additive repair (F03).
 *
 * Mutation is always an additive patch over user-owned configuration (decision
 * f03-d01). A fresh project yields a `create` plan; an existing project yields
 * a minimal `patch` plan that only adds missing required mappings. Re-planning
 * after applying the patch is a no-op (idempotent, EC-20). Malformed configs
 * are never repaired — they surface as errors and stop before mutation (EC-03).
 */

import * as fs from "fs";
import * as path from "path";

import {
  NPM_THEME_PACKAGE,
  NPM_THEME_VERSION,
  WALLY_REGISTRY,
} from "../constants/theme";
import { buildToolchainModel, renderMiseToml, MISE_CONFIG_PATH } from "./toolchain";
import { buildAdditivePatch } from "../detectors/rojo-config";
import {
  validateJsonParse,
  validateRojoJson,
  validateRojoMappings,
  validatePackageJson,
  REQUIRED_ROJO_MAPPINGS,
  type Flavor,
} from "./config-validator";

/** Stable preview prompt ID (F03 UI contract). */
export const CONFIG_PREVIEW_ID = "config__preview";

export interface PlannedFile {
  /** Repository-relative destination path. */
  path: string;
  /** Full intended file content (create) or patched content (repair). */
  content: string;
  reason: string;
}

export interface ConfigPlan {
  flavor: Flavor;
  projectName: string;
  create: PlannedFile[];
  patch: PlannedFile[];
  unchanged: string[];
  /** Human-readable change summary / diff lines. */
  diff: string[];
  /** Hard errors that block mutation (e.g. malformed existing config). */
  errors: string[];
}

function getAtPath(tree: Record<string, unknown>, atPath: string[]): unknown {
  let node: unknown = tree;
  for (const seg of atPath) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[seg];
  }
  return node;
}

// --- Flavor templates -------------------------------------------------------

function robloxTsRojoTree(): Record<string, unknown> {
  return {
    $className: "DataModel",
    ReplicatedStorage: {
      $className: "ReplicatedStorage",
      rbxts_include: {
        $path: "include",
        node_modules: {
          $className: "Folder",
          "@rbxts": { $path: "node_modules/@rbxts" },
        },
      },
    },
    StarterPlayer: {
      $className: "StarterPlayer",
      StarterPlayerScripts: {
        $className: "StarterPlayerScripts",
        TS: { $path: "out/client" },
      },
    },
  };
}

function luauRojoTree(): Record<string, unknown> {
  return {
    $className: "DataModel",
    ReplicatedStorage: {
      $className: "ReplicatedStorage",
      Packages: { $path: "Packages" },
    },
    StarterPlayer: {
      $className: "StarterPlayer",
      StarterPlayerScripts: {
        $className: "StarterPlayerScripts",
        Client: { $path: "src/client" },
      },
    },
  };
}

function rojoConfigText(projectName: string, flavor: Flavor): string {
  return JSON.stringify(
    {
      name: projectName,
      globIgnorePaths: ["**/*.spec.ts", "**/*.spec.tsx"],
      tree: flavor === "roblox-ts" ? robloxTsRojoTree() : luauRojoTree(),
    },
    null,
    2
  );
}

function packageJsonText(projectName: string, includeTheme: boolean): string {
  return JSON.stringify(
    {
      name: projectName,
      version: "0.1.0",
      private: true,
      scripts: {
        build: "rbxtsc",
        watch: "rbxtsc -w",
        "build:place": "rojo build default.project.json -o game.rbxl",
        serve: "rojo serve",
      },
      ...(includeTheme
        ? { dependencies: { [NPM_THEME_PACKAGE]: `^${NPM_THEME_VERSION}` } }
        : {}),
      devDependencies: {
        "roblox-ts": "^3.0.0",
        "@rbxts/types": "^1.0.806",
        "@rbxts/services": "^1.5.0",
        "@rbxts/react": "^17.2.3",
        "@rbxts/react-roblox": "^17.2.3",
        "@rbxts/compiler-types": "3.0.0-types.0",
      },
    },
    null,
    2
  );
}

function wallyTomlText(projectName: string): string {
  return [
    `[package]`,
    `name = "local/${projectName}"`,
    `version = "0.1.0"`,
    `registry = "${WALLY_REGISTRY}"`,
    `realm = "shared"`,
    ``,
  ].join("\n");
}

function miseTomlText(flavor: Flavor): string {
  return renderMiseToml(buildToolchainModel(flavor));
}

interface RequiredArtifact {
  relPath: string;
  build: (projectName: string, flavor: Flavor, includeTheme: boolean) => string;
}

const REQUIRED_ARTIFACTS: Record<Flavor, RequiredArtifact[]> = {
  "roblox-ts": [
    { relPath: "default.project.json", build: (n) => rojoConfigText(n, "roblox-ts") },
    { relPath: "rojo.json", build: (n) => rojoConfigText(n, "roblox-ts") },
    { relPath: "package.json", build: (n, _f, theme) => packageJsonText(n, theme) },
    { relPath: MISE_CONFIG_PATH, build: (_n, f) => miseTomlText(f) },
  ],
  "luau-wally": [
    { relPath: "default.project.json", build: (n) => rojoConfigText(n, "luau-wally") },
    { relPath: "wally.toml", build: (n) => wallyTomlText(n) },
    { relPath: MISE_CONFIG_PATH, build: (_n, f) => miseTomlText(f) },
  ],
};

// --- Additive repair --------------------------------------------------------

function repairRojoConfig(
  raw: string,
  flavor: Flavor
): { patchedText: string; additions: string[]; malformed: boolean } {
  if (!validateRojoJson(raw).valid) {
    return { patchedText: raw, additions: [], malformed: true };
  }
  const parsed = JSON.parse(raw) as { tree?: Record<string, unknown> };
  const tree = (parsed.tree ?? {}) as Record<string, unknown>;
  let currentText = raw;
  const additions: string[] = [];

  for (const required of REQUIRED_ROJO_MAPPINGS[flavor]) {
    const node = getAtPath(tree, required.atPath);
    const target =
      typeof node === "object" && node !== null && !Array.isArray(node)
        ? (node as Record<string, unknown>).$path
        : undefined;
    if (target !== required.target) {
      const patch = buildAdditivePatch(currentText, {
        treePath: required.atPath,
        target: required.target,
      });
      currentText = patch.patchedText;
      additions.push(...patch.additions);
    }
  }

  return { patchedText: currentText, additions, malformed: false };
}

function repairPackageJson(raw: string, _flavor: Flavor): string {
  // The theme is optional; package.json repair has no required additions.
  return raw;
}

// --- Planners ---------------------------------------------------------------

/** Plan every required artifact as a fresh `create` (no FS read). */
export function previewCreatePlan(
  flavor: Flavor,
  projectName = "robloxui-app",
  options: { theme?: boolean } = {}
): ConfigPlan {
  const includeTheme = options.theme === true;
  const create = REQUIRED_ARTIFACTS[flavor].map((artifact) => ({
    path: artifact.relPath,
    content: artifact.build(projectName, flavor, includeTheme),
    reason: "create",
  }));

  return {
    flavor,
    projectName,
    create,
    patch: [],
    unchanged: [],
    diff: create.map((f) => `+ create ${f.path}`),
    errors: [],
  };
}

function readFile(cwd: string, relPath: string): string | null {
  const full = path.join(cwd, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf-8");
}

/**
 * Plan minimal additive changes against an existing project. Existing valid
 * files are unchanged; files missing required mappings receive a minimal
 * patch; missing files are created. Malformed configs surface as errors and
 * are never mutated. The theme is optional and never injected by repair.
 */
export function planConfig(
  cwd: string,
  flavor: Flavor,
  projectName = "robloxui-app"
): ConfigPlan {
  const create: PlannedFile[] = [];
  const patch: PlannedFile[] = [];
  const unchanged: string[] = [];
  const diff: string[] = [];
  const errors: string[] = [];

  for (const artifact of REQUIRED_ARTIFACTS[flavor]) {
    const existing = readFile(cwd, artifact.relPath);

    if (existing === null) {
      const content = artifact.build(projectName, flavor, false);
      create.push({ path: artifact.relPath, content, reason: "missing" });
      diff.push(`+ create ${artifact.relPath}`);
      continue;
    }

    const validity = fileValidity(existing, artifact.relPath, flavor);
    if (validity.malformed) {
      errors.push(...validity.errors);
      diff.push(`! ${artifact.relPath} malformed (not repaired)`);
      continue;
    }

    if (validity.valid) {
      unchanged.push(artifact.relPath);
      diff.push(`= ${artifact.relPath} already satisfies`);
      continue;
    }

    const repaired = repairFile(existing, artifact.relPath, flavor, projectName);
    if (repaired === null) {
      errors.push(`Could not repair ${artifact.relPath}`);
      continue;
    }
    patch.push({ path: artifact.relPath, content: repaired, reason: "additive-repair" });
    diff.push(`~ patch ${artifact.relPath}`);
  }

  return { flavor, projectName, create, patch, unchanged, diff, errors };
}

function fileValidity(
  raw: string,
  relPath: string,
  flavor: Flavor
): { valid: boolean; malformed: boolean; errors: string[] } {
  if (relPath === MISE_CONFIG_PATH || relPath === "wally.toml") {
    // mise.toml content correctness is owned by the toolchain module (F01) and
    // wally.toml is plain project metadata now that the theme is not a Wally
    // dependency; presence is sufficient for the config plan.
    return { valid: raw.trim().length > 0, malformed: false, errors: [] };
  }
  if (relPath === "package.json") {
    const jsonCheck = validateJsonParse(raw);
    if (!jsonCheck.valid) {
      return { valid: false, malformed: true, errors: jsonCheck.errors };
    }
    const res = validatePackageJson(raw, flavor);
    return { valid: res.valid, malformed: false, errors: res.errors };
  }
  // Rojo configs (default.project.json / rojo.json)
  const jsonCheck = validateRojoJson(raw);
  if (!jsonCheck.valid) {
    return { valid: false, malformed: true, errors: jsonCheck.errors };
  }
  const res = validateRojoMappings(raw, flavor);
  return { valid: res.valid, malformed: false, errors: res.errors };
}

function repairFile(
  raw: string,
  relPath: string,
  flavor: Flavor,
  projectName: string
): string | null {
  if (relPath === "package.json") return repairPackageJson(raw, flavor);
  if (relPath === MISE_CONFIG_PATH) return miseTomlText(flavor);
  if (relPath === "default.project.json" || relPath === "rojo.json") {
    return repairRojoConfig(raw, flavor).patchedText;
  }
  // Fallback: regenerate from template (never includes the optional theme).
  const artifact = REQUIRED_ARTIFACTS[flavor].find((a) => a.relPath === relPath);
  return artifact ? artifact.build(projectName, flavor, false) : null;
}
