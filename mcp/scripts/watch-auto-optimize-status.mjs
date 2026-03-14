import path from "node:path";
import process from "node:process";
import { readdir, readFile } from "node:fs/promises";

const cwd = process.cwd();
const repoRoot = path.resolve(cwd, "..");

function parseArgs(argv) {
  const out = {
    statusFile: path.join(repoRoot, "artifacts", "auto-optimize", "latest-event-fast-par-status.json"),
    intervalMs: 3000,
    logLines: 12,
    once: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = i + 1 < argv.length ? argv[i + 1] : undefined;
    const takeValue = () => {
      i += 1;
      return next;
    };
    switch (key) {
      case "status-file":
        out.statusFile = path.resolve(String(takeValue() || "").trim());
        break;
      case "interval-ms":
        out.intervalMs = Math.max(500, Number(takeValue()) || out.intervalMs);
        break;
      case "log-lines":
        out.logLines = Math.max(0, Math.floor(Number(takeValue()) || out.logLines));
        break;
      case "once":
        out.once = true;
        break;
      default:
        break;
    }
  }
  return out;
}

async function pathExists(filePath) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch (_error) {
    return false;
  }
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(String(text || "").replace(/^\uFEFF/, ""));
}

function rel(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function formatNumber(value, digits = 3) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : "-";
}

function formatIso(iso) {
  if (!iso) return "-";
  const date = new Date(String(iso));
  if (!Number.isFinite(date.getTime())) return String(iso);
  return date.toLocaleString("ja-JP", { hour12: false });
}

async function tailFile(filePath, lineCount) {
  if (!filePath || lineCount <= 0 || !(await pathExists(filePath))) return [];
  const text = await readFile(filePath, "utf8");
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(-lineCount);
}

async function recentSessionFiles(sessionDir, limit = 8) {
  try {
    const entries = await readdir(sessionDir, { withFileTypes: true });
    const rows = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(sessionDir, entry.name);
      const stat = await import("node:fs/promises").then((mod) => mod.stat(fullPath));
      rows.push({
        name: entry.name,
        mtimeMs: stat.mtimeMs,
        size: stat.size
      });
    }
    return rows.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
  } catch (_error) {
    return [];
  }
}

function sessionLabelFromStatus(status) {
  const sessionId = String(status?.sessionId || "");
  const index = sessionId.indexOf("__");
  return index >= 0 ? sessionId.slice(index + 2) : "";
}

function clearScreen() {
  process.stdout.write("\x1Bc");
}

function divider(title = "") {
  return title ? `\n=== ${title} ===` : "\n====================";
}

async function render(cli) {
  const status = await readJson(cli.statusFile);
  const sessionId = String(status?.sessionId || "");
  const label = sessionLabelFromStatus(status);
  const sessionDir = sessionId
    ? path.join(repoRoot, "artifacts", "auto-optimize", sessionId)
    : null;
  const stdoutLog = label ? path.join(repoRoot, "artifacts", "auto-optimize", `${label}.stdout.log`) : "";
  const stderrLog = label ? path.join(repoRoot, "artifacts", "auto-optimize", `${label}.stderr.log`) : "";
  const latestIteration = status?.latestIteration || null;
  const files = sessionDir ? await recentSessionFiles(sessionDir) : [];
  const stdoutTail = await tailFile(stdoutLog, cli.logLines);
  const stderrTail = await tailFile(stderrLog, cli.logLines);

  clearScreen();
  const lines = [];
  lines.push("fact_sim auto-optimize monitor");
  lines.push("");
  lines.push(`Status          : ${status.status || "-"}`);
  lines.push(`Session         : ${sessionId || "-"}`);
  lines.push(`Target Engine   : ${status.targetEngine || "-"}`);
  lines.push(`Benchmark       : ${status.benchmarkExample || "-"}`);
  lines.push(`Started         : ${formatIso(status.startedAt)}`);
  lines.push(`Finished        : ${formatIso(status.finishedAt)}`);
  lines.push(`Elapsed Hours   : ${formatNumber(status.elapsedHours, 3)}`);
  lines.push(`Initial Speed   : ${formatNumber(status.initialTargetSpeed, 3)}x`);
  lines.push(`Best Speed      : ${formatNumber(status.bestTargetSpeed, 3)}x`);
  lines.push(`Improvement     : ${formatPercent(status.currentImprovementPct)}`);
  lines.push(`Iterations      : ${status.iterationCount || 0} / ${status.maxIterations || 0}`);
  lines.push(`No Improve      : ${status.consecutiveNoImprovement || 0} / ${status.maxNoImprovementIterations || 0}`);
  if (latestIteration) {
    lines.push(divider("Latest Iteration"));
    lines.push(`Index           : ${latestIteration.index}`);
    lines.push(`Status          : ${latestIteration.status || "-"}`);
    lines.push(`Baseline        : ${formatNumber(latestIteration.baselineSpeed, 3)}x`);
    lines.push(`After           : ${formatNumber(latestIteration.afterSpeed, 3)}x`);
    lines.push(`Delta           : ${formatPercent(latestIteration.deltaPct)}`);
    lines.push(`Note            : ${latestIteration.note || "-"}`);
  }
  if (sessionDir) {
    lines.push(divider("Session Paths"));
    lines.push(`Status File     : ${rel(cli.statusFile)}`);
    lines.push(`Session Dir     : ${rel(sessionDir)}`);
  }
  if (files.length) {
    lines.push(divider("Recent Session Files"));
    for (const file of files) {
      lines.push(`${file.name.padEnd(34)} ${new Date(file.mtimeMs).toLocaleTimeString("ja-JP", { hour12: false })}  ${file.size} B`);
    }
  }
  if (stdoutTail.length) {
    lines.push(divider("Stdout Tail"));
    lines.push(...stdoutTail);
  }
  if (stderrTail.length) {
    lines.push(divider("Stderr Tail"));
    lines.push(...stderrTail);
  }
  lines.push(divider());
  lines.push(`Refresh         : ${new Date().toLocaleTimeString("ja-JP", { hour12: false })}`);
  lines.push("Exit            : Ctrl+C");
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  while (true) {
    try {
      await render(cli);
    } catch (error) {
      clearScreen();
      process.stdout.write(`monitor error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    if (cli.once) return;
    await new Promise((resolve) => setTimeout(resolve, cli.intervalMs));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
