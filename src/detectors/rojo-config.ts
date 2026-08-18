/**
 * Safe Rojo configuration parse + raw-preserving additive merge model (F02).
 *
 * Detection never mutates files. Existing user mappings and unknown keys are
 * preserved; only documented additive mappings are applied (AC-04, AC-06,
 * EC-02, EC-03). When both `rojo.json` and `default.project.json` are present
 * the outcome is marked ambiguous so callers can require an explicit choice
 * (EC-01, decision f02-d01).
 */

import * as fs from "fs";
import * as path from "path";

export type RojoValidity = "valid" | "malformed" | "absent";

export const ROJO_FILE_NAMES = ["rojo.json", "default.project.json"] as const;
export type RojoFileName = (typeof ROJO_FILE_NAMES)[number];

export interface RojoConfigFile {
  fileName: RojoFileName;
  path: string;
  rawText: string;
  parsedTree: unknown;
  validity: RojoValidity;
  /** Human-readable parse error + location hint when malformed. */
  parseError?: string;
}

export interface RojoParseOutcome {
  /** Existing rojo file names (any validity). */
  present: RojoFileName[];
  configs: Partial<Record<RojoFileName, RojoConfigFile>>;
  /** Both supported rojo files exist — caller must require explicit choice. */
  ambiguous: boolean;
  /** Files that exist but failed to parse. */
  malformed: RojoConfigFile[];
}

/** Read and classify a single Rojo file. Never throws. */
export function parseRojoFile(cwd: string, fileName: RojoFileName): RojoConfigFile | null {
  const filePath = path.join(cwd, fileName);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const rawText = fs.readFileSync(filePath, "utf-8");
  try {
    const parsedTree = JSON.parse(rawText);
    return {
      fileName,
      path: filePath,
      rawText,
      parsedTree,
      validity: "valid",
    };
  } catch (err) {
    const parseError = err instanceof Error ? err.message : String(err);
    return {
      fileName,
      path: filePath,
      rawText,
      parsedTree: null,
      validity: "malformed",
      parseError,
    };
  }
}

/** Inspect every supported Rojo file without mutating anything. */
export function inspectRojo(cwd: string): RojoParseOutcome {
  const configs: Partial<Record<RojoFileName, RojoConfigFile>> = {};
  const present: RojoFileName[] = [];
  const malformed: RojoConfigFile[] = [];

  for (const name of ROJO_FILE_NAMES) {
    const cfg = parseRojoFile(cwd, name);
    if (!cfg) continue;
    configs[name] = cfg;
    present.push(name);
    if (cfg.validity === "malformed") {
      malformed.push(cfg);
    }
  }

  return {
    present,
    configs,
    ambiguous:
      present.includes("rojo.json") && present.includes("default.project.json"),
    malformed,
  };
}

/** True when a parsed Rojo tree looks structurally usable. */
export function hasUsableTree(config: RojoConfigFile | null | undefined): boolean {
  if (!config || config.validity !== "valid") return false;
  const tree = (config.parsedTree as { tree?: unknown } | null)?.tree;
  return typeof tree === "object" && tree !== null && !Array.isArray(tree);
}

/** Collect `$path` source roots from a parsed Rojo tree. */
export function collectRojoSourceRoots(tree: unknown): string[] {
  const roots: string[] = [];

  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.$path === "string") {
          roots.push(obj.$path);
        }
        walk(obj);
      }
    }
  };

  walk(tree);
  return roots;
}

export interface RojoMappingTarget {
  /** Instance path inside the Rojo tree, e.g. ["ReplicatedStorage","Components"]. */
  treePath: string[];
  /** Filesystem target for the `$path` leaf, e.g. "src/client/ui/components". */
  target: string;
}

export interface AdditivePatch {
  /** Re-serialized text with only the documented mapping added. */
  patchedText: string;
  /** Human-readable list of additions applied. */
  additions: string[];
  /** True when the mapping was not already present (i.e. a real change). */
  changed: boolean;
}

function ensureTreeObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/**
 * Apply a single additive `$path` mapping to a parsed Rojo tree.
 *
 * Returns a deep-cloned tree with every existing key (known or unknown)
 * preserved; only the documented leaf is added/updated (EC-02).
 */
export function setRojoMapping(
  tree: Record<string, unknown>,
  mapping: RojoMappingTarget
): { tree: Record<string, unknown>; changed: boolean } {
  const clone = JSON.parse(JSON.stringify(tree)) as Record<string, unknown>;
  let node = clone;

  for (const seg of mapping.treePath.slice(0, -1)) {
    const next = node[seg];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      node[seg] = {};
    }
    node = ensureTreeObject(node[seg]);
  }

  const last = mapping.treePath[mapping.treePath.length - 1];
  if (last === undefined) {
    return { tree: clone, changed: false };
  }
  const leaf = ensureTreeObject(node[last]);
  const changed = leaf.$path !== mapping.target;
  leaf.$path = mapping.target;
  node[last] = leaf;

  return { tree: clone, changed };
}

/**
 * Build an additive patch against a raw Rojo config. The original raw text is
 * the source of truth; unknown keys and mappings remain unchanged except for
 * the documented addition (AC-06, EC-02).
 */
export function buildAdditivePatch(
  rawText: string,
  mapping: RojoMappingTarget
): AdditivePatch {
  const parsed = JSON.parse(rawText) as { tree?: Record<string, unknown> };
  const tree = ensureTreeObject(parsed.tree);
  const { tree: patchedTree, changed } = setRojoMapping(tree, mapping);

  const serialized = {
    ...parsed,
    tree: patchedTree,
  };

  return {
    patchedText: JSON.stringify(serialized, null, 2),
    additions: changed
      ? [`${mapping.treePath.join(" → ")} = $path:${mapping.target}`]
      : [],
    changed,
  };
}
