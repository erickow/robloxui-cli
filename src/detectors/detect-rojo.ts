/**
 * Detects the source directory from a rojo.json project file.
 */

import * as fs from "fs";
import * as path from "path";

interface RojoConfig {
  name?: string;
  tree?: Record<string, unknown>;
  servePlaceIds?: number[];
  servePort?: number;
}

/**
 * Read and parse rojo.json from the project root.
 * Returns the parsed config or null if the file doesn't exist or is invalid.
 */
export function readRojoConfig(cwd: string): RojoConfig | null {
  for (const fileName of ["rojo.json", "default.project.json"]) {
    const rojoPath = path.join(cwd, fileName);

    if (!fs.existsSync(rojoPath)) {
      continue;
    }

    try {
      const raw = fs.readFileSync(rojoPath, "utf-8");
      const config = JSON.parse(raw) as RojoConfig;
      return config;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Find a reasonable default source directory from the rojo.json config.
 * Walks the `tree` object looking for a "src" key and returns
 * a best-guess path like "src/client/ui/components".
 *
 * If rojo.json doesn't exist or can't be parsed, returns null.
 */
export function detectRojoSourceDir(cwd: string): string | null {
  const config = readRojoConfig(cwd);

  if (!config?.tree) {
    return null;
  }

  // Common Rojo tree patterns for Roblox-TS projects.
  // Try to find the deepest "src" path in the tree.
  const candidates = collectRojoPaths(config.tree, "");

  // Look for common UI component directories
  const preferredPaths = [
    "src/client/ui/components",
    "src/client/components",
    "src/shared/components",
    "src/components",
  ];

  for (const preferred of preferredPaths) {
    if (candidates.some((c) => c.startsWith(preferred) || preferred.startsWith(c))) {
      return path.join(cwd, preferred);
    }
  }

  // Fallback: use the first "src" path found
  const srcCandidate = candidates.find((c) => c.startsWith("src"));
  if (srcCandidate) {
    return path.join(cwd, srcCandidate);
  }

  // Last resort default
  return path.join(cwd, "src", "client", "ui", "components");
}

/**
 * Recursively collect all paths from the rojo tree.
 */
function collectRojoPaths(
  tree: Record<string, unknown>,
  prefix: string
): string[] {
  const paths: string[] = [];

  for (const [key, value] of Object.entries(tree)) {
    const currentPath = prefix ? `${prefix}/${key}` : key;

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const node = value as Record<string, unknown>;

      // If the node has a "$path" property, it's a Rojo instance reference
      if ("$path" in node && typeof node.$path === "string") {
        paths.push(node.$path);
      } else if ("$className" in node) {
        // It's a Rojo instance — may have children
        paths.push(currentPath);
        // Recurse into children if any
        const children = Object.entries(node).filter(
          ([k]) => !k.startsWith("$")
        );
        if (children.length > 0) {
          const childObj: Record<string, unknown> = {};
          for (const [ck, cv] of children) {
            childObj[ck] = cv;
          }
          paths.push(...collectRojoPaths(childObj, currentPath));
        }
      } else {
        // Plain directory node — recurse
        paths.push(currentPath);
        paths.push(...collectRojoPaths(node, currentPath));
      }
    }
  }

  return paths;
}
