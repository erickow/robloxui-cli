/** Stable, operation-specific failure contract for external tools. */
export type RecoveryOperation = "network" | "npm" | "wally" | "mise" | "rojo" | "api";

export interface Failure {
  operation: RecoveryOperation;
  cause: string;
  remediation: string;
  retry: string;
  manualRecovery: string;
  preserved: string[];
  unsafePaths: string[];
  id: "recovery__failure" | "recovery__partial";
}

const guidance: Record<RecoveryOperation, { remediation: string; retry: string; manual: string }> = {
  network: { remediation: "Check connectivity and the API URL.", retry: "robloxui add <component-slug>", manual: "Download the component source and copy it after validating the payload." },
  api: { remediation: "Check the component slug, authentication, and API availability.", retry: "robloxui add <component-slug>", manual: "Use the marketplace web page to download the component." },
  npm: { remediation: "Check package.json and the npm registry.", retry: "npm install robloxui", manual: "npm install robloxui  # ships robloxui/theme" },
  wally: { remediation: "Install Wally with mise, then verify wally.toml.", retry: "wally install", manual: "mise install && wally install" },
  mise: { remediation: "Install mise and verify the pinned tool versions.", retry: "mise install", manual: "Install mise from https://mise.jdx.dev/ and run mise install." },
  rojo: { remediation: "Validate the Rojo project mapping and start the server.", retry: "rojo serve", manual: "Repair the mapping, then run rojo serve -p default.project.json." },
};

export function normalizeFailure(
  operation: RecoveryOperation,
  cause: unknown,
  options: { preserved?: string[]; unsafePaths?: string[] } = {}
): Failure {
  const g = guidance[operation];
  const unsafePaths = options.unsafePaths ?? [];
  return {
    operation,
    cause: cause instanceof Error ? cause.message : String(cause),
    remediation: g.remediation,
    retry: g.retry,
    manualRecovery: g.manual,
    preserved: options.preserved ?? [],
    unsafePaths,
    id: unsafePaths.length ? "recovery__partial" : "recovery__failure",
  };
}
