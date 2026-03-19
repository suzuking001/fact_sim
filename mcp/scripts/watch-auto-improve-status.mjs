import path from "node:path";
import process from "node:process";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mcpRoot, "..");

function parseArgs(argv) {
  const out = {
    job: "",
    statusFile: "",
    intervalMs: 3000,
    logLines: 12,
    previewLines: 20,
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
      case "job":
        out.job = String(takeValue() || "").trim();
        break;
      case "status-file":
        out.statusFile = String(takeValue() || "").trim();
        break;
      case "interval-ms":
        out.intervalMs = Math.max(500, Number(takeValue()) || out.intervalMs);
        break;
      case "log-lines":
        out.logLines = Math.max(0, Math.floor(Number(takeValue()) || out.logLines));
        break;
      case "preview-lines":
        out.previewLines = Math.max(4, Math.floor(Number(takeValue()) || out.previewLines));
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

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(String(text || "").replace(/^\uFEFF/, ""));
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function resolveExistingArtifactPath(filePaths, artifactRoot, sessionDir = "") {
  for (const filePath of Array.isArray(filePaths) ? filePaths : [filePaths]) {
    const resolved = resolveArtifactPath(filePath, artifactRoot, sessionDir);
    if (resolved && await pathExists(resolved)) return resolved;
  }
  return resolveArtifactPath(Array.isArray(filePaths) ? filePaths[0] : filePaths, artifactRoot, sessionDir);
}

function rel(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function resolveArtifactPath(filePath, artifactRoot, sessionDir = "") {
  if (!filePath) return "";
  if (path.isAbsolute(filePath)) return filePath;
  const normalized = String(filePath).replace(/\\/g, "/");
  if (normalized.startsWith("artifacts/") || normalized.startsWith("tmp/")) {
    return path.resolve(repoRoot, filePath);
  }
  if (sessionDir && !normalized.startsWith("artifacts/") && !normalized.startsWith("./") && !normalized.startsWith("../")) {
    return path.resolve(sessionDir, filePath);
  }
  const artifactCandidate = path.resolve(artifactRoot, filePath);
  return artifactCandidate;
}

function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || value === "") return "-";
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : "-";
}

function formatIso(iso) {
  if (!iso) return "-";
  const date = new Date(String(iso));
  if (!Number.isFinite(date.getTime())) return String(iso);
  return date.toLocaleString("ja-JP", { hour12: false });
}

function shorten(text, max = 140) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

async function readPreview(filePath, lineCount, mode = "head") {
  if (!filePath || lineCount <= 0 || !(await pathExists(filePath))) return [];
  const text = await readFile(filePath, "utf8");
  const lines = String(text || "").split(/\r?\n/);
  const filtered = lines.filter((line) => line.length > 0);
  return mode === "tail" ? filtered.slice(-lineCount) : filtered.slice(0, lineCount);
}

async function recentSessionFiles(sessionDir, limit = 10) {
  try {
    const entries = await readdir(sessionDir, { withFileTypes: true });
    const rows = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(sessionDir, entry.name);
      const info = await stat(fullPath);
      rows.push({
        name: entry.name,
        mtimeMs: info.mtimeMs,
        size: info.size
      });
    }
    return rows.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
  } catch (_error) {
    return [];
  }
}

function clearScreen() {
  process.stdout.write("\x1Bc");
}

function divider(title = "") {
  return title ? `\n=== ${title} ===` : "\n====================";
}

async function resolveStatusFile(cli) {
  if (cli.statusFile) {
    return path.isAbsolute(cli.statusFile)
      ? cli.statusFile
      : path.resolve(repoRoot, cli.statusFile);
  }
  if (!cli.job) {
    return path.join(repoRoot, "artifacts", "auto-optimize", "latest-event-fast-par-status.json");
  }
  const jobPath = path.isAbsolute(cli.job) ? cli.job : path.resolve(repoRoot, cli.job);
  const job = await readJson(jobPath);
  const fromJob = String(job.statusFile || "").trim();
  if (fromJob) {
    return path.isAbsolute(fromJob) ? fromJob : path.resolve(repoRoot, fromJob);
  }
  return path.join(repoRoot, "artifacts", "auto-optimize", "latest-event-fast-par-status.json");
}

