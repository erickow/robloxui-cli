/**
 * `RobloxUI add <slug>` command handler.
 *
 * Orchestrates the full "add component" workflow:
 * 1. Detect project type
 * 2. Prompt for install path confirmation
 * 3. Fetch component from the RobloxUI API (authenticated if logged in)
 * 4. Write source files to the target directory
 * 5. Install the appropriate theme package
 * 6. Print success summary with import instructions
 *
 * Grid of exits:
 *   - 0: Success
 *   - 1: Error (invalid slug, network error, API error, entitlement)
 *   - 2: Not logged in (login required for downloads)
 */

import * as path from "path";
import { detectProject } from "../detectors/detect-project";
import {
  fetchComponent,
  installComponent,
  ApiError,
  NetworkError,
  UnauthenticatedError,
  DailyLimitError,
  ProRequiredError,
} from "../api/client";
import { writeComponentFiles } from "../writers/file-writer";
import {
  validatePayload,
  beginTransaction,
  stageComponent,
  commitTransaction,
  rollbackTransaction,
  hasBlockingConflicts,
  INSTALL_CONFLICTS_ID,
  INSTALL_SUCCESS_ID,
} from "../writers/transaction";
import { installCanonicalNpmTheme } from "../installers/npm-theme-installer";
import { vendorWallyTheme } from "../installers/theme-vendor";
import { confirmPrompt, pathPrompt } from "../utils/prompts";
import { logger } from "../utils/logger";
import { getAuthToken } from "../utils/config";
import {
  runPreflight,
  PREFLIGHT_FAILURE_ID,
  PREFLIGHT_SUMMARY_ID,
} from "../preflight/run-preflight";
import { currentPlatform } from "../preflight/platform";
import type { ComponentResponse } from "../api/types";

/**
 * Run the `add` command.
 *
 * @param slug - The component slug to install
 * @param cwd - The current working directory (usually process.cwd())
 * @param options - Optional overrides (used in tests)
 */
export async function runAddCommand(
  slug: string,
  cwd: string,
  options?: {
    /** Skip interactive prompts (auto-confirm defaults). */
    nonInteractive?: boolean;
    /** Force overwrite existing files without prompting. */
    force?: boolean;
    /** Override the install directory (resolved against cwd). */
    path?: string;
    /** Explicit project flavor (required for non-interactive conflicting projects). */
    flavor?: "roblox-ts" | "luau-wally";
    /**
     * Install the RobloxUI theme alongside the component. Explicit true/false
     * (--theme / --no-theme) wins; interactive runs prompt; non-interactive
     * runs default to skipping it. Components ship their own tokens, so the
     * canonical theme is optional.
     */
    theme?: boolean;
  }
): Promise<number> {
  // ---- 1. Detect project type ----
  logger.heading(`RobloxUI — adding component "${slug}"`);

  const detection = await detectProject(cwd);

  // Allow an explicit --path override (resolved against cwd).
  if (options?.path) {
    detection.suggestedPath = path.resolve(cwd, options.path);
  }

  // Theme is optional: explicit --theme/--no-theme wins, interactive runs
  // prompt, non-interactive runs skip it. Components embed their own design
  // tokens, so they work without the canonical theme package.
  let includeTheme: boolean;
  if (typeof options?.theme === "boolean") {
    includeTheme = options.theme;
  } else if (options?.nonInteractive) {
    includeTheme = false;
  } else {
    includeTheme = await confirmPrompt(
      "Also install the RobloxUI theme (robloxui/theme)?",
      false
    );
  }

  if (!options?.nonInteractive && !options?.path) {
    const confirmed = await confirmPrompt(
      `Install to ${detection.suggestedPath}?`,
      true
    );
    if (!confirmed) {
      const customPath = await pathPrompt(
        "Enter install path",
        detection.suggestedPath
      );
      detection.suggestedPath = path.resolve(cwd, customPath);
    }
  }

  // ---- 1b. Preflight gate (F04) ----
  // Run deterministic checks before any network call or write. Any failure
  // exits nonzero with an actionable remediation and mutates nothing (AC-08,
  // AC-13).
  const explicitFlavor =
    options?.flavor ??
    (detection.type === "roblox-ts" || detection.type === "luau-wally"
      ? detection.type
      : undefined);
  const preflight = runPreflight({
    slug,
    cwd,
    nonInteractive: !!options?.nonInteractive,
    explicitFlavor,
    explicitTarget: detection.suggestedPath,
    approval: !!options?.nonInteractive,
    adapters: { platform: currentPlatform() },
  });
  if (!preflight.ok) {
    logger.error(
      `[${PREFLIGHT_FAILURE_ID}] Preflight failed — no files or manifests were changed.`
    );
    for (const failure of preflight.failures) {
      logger.warn(`  - ${failure.name}: ${failure.remediation ?? "unspecified"}`);
    }
    return preflight.exitCode;
  }
  logger.info(
    `[${PREFLIGHT_SUMMARY_ID}] flavor=${preflight.flavor} target=${preflight.target}`
  );

  // ---- 2. Fetch component from API ----
  // Authenticated path → uses /cli/install which enforces entitlement + limit
  // and logs the download for creator revenue attribution.
  // Anonymous path → falls back to the public /components/[slug] endpoint
  // (Pro source code is stripped server-side).
  const token = getAuthToken();
  let component: ComponentResponse;
  try {
    if (token) {
      component = await installComponent(slug, token);
    } else {
      component = await fetchComponent(slug);
    }
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      logger.error(err.message);
      logger.info("Run `robloxui login` to authenticate.");
      return 2;
    }
    if (err instanceof DailyLimitError) {
      logger.error(
        `You've hit today's free limit (${err.used}/${err.limit} downloads).`
      );
      logger.info(`Upgrade to Pro for unlimited downloads: ${err.upgradeUrl}`);
      return 1;
    }
    if (err instanceof ProRequiredError) {
      logger.error(
        `"${err.componentName}" is a Pro component. Subscribe to Pro to install it.`
      );
      logger.info(`  ${err.upgradeUrl}`);
      return 1;
    }
    if (err instanceof ApiError) {
      // 404 or other API error
      if (err.statusCode === 404) {
        logger.error(
          `Component '${slug}' not found. Browse available components at https://robloxui.pencipta.com`
        );
      } else {
        logger.error(err.message);
      }
      return 1;
    }
    if (err instanceof NetworkError) {
      logger.error(err.message);
      return 1;
    }
    logger.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // If the user tried to install a Pro component without auth/entitlement,
  // the API returns the component with source code stripped. Catch that here
  // with a clear hint rather than writing empty files.
  if (component.is_pro && !component.tsx_source_code && !component.luau_source_code) {
    logger.error(`"${component.name}" is a Pro component.`);
    if (!token) {
      logger.info("Run `robloxui login` first, then re-run this command.");
    } else {
      logger.info("Subscribe to Pro to install it: https://robloxui.pencipta.com/pricing");
    }
    return 1;
  }

  // ---- 3. Validate payload + write files transactionally (F07) ----
  const payloadCheck = validatePayload(component);
  if (!payloadCheck.valid) {
    logger.error("Component payload is incomplete or incompatible (EC-13):");
    for (const e of payloadCheck.errors) {
      logger.warn(`  - ${e}`);
    }
    return 1;
  }

  let installPath = detection.suggestedPath;

  // For manual projects, create a subdirectory named after the component
  if (detection.type === "manual") {
    installPath = path.join(installPath, component.slug);
  }

  // Non-interactive runs use the staging/commit/rollback transaction so that
  // conflicts never overwrite without --force (f07-d02) and theme failure
  // rolls back newly-created component files (AC-14, EC-15). Interactive runs
  // keep the per-file confirm UX via writeComponentFiles.
  let themeRollbackTx: ReturnType<typeof beginTransaction> | null = null;

  if (options?.nonInteractive) {
    const tx = beginTransaction(cwd, installPath);
    stageComponent(tx, component);

    if (hasBlockingConflicts(tx, !!options?.force)) {
      logger.error(
        `[${INSTALL_CONFLICTS_ID}] Conflicting files — re-run with --force to overwrite.`
      );
      for (const p of tx.conflicts) {
        logger.warn(`  - ${p}`);
      }
      return 1;
    }

    const commitResult = commitTransaction(tx);
    if (!commitResult.ok) {
      rollbackTransaction(tx);
      logger.error(`Failed to write component files: ${commitResult.error}`);
      return 1;
    }
    themeRollbackTx = tx;
  } else {
    const writeResult = await writeComponentFiles(component, installPath, {
      force: options?.force,
    });
    if (writeResult.filesWritten.length === 0 && writeResult.filesSkipped.length > 0) {
      logger.warn("All files skipped. No changes were made.");
      return 0;
    }
  }

  // ---- 4. Install theme package (optional) ----
  let themeInstalled = false;
  if (!includeTheme) {
    logger.info(
      "Theme skipped — components ship their own design tokens. Install later with: npm install robloxui"
    );
  } else if (detection.type === "roblox-ts") {
    const themeResult = installCanonicalNpmTheme(cwd);
    themeInstalled = themeResult.status === "installed";
    if (themeResult.version) {
      logger.field("Theme", `${themeResult.package}@${themeResult.version}`);
    }
    if (!themeInstalled && themeRollbackTx) {
      rollbackTransaction(themeRollbackTx);
      logger.error("Theme installation failed; newly-created component files were rolled back.");
      return 1;
    }
  } else if (detection.type === "luau-wally") {
    themeInstalled = vendorWallyTheme(cwd);
    logger.field("Theme", "bundled RuiTheme (Packages/RuiTheme/init.lua)");
    if (!themeInstalled && themeRollbackTx) {
      rollbackTransaction(themeRollbackTx);
      logger.error("Theme installation failed; newly-created component files were rolled back.");
      return 1;
    }
  }

  // ---- 5. Print success summary ----
  logger.heading("Installation Summary");
  logger.field("Component", component.name);
  logger.field("Framework", component.framework);
  logger.field("Install path", installPath);

  logger.blank();

  if (themeInstalled) {
    logger.success("Theme package installed.");
  } else if (includeTheme && (detection.type === "roblox-ts" || detection.type === "luau-wally")) {
    logger.warn("Theme package not installed. See instructions above.");
  }

  logger.blank();
  logger.heading("Import Instructions");

  if (component.tsx_source_code) {
    const tsxFileName = `${component.slug}.tsx`;
    logger.info(`TSX: import { ${component.name} } from "./components/${tsxFileName.replace(".tsx", "")}";`);
  }

  if (component.luau_source_code) {
    const luauFileName = `${component.slug}.luau`;
    logger.info(`Luau: local ${component.name} = require(script.Parent.${luauFileName.replace(".luau", "")})`);
  }

  logger.blank();
  if (component.usage_example) {
    logger.info("Usage example:");
    logger.dim(component.usage_example);
    logger.blank();
  }

  logger.success(`Done! Component "${component.name}" added to your project.`);
  return 0;
}
