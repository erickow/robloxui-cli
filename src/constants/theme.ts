/**
 * Shared theme package identifiers for npm and Wally installers.
 *
 * Keep in sync with `packages/theme/` and `src/lib/cli-info.ts`.
 */

export const THEME_VERSION = "0.1.0";

/**
 * The theme is bundled inside the `robloxui` npm package and exposed as the
 * `robloxui/theme` subpath. Consumers `npm install robloxui` and reach the
 * theme via `import { theme } from "robloxui/theme"`.
 */
export const NPM_THEME_PACKAGE = "robloxui";

/** Import specifier / canonical npm theme contract. */
export const THEME_IMPORT = `${NPM_THEME_PACKAGE}/theme`;

/** Published `robloxui` version that ships the theme subpath. */
export const NPM_THEME_VERSION = "0.2.5";

/**
 * The theme is NOT published to Wally. For Luau/Wally projects the CLI vendors
 * the bundled theme into `Packages/<alias>/init.lua`; the alias keeps the
 * `require(ReplicatedStorage.Packages.RuiTheme)` import contract.
 */
export const WALLY_THEME_ALIAS = "RuiTheme";

/** Default Wally registry (UpliftGames index). */
export const WALLY_REGISTRY = "https://github.com/UpliftGames/wally-index";
