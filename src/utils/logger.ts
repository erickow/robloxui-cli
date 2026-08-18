/**
 * Console output formatting utilities for the RobloxUI CLI.
 * Uses ANSI escape codes for color — no external dependencies.
 */

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

export const logger = {
  /** Print a success message (green). */
  success(msg: string): void {
    console.log(`${GREEN}✔${RESET} ${msg}`);
  },

  /** Print an error message (red). */
  error(msg: string): void {
    console.error(`${RED}✘${RESET} ${msg}`);
  },

  /** Print a warning message (yellow). */
  warn(msg: string): void {
    console.warn(`${YELLOW}⚠${RESET} ${msg}`);
  },

  /** Print an info message (cyan). */
  info(msg: string): void {
    console.log(`${CYAN}ℹ${RESET} ${msg}`);
  },

  /** Print a bold heading. */
  heading(msg: string): void {
    console.log(`\n${BOLD}${msg}${RESET}\n`);
  },

  /** Print dim/muted text. */
  dim(msg: string): void {
    console.log(`${DIM}${msg}${RESET}`);
  },

  /** Print a section with a cyan label and value. */
  field(label: string, value: string): void {
    console.log(`  ${CYAN}${label}:${RESET} ${value}`);
  },

  /** Print a blank line. */
  blank(): void {
    console.log();
  },
};
