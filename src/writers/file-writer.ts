/**
 * File writer — writes component source files to the target directory.
 * Handles conflict detection and prompts for overwrite confirmation (EC-13).
 *
 * Supports two payload shapes:
 *  1. Multi-file:  `tsx_source_files` / `luau_source_files` arrays of
 *     { path, code }. Each entry is written to its repo-relative `path`,
 *     preserving subdirectories (e.g. "ChatSystem/ChatWindow.luau").
 *  2. Single-file (legacy): `tsx_source_code` / `luau_source_code` strings
 *     written as `{slug}.tsx` / `{slug}.luau`.
 */

import * as fs from "fs";
import * as path from "path";
import { confirmPrompt } from "../utils/prompts";
import { logger } from "../utils/logger";
import type { ComponentResponse, SourceFile } from "../api/types";

export interface WriteOptions {
  /** Overwrite existing files without prompting. */
  force?: boolean;
}

export interface WriteResult {
  filesWritten: string[];
  filesSkipped: string[];
}

/** Files whose `path` escapes the install root via ".." — refused for safety. */
function isPathSafe(relativePath: string): boolean {
  const normalized = path.normalize(relativePath).replace(/^([a-zA-Z]:)?[\\/]+/, "");
  return !normalized.startsWith("..") && !path.isAbsolute(relativePath);
}

/** Sanitize a repo-relative path and join it under the install root. */
export function resolveUnder(root: string, relativePath: string): string {
  const clean = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return path.join(root, ...clean.split("/"));
}

async function writeOne(
  filePath: string,
  content: string,
  options: WriteOptions,
  result: WriteResult
): Promise<void> {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(filePath)) {
    if (options.force) {
      fs.writeFileSync(filePath, content, "utf-8");
      result.filesWritten.push(filePath);
      logger.success(`Overwrote: ${filePath}`);
      return;
    }

    logger.warn(`File already exists: ${filePath}`);
    const shouldOverwrite = await confirmPrompt("Overwrite?", false);
    if (shouldOverwrite) {
      fs.writeFileSync(filePath, content, "utf-8");
      result.filesWritten.push(filePath);
      logger.success(`Overwrote: ${filePath}`);
    } else {
      result.filesSkipped.push(filePath);
      logger.info(`Skipped: ${filePath}`);
    }
    return;
  }

  fs.writeFileSync(filePath, content, "utf-8");
  result.filesWritten.push(filePath);
  logger.success(`Wrote: ${filePath}`);
}

export interface PlannedFile {
  relPath: string;
  content: string;
}

/**
 * Plan every file that would be written for a component — without touching
 * disk. Multi-file payloads take precedence over single-string legacy fields;
 * unsafe (path-traversal) entries are rejected (F07 staging, EC-16).
 */
export function planComponentWrites(component: ComponentResponse): PlannedFile[] {
  const planned: PlannedFile[] = [];

  const addMulti = (files: SourceFile[] | null | undefined) => {
    if (!files || files.length === 0) return;
    for (const f of files) {
      if (!f || typeof f.path !== "string" || typeof f.code !== "string") continue;
      if (!isPathSafe(f.path)) {
        logger.warn(`Skipping unsafe path: ${f.path}`);
        continue;
      }
      planned.push({ relPath: f.path, content: f.code });
    }
  };

  if (component.framework === "tsx" || component.framework === "both") {
    addMulti(component.tsx_source_files);
  }
  if (component.framework === "luau" || component.framework === "both") {
    addMulti(component.luau_source_files);
  }

  // Fall back to single-string legacy payloads.
  if (planned.length === 0) {
    if (
      component.tsx_source_code &&
      (component.framework === "tsx" || component.framework === "both")
    ) {
      planned.push({ relPath: `${component.slug}.tsx`, content: component.tsx_source_code });
    }
    if (
      component.luau_source_code &&
      (component.framework === "luau" || component.framework === "both")
    ) {
      planned.push({ relPath: `${component.slug}.luau`, content: component.luau_source_code });
    }
  }

  // Last resort: usage example.
  if (planned.length === 0 && component.usage_example) {
    const ext = component.framework === "luau" ? "luau" : "tsx";
    planned.push({ relPath: `${component.slug}.${ext}`, content: component.usage_example });
  }

  return planned;
}

/** Resolve planned files under a target dir and flag existing ones as conflicts. */
export function detectConflicts(
  planned: PlannedFile[],
  targetDir: string
): { resolved: string[]; conflicts: string[] } {
  const resolved: string[] = [];
  const conflicts: string[] = [];
  for (const file of planned) {
    const full = resolveUnder(targetDir, file.relPath);
    resolved.push(full);
    if (fs.existsSync(full)) {
      conflicts.push(full);
    }
  }
  return { resolved, conflicts };
}

/**
 * Write the component's source files to the target directory.
 *
 * For "both" framework components, writes both .tsx and .luau payloads.
 * Multi-file payloads take precedence over single-string legacy fields.
 */
export async function writeComponentFiles(
  component: ComponentResponse,
  targetDir: string,
  options: WriteOptions = {}
): Promise<WriteResult> {
  const result: WriteResult = { filesWritten: [], filesSkipped: [] };

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    logger.info(`Created directory: ${targetDir}`);
  }

  const planned = planComponentWrites(component);

  for (const file of planned) {
    const full = resolveUnder(targetDir, file.relPath);
    await writeOne(full, file.content, options, result);
  }

  return result;
}
