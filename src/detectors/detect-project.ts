/**
 * Project type detection.
 * Scans the current working directory for known config files:
 *   - rojo.json     → Roblox-TS
 *   - wally.toml    → Luau/Wally
 *   - package.json  → used as supplementary info
 *
 * If no config files are found, prompts for manual type selection.
 */

import * as fs from "fs";
import * as path from "path";
import { selectPrompt } from "../utils/prompts";
import { logger } from "../utils/logger";
import { detectRojoSourceDir } from "./detect-rojo";
import {
  inspectRojo,
  collectRojoSourceRoots,
  ROJO_FILE_NAMES,
  type RojoParseOutcome,
} from "./rojo-config";

export type ProjectType = "roblox-ts" | "luau-wally" | "manual";

export interface DetectionResult {
  type: ProjectType;
  /** The suggested install path for component files. */
  suggestedPath: string;
}

/** Names of config files to scan for. */
const ROJO_CONFIG = "rojo.json";
const ROJO_DEFAULT_CONFIG = "default.project.json";
const WALLY_CONFIG = "wally.toml";

/** Default install path for marketplace components (matches init scaffold). */
export const DEFAULT_COMPONENTS_PATH = "src/client/ui/components";

/**
 * Scan the current working directory for project config files.
 *
 * Priority:
 * 1. rojo.json → Roblox-TS
 * 2. wally.toml → Luau/Wally
 * 3. Neither → prompt manual selection
 */
export async function detectProject(cwd: string): Promise<DetectionResult> {
  const hasRojo =
    fs.existsSync(path.join(cwd, ROJO_CONFIG)) ||
    (fs.existsSync(path.join(cwd, ROJO_DEFAULT_CONFIG)) &&
      fs.existsSync(path.join(cwd, "package.json")));
  const hasWally = fs.existsSync(path.join(cwd, WALLY_CONFIG));

  if (hasRojo) {
    const rojoDir = detectRojoSourceDir(cwd);
    const suggestedPath =
      rojoDir ?? path.join(cwd, DEFAULT_COMPONENTS_PATH);
    logger.info("Detected Roblox-TS project (rojo.json)");
    return { type: "roblox-ts", suggestedPath };
  }

  if (hasWally) {
    const suggestedPath = path.join(cwd, DEFAULT_COMPONENTS_PATH);
    logger.info("Detected Luau/Wally project (wally.toml)");
    return { type: "luau-wally", suggestedPath };
  }

  // No config files found — prompt for manual selection
  logger.warn("No project config files detected (rojo.json, wally.toml).");

  const options: ProjectType[] = ["roblox-ts", "luau-wally", "manual"] as const;
  const selected = await selectPrompt("Select your project type:", options as unknown as string[]);

  const selectedType = selected as ProjectType;
  let suggestedPath: string;
  switch (selectedType) {
    case "roblox-ts":
      suggestedPath = path.join(cwd, DEFAULT_COMPONENTS_PATH);
      break;
    case "luau-wally":
      suggestedPath = path.join(cwd, DEFAULT_COMPONENTS_PATH);
      break;
    case "manual":
      suggestedPath = cwd;
      break;
    default:
      suggestedPath = cwd;
      break;
  }

  return { type: selectedType, suggestedPath };
}

// ---------------------------------------------------------------------------
// F02 — conflict-aware project profile detection (non-destructive).
// The legacy `detectProject` above is preserved for existing callers; the
// `add` command migrates onto this richer profile in F04.
// ---------------------------------------------------------------------------

/** Stable prompt ID emitted when signals conflict or are insufficient. */
export const CONFLICT_PROMPT_ID = "detect__conflict";

export type ProfileFlavor = "roblox-ts" | "luau-wally";

export interface ProjectProfile {
  cwd: string;
  /** Rojo file names present on disk (any validity). */
  rojoFiles: string[];
  wally: boolean;
  npm: boolean;
  mise: boolean;
  /** Resolved only when signals are unambiguous (AC-07). */
  flavor?: ProfileFlavor;
  /** True when present signals disagree (EC-01, EC-05). */
  conflict: boolean;
  /** True when a flavor cannot be safely inferred (AC-07, EC-04). */
  requiresChoice: boolean;
  /** Stable conflict ID surfaced to the prompt layer and tests. */
  conflictId: string;
  confidence: "high" | "low";
  sourceRoots: string[];
  rojo: RojoParseOutcome;
}

const PACKAGE_JSON = "package.json";
const MISE_TOML = "mise.toml";

function rojoFileValid(
  outcome: RojoParseOutcome,
  name: (typeof ROJO_FILE_NAMES)[number]
): boolean {
  return outcome.configs[name]?.validity === "valid";
}

/**
 * Build a complete project profile without prompting or writing. Conflicting
 * or insufficient signals never produce a silent flavor guess (AC-07, EC-01,
 * EC-04, EC-05, EC-03 for malformed configs).
 */
export function detectProjectProfile(cwd: string): ProjectProfile {
  const rojo = inspectRojo(cwd);
  const wally = fs.existsSync(path.join(cwd, WALLY_CONFIG));
  const npm = fs.existsSync(path.join(cwd, PACKAGE_JSON));
  const mise = fs.existsSync(path.join(cwd, MISE_TOML));

  const rojoJsonValid = rojoFileValid(rojo, "rojo.json");
  const defaultValid = rojoFileValid(rojo, "default.project.json");

  let flavor: ProfileFlavor | undefined;
  let conflict = false;
  let requiresChoice = false;

  if (rojo.malformed.length > 0) {
    // Malformed Rojo config — never guess; surface and require choice (EC-03).
    requiresChoice = true;
  } else if (rojo.ambiguous) {
    // Both Rojo files exist — require explicit selection (EC-01, f02-d01).
    conflict = true;
    requiresChoice = true;
  } else {
    const rojoSignal = rojoJsonValid || (defaultValid && npm);
    const wallySignal = wally;

    if (rojoSignal && wallySignal) {
      conflict = true; // EC-05: conflicting markers
      requiresChoice = true;
    } else if (rojoSignal) {
      flavor = "roblox-ts";
    } else if (wallySignal) {
      flavor = "luau-wally";
    } else {
      requiresChoice = true; // EC-04: no usable markers
    }
  }

  const sourceRoots = rojo.present
    .flatMap((name) => {
      const cfg = rojo.configs[name];
      const tree = (cfg?.parsedTree as { tree?: unknown } | null)?.tree;
      return tree ? collectRojoSourceRoots(tree) : [];
    })
    .filter((value, index, arr) => arr.indexOf(value) === index);

  const needsPrompt = conflict || requiresChoice;

  return {
    cwd,
    rojoFiles: rojo.present,
    wally,
    npm,
    mise,
    flavor,
    conflict,
    requiresChoice,
    conflictId: needsPrompt ? CONFLICT_PROMPT_ID : "",
    confidence: flavor ? "high" : "low",
    sourceRoots,
    rojo,
  };
}

/**
 * Resolve a flavor for a profile, prompting only when the profile is
 * ambiguous. Callers may inject a `choose` function for testing.
 */
export async function resolveProfileFlavor(
  profile: ProjectProfile,
  choose?: (profile: ProjectProfile) => Promise<ProfileFlavor>
): Promise<ProfileFlavor> {
  if (profile.flavor) {
    return profile.flavor;
  }
  if (choose) {
    return choose(profile);
  }
  const selected = await selectPrompt<ProfileFlavor>(
    "Conflicting project signals detected. Choose your flavor:",
    ["roblox-ts", "luau-wally"],
    { id: profile.conflictId || CONFLICT_PROMPT_ID }
  );
  return selected;
}
