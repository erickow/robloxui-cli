/**
 * `RobloxUI list` / `RobloxUI search <query>` command.
 *
 * Queries the RobloxUI API for available components and prints a compact
 * table: slug | name | framework | category. Lets developers discover
 * component slugs from the terminal before running `add`.
 */

import { listComponents } from "../api/client";
import { ApiError, NetworkError } from "../api/client";
import { logger } from "../utils/logger";

/**
 * @param query  Optional free-text search term.
 * @param opts   Optional filters (framework, category, limit).
 */
export async function runListCommand(
  query?: string,
  opts: { framework?: string; category?: string; limit?: number } = {}
): Promise<number> {
  const limit = Math.min(opts.limit ?? 30, 100);

  try {
    const result = await listComponents({
      search: query,
      framework: opts.framework,
      category: opts.category,
      limit,
    });

    logger.heading(
      query
        ? `Search results for "${query}"`
        : "RobloxUI components"
    );

    if (result.components.length === 0) {
      logger.warn("No components found. Browse at https://robloxui.pencipta.com");
      return 0;
    }

    const rows = result.components.map((c) => ({
      slug: c.slug,
      name: c.name,
      framework:
        c.framework === "both" ? "tsx+luau" : c.framework,
      category: c.category,
    }));

    // Column widths
    const wSlug = Math.max(4, ...rows.map((r) => r.slug.length));
    const wName = Math.max(4, ...rows.map((r) => r.name.length));
    const wFrame = Math.max(9, ...rows.map((r) => r.framework.length));
    const wCat = Math.max(8, ...rows.map((r) => r.category.length));

    const fmtRow = (s: string, n: string, f: string, c: string) =>
      `  ${s.padEnd(wSlug)}  ${n.padEnd(wName)}  ${f.padEnd(wFrame)}  ${c.padEnd(wCat)}`;

    logger.dim(
      fmtRow("SLUG", "NAME", "FRAMEWORK", "CATEGORY")
    );
    logger.dim(
      `  ${"-".repeat(wSlug)}  ${"-".repeat(wName)}  ${"-".repeat(wFrame)}  ${"-".repeat(wCat)}`
    );
    for (const r of rows) {
      console.log(fmtRow(r.slug, r.name, r.framework, r.category));
    }

    logger.blank();
    logger.info(
      `Showing ${result.components.length} of ${result.total} components.`
    );
    logger.info("Install any with: npx robloxui add <slug>");
    logger.dim("Browse visually at https://robloxui.pencipta.com");
    return 0;
  } catch (err) {
    if (err instanceof NetworkError || err instanceof ApiError) {
      logger.error(err.message);
      return 1;
    }
    logger.error(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}
