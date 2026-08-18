/**
 * Interactive prompt utilities. On a TTY, selection uses arrow-key navigation
 * (highlight + Enter, Space to toggle in multi-select) — no typed numbers.
 * Non-TTY stdin falls back to numbered input so scripts/pipes still work.
 */

import * as readline from "readline";
import { logger } from "./logger";

function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a yes/no question with a default answer.
 * Returns true for "yes", false for "no".
 */
export function confirmPrompt(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  const rl = createPrompt();

  return new Promise((resolve) => {
    rl.question(question + suffix, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") {
        resolve(defaultYes);
      } else {
        resolve(trimmed === "y" || trimmed === "yes");
      }
    });
  });
}

/**
 * Ask the user to type/paste a path.
 */
export function pathPrompt(question: string, defaultPath: string): Promise<string> {
  const rl = createPrompt();

  return new Promise((resolve) => {
    rl.question(`${question} [${defaultPath}]: `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed === "" ? defaultPath : trimmed);
    });
  });
}

/**
 * Stable semantic prompt identifiers (F02+). When present, the prompt surfaces
 * the id so tests and non-interactive tooling can identify it deterministically.
 */
export interface SelectPromptOptions {
  id?: string;
}

export interface MultiSelectPromptOptions {
  id?: string;
  /** Pre-check every option (default false). */
  checkAll?: boolean;
}

interface RenderState<T extends string> {
  question: string;
  options: T[];
  multiple: boolean;
  cursor: number;
  selected: Set<number>;
  renderHeight: number;
}

function renderState<T extends string>(state: RenderState<T>): void {
  const cursorUp = `\x1b[${state.renderHeight}A`;
  const lines: string[] = [state.question];
  state.options.forEach((opt, i) => {
    const cursorMark = i === state.cursor ? "\u25b8" : " ";
    const checkbox = state.multiple
      ? state.selected.has(i) ? "[x] " : "[ ] "
      : "";
    lines.push(`  ${cursorMark} ${checkbox}${opt}`);
  });
  if (state.renderHeight > 0) {
    process.stdout.write(cursorUp);
  }
  for (const line of lines) {
    process.stdout.write(`\x1b[2K${line}\n`);
  }
  state.renderHeight = lines.length;
}

async function keypressSelect<T extends string>(
  question: string,
  options: T[],
  opts: { multiple: boolean; checkAll?: boolean }
): Promise<{ cancelled: boolean; selected: number[] }> {
  const rl = createPrompt();
  const stdin = process.stdin;
  const wasRaw = stdin.isTTY && stdin.isRaw;

  const selected = new Set<number>(opts.checkAll ? options.map((_, i) => i) : []);
  let cursor = 0;
  let cancelled = false;

  const state: RenderState<T> = {
    question,
    options,
    multiple: opts.multiple,
    cursor,
    selected,
    renderHeight: 0,
  };

  const cleanup = () => {
    if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
    stdin.removeListener("data", onData);
    stdin.pause();
    rl.close();
  };

  const finish = () => {
    cleanup();
    process.stdout.write("\n");
  };

  const onData = (chunk: Buffer) => {
    const key = chunk.toString();
    if (key === "\u0003") {
      // Ctrl+C
      cancelled = true;
      finish();
      process.emit("SIGINT");
      return;
    }
    if (key === "\r" || key === "\n") {
      finish();
      return;
    }
    if (key === " ") {
      if (opts.multiple) {
        if (selected.has(cursor)) {
          selected.delete(cursor);
        } else {
          selected.add(cursor);
        }
        renderState(state);
      } else {
        finish();
      }
      return;
    }
    if (key === "a" || key === "A") {
      if (opts.multiple) {
        if (selected.size === options.length) {
          selected.clear();
        } else {
          options.forEach((_, i) => selected.add(i));
        }
        renderState(state);
      }
      return;
    }
    if (key === "\u001b[A" || key === "k") {
      // Up
      cursor = cursor > 0 ? cursor - 1 : options.length - 1;
      state.cursor = cursor;
      renderState(state);
      return;
    }
    if (key === "\u001b[B" || key === "j") {
      // Down
      cursor = cursor < options.length - 1 ? cursor + 1 : 0;
      state.cursor = cursor;
      renderState(state);
      return;
    }
    // Number keys 1-9 for quick single-select pick
    const n = parseInt(key, 10);
    if (!opts.multiple && n >= 1 && n <= options.length) {
      cursor = n - 1;
      state.selected.clear();
      state.selected.add(cursor);
      finish();
      return;
    }
  };

  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", onData);

  renderState(state);

  await new Promise<void>((resolve) => {
    const onClose = () => resolve();
    rl.on("close", onClose);
  });

  return { cancelled, selected: [...selected] };
}

/**
 * Numbered single selection prompt (arrow keys or number keys; Enter confirms).
 */
export async function selectPrompt<T extends string>(
  question: string,
  options: T[],
  promptOptions?: SelectPromptOptions
): Promise<T> {
  const q = promptOptions?.id ? `[${promptOptions.id}] ${question}` : question;

  // Non-TTY fallback: numbered input.
  if (!process.stdin.isTTY) {
    const rl = createPrompt();
    if (promptOptions?.id) {
      logger.info(`[${promptOptions.id}] ${question}`);
    } else {
      logger.info(question);
    }
    options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt}`);
    });

    return new Promise<T>((resolve, reject) => {
      rl.question(`Enter number (1-${options.length}): `, (answer) => {
        rl.close();
        const num = parseInt(answer.trim(), 10);
        if (isNaN(num) || num < 1 || num > options.length) {
          reject(new Error(`Invalid selection: ${answer}`));
        } else {
          resolve(options[num - 1] as T);
        }
      });
    });
  }

  const result = await keypressSelect(q, options, { multiple: false });
  if (result.cancelled) {
    throw new Error("Selection cancelled.");
  }
  return options[result.selected[0] ?? 0] as T;
}

/**
 * Arrow-key multi-select (Space toggles, A select all, Enter confirms).
 */
export async function multiSelectPrompt<T extends string>(
  question: string,
  options: T[],
  promptOptions?: MultiSelectPromptOptions
): Promise<T[]> {
  const q = promptOptions?.id
    ? `[${promptOptions.id}] ${question}`
    : question;

  if (!process.stdin.isTTY) {
    const rl = createPrompt();
    if (promptOptions?.id) {
      logger.info(`[${promptOptions.id}] ${question}`);
    } else {
      logger.info(question);
    }
    options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt}`);
    });
    return new Promise<T[]>((resolve, reject) => {
      rl.question(
        `Enter numbers (comma-separated, or "all"; empty = none): `,
        (answer) => {
          rl.close();
          const trimmed = answer.trim().toLowerCase();
          if (trimmed === "all") {
            resolve(options);
          } else if (trimmed === "") {
            resolve([]);
          } else {
            const nums = trimmed.split(",").map((s) => parseInt(s.trim(), 10));
            const flat: T[] = [];
            for (const num of nums) {
              if (isNaN(num) || num < 1 || num > options.length) {
                reject(new Error(`Invalid selection: ${answer}`));
                return;
              }
              flat.push(options[num - 1]);
            }
            resolve(flat);
          }
        }
      );
    });
  }

  const result = await keypressSelect(q, options, {
    multiple: true,
    checkAll: promptOptions?.checkAll,
  });
  if (result.cancelled) {
    throw new Error("Selection cancelled.");
  }
  return result.selected.map((i) => options[i] as T);
}