import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { beginTransaction, commitTransaction, hasBlockingConflicts, rollbackTransaction, stageComponent } from "../../writers/transaction";
import type { ComponentResponse } from "../../api/types";

const component = { slug: "button", framework: "tsx", tsx_source_code: "new", luau_source_code: null } as ComponentResponse;
describe("install transaction", () => {
  it("conflict defaults to no overwrite", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "rui-tx-"));
    const target = path.join(cwd, "components"); fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "button.tsx"), "old");
    const tx = beginTransaction(cwd, target); stageComponent(tx, component);
    expect(hasBlockingConflicts(tx, false)).toBe(true);
    expect(fs.readFileSync(path.join(target, "button.tsx"), "utf8")).toBe("old");
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  it("rollback restores manifest and removes staged files", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "rui-tx-"));
    fs.writeFileSync(path.join(cwd, "package.json"), "old"); const target = path.join(cwd, "components");
    const tx = beginTransaction(cwd, target); stageComponent(tx, component); expect(commitTransaction(tx).ok).toBe(true);
    fs.writeFileSync(path.join(cwd, "package.json"), "changed"); const result = rollbackTransaction(tx);
    expect(result.removed).toHaveLength(1); expect(fs.readFileSync(path.join(cwd, "package.json"), "utf8")).toBe("old");
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});
