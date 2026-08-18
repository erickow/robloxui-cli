import { describe, expect, it } from "vitest";
import { normalizeFailure } from "../../utils/recovery";

describe("recovery", () => {
  it("maps each external operation", () => {
    for (const operation of ["network", "npm", "wally", "mise", "rojo"] as const) {
      const failure = normalizeFailure(operation, "boom");
      expect(failure.operation).toBe(operation);
      expect(failure.retry.length).toBeGreaterThan(0);
      expect(failure.manualRecovery.length).toBeGreaterThan(0);
    }
  });

  it("lists unsafe paths", () => {
    const failure = normalizeFailure("npm", new Error("lock changed"), {
      preserved: ["package.json"], unsafePaths: ["package-lock.json"],
    });
    expect(failure.id).toBe("recovery__partial");
    expect(failure.unsafePaths).toEqual(["package-lock.json"]);
  });
});
