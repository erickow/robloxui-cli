/**
 * Ordered cross-platform preflight pipeline (F04).
 *
 * Runs every required gate before any network call or write: slug, runtime,
 * flavor selection, target path safety, package-manager/tool availability,
 * optional auth, network reachability, and non-interactive input completeness.
 * Every failure is actionable and exits nonzero; preflight never mutates files
 * or manifests (AC-08, AC-13, AC-16, AC-17, EC-06, EC-16, EC-17).
 */

import * as path from "path";
import { spawnSync } from "child_process";
import {
  detectProjectProfile,
  type ProjectProfile,
  type ProfileFlavor,
} from "../detectors/detect-project";
import {
  buildCommand,
  currentPlatform,
  escapesRoot,
  SUPPORTED_NODE_RANGE,
  type Platform,
} from "./platform";

export const PREFLIGHT_FAILURE_ID = "preflight__failure";
export const PREFLIGHT_SUMMARY_ID = "preflight__summary";

export type CheckStatus = "pass" | "fail";

export interface PreflightCheck {
  id: string;
  name: string;
  status: CheckStatus;
  remediation?: string;
}

export interface PreflightResult {
  ok: boolean;
  exitCode: number;
  /** True only when every check passed — gates all writes (AC-13). */
  mutationAllowed: boolean;
  flavor?: ProfileFlavor;
  target?: string;
  checks: PreflightCheck[];
  failures: PreflightCheck[];
  summaryId: string;
  failureId: string;
}

export type ToolName = "npm" | "wally" | "mise" | "rojo";

export interface PreflightAdapters {
  detectProfile: (cwd: string) => ProjectProfile;
  isToolAvailable: (tool: ToolName) => boolean;
  hasNetwork: () => boolean;
  hasAuth: () => boolean;
  platform: Platform;
}

export interface PreflightInput {
  slug: string;
  cwd: string;
  nonInteractive: boolean;
  explicitFlavor?: ProfileFlavor;
  explicitTarget?: string;
  /** CI approval flag (e.g. `--yes`). Required when nonInteractive (f04-d02). */
  approval?: boolean;
  /** When true, auth is a hard requirement for this install. */
  requiresAuth?: boolean;
  adapters?: Partial<PreflightAdapters>;
}

