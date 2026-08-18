import * as fs from "fs";
import * as path from "path";
import { detectProjectProfile } from "../detectors/detect-project";
import { miseIsAvailable } from "../setup/mise-adapter";
import { detectToolchain, rojoIsAvailable } from "../utils/toolchain";
import { logger } from "../utils/logger";

export function runDoctorCommand(cwd: string): number {
  logger.heading("RobloxUI — environment doctor");
  const checks: Array<[string, boolean, string]> = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const profile = detectProjectProfile(cwd);
  const toolchain = detectToolchain();

  checks.push(["Node.js 20.12+", nodeMajor >= 20, `detected ${process.versions.node}`]);
  checks.push(["npm", toolchain.npm, "install Node.js 20.12+ if missing"]);
  checks.push(["mise", miseIsAvailable(), "run init to bootstrap mise automatically"]);
  checks.push(["Rojo", rojoIsAvailable(cwd), "run mise install in the project"]);
  checks.push(["Project flavor", profile.flavor !== undefined, "add rojo.json or wally.toml"]);
  checks.push([
    "Rojo config",
    fs.existsSync(path.join(cwd, "rojo.json")) || fs.existsSync(path.join(cwd, "default.project.json")),
    "run robloxui init or add a Rojo project file",
  ]);

  let failures = 0;
  for (const [name, ok, hint] of checks) {
    if (ok) logger.success(`${name} — ok`);
    else {
      failures++;
      logger.warn(`${name} — ${hint}`);
    }
  }

  logger.blank();
  if (failures === 0) {
    logger.success("Environment is ready. Run npm run dev to connect to Studio.");
    return 0;
  }
  logger.warn(`${failures} check${failures === 1 ? "" : "s"} need attention.`);
  return 1;
}
