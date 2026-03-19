import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(scriptDir, "..");

const child = spawn(process.execPath, [
  path.join(scriptDir, "watch-auto-improve-status.mjs"),
  "--status-file",
  path.join("..", "artifacts", "auto-optimize", "latest-event-fast-par-status.json"),
  ...process.argv.slice(2)
], {
  cwd: mcpRoot,
  env: process.env,
  stdio: "inherit",
  shell: false
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(Number(code ?? 0));
});