const DEFAULT_COMPONENTS_PATH = "src/client/ui/components";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function defaultIsToolAvailable(tool: ToolName): boolean {
  try {
    const checkCmd = process.platform === "win32" ? "where.exe" : "which";
    const result = spawnSync(checkCmd, [tool], {
      stdio: "pipe",
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function resolveAdapters(
  adapters: Partial<PreflightAdapters> | undefined
): PreflightAdapters {
  return {
    detectProfile: adapters?.detectProfile ?? detectProjectProfile,
    isToolAvailable: adapters?.isToolAvailable ?? defaultIsToolAvailable,
    hasNetwork: adapters?.hasNetwork ?? (() => true),
    hasAuth: adapters?.hasAuth ?? (() => false),
    platform: adapters?.platform ?? currentPlatform(),
  };
}

function minNodeMajor(): number {
  const match = SUPPORTED_NODE_RANGE.match(/\d+/);
  return parseInt(match?.[0] ?? "0", 10);
}

function currentMajor(): number {
  return parseInt(process.versions.node.split(".")[0] ?? "0", 10);
}

/**
 * Execute the preflight pipeline. Pure with respect to the filesystem: it may
 * read the project profile and probe PATH, but it never writes.
 */
export function runPreflight(input: PreflightInput): PreflightResult {
  const a = resolveAdapters(input.adapters);
  const checks: PreflightCheck[] = [];

  // 1. Slug format.
  const slugOk = SLUG_RE.test(input.slug);
  checks.push({
    id: "slug",
    name: "component slug",
    status: slugOk ? "pass" : "fail",
    remediation: slugOk
      ? undefined
      : "Slug must be lowercase, alphanumeric with dashes (1-64 chars).",
  });

  // 2. Runtime compatibility (AC-17, EC-17).
  const runtimeOk = currentMajor() >= minNodeMajor();
  checks.push({
    id: "runtime",
    name: `Node.js ${SUPPORTED_NODE_RANGE}`,
    status: runtimeOk ? "pass" : "fail",
    remediation: runtimeOk
      ? undefined
      : `Upgrade Node.js to ${SUPPORTED_NODE_RANGE} (current: ${process.versions.node}).`,
  });

  // 3. Flavor selection (AC-07, EC-01, EC-04, EC-05).
  const profile = a.detectProfile(input.cwd);
  const flavor: ProfileFlavor | undefined =
    input.explicitFlavor ?? profile.flavor;
  const flavorOk = flavor !== undefined;
  checks.push({
    id: "flavor",
    name: "project flavor",
    status: flavorOk ? "pass" : "fail",
    remediation: flavorOk
      ? undefined
      : input.nonInteractive
        ? "Pass --flavor <roblox-ts|luau-wally>. Conflicting or missing project markers cannot be resolved non-interactively. Example: robloxui add button --yes --flavor roblox-ts --path src/client/ui/components"
        : "Conflicting or missing project signals. Re-run interactively to choose a flavor, or pass --flavor.",
  });

  // 4. Target path safety (EC-16).
  const targetRel = input.explicitTarget ?? DEFAULT_COMPONENTS_PATH;
  const resolvedTarget = path.resolve(input.cwd, targetRel);
  const targetSafe = !escapesRoot(resolvedTarget, path.resolve(input.cwd));
  checks.push({
    id: "target",
    name: "target path",
    status: targetSafe ? "pass" : "fail",
    remediation: targetSafe
      ? undefined
      : "Target path must stay inside the project root.",
  });

  // 5. Package-manager / tool prerequisites (AC-08, EC-06, EC-11).
  if (flavor === "roblox-ts") {
    checks.push(toolCheck(a, "npm", "Install Node.js (includes npm) or run via mise."));
  } else if (flavor === "luau-wally") {
    checks.push(
      toolCheck(a, "wally", "Install Wally via `mise install` or https://github.com/UpliftGames/wally.")
    );
  }

  // 6. Auth (when required).
  if (input.requiresAuth) {
    const authOk = a.hasAuth();
    checks.push({
      id: "auth",
      name: "authentication",
      status: authOk ? "pass" : "fail",
      remediation: authOk ? undefined : "Run `robloxui login` first.",
    });
  }

  // 7. Network reachability.
  const netOk = a.hasNetwork();
  checks.push({
    id: "network",
    name: "network",
    status: netOk ? "pass" : "fail",
    remediation: netOk ? undefined : "Check your connection and retry.",
  });

  // 8. Non-interactive completeness (f04-d02).
  if (input.nonInteractive) {
    const ciOk = input.approval === true;
    checks.push({
      id: "ci-input",
      name: "non-interactive approval",
      status: ciOk ? "pass" : "fail",
      remediation: ciOk
        ? undefined
        : "Non-interactive runs require --yes. Example: robloxui add button --yes --flavor roblox-ts --path src/client/ui/components",
    });
  }

  const failures = checks.filter((c) => c.status === "fail");
  const ok = failures.length === 0;

  return {
    ok,
    exitCode: ok ? 0 : 1,
    mutationAllowed: ok,
    flavor,
    target: targetSafe ? resolvedTarget : undefined,
    checks,
    failures,
    summaryId: PREFLIGHT_SUMMARY_ID,
    failureId: PREFLIGHT_FAILURE_ID,
  };
}

function toolCheck(
  a: PreflightAdapters,
  tool: ToolName,
  remediation: string
): PreflightCheck {
  const ok = a.isToolAvailable(tool);
  return {
    id: `tool-${tool}`,
    name: `${tool} available`,
    status: ok ? "pass" : "fail",
    remediation: ok ? undefined : remediation,
  };
}

/** Render a one-line command summary for display (argv-safe, EC-16). */
export function renderCommand(
  executable: string,
  args: string[],
  platform: Platform = currentPlatform()
): string {
  const cmd = buildCommand(executable, args, platform);
  return [cmd.executable, ...cmd.args].map((part) =>
    part.includes(" ") ? `"${part}"` : part
  ).join(" ");
}
