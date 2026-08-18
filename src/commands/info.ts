/**
 * `RobloxUI info <slug>` command.
 *
 * Fetches a component's metadata and prints a rich preview (name, framework,
 * category, dependencies, theme tokens, usage example) plus the exact
 * `npx robloxui add <slug>` command — so a developer can inspect a component
 * before installing it.
 */

import { fetchComponent, ApiError, NetworkError } from "../api/client";
import { logger } from "../utils/logger";

export async function runInfoCommand(slug: string): Promise<number> {
  let component;
  try {
    component = await fetchComponent(slug);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.statusCode === 404) {
        logger.error(
          `Component '${slug}' not found. Run 'npx robloxui list' to browse.`
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
    logger.error(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }

  logger.heading(`${component.name}  (${component.slug})`);

  const flavor =
    component.framework === "both"
      ? "Roblox-TS + React-Luau"
      : component.framework === "tsx"
        ? "Roblox-TS"
        : "React-Luau";

  logger.field("Framework", flavor);
  logger.field("Category", component.category);
  logger.field("Author", component.author);
  logger.field(
    "License",
    component.is_pro
      ? `Pro ($${(component.price_cents / 100).toFixed(2)})`
      : "Free"
  );

  if (component.dependencies.length > 0) {
    logger.field("Dependencies", component.dependencies.join(", "));
  }

  if (component.theme_tokens.length > 0) {
    logger.field("Theme tokens", component.theme_tokens.join(", "));
  }

  logger.field("Source", `https://robloxui.pencipta.com/components/${component.slug}`);

  logger.blank();
  logger.heading("Install");
  logger.info(`  npx robloxui add ${component.slug}`);

  if (component.usage_example) {
    logger.blank();
    logger.heading("Usage example");
    logger.dim(component.usage_example);
  }

  logger.blank();
  logger.success(`Done. Run 'npx robloxui add ${component.slug}' to install.`);
  return 0;
}
