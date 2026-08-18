/**
 * HTTP client for the RobloxUI REST API.
 * Uses the native fetch API (available in Node 18+).
 */

import type { ApiDetailResponse, ComponentResponse, ComponentListResponse } from "./types";

/** Base URL for the RobloxUI API. Configurable via RUI_API_URL env var. */
const API_BASE_URL =
  process.env.RUI_API_URL ?? "https://robloxui.pencipta.com/api/v1";
const SITE_URL =
  process.env.RUI_SITE_URL ?? "https://robloxui.pencipta.com";

/**
 * Represents a failed API request.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Represents a network connectivity failure.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Thrown when the user has hit the free-tier daily limit. The CLI catches
 * this and prints an upgrade hint with a link.
 */
export class DailyLimitError extends Error {
  constructor(
    message: string,
    public readonly used: number,
    public readonly limit: number,
    public readonly upgradeUrl: string,
  ) {
    super(message);
    this.name = "DailyLimitError";
  }
}

/**
 * Thrown when the user tries to install a Pro component without an
 * entitlement (no Pro sub, no one-time purchase).
 */
export class ProRequiredError extends Error {
  constructor(
    message: string,
    public readonly componentName: string,
    public readonly upgradeUrl: string,
  ) {
    super(message);
    this.name = "ProRequiredError";
  }
}

/**
 * Thrown when no auth token is configured or the token is invalid/revoked.
 */
export class UnauthenticatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Fetch a component by slug from the RobloxUI API (public endpoint, no auth).
 * Kept for `robloxui info` and `list`/`search` — source code is stripped for
 * Pro components the user hasn't purchased.
 *
 * Throws ApiError for 404 responses or server errors.
 * Throws NetworkError for connectivity failures.
 */
export async function fetchComponent(slug: string): Promise<ComponentResponse> {
  const url = `${API_BASE_URL}/components/${encodeURIComponent(slug)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new NetworkError(
      "Network error: unable to reach the RobloxUI API. Check your connection and try again."
    );
  }

  if (response.status === 404) {
    throw new ApiError(
      `Component '${slug}' not found. Browse available components at https://robloxui.pencipta.com`,
      404
    );
  }

  if (!response.ok) {
    throw new ApiError(
      `API request failed with status ${response.status}`,
      response.status
    );
  }

  const data = (await response.json()) as ApiDetailResponse;

  if (!data.component) {
    throw new ApiError("Unexpected API response: missing component data");
  }

  return data.component;
}

/**
 * Install (download) a component via the authenticated CLI endpoint.
 * Requires a bearer token obtained via `robloxui login` or `--token`.
 *
 * Returns the full component (including Pro source code) when the user is
 * entitled. Throws typed errors for the three entitlement failure modes:
 *   - UnauthenticatedError  → 401 (run `robloxui login`)
 *   - DailyLimitError       → 402 (free-tier limit hit)
 *   - ProRequiredError      → 403 (Pro component, no entitlement)
 */
export async function installComponent(
  slug: string,
  authToken: string
): Promise<ComponentResponse> {
  const url = `${API_BASE_URL}/cli/install`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ slug }),
    });
  } catch {
    throw new NetworkError(
      "Network error: unable to reach the RobloxUI API. Check your connection and try again."
    );
  }

  // 401 → not authenticated (missing/invalid/revoked token)
  if (response.status === 401) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    throw new UnauthenticatedError(
      body.error_description ?? "Authentication required. Run `robloxui login`."
    );
  }

  // 402 → free-tier daily limit hit
  if (response.status === 402) {
    const body = (await response.json().catch(() => ({}))) as {
      used?: number;
      limit?: number;
      upgrade_url?: string;
      error_description?: string;
    };
    throw new DailyLimitError(
      body.error_description ??
        `Free tier limit reached (${body.used ?? 0}/${body.limit ?? 0} today).`,
      body.used ?? 0,
      body.limit ?? 0,
      body.upgrade_url ?? `${SITE_URL}/pricing`
    );
  }

  // 403 → Pro component, no entitlement
  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as {
      component?: { name?: string };
      upgrade_url?: string;
    };
    throw new ProRequiredError(
      `This is a Pro component. Subscribe to Pro to unlock it.`,
      body.component?.name ?? slug,
      body.upgrade_url ?? `${SITE_URL}/pricing`
    );
  }

  if (response.status === 404) {
    throw new ApiError(
      `Component '${slug}' not found. Browse available components at https://robloxui.pencipta.com`,
      404
    );
  }

  if (!response.ok) {
    throw new ApiError(
      `API request failed with status ${response.status}`,
      response.status
    );
  }

  const data = (await response.json()) as ApiDetailResponse;
  if (!data.component) {
    throw new ApiError("Unexpected API response: missing component data");
  }
  return data.component;
}

/**
 * Query parameters for listing / searching components.
 */
export interface ListParams {
  search?: string;
  framework?: string;
  category?: string;
  page?: number;
  limit?: number;
}

/**
 * List or search components via the RobloxUI API.
 * Pass `search` to filter by name/description/category.
 * Returns a page of component summaries.
 */
export async function listComponents(
  params: ListParams = {}
): Promise<ComponentListResponse> {
  const url = new URL(`${API_BASE_URL}/components`);
  if (params.search) url.searchParams.set("search", params.search);
  if (params.framework) url.searchParams.set("framework", params.framework);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.page) url.searchParams.set("page", String(params.page));
  if (params.limit) url.searchParams.set("limit", String(params.limit));

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new NetworkError(
      "Network error: unable to reach the RobloxUI API. Check your connection and try again."
    );
  }

  if (!response.ok) {
    throw new ApiError(
      `API request failed with status ${response.status}`,
      response.status
    );
  }

  return (await response.json()) as ComponentListResponse;
}
