/**
 * Filesystem transaction journal for component installation (F07).
 *
 * Component payloads are validated and staged before a single byte is written
 * (decision f07-d01). Conflicts default to STOP and list (decision f07-d02,
 * AC-12, EC-12). Commit is the only write boundary. On failure or cancellation,
 * rollback restores manifests from their pre-install snapshot and removes
 * newly-created safe artifacts; anything that cannot be safely restored is
 * listed explicitly (AC-14, EC-14, EC-15, EC-18, EC-20).
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";
import {
  planComponentWrites,
  resolveUnder,
  type PlannedFile,
} from "./file-writer";
import type { ComponentResponse } from "../api/types";

/** Stable output IDs (F07 UI contract). */
export const INSTALL_CONFLICTS_ID = "install__conflicts";
export const INSTALL_SUCCESS_ID = "install__success";

const MANIFEST_FILES = ["package.json", "wally.toml"];

export interface PayloadValidation {
  valid: boolean;
  errors: string[];
}

/** Reject incomplete / incompatible component payloads before staging (EC-13). */
export function validatePayload(component: ComponentResponse): PayloadValidation {
  const errors: string[] = [];
  if (!component || typeof component.slug !== "string" || component.slug.length === 0) {
    errors.push("Component payload is missing required field: slug.");
  }
  if (
    typeof component.framework !== "string" ||
    !["tsx", "luau", "both"].includes(component.framework)
  ) {
    errors.push(`Component payload has invalid framework: ${String(component.framework)}.`);
  }
  const planned = planComponentWrites(component);
  if (planned.length === 0) {
    errors.push("Component payload has no usable source files.");
  }
  return { valid: errors.length === 0, errors };
}

export interface StagedFile {
  /** Absolute destination path. */
  path: string;
  content: string;
  existedBefore: boolean;
  priorContent: string | null;
}

export interface ManifestSnapshot {
  path: string;
  /** Content before the transaction; null when the manifest did not exist. */
  content: string | null;
}

export interface InstallTransaction {
  cwd: string;
  targetDir: string;
  stagedFiles: StagedFile[];
  conflicts: string[];
  manifestSnapshots: ManifestSnapshot[];
  committed: boolean;
}

export interface RollbackResult {
  restored: string[];
  removed: string[];
  /** Files that could not be safely restored (AC-14). */
  unsafe: string[];
}

function readSnapshot(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Snapshot project manifests and open a transaction. */
export function beginTransaction(cwd: string, targetDir: string): InstallTransaction {
  const manifestSnapshots = MANIFEST_FILES.map((name) => {
    const p = path.join(cwd, name);
    return { path: p, content: readSnapshot(p) };
  });

  return {
    cwd,
    targetDir,
    stagedFiles: [],
    conflicts: [],
    manifestSnapshots,
    committed: false,
  };
}

/**
 * Stage a component's files into the transaction (no writes). Returns the
 * conflicts (existing files) so the caller can stop-and-list by default.
 */
export function stageComponent(
  tx: InstallTransaction,
  component: ComponentResponse
): { conflicts: string[] } {
  const planned = planComponentWrites(component);
  const conflicts: string[] = [];

  for (const file of planned) {
    const full = resolveUnder(tx.targetDir, file.relPath);
    const existedBefore = fs.existsSync(full);
    const priorContent = existedBefore ? readSnapshot(full) : null;
    if (existedBefore) {
      conflicts.push(full);
    }
    tx.stagedFiles.push({ path: full, content: file.content, existedBefore, priorContent });
  }

  tx.conflicts = conflicts;
  return { conflicts };
}

/**
 * Commit every staged file atomically. If any write fails, the files written
 * so far are rolled back and `ok` is false (AC-14).
 */
export function commitTransaction(tx: InstallTransaction): { ok: boolean; error?: string } {
  const written: string[] = [];
  try {
    for (const file of tx.stagedFiles) {
      const dir = path.dirname(file.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(file.path, file.content, "utf-8");
      written.push(file.path);
    }
    tx.committed = true;
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Roll back the partial writes within this commit attempt.
    for (const p of written) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* best-effort */
      }
    }
    tx.committed = false;
    return { ok: false, error };
  }
}

/**
 * Restore manifests from their pre-install snapshot and remove newly-created
 * component artifacts. Files the caller declares unsafe-to-restore (e.g. a
 * lockfile rewritten by the package manager) are listed, never touched.
 */
export function rollbackTransaction(
  tx: InstallTransaction,
  options?: { unsafePaths?: string[] }
): RollbackResult {
  const restored: string[] = [];
  const removed: string[] = [];
  const unsafe: string[] = [];
  const unsafeSet = new Set(options?.unsafePaths ?? []);

  // Restore manifests from snapshot.
  for (const snap of tx.manifestSnapshots) {
    if (unsafeSet.has(snap.path)) {
      unsafe.push(snap.path);
      continue;
    }
    try {
      if (snap.content === null) {
        if (fs.existsSync(snap.path)) {
          // Manifest did not exist before; removing is unsafe unless we created
          // it — surface as unsafe rather than guessing.
          unsafe.push(snap.path);
        }
      } else {
        fs.writeFileSync(snap.path, snap.content, "utf-8");
        restored.push(snap.path);
      }
    } catch {
      unsafe.push(snap.path);
    }
  }

  // Remove / restore component files.
  for (const file of tx.stagedFiles) {
    if (unsafeSet.has(file.path)) {
      unsafe.push(file.path);
      continue;
    }
    try {
      if (file.existedBefore) {
        if (file.priorContent !== null) {
          fs.writeFileSync(file.path, file.priorContent, "utf-8");
          restored.push(file.path);
        } else {
          unsafe.push(file.path);
        }
      } else {
        // Newly created by us — safe to remove.
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          removed.push(file.path);
        }
      }
    } catch {
      unsafe.push(file.path);
    }
  }

  if (unsafe.length > 0) {
    logger.warn("Some files could not be safely restored and were left in place:");
    for (const p of unsafe) {
      logger.warn(`  - ${p}`);
    }
  }

  return { restored, removed, unsafe };
}

/** True when the transaction has blocking conflicts and force was not supplied. */
export function hasBlockingConflicts(tx: InstallTransaction, force: boolean): boolean {
  return !force && tx.conflicts.length > 0;
}
