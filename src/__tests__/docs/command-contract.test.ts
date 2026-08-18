import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("documentation command contract", () => {
  it("checks current commands", () => {
    const root = process.cwd();
    const docs = fs.readFileSync(path.join(root, "README.md"), "utf8");
    expect(docs).toContain("mise install");
    expect(docs).toContain("robloxui/theme");
    expect(docs).toContain("wally install");
    expect(docs).toContain("npm run dev");
    expect(docs).toContain("recovery");
    expect(docs).not.toMatch(/Aftman/);
  });
});
