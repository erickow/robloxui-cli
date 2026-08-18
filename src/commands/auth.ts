/**
 * `robloxui login` — authenticate the CLI.
 *
 * Two flows:
 *   1. Device flow (default): CLI polls while the user approves in a browser.
 *   2. Manual token: `--token <key>` for CI / headless machines.
 */

import { logger } from "../utils/logger";
import { setAuthToken, loadConfig } from "../utils/config";

const API_BASE_URL =
  process.env.RUI_API_URL ?? "https://robloxui.pencipta.com/api/v1";
const SITE_URL =
  process.env.RUI_SITE_URL ?? "https://robloxui.pencipta.com";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

interface PollResult {
  access_token?: string;
  error?: string;
}

export interface LoginOptions {
  /** Pasted API token — skips the device flow. */
  token?: string;
}

export async function runLoginCommand(options: LoginOptions): Promise<number> {
  // ── Manual token flow ─────────────────────────────────────────────────
  if (options.token) {
    setAuthToken(options.token.trim());
    logger.success("Token saved.");
    logger.info("Run `robloxui whoami` to verify.");
    return 0;
  }

  // ── Device flow ───────────────────────────────────────────────────────
  logger.heading("RobloxUI login");
  logger.blank();

  // 1. Request device code.
  let res = await fetch(`${API_BASE_URL}/cli/auth/device`, {
    method: "POST",
  });
  if (!res.ok) {
    logger.error(
      `Failed to start login flow (HTTP ${res.status}). Try again or use --token.`
    );
    return 1;
  }
  const device = (await res.json()) as DeviceCodeResponse;

  // 2. Print the user code + URL.
  logger.info(`Open:  ${device.verification_url}?code=${device.user_code}`);
  logger.info(`Code:  ${device.user_code}`);
  logger.blank();
  logger.dim(
    `Waiting for approval... (expires in ${Math.floor(device.expires_in / 60)}m ${device.expires_in % 60}s)`
  );
  logger.blank();

  // 3. Poll until confirmed / expired.
  const deadline = Date.now() + device.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, device.interval * 1000));

    res = await fetch(`${API_BASE_URL}/cli/auth/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: device.device_code }),
    });

    const data = (await res.json()) as PollResult;

    if (res.ok && data.access_token) {
      setAuthToken(data.access_token);
      logger.success("Logged in.");
      return 0;
    }

    if (data.error === "authorization_pending") {
      continue;
    }
    if (data.error === "slow_down") {
      await new Promise((r) => setTimeout(r, device.interval * 1000));
      continue;
    }
    if (data.error === "expired_token") {
      logger.error("Login code expired. Run `robloxui login` again.");
      return 1;
    }
    if (data.error === "access_denied") {
      logger.error("Login denied.");
      return 1;
    }
    // Unknown error — bail.
    logger.error(`Login failed: ${data.error ?? "unknown"}`);
    return 1;
  }

  logger.error("Login timed out.");
  return 1;
}

export async function runLogoutCommand(): Promise<number> {
  const cfg = loadConfig();
  if (!cfg.token) {
    logger.info("Not logged in.");
    return 0;
  }
  const { clearConfig } = await import("../utils/config");
  clearConfig();
  logger.success("Logged out.");
  return 0;
}

export async function runWhoamiCommand(): Promise<number> {
  const cfg = loadConfig();
  if (!cfg.token) {
    logger.info("Not logged in. Run `robloxui login` first.");
    return 1;
  }
  // We don't have a /me endpoint yet — just confirm the token is load-bearing
  // by attempting a tiny authenticated call.
  try {
    const res = await fetch(`${API_BASE_URL}/affiliate/stats`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (res.status === 401) {
      logger.error("Your token is invalid or revoked. Run `robloxui login` again.");
      return 1;
    }
    if (res.ok) {
      logger.success(
        `Logged in${cfg.label ? ` as ${cfg.label}` : ""}. Token prefix: ${cfg.token.slice(0, 8)}…`
      );
      return 0;
    }
  } catch {
    /* fall through */
  }
  logger.info(
    `Token present (prefix ${cfg.token.slice(0, 8)}…). Could not verify against API.`
  );
  return 0;
}
