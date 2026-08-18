/**
 * Global vitest setup for the CLI package.
 *
 * Mocks the logger to suppress noisy stdout/stderr during tests so
 * intentional error-path output (✘, ⚠) doesn't confuse CI or
 * pollute test results. Individual tests that need to observe
 * logger output can mock it locally.
 */
import { vi } from "vitest";

vi.mock("../utils/logger", () => {
  const noop = () => {};
  return {
    logger: {
      success: noop,
      error: noop,
      warn: noop,
      info: noop,
      heading: noop,
      dim: noop,
      field: noop,
      blank: noop,
    },
  };
});
