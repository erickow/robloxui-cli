/**
 * Auth token storage for the RobloxUI CLI.
 *
 * Tokens live in a per-user config file:
 *   - $XDG_CONFIG_HOME/robloxui/config.json  (POSIX, if XDG_CONFIG_HOME set)
 *   - ~/.config/robloxui/config.json         (POSIX fallback)
 *   - %APPDATA%\robloxui\config.json         (Windows)
 *
 * The token is the plaintext api-key returned by `robloxui login` or pasted
 * via `robloxui login --token`. Stored as JSON for forward-compat (we may add
 * other fields like default project flavor later).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface ConfigFile {
  /** Plaintext API token (kept here so subsequent CLI runs can authenticate). */
  token?: string;
  /** Email or username for display in `robloxui whoami`. */
  label?: string;
}

function configDir(): string {
  const envOverride = process.env.XDG_CONFIG_HOME;
  if (envOverride) return path.join(envOverride, "robloxui");

  const platform = process.platform;
  if (platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), "robloxui");
  }
  // darwin / linux
  return path.join(os.homedir(), ".config", "robloxui");
}

function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function loadConfig(): ConfigFile {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return JSON.parse(raw) as ConfigFile;
  } catch {
    return {};
  }
}

export function saveConfig(cfg: ConfigFile): void {
  const dir = configDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* directory may already exist */
  }
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), {
    mode: 0o600,
  });
}

export function clearConfig(): void {
  try {
    fs.unlinkSync(configPath());
  } catch {
    /* file may not exist */
  }
}

export function getAuthToken(): string | null {
  const cfg = loadConfig();
  return cfg.token ?? null;
}

export function setAuthToken(token: string, label?: string): void {
  const cfg = loadConfig();
  cfg.token = token;
  if (label) cfg.label = label;
  saveConfig(cfg);
}
