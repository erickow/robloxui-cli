/**
 * Luau/Wally theme installer.
 *
 * The RobloxUI theme is not published to Wally. For Luau projects the CLI
 * vendors the bundled theme directly into `Packages/<alias>/init.lua`, so no
 * `wally.toml` dependency and no `wally install` are required for the theme.
 */

import { logger } from "../utils/logger";
import { WALLY_THEME_ALIAS } from "../constants/theme";
import { vendorWallyTheme, wallyThemeIsInstalled } from "./theme-vendor";

/**
 * Ensure the bundled RobloxUI theme is present in a Luau project. Vendors the
 * bundled theme into `Packages/RuiTheme/` when it is missing. Idempotent.
 *
 * Returns true on success, false on failure.
 */
export function installWallyTheme(cwd: string): boolean {
  if (wallyThemeIsInstalled(cwd)) {
    logger.success(`${WALLY_THEME_ALIAS} already present.`);
    return true;
  }

  logger.info(`Vendoring bundled ${WALLY_THEME_ALIAS}...`);
  if (vendorWallyTheme(cwd)) {
    return true;
  }

  logger.warn(
    `Could not vendor ${WALLY_THEME_ALIAS} — bundled theme assets not found in the CLI package.`
  );
  return false;
}
