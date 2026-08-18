import { describe, expect, it } from "vitest";
import { runSmoke } from "./rojo-smoke";

describe("fresh Rojo smoke", () => {
  it.each(["roblox-ts", "luau-wally"] as const)("verifies %s mapping", (flavor) => {
    const report = runSmoke(flavor);
    expect(report.mapping).toContain(flavor === "roblox-ts" ? "out/client" : "src/client");
    expect(require("node:fs").existsSync(report.tempDir)).toBe(false);
  });
});
