/**
 * Rojo / package-manager configuration validation (F03).
 *
 * Pure functions — no FS access. Callers pass raw text. A malformed config
 * never reaches mutation: validation stops before writes (AC-05, EC-03).
 */

export type Flavor = "roblox-ts" | "luau-wally";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function getAtPath(
  tree: Record<string, unknown>,
  atPath: string[]
): unknown {
  let node: unknown = tree;
  for (const seg of atPath) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[seg];
  }
  return node;
}

interface RojoLike {
  tree?: Record<string, unknown>;
}

/** True when raw text parses as JSON (no schema requirements). */
export function validateJsonParse(raw: string): ValidationResult {
  try {
    JSON.parse(raw);
    return { valid: true, errors: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`JSON parse error: ${msg}`] };
  }
}

/** Validate raw text parses as JSON and (optionally) contains a tree. */
export function validateRojoJson(raw: string): ValidationResult {
  const errors: string[] = [];
  let parsed: RojoLike;
  try {
    parsed = JSON.parse(raw) as RojoLike;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`Rojo config is not valid JSON: ${msg}`] };
  }
  if (parsed.tree === undefined) {
    errors.push("Rojo config is missing a `tree` mapping.");
  } else if (
    typeof parsed.tree !== "object" ||
    parsed.tree === null ||
    Array.isArray(parsed.tree)
  ) {
    errors.push("Rojo config `tree` must be an object.");
  }
  return { valid: errors.length === 0, errors };
}

/** Required Rojo `$path` mappings per flavor (instance path -> filesystem). */
export const REQUIRED_ROJO_MAPPINGS: Record<
  Flavor,
  { atPath: string[]; target: string }[]
> = {
  "roblox-ts": [
    {
      atPath: [
        "ReplicatedStorage",
        "rbxts_include",
        "node_modules",
        "@rbxts",
      ],
      target: "node_modules/@rbxts",
    },
    {
      atPath: ["StarterPlayer", "StarterPlayerScripts", "TS"],
      target: "out/client",
    },
  ],
  "luau-wally": [
    {
      atPath: ["ReplicatedStorage", "Packages"],
      target: "Packages",
    },
    {
      atPath: ["StarterPlayer", "StarterPlayerScripts", "Client"],
      target: "src/client",
    },
  ],
};

/** Validate that a parsed Rojo tree contains every required flavor mapping. */
export function validateRojoMappings(
  raw: string,
  flavor: Flavor
): ValidationResult {
  const base = validateRojoJson(raw);
  if (!base.valid) return base;

  const parsed = JSON.parse(raw) as { tree?: Record<string, unknown> };
  const tree = parsed.tree;
  const errors: string[] = [];

  if (typeof tree === "object" && tree !== null && !Array.isArray(tree)) {
    for (const required of REQUIRED_ROJO_MAPPINGS[flavor]) {
      const node = getAtPath(tree as Record<string, unknown>, required.atPath);
      const target =
        typeof node === "object" && node !== null && !Array.isArray(node)
          ? (node as Record<string, unknown>).$path
          : undefined;
      if (target !== required.target) {
        errors.push(
          `Missing Rojo mapping ${required.atPath.join(".")} -> ${required.target}` +
            (target ? ` (found: ${String(target)})` : "")
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a package.json is structurally usable. The RobloxUI theme is
 * optional, so its dependency is not required.
 */
export function validatePackageJson(raw: string, _flavor: Flavor): ValidationResult {
  const errors: string[] = [];
  try {
    JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`package.json is not valid JSON: ${msg}`] };
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a wally.toml is structurally usable. The theme is not a Wally
 * dependency anymore (the CLI vendors it), so presence of a `[package]`
 * header is sufficient.
 */
export function validateWallyToml(raw: string): ValidationResult {
  const errors: string[] = [];
  if (!/^\[package\]\s*$/m.test(raw)) {
    errors.push("wally.toml missing a `[package]` section");
  }
  return { valid: errors.length === 0, errors };
}
