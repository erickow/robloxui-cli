/**
 * Post-scaffold setup: dependencies, theme fallbacks, compile, place file, Rojo plugin.
 */

import { installNpmDependencies } from "../installers/npm-installer";
import { installWallyTheme } from "../installers/wally-installer";
import {
  npmThemeIsInstalled,
  vendorNpmTheme,
} from "../installers/theme-vendor";
import { logger } from "../utils/logger";
import {
  buildPlaceFile,
  installRojoPlugin,
  rojoIsAvailable,
  runRbxtsc,
} from "../utils/toolchain";
import { defaultMiseRunner, runMiseInstall } from "./mise-adapter";
import type { InitFlavor } from "../commands/init";

export interface PostInitResult {
  depsInstalled: boolean;
  themeInstalled: boolean;
  compiled: boolean;
  placeBuilt: boolean;
  pluginInstalled: boolean;
}

export function runPostInitSetup(
  projectDir: string,
  flavor: InitFlavor,
  options: { skipInstall?: boolean; noBootstrap?: boolean; theme?: boolean } = {}
): PostInitResult {
  const result: PostInitResult = {
    depsInstalled: false,
    themeInstalled: false,
    compiled: false,
    placeBuilt: false,
    pluginInstalled: false,
  };

  if (options.skipInstall) {
    return result;
  }

  const includeTheme = options.theme === true;
  if (!includeTheme) {
    logger.info(
      "Theme skipped — components ship their own design tokens. Install later with: npm install robloxui"
    );
  }

  logger.blank();
  logger.heading("Setting up project");

  runMiseInstall(projectDir, defaultMiseRunner, { bootstrap: !options.noBootstrap });

  if (flavor === "roblox-ts") {
    result.depsInstalled = installNpmDependencies(projectDir);

    if (includeTheme) {
      if (!npmThemeIsInstalled(projectDir)) {
        logger.info("npm theme missing — vendoring bundled robloxui/theme...");
        result.themeInstalled = vendorNpmTheme(projectDir);
      } else {
        result.themeInstalled = true;
      }
    }

    if (result.depsInstalled || (includeTheme && npmThemeIsInstalled(projectDir))) {
      result.compiled = runRbxtsc(projectDir);
    }
  } else {
    result.depsInstalled = true;
    result.themeInstalled = includeTheme ? installWallyTheme(projectDir) : false;
  }

  if (rojoIsAvailable(projectDir)) {
    result.pluginInstalled = installRojoPlugin(projectDir);

    const projectFile =
      flavor === "roblox-ts" ? "default.project.json" : "default.project.json";
    const canBuildPlace = flavor === "luau-wally" || result.compiled;
    if (canBuildPlace) {
      result.placeBuilt = buildPlaceFile(projectDir, projectFile);
    }
  } else {
    logger.warn("Rojo not available — skipped plugin install and game.rbxl build.");
  }

  return result;
}

export function printReadySummary(
  flavor: InitFlavor,
  projectDir: string,
  result: PostInitResult
): void {
  logger.blank();
  logger.heading("Ready to open in Roblox Studio");

  if (result.placeBuilt) {
    logger.info("  1. Open game.rbxl in Roblox Studio (in your project folder)");
    logger.info("  2. Start development: npm run dev");
    logger.info("  3. Rojo plugin → Connect → press Play");
  } else {
    logger.info("  1. Open any Studio place (or run npm run build:place)");
    logger.info("  2. Start development: npm run dev");
    logger.info("  3. Rojo plugin → Connect → press Play");
  }

  if (!result.pluginInstalled) {
    logger.info("  Plugin: run `mise exec -- rojo plugin install` once if Rojo is not in Studio.");
  }

  logger.blank();
  logger.info("Add marketplace components: npx robloxui add <slug>");
}