async function render(cli, statusFile) {
  const status = await readJson(statusFile);
  const artifactRoot = path.dirname(statusFile);
  const sessionDir = status?.sessionId ? path.join(artifactRoot, status.sessionId) : "";
  const latest = status?.latestIteration || null;
  const recentIterations = Array.isArray(status?.recentIterations) ? status.recentIterations : [];

  const latestPromptPath = await resolveExistingArtifactPath([latest?.delegatePromptPath, latest?.optimizePromptPath], artifactRoot, sessionDir);
  const latestResponsePath = resolveArtifactPath(latest?.delegateMessagePath, artifactRoot, sessionDir);
  const latestStdoutPath = resolveArtifactPath(latest?.delegateStdoutPath, artifactRoot, sessionDir);
  const latestStderrPath = resolveArtifactPath(latest?.delegateStderrPath, artifactRoot, sessionDir);

  const promptPreview = await readPreview(latestPromptPath, cli.previewLines, "head");
  const responsePreview = await readPreview(latestResponsePath, cli.previewLines, "head");
  const stdoutTail = await readPreview(latestStdoutPath, cli.logLines, "tail");
  const stderrTail = await readPreview(latestStderrPath, cli.logLines, "tail");
  const files = sessionDir ? await recentSessionFiles(sessionDir) : [];

  clearScreen();
  const lines = [];
  lines.push("fact_sim auto-improve monitor");
  lines.push("");
  lines.push(`Status          : ${status.status || "-"}`);
  lines.push(`Session         : ${status.sessionId || "-"}`);
  lines.push(`Target Engine   : ${status.targetEngine || "-"}`);
  lines.push(`Profile         : ${status.profile || "-"}`);
  lines.push(`Prompt / Scope  : ${status.promptMode || "-"} / ${status.scopeMode || "-"}`);
  lines.push(`Benchmark       : ${status.benchmarkExample || "-"}`);
  lines.push(`Started         : ${formatIso(status.startedAt)}`);
  lines.push(`Finished        : ${formatIso(status.finishedAt)}`);
  lines.push(`Elapsed Hours   : ${formatNumber(status.elapsedHours, 3)}`);
  lines.push(`Initial Speed   : ${formatNumber(status.initialTargetSpeed, 3)}x`);
  lines.push(`Best Speed      : ${formatNumber(status.bestTargetSpeed, 3)}x`);
  lines.push(`Improvement     : ${formatPercent(status.currentImprovementPct)}`);
  lines.push(`Iterations      : ${status.iterationCount || 0} / ${status.maxIterations || 0}`);
  lines.push(`No Improve      : ${status.consecutiveNoImprovement || 0} / ${status.maxNoImprovementIterations || 0}`);
  if (status.monitor?.autoStart) {
    lines.push(`Monitor Start   : ${status.monitor.autoStart.started ? "auto-started" : "manual / unavailable"}${status.monitor.autoStart.mode ? ` (${status.monitor.autoStart.mode})` : ""}`);
  }

  if (latest) {
    lines.push(divider("Latest Iteration"));
    lines.push(`Index           : ${latest.index}`);
    lines.push(`Status          : ${latest.status || "-"}`);
    lines.push(`Baseline        : ${formatNumber(latest.baselineSpeed, 3)}x`);
    lines.push(`After           : ${formatNumber(latest.afterSpeed, 3)}x`);
    lines.push(`Delta           : ${formatPercent(latest.deltaPct)}`);
    lines.push(`Changed Paths   : ${Array.isArray(latest.changedPaths) && latest.changedPaths.length ? latest.changedPaths.join(", ") : "(none)"}`);
    lines.push(`Note            : ${latest.note || "-"}`);
  }

  lines.push(divider("Current Paths"));
  lines.push(`Status File     : ${rel(statusFile)}`);
  if (sessionDir) lines.push(`Session Dir     : ${rel(sessionDir)}`);
  if (latest?.requestPath) lines.push(`Request         : ${latest.requestPath}`);
  if (latest?.optimizePromptPath) lines.push(`Runner Prompt   : ${latest.optimizePromptPath}`);
  if (latest?.delegatePromptPath) lines.push(`Delegate Prompt : ${latest.delegatePromptPath}`);
  if (latest?.delegateMessagePath) lines.push(`Delegate Reply  : ${latest.delegateMessagePath}`);
  if (latest?.patchDiffPath) lines.push(`Patch Diff      : ${latest.patchDiffPath}`);

  if (recentIterations.length) {
    lines.push(divider("Recent Iterations"));
    for (const iteration of recentIterations.slice(-8).reverse()) {
      lines.push(`#${String(iteration.index).padStart(3)}  ${String(iteration.status || "-").padEnd(22)}  delta=${formatPercent(iteration.deltaPct).padEnd(8)}  ${shorten(iteration.note || "-", 80)}`);
    }
  }

  if (promptPreview.length) {
    lines.push(divider("AI Prompt Preview"));
    lines.push(...promptPreview);
  }
  if (responsePreview.length) {
    lines.push(divider("AI Response Preview"));
    lines.push(...responsePreview);
  }
  if (stdoutTail.length) {
    lines.push(divider("Delegate Stdout Tail"));
    lines.push(...stdoutTail);
  }
  if (stderrTail.length) {
    lines.push(divider("Delegate Stderr Tail"));
    lines.push(...stderrTail);
  }
  if (files.length) {
    lines.push(divider("Recent Session Files"));
    for (const file of files) {
      lines.push(`${file.name.padEnd(36)} ${new Date(file.mtimeMs).toLocaleTimeString("ja-JP", { hour12: false })}  ${file.size} B`);
    }
  }

  lines.push(divider());
  lines.push(`Refresh         : ${new Date().toLocaleTimeString("ja-JP", { hour12: false })}`);
  lines.push("Exit            : Ctrl+C");
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const statusFile = await resolveStatusFile(cli);
  while (true) {
    try {
      await render(cli, statusFile);
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
