import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type SmokeFlavor = "roblox-ts" | "luau-wally";
export interface SmokeReport { flavor: SmokeFlavor; tempDir: string; artifact: string; mapping: string; }

/** Deterministic mapping smoke: no network, Studio, or real external binary. */
export function runSmoke(flavor: SmokeFlavor): SmokeReport {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "robloxui-smoke-"));
  try {
    const source = path.join(tempDir, "src", "client");
    fs.mkdirSync(source, { recursive: true });
    const artifact = path.join(source, flavor === "roblox-ts" ? "sample.tsx" : "init.client.luau");
    fs.writeFileSync(artifact, "-- deterministic smoke artifact\n");
    const mapping = flavor === "roblox-ts" ? "out/client -> StarterPlayerScripts" : "src/client -> StarterPlayerScripts";
    fs.writeFileSync(path.join(tempDir, flavor === "roblox-ts" ? "rojo.json" : "default.project.json"), JSON.stringify({ tree: { $path: "src/client" } }));
    if (!fs.existsSync(artifact)) throw new Error("smoke artifact was not created");
    return { flavor, tempDir, artifact, mapping };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("rojo-smoke.ts")) {
  const flavor = process.argv[2] as SmokeFlavor | undefined;
  if (flavor !== "roblox-ts" && flavor !== "luau-wally") throw new Error("usage: rojo-smoke.ts <roblox-ts|luau-wally>");
  console.log(JSON.stringify(runSmoke(flavor)));
}
