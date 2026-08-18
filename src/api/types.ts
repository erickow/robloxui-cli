/**
 * TypeScript types for the RobloxUI REST API responses.
 * Mirrors the ComponentEntity from the web app (src/types/component.ts).
 */

export interface SourceFile {
  path: string;
  code: string;
}

export interface ComponentResponse {
  id: string;
  slug: string;
  name: string;
  description: string;
  framework: "tsx" | "luau" | "both";
  category: string;
  price_cents: number;
  is_pro: boolean;
  preview_image_url: string;
  preview_html: string | null;
  tsx_source_code: string | null;
  luau_source_code: string | null;
  /** Multi-file payload — when present, the writer installs each entry to its `path`. */
  tsx_source_files: SourceFile[] | null;
  luau_source_files: SourceFile[] | null;
  dependencies: string[];
  theme_tokens: string[];
  usage_example: string | null;
  author: string;
  created_at: string;
  updated_at: string;
}

export interface ApiDetailResponse {
  component: ComponentResponse;
}

export interface ApiErrorResponse {
  error: string;
}

/** Lightweight fields used by `list` / `search` command output. */
export interface ComponentListItem {
  slug: string;
  name: string;
  description: string;
  framework: "tsx" | "luau" | "both";
  category: string;
  is_pro: boolean;
}

export interface ComponentListResponse {
  components: ComponentListItem[];
  total: number;
  page: number;
  limit: number;
}
