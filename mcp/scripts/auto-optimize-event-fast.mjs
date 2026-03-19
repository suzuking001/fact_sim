import path from "node:path";
import process from "node:process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { FactSimRuntime } from "../dist/fact-sim-runtime.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mcpRoot, "..");
const cwd = mcpRoot;
let currentSessionDir = null;
let currentControlServer = null;

function nowIso() {
  return new Date().toISOString();
}

function stamp() {
  return nowIso().replace(/[:.]/g, "-");
}

function sanitizePart(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function parseList(value) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIntList(value) {
  return parseList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(1, Math.floor(Math.abs(item))));
}

function parseArgs(argv) {
  const out = {
    label: "",
    profile: "nightly",
    engines: ["dt", "event", "event-fast", "event-fast-worker", "event-fast-par"],
    optimizeEngines: ["event-fast-par"],
    targetEngine: "event-fast-par",
    examples: null,
    benchmarkExample: "",
    seeds: [1],
    includeCurrentGraph: false,
    includeExamples: true,
    strict: true,
    reruns: 2,
    stopOnFirstFailure: true,
    benchmarkWallMs: 2000,
    delegateTimeoutMs: 900000,
    minImprovementPct: 1,
    maxIterations: 999,
    minRuntimeHours: 0,
    maxNoImprovementIterations: 24,
    promptMode: "",
    scopeMode: "",
    statusFile: "",
    patchCommand: "",
    dryRun: false,
    allowDirty: false,
    _explicit: new Set()
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
      case "label":
        out._explicit.add("label");
        out.label = String(takeValue() || "").trim();
        break;
      case "profile":
        out._explicit.add("profile");
        out.profile = String(takeValue() || out.profile).trim() || out.profile;
        break;
      case "engines":
        out._explicit.add("engines");
        out.engines = parseList(takeValue());
        break;
      case "optimize-engines":
        out._explicit.add("optimizeEngines");
        out.optimizeEngines = parseList(takeValue());
        break;
      case "target-engine":
        out._explicit.add("targetEngine");
        out.targetEngine = String(takeValue() || out.targetEngine).trim() || out.targetEngine;
        break;
      case "examples":
        out._explicit.add("examples");
        out.examples = parseList(takeValue());
        break;
      case "benchmark-example":
        out._explicit.add("benchmarkExample");
        out.benchmarkExample = String(takeValue() || "").trim();
        break;
      case "seeds":
        out._explicit.add("seeds");
        out.seeds = parseIntList(takeValue());
        break;
      case "benchmark-wall-ms":
        out._explicit.add("benchmarkWallMs");
        out.benchmarkWallMs = Math.max(100, Number(takeValue()) || out.benchmarkWallMs);
        break;
      case "delegate-timeout-ms":
        out._explicit.add("delegateTimeoutMs");
        out.delegateTimeoutMs = Math.max(30000, Number(takeValue()) || out.delegateTimeoutMs);
        break;
      case "min-improvement-pct":
        out._explicit.add("minImprovementPct");
        out.minImprovementPct = Number(takeValue());
        if (!Number.isFinite(out.minImprovementPct)) out.minImprovementPct = 1;
        break;
      case "max-iterations":
        out._explicit.add("maxIterations");
        out.maxIterations = Math.max(1, Math.floor(Number(takeValue()) || out.maxIterations));
        break;
      case "min-runtime-hours":
        out._explicit.add("minRuntimeHours");
        out.minRuntimeHours = Math.max(0, Number(takeValue()) || 0);
        break;
      case "max-no-improvement-iterations":
        out._explicit.add("maxNoImprovementIterations");
        out.maxNoImprovementIterations = Math.max(1, Math.floor(Number(takeValue()) || out.maxNoImprovementIterations));
        break;
      case "prompt-mode":
        out._explicit.add("promptMode");
        out.promptMode = String(takeValue() || "").trim().toLowerCase();
        break;
      case "scope-mode":
        out._explicit.add("scopeMode");
        out.scopeMode = String(takeValue() || "").trim().toLowerCase();
        break;
      case "status-file":
        out._explicit.add("statusFile");
        out.statusFile = String(takeValue() || "").trim();
        break;
      case "patch-command":
        out._explicit.add("patchCommand");
        out.patchCommand = String(takeValue() || "").trim();
        break;
      case "reruns":
        out._explicit.add("reruns");
        out.reruns = Math.max(0, Math.floor(Number(takeValue()) || out.reruns));
        break;
      case "strict":
        out._explicit.add("strict");
        out.strict = true;
        break;
      case "no-strict":
        out._explicit.add("strict");
        out.strict = false;
        break;
      case "stop-on-first-failure":
        out._explicit.add("stopOnFirstFailure");
        out.stopOnFirstFailure = true;
        break;
      case "no-stop-on-first-failure":
        out._explicit.add("stopOnFirstFailure");
        out.stopOnFirstFailure = false;
        break;
      case "include-current-graph":
        out._explicit.add("includeCurrentGraph");
        out.includeCurrentGraph = true;
        break;
      case "no-current-graph":
        out._explicit.add("includeCurrentGraph");
        out.includeCurrentGraph = false;
        break;
      case "dry-run":
        out.dryRun = true;
        break;
      case "allow-dirty":
        out.allowDirty = true;
        break;
      default:
        break;
    }
  }
  out.engines = Array.from(new Set(out.engines.map((item) => String(item || "").trim()).filter(Boolean)));
  out.optimizeEngines = Array.from(new Set(out.optimizeEngines.map((item) => String(item || "").trim()).filter(Boolean)));
  if (!out.optimizeEngines.length && out.targetEngine) {
    out.optimizeEngines = [String(out.targetEngine).trim()].filter(Boolean);
  }
  if (!out.benchmarkExample) {
    out.benchmarkExample = out.targetEngine === "event-fast-par" ? "parallel_benchmark" : "";
  }
  return applyProfileDefaults(out);
}

function applyProfileDefaults(cli) {
  const explicit = cli._explicit || new Set();
  const targetEngine = String(cli.targetEngine || "").trim() || "event-fast-par";
  const focusedEngines = Array.from(new Set(["dt", targetEngine]));
  const presets = {
    cheap: {
      promptMode: "compact",
      scopeMode: "focused",
      benchmarkWallMs: 500,
      reruns: 0,
      maxNoImprovementIterations: 12,
      delegateTimeoutMs: 8 * 60 * 1000,
      engines: focusedEngines
    },
    balanced: {
      promptMode: "compact",
      scopeMode: "focused",
      benchmarkWallMs: 1000,
      reruns: 1,
      delegateTimeoutMs: 12 * 60 * 1000
    },
    nightly: {
      promptMode: "compact",
      scopeMode: "focused"
    },
    deep: {
      promptMode: "full",
      scopeMode: "broad",
      benchmarkWallMs: 2000,
      reruns: 2,
      delegateTimeoutMs: 15 * 60 * 1000
    }
  };
  const preset = presets[String(cli.profile || "").trim().toLowerCase()] || presets.nightly;
  for (const [key, value] of Object.entries(preset)) {
    if (explicit.has(key)) continue;
    cli[key] = Array.isArray(value) ? [...value] : value;
  }
  if (!cli.promptMode) cli.promptMode = "compact";
  if (!cli.scopeMode) cli.scopeMode = "focused";
  return cli;
}

function elapsedMsSince(isoStart) {
  const start = new Date(String(isoStart || "")).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Date.now() - start);
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, String(value ?? ""), "utf8");
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(String(text || "").replace(/^\uFEFF/, ""));
}

function toRelative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function normalizeFileList(values) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : []) {
    const normalized = String(raw || "").replace(/\\/g, "/").trim().replace(/^\.\//, "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function allowedPathsForEngine(engine, scopeMode = "broad") {
  const base = new Set();
  const value = String(engine || "").trim();
  const focused = String(scopeMode || "").trim().toLowerCase() === "focused";
  if (value === "event-fast") {
    base.add("js/app/engine-fast-runtime.js");
    base.add("js/app/engine-fast-compat.js");
    base.add("js/app/engine-fast-kernels.js");
  } else if (value === "event-fast-worker") {
    base.add("js/app/engine-fast-worker.js");
    base.add("js/app/engine-fast-worker-host.js");
    if (!focused) {
      base.add("js/app/engine-fast-runtime.js");
      base.add("js/app/engine-fast-compat.js");
      base.add("js/app/engine-fast-kernels.js");
    }
  } else if (value === "event-fast-par") {
    base.add("js/app/engine-fast-par-worker.js");
    base.add("js/app/engine-fast-par-host.js");
    base.add("js/app/engine-fast-par-partitioner.js");
    if (!focused) {
      base.add("js/app/engine-fast-worker.js");
      base.add("js/app/engine-fast-worker-host.js");
      base.add("js/app/engine-fast-runtime.js");
      base.add("js/app/engine-fast-compat.js");
      base.add("js/app/engine-fast-kernels.js");
    }
  }
  return Array.from(base);
}

function recommendedFilesForEngine(engine) {
  const value = String(engine || "").trim();
  if (value === "event-fast-par") {
    return [
      "js/app/engine-fast-par-host.js",
      "js/app/engine-fast-par-worker.js",
      "js/app/engine-fast-par-partitioner.js"
    ];
  }
  if (value === "event-fast-worker") {
    return [
      "js/app/engine-fast-worker-host.js",
      "js/app/engine-fast-worker.js"
    ];
  }
  return [
    "js/app/engine-fast-runtime.js",
    "js/app/engine-fast-compat.js",
    "js/app/engine-fast-kernels.js"
  ];
}

function makeEngineTestOptions(cli, suite, extra = {}) {
  return {
    suite,
    includeCurrentGraph: cli.includeCurrentGraph,
    includeExamples: cli.includeExamples,
    examples: Array.isArray(cli.examples) && cli.examples.length ? cli.examples : undefined,
    engines: cli.engines,
    seeds: cli.seeds,
    strictFinalParity: cli.strict,
    reruns: cli.reruns,
    stopOnFirstFailure: cli.stopOnFirstFailure,
    saveArtifacts: true,
    artifactLabel: [cli.label, suite].filter(Boolean).join("-"),
    ...extra
  };
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: options.stdio || ["ignore", "pipe", "pipe"],
      shell: !!options.shell
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: Number(code ?? 1), stdout, stderr }));
    if (options.stdinText && child.stdin) {
      child.stdin.write(options.stdinText);
      child.stdin.end();
    }
  });
}

async function killProcessTree(pid) {
  await runCommand("taskkill", ["/PID", String(pid), "/T", "/F"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  }).catch(() => null);
}

async function prepareBenchmarkExample(runtime, cli) {
  const example = String(cli.benchmarkExample || "").trim();
  if (!example) return null;
  await runtime.loadExample(example);
  return example;
}

function parseGitStatusPorcelain(text) {
  const rows = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.length < 4) continue;
    const status = line.slice(0, 2);
    const rawPath = line.slice(3).trim();
    const pathParts = rawPath.split(" -> ");
    const nextPath = String(pathParts[pathParts.length - 1] || "").replace(/\\/g, "/");
    rows.push({ status, path: nextPath });
  }
  return rows;
}

function mapStatusByPath(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.path, row.status);
  return map;
}

function computeTouchedPaths(beforeRows, afterRows) {
  const before = mapStatusByPath(beforeRows);
  const after = mapStatusByPath(afterRows);
  const touched = [];
  const allPaths = new Set([...before.keys(), ...after.keys()]);
  for (const filePath of allPaths) {
    if (before.get(filePath) !== after.get(filePath)) touched.push(filePath);
  }
  return normalizeFileList(touched);
}

async function gitStatus() {
  const result = await runCommand("git", ["status", "--porcelain=v1"], { cwd: repoRoot });
  if (result.code !== 0) throw new Error(`git status failed: ${result.stderr || result.stdout}`);
  return parseGitStatusPorcelain(result.stdout);
}

async function gitDiff(paths) {
  const normalized = normalizeFileList(paths);
  const args = ["diff", "--binary", "--"];
  if (normalized.length) args.push(...normalized);
  const result = await runCommand("git", args, { cwd: repoRoot });
  if (result.code !== 0) throw new Error(`git diff failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function gitRestoreTracked(paths) {
  const normalized = normalizeFileList(paths);
  if (!normalized.length) return;
  const result = await runCommand("git", ["restore", "--worktree", "--source=HEAD", "--", ...normalized], { cwd: repoRoot });
  if (result.code !== 0) throw new Error(`git restore failed: ${result.stderr || result.stdout}`);
}

async function gitIsTracked(filePath) {
  const result = await runCommand("git", ["ls-files", "--error-unmatch", filePath], { cwd: repoRoot });
  return result.code === 0;
}

async function ensureCleanWorktree() {
  const rows = await gitStatus();
  const nonArtifact = rows.filter((row) => !/^artifacts\//.test(row.path));
  if (nonArtifact.length) {
    const preview = nonArtifact.slice(0, 12).map((row) => `${row.status} ${row.path}`);
    throw new Error(`worktree must be clean before auto-optimize; found ${nonArtifact.length} dirty path(s): ${preview.join(", ")}`);
  }
}

async function snapshotFiles(paths) {
  const snapshot = new Map();
  for (const relativePath of normalizeFileList(paths)) {
    const fullPath = path.join(repoRoot, relativePath);
    try {
      const content = await readFile(fullPath, "utf8");
      snapshot.set(relativePath, { exists: true, content });
    } catch (_error) {
      snapshot.set(relativePath, { exists: false, content: "" });
    }
  }
  return snapshot;
}

async function restoreSnapshots(snapshot) {
  for (const [relativePath, state] of snapshot.entries()) {
    const fullPath = path.join(repoRoot, relativePath);
    if (!state.exists) {
      await rm(fullPath, { recursive: true, force: true });
      continue;
    }
    await ensureDir(path.dirname(fullPath));
    await writeFile(fullPath, state.content, "utf8");
  }
}

function benchmarkByMode(benchmark) {
  const out = {};
  for (const row of Array.isArray(benchmark?.results) ? benchmark.results : []) {
    const mode = String(row?.mode || "");
    const renderCase = String(row?.renderCase || "");
    if (!mode || renderCase !== "headless") continue;
    if (!out[mode] || Number(row.speed || 0) > Number(out[mode].speed || 0)) {
      out[mode] = {
        speed: Number(row.speed || 0),
        simSec: Number(row.simSec || 0),
        wallMs: Number(row.wallMs || 0)
      };
    }
  }
  return out;
}

function targetSpeed(benchmark, targetEngine) {
  const map = benchmarkByMode(benchmark);
  return Number(map[targetEngine]?.speed || 0);
}

function buildOptimizationRequest(session, baselineBenchmark, targetEngine, iteration) {
  return {
    version: 1,
    mode: "optimize",
    sessionId: session.sessionId,
    iteration,
    targetEngine,
    profile: session.profile,
    examples: session.config.examples,
    benchmarkExample: session.config.benchmarkExample,
    seeds: session.config.seeds,
    engines: session.config.engines,
    constraints: {
      protectEngines: ["dt", "event"],
      allowedPaths: allowedPathsForEngine(targetEngine, session.config.scopeMode)
    },
    recommendedFiles: recommendedFilesForEngine(targetEngine),
    promptMode: session.config.promptMode,
    scopeMode: session.config.scopeMode,
    benchmark: {
      wallMs: session.config.benchmarkWallMs,
      baseline: benchmarkByMode(baselineBenchmark),
      targetSpeed: targetSpeed(baselineBenchmark, targetEngine),
      minImprovementPct: session.config.minImprovementPct
    },
    verification: {
      suites: ["quick", "standard"],
      strictFinalParity: session.config.strict,
      reruns: session.config.reruns,
      stopOnFirstFailure: session.config.stopOnFirstFailure
    }
  };
}

function buildOptimizePrompt(request) {
  const promptMode = String(request?.promptMode || "compact").trim().toLowerCase();
  const lines = [];
  lines.push("Use the existing AGENTS.md instructions in this repo.");
  lines.push("Optimize the target event-fast* engine for speed while preserving dt parity.");
  lines.push("Only edit allowed paths. Do not modify dt or event (heap).");
  lines.push("Do not edit engine-test or other test-only helpers as part of performance optimization.");
  lines.push("");
  if (promptMode === "full") {
    lines.push("Optimization request:");
    lines.push("```json");
    lines.push(JSON.stringify(request, null, 2));
    lines.push("```");
    lines.push("");
  } else {
    lines.push(`Target engine: ${request.targetEngine}`);
    lines.push(`Prompt mode: ${promptMode}`);
    lines.push(`Scope mode: ${request.scopeMode || "focused"}`);
    lines.push(`Allowed paths: ${normalizeFileList(request?.constraints?.allowedPaths).join(", ") || "(none)"}`);
    lines.push(`Recommended files: ${normalizeFileList(request?.recommendedFiles).join(", ") || "(none)"}`);
    lines.push(`Benchmark example: ${request.benchmarkExample || "(default)"}`);
    lines.push(`Target speed: ${Number(request?.benchmark?.targetSpeed || 0).toFixed(3)}x`);
    lines.push(`Minimum improvement: ${Number(request?.benchmark?.minImprovementPct || 0)}%`);
    lines.push(`Verification after patch: suites=${Array.isArray(request?.verification?.suites) ? request.verification.suites.join(",") : "(default)"}, reruns=${Number(request?.verification?.reruns || 0)}, strictFinalParity=${request?.verification?.strictFinalParity ? "true" : "false"}`);
    lines.push("");
  }
  lines.push("Requirements:");
  lines.push("- Make one small, defensible performance improvement.");
  lines.push("- Preserve correctness relative to dt.");
  lines.push("- Prefer changes that improve headless benchmark speed for the target engine.");
  lines.push("- Do not broaden the patch beyond the allowed paths.");
  lines.push("- After editing, summarize the expected performance hypothesis.");
  return lines.join("\n");
}

async function hasCodexCli() {
  const probe = await runCommand("codex", ["--version"], { cwd: repoRoot });
  return probe.code === 0;
}

async function runCodexDelegate(prompt, outputPath) {
  const args = [
    "exec",
    "--full-auto",
    "-C",
    repoRoot,
    "--output-last-message",
    outputPath,
    "-"
  ];
  return runCommand("codex", args, {
    cwd: repoRoot,
    stdinText: prompt,
    stdio: ["pipe", "inherit", "inherit"]
  });
}

async function runWatchedProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: options.stdio || "inherit",
      shell: !!options.shell
    });
    let heartbeatHandle = null;
    let timeoutHandle = null;
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (heartbeatHandle) clearInterval(heartbeatHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve(result);
    };
    if (typeof options.onHeartbeat === "function") {
      const intervalMs = Math.max(5000, Number(options.heartbeatMs || 15000));
      heartbeatHandle = setInterval(() => {
        options.onHeartbeat(child.pid);
      }, intervalMs);
    }
    if (Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0) {
      timeoutHandle = setTimeout(async () => {
        await killProcessTree(child.pid).catch(() => null);
        await finish({ code: 124, timedOut: true });
      }, Number(options.timeoutMs));
    }
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (heartbeatHandle) clearInterval(heartbeatHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    });
    child.on("exit", async (code) => {
      await finish({ code: Number(code ?? 1), timedOut: false });
    });
  });
}

async function runDefaultPatchDelegate(sessionDir, requestPath, iterationIndex, options = {}) {
  return runWatchedProcess(process.execPath, [
    path.join("scripts", "auto-patch-event-fast.mjs"),
    "--patch-request",
    requestPath,
    "--session-dir",
    sessionDir,
    "--iteration",
    String(iterationIndex)
  ], {
    cwd,
    stdio: "inherit",
    env: {
      FACT_SIM_CODEX_TIMEOUT_MS: String(Math.max(30000, Number(options.timeoutMs || 0) || 300000))
    },
    timeoutMs: Math.max(60000, Number(options.timeoutMs || 0) || 300000) + 30000,
    heartbeatMs: options.heartbeatMs,
    onHeartbeat: options.onHeartbeat
  });
}

async function runShellDelegate(command, env) {
  return runWatchedProcess(command, [], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: true
  });
}

async function autoStartMonitor(statusHtmlFile) {
  if (process.env.FACT_SIM_DISABLE_AUTO_WATCH === "1") return { started: false, reason: "disabled" };
  if (process.env.FACT_SIM_AUTO_WATCH_STARTED === "1") return { started: false, reason: "already-started" };
  const env = { ...process.env, FACT_SIM_AUTO_WATCH_STARTED: "1" };
  if (process.platform === "win32") {
    const ps = `Start-Process -FilePath '${statusHtmlFile.replace(/'/g, "''")}'`;
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      ps
    ], {
      cwd: repoRoot,
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: false
    });
    child.unref();
    return { started: true, mode: "browser-dashboard" };
  }
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [statusHtmlFile], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: "ignore",
    shell: false
  });
  child.unref();
  return { started: true, mode: "browser-dashboard" };
}

function spawnStopHelper() {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", path.join(repoRoot, "scripts", "stop_auto_optimize.bat")], {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: false
    });
    child.unref();
    return;
  }
  const child = spawn("sh", ["-lc", "pkill -f 'auto-improve.mjs|auto-optimize-event-fast.mjs|auto-patch-event-fast.mjs|watch-auto-improve-status.mjs|watch-auto-optimize-status.mjs' || true"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
    shell: false
  });
  child.unref();
}

async function startControlServer() {
  if (currentControlServer) return currentControlServer;
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, status: "running" }));
      return;
    }
    if (req.method === "POST" && req.url === "/stop-all") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, message: "Stopping all auto-optimize jobs." }));
      setTimeout(() => {
        try {
          spawnStopHelper();
        } catch (_error) {}
      }, 250);
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "not-found" }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  currentControlServer = {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    stopAllUrl: `http://127.0.0.1:${port}/stop-all`
  };
  return currentControlServer;
}

async function revertForbiddenChanges(paths) {
  const tracked = [];
  const untracked = [];
  for (const filePath of normalizeFileList(paths)) {
    if (await gitIsTracked(filePath)) tracked.push(filePath);
    else untracked.push(filePath);
  }
  if (tracked.length) await gitRestoreTracked(tracked);
  for (const filePath of untracked) {
    await rm(path.join(repoRoot, filePath), { recursive: true, force: true });
  }
}

function buildSummaryMarkdown(session) {
  const lines = [];
  lines.push("# Auto Optimize Session");
  lines.push("");
  lines.push(`- Session ID: \`${session.sessionId}\``);
  lines.push(`- Status: \`${session.status}\``);
  lines.push(`- Target engine: \`${session.config.targetEngine}\``);
  lines.push(`- Started: \`${session.startedAt}\``);
  lines.push(`- Finished: \`${session.finishedAt || ""}\``);
  lines.push(`- Min improvement: \`${session.config.minImprovementPct}%\``);
  lines.push(`- Min runtime hours: \`${session.config.minRuntimeHours}\``);
  lines.push(`- Max no-improvement iterations: \`${session.config.maxNoImprovementIterations}\``);
  if (Number.isFinite(session.initialTargetSpeed)) lines.push(`- Initial target speed: \`${session.initialTargetSpeed.toFixed(3)}x\``);
  if (Number.isFinite(session.bestTargetSpeed)) lines.push(`- Best target speed: \`${session.bestTargetSpeed.toFixed(3)}x\``);
  if (Number.isFinite(session.currentImprovementPct)) lines.push(`- Current improvement: \`${session.currentImprovementPct.toFixed(2)}%\``);
  if (session.monitor?.statusFile) lines.push(`- Status file: \`${session.monitor.statusFile}\``);
  if (session.monitor?.statusHtmlFile) lines.push(`- Status dashboard: \`${session.monitor.statusHtmlFile}\``);
  if (session.monitor?.stopAllUrl) lines.push(`- Stop endpoint: \`${session.monitor.stopAllUrl}\``);
  if (session.monitor?.autoStart?.started) lines.push(`- Monitor: \`auto-started (${session.monitor.autoStart.mode || "unknown"})\``);
  lines.push("");
  lines.push("## Iterations");
  lines.push("");
  for (const iteration of session.iterations) {
    lines.push(`- #${iteration.index}: \`${iteration.status}\``);
    if (Number.isFinite(iteration.baselineSpeed)) lines.push(`  Baseline speed: ${iteration.baselineSpeed}`);
    if (Number.isFinite(iteration.afterSpeed)) lines.push(`  After speed: ${iteration.afterSpeed}`);
    if (Number.isFinite(iteration.deltaPct)) lines.push(`  Delta: ${iteration.deltaPct.toFixed(2)}%`);
    if (iteration.note) lines.push(`  Note: ${iteration.note}`);
    if (iteration.delegatePromptPath) lines.push(`  Prompt: ${iteration.delegatePromptPath}`);
    if (iteration.delegateMessagePath) lines.push(`  Response: ${iteration.delegateMessagePath}`);
  }
  return lines.join("\n");
}

function buildStatusPayload(session) {
  const latest = Array.isArray(session.iterations) && session.iterations.length
    ? session.iterations[session.iterations.length - 1]
    : null;
  const recentIterations = Array.isArray(session.iterations)
    ? session.iterations.slice(-8).map((iteration) => ({
      index: iteration.index,
      status: iteration.status,
      deltaPct: Number.isFinite(iteration.deltaPct) ? Number(iteration.deltaPct.toFixed(4)) : null,
      note: iteration.note || "",
      changedPaths: normalizeFileList(iteration.changedPaths).slice(0, 8),
      requestPath: iteration.requestPath || null,
      optimizePromptPath: iteration.optimizePromptPath || null,
      delegatePromptPath: iteration.delegatePromptPath || null,
      delegateMessagePath: iteration.delegateMessagePath || null,
      delegateStdoutPath: iteration.delegateStdoutPath || null,
      delegateStderrPath: iteration.delegateStderrPath || null,
      patchDiffPath: iteration.patchDiffPath || null
    }))
    : [];
  return {
    version: 1,
    sessionId: session.sessionId,
    status: session.status,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt || null,
    elapsedHours: Number((elapsedMsSince(session.startedAt) / 3600000).toFixed(3)),
    targetEngine: session.config?.targetEngine || null,
    benchmarkExample: session.config?.benchmarkExample || null,
    iterationCount: Array.isArray(session.iterations) ? session.iterations.length : 0,
    maxIterations: Number(session.config?.maxIterations || 0),
    minRuntimeHours: Number(session.config?.minRuntimeHours || 0),
    maxNoImprovementIterations: Number(session.config?.maxNoImprovementIterations || 0),
    consecutiveNoImprovement: Number(session.consecutiveNoImprovement || 0),
    initialTargetSpeed: Number.isFinite(session.initialTargetSpeed) ? Number(session.initialTargetSpeed.toFixed(6)) : null,
    bestTargetSpeed: Number.isFinite(session.bestTargetSpeed) ? Number(session.bestTargetSpeed.toFixed(6)) : null,
    currentImprovementPct: Number.isFinite(session.currentImprovementPct) ? Number(session.currentImprovementPct.toFixed(4)) : null,
    profile: session.profile || null,
    promptMode: session.config?.promptMode || null,
    scopeMode: session.config?.scopeMode || null,
    statusFile: session.monitor?.statusFile || null,
    statusHtmlFile: session.monitor?.statusHtmlFile || null,
    stopAllUrl: session.monitor?.stopAllUrl || null,
    monitor: session.monitor || null,
    latestIteration: latest ? {
      index: latest.index,
      status: latest.status,
      baselineSpeed: Number.isFinite(latest.baselineSpeed) ? Number(latest.baselineSpeed.toFixed(6)) : null,
      afterSpeed: Number.isFinite(latest.afterSpeed) ? Number(latest.afterSpeed.toFixed(6)) : null,
      deltaPct: Number.isFinite(latest.deltaPct) ? Number(latest.deltaPct.toFixed(4)) : null,
      note: latest.note || "",
      changedPaths: normalizeFileList(latest.changedPaths),
      requestPath: latest.requestPath || null,
      optimizePromptPath: latest.optimizePromptPath || null,
      patchResultPath: latest.patchResultPath || null,
      delegatePromptPath: latest.delegatePromptPath || null,
      delegateMessagePath: latest.delegateMessagePath || null,
      delegateStdoutPath: latest.delegateStdoutPath || null,
      delegateStderrPath: latest.delegateStderrPath || null,
      patchDiffPath: latest.patchDiffPath || null
    } : null,
    recentIterations
  };
}

function buildStatusMarkdown(session) {
  const status = buildStatusPayload(session);
  const lines = [];
  lines.push(`# Auto Optimize Status`);
  lines.push(``);
  lines.push(`- Session: \`${status.sessionId}\``);
  lines.push(`- Status: \`${status.status}\``);
  lines.push(`- Target: \`${status.targetEngine}\``);
  lines.push(`- Profile: \`${status.profile || "-"}\``);
  lines.push(`- Prompt / Scope: \`${status.promptMode || "-"} / ${status.scopeMode || "-"}\``);
  lines.push(`- Benchmark example: \`${status.benchmarkExample}\``);
  if (status.statusHtmlFile) lines.push(`- Status dashboard: \`${status.statusHtmlFile}\``);
  if (status.stopAllUrl) lines.push(`- Stop endpoint: \`${status.stopAllUrl}\``);
  lines.push(`- Elapsed: \`${status.elapsedHours.toFixed(3)} h\``);
  if (Number.isFinite(status.initialTargetSpeed)) lines.push(`- Initial speed: \`${status.initialTargetSpeed.toFixed(3)}x\``);
  if (Number.isFinite(status.bestTargetSpeed)) lines.push(`- Best speed: \`${status.bestTargetSpeed.toFixed(3)}x\``);
  if (Number.isFinite(status.currentImprovementPct)) lines.push(`- Improvement: \`${status.currentImprovementPct.toFixed(2)}%\``);
  lines.push(`- Consecutive no-improvement iterations: \`${status.consecutiveNoImprovement}/${status.maxNoImprovementIterations}\``);
  if (status.latestIteration) {
    lines.push(``);
    lines.push(`## Latest Iteration`);
    lines.push(`- #${status.latestIteration.index}: \`${status.latestIteration.status}\``);
    if (Number.isFinite(status.latestIteration.deltaPct)) lines.push(`- Delta: \`${status.latestIteration.deltaPct.toFixed(2)}%\``);
    if (status.latestIteration.note) lines.push(`- Note: ${status.latestIteration.note}`);
    if (status.latestIteration.optimizePromptPath) lines.push(`- Runner prompt: \`${status.latestIteration.optimizePromptPath}\``);
    if (status.latestIteration.delegatePromptPath) lines.push(`- Delegate prompt: \`${status.latestIteration.delegatePromptPath}\``);
    if (status.latestIteration.delegateMessagePath) lines.push(`- Delegate response: \`${status.latestIteration.delegateMessagePath}\``);
    if (status.latestIteration.patchDiffPath) lines.push(`- Patch diff: \`${status.latestIteration.patchDiffPath}\``);
  }
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function resolveStatusArtifactPath(filePath, sessionDir) {
  if (!filePath) return "";
  if (path.isAbsolute(filePath)) return filePath;
  const normalized = String(filePath).replace(/\\/g, "/");
  if (normalized.startsWith("artifacts/") || normalized.startsWith("tmp/")) {
    return path.resolve(repoRoot, filePath);
  }
  return path.resolve(sessionDir, filePath);
}

async function readPreviewText(filePath, lineCount = 20) {
  if (!filePath) return "";
  try {
    const text = await readFile(filePath, "utf8");
    return String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .slice(0, lineCount)
      .join("\n");
  } catch (_error) {
    return "";
  }
}

async function recentSessionFiles(sessionDir, limit = 10) {
  try {
    const entries = await readdir(sessionDir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(sessionDir, entry.name);
      const info = await stat(fullPath);
      files.push({
        name: entry.name,
        size: info.size,
        mtimeMs: info.mtimeMs
      });
    }
    return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
  } catch (_error) {
    return [];
  }
}

async function buildStatusHtml(session, sessionDir) {
  const status = buildStatusPayload(session);
  const latest = status.latestIteration || null;
  const promptPath = resolveStatusArtifactPath(latest?.delegatePromptPath || latest?.optimizePromptPath, sessionDir);
  const responsePath = resolveStatusArtifactPath(latest?.delegateMessagePath, sessionDir);
  const stdoutPath = resolveStatusArtifactPath(latest?.delegateStdoutPath, sessionDir);
  const stderrPath = resolveStatusArtifactPath(latest?.delegateStderrPath, sessionDir);
  const promptPreview = await readPreviewText(promptPath, 18);
  const responsePreview = await readPreviewText(responsePath, 18);
  const stdoutPreview = await readPreviewText(stdoutPath, 12);
  const stderrPreview = await readPreviewText(stderrPath, 12);
  const files = await recentSessionFiles(sessionDir, 12);
  const stopAllUrl = session.monitor?.stopAllUrl || "";
  const latestRows = latest ? `
    <tr><th>Index</th><td>${escapeHtml(latest.index)}</td></tr>
    <tr><th>Status</th><td>${escapeHtml(latest.status || "-")}</td></tr>
    <tr><th>Baseline</th><td>${Number.isFinite(latest.baselineSpeed) ? `${latest.baselineSpeed.toFixed(3)}x` : "-"}</td></tr>
    <tr><th>After</th><td>${Number.isFinite(latest.afterSpeed) ? `${latest.afterSpeed.toFixed(3)}x` : "-"}</td></tr>
    <tr><th>Delta</th><td>${Number.isFinite(latest.deltaPct) ? `${latest.deltaPct.toFixed(2)}%` : "-"}</td></tr>
    <tr><th>Note</th><td>${escapeHtml(latest.note || "-")}</td></tr>
  ` : `<tr><td colspan="2">No iteration yet.</td></tr>`;
  const recentRows = (status.recentIterations || []).slice().reverse().map((iteration) => `
    <tr>
      <td>${escapeHtml(iteration.index)}</td>
      <td>${escapeHtml(iteration.status || "-")}</td>
      <td>${Number.isFinite(iteration.deltaPct) ? `${iteration.deltaPct.toFixed(2)}%` : "-"}</td>
      <td>${escapeHtml(iteration.note || "-")}</td>
    </tr>
  `).join("");
  const fileRows = files.map((file) => `
    <tr>
      <td>${escapeHtml(file.name)}</td>
      <td>${new Date(file.mtimeMs).toLocaleTimeString("ja-JP", { hour12: false })}</td>
      <td>${escapeHtml(file.size)} B</td>
    </tr>
  `).join("");
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="3">
  <title>FACT SIM Auto Optimize Status</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f5f7fb; color: #172033; }
    main { max-width: 1280px; margin: 0 auto; padding: 20px 24px 40px; }
    h1, h2 { margin: 0 0 12px; }
    .meta { color: #58657e; margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .card { background: #fff; border: 1px solid #d8e0ee; border-radius: 14px; padding: 14px 16px; box-shadow: 0 8px 20px rgba(32, 55, 98, 0.06); }
    .toolbar { display: flex; gap: 12px; align-items: center; margin: 0 0 18px; flex-wrap: wrap; }
    button { appearance: none; border: 0; border-radius: 999px; padding: 12px 18px; font: inherit; font-weight: 700; cursor: pointer; }
    button.primary { background: #d94a4a; color: #fff; }
    button.primary:disabled { background: #c4cad8; cursor: not-allowed; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #73819c; }
    .value { font-size: 24px; font-weight: 700; margin-top: 6px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6ebf5; vertical-align: top; }
    th { width: 140px; color: #5d6b85; font-weight: 600; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: #0f1728; color: #e9eefc; border-radius: 12px; padding: 14px; max-height: 300px; overflow: auto; }
    .mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    @media (max-width: 920px) { .row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>FACT SIM Auto Optimize</h1>
    <div class="meta">Session: <span class="mono">${escapeHtml(status.sessionId || "-")}</span> | Updated: ${escapeHtml(new Date().toLocaleString("ja-JP", { hour12: false }))}</div>
    <div class="toolbar">
      <button id="stop-all-button" class="primary" ${stopAllUrl ? "" : "disabled"}>Stop All Auto-Optimize Jobs</button>
      <div id="stop-all-status" class="meta">${escapeHtml(stopAllUrl ? "Use this button to stop all old and current auto-optimize jobs." : "Stop endpoint unavailable. Use scripts/stop_auto_optimize.bat.")}</div>
    </div>
    <section class="grid">
      <div class="card"><div class="label">Status</div><div class="value">${escapeHtml(status.status || "-")}</div></div>
      <div class="card"><div class="label">Target</div><div class="value">${escapeHtml(status.targetEngine || "-")}</div></div>
      <div class="card"><div class="label">Improvement</div><div class="value">${Number.isFinite(status.currentImprovementPct) ? `${status.currentImprovementPct.toFixed(2)}%` : "-"}</div></div>
      <div class="card"><div class="label">Initial</div><div class="value">${Number.isFinite(status.initialTargetSpeed) ? `${status.initialTargetSpeed.toFixed(3)}x` : "-"}</div></div>
      <div class="card"><div class="label">Best</div><div class="value">${Number.isFinite(status.bestTargetSpeed) ? `${status.bestTargetSpeed.toFixed(3)}x` : "-"}</div></div>
      <div class="card"><div class="label">Iterations</div><div class="value">${escapeHtml(status.iterationCount)} / ${escapeHtml(status.maxIterations)}</div></div>
    </section>
    <section class="row">
      <div class="card">
        <h2>Latest Iteration</h2>
        <table>${latestRows}</table>
      </div>
      <div class="card">
        <h2>Recent Iterations</h2>
        <table>
          <thead><tr><th>#</th><th>Status</th><th>Delta</th><th>Note</th></tr></thead>
          <tbody>${recentRows || '<tr><td colspan="4">No iterations yet.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="row">
      <div class="card">
        <h2>AI Prompt Preview</h2>
        <pre>${escapeHtml(promptPreview || "(not available yet)")}</pre>
      </div>
      <div class="card">
        <h2>AI Response Preview</h2>
        <pre>${escapeHtml(responsePreview || "(not available yet)")}</pre>
      </div>
    </section>
    <section class="row">
      <div class="card">
        <h2>Delegate Stdout</h2>
        <pre>${escapeHtml(stdoutPreview || "(not available yet)")}</pre>
      </div>
      <div class="card">
        <h2>Delegate Stderr</h2>
        <pre>${escapeHtml(stderrPreview || "(not available yet)")}</pre>
      </div>
    </section>
    <section class="card" style="margin-top:16px;">
      <h2>Recent Session Files</h2>
      <table>
        <thead><tr><th>Name</th><th>Updated</th><th>Size</th></tr></thead>
        <tbody>${fileRows || '<tr><td colspan="3">No files yet.</td></tr>'}</tbody>
      </table>
    </section>
  </main>
  <script>
    const stopAllUrl = ${JSON.stringify(stopAllUrl)};
    const stopButton = document.getElementById("stop-all-button");
    const stopStatus = document.getElementById("stop-all-status");
    if (stopButton) {
      stopButton.addEventListener("click", async () => {
        if (!stopAllUrl) {
          stopStatus.textContent = "Stop endpoint unavailable. Run scripts/stop_auto_optimize.bat.";
          return;
        }
        if (!window.confirm("Stop all running auto-optimize jobs?")) return;
        stopButton.disabled = true;
        stopStatus.textContent = "Stopping jobs...";
        try {
          const response = await fetch(stopAllUrl, { method: "POST", mode: "cors" });
          if (!response.ok) throw new Error("stop request failed");
          stopStatus.textContent = "Stop request sent. The page will stop updating shortly.";
        } catch (error) {
          stopButton.disabled = false;
          stopStatus.textContent = "Failed to send stop request. Use scripts/stop_auto_optimize.bat.";
        }
      });
    }
  </script>
</body>
</html>`;
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const sessionId = `${stamp()}${cli.label ? `__${sanitizePart(cli.label)}` : ""}`;
  const sessionDir = path.join(repoRoot, "artifacts", "auto-optimize", sessionId);
  currentSessionDir = sessionDir;
  await ensureDir(sessionDir);
  if (!cli.allowDirty) {
    await ensureCleanWorktree();
  }

  const session = {
    version: 1,
    sessionId,
    startedAt: nowIso(),
    finishedAt: null,
    status: "running",
    profile: cli.profile,
    config: {
      engines: cli.engines,
      optimizeEngines: cli.optimizeEngines,
      targetEngine: cli.targetEngine,
      examples: cli.examples,
      benchmarkExample: cli.benchmarkExample,
      seeds: cli.seeds,
      includeCurrentGraph: cli.includeCurrentGraph,
      includeExamples: cli.includeExamples,
      strict: cli.strict,
      reruns: cli.reruns,
      stopOnFirstFailure: cli.stopOnFirstFailure,
      benchmarkWallMs: cli.benchmarkWallMs,
      delegateTimeoutMs: cli.delegateTimeoutMs,
      promptMode: cli.promptMode,
      scopeMode: cli.scopeMode,
      minImprovementPct: cli.minImprovementPct,
      maxIterations: cli.maxIterations,
      minRuntimeHours: cli.minRuntimeHours,
      maxNoImprovementIterations: cli.maxNoImprovementIterations,
      statusFile: cli.statusFile || ""
    },
    baselineBenchmark: null,
    bestBenchmark: null,
    initialTargetSpeed: null,
    bestTargetSpeed: null,
    currentImprovementPct: 0,
    consecutiveNoImprovement: 0,
    monitor: null,
    iterations: []
  };

  const statusFile = cli.statusFile
    ? (path.isAbsolute(cli.statusFile) ? cli.statusFile : path.resolve(repoRoot, cli.statusFile))
    : path.join(repoRoot, "artifacts", "auto-optimize", "latest-event-fast-par-status.json");
  const statusMarkdownFile = statusFile.replace(/\.json$/i, ".md");
  const statusHtmlFile = statusFile.replace(/\.json$/i, ".html");
  const persistSession = async () => {
    await writeJson(path.join(sessionDir, "session.json"), session);
    await writeText(path.join(sessionDir, "summary.md"), buildSummaryMarkdown(session));
    await writeJson(statusFile, buildStatusPayload(session));
    await writeText(statusMarkdownFile, buildStatusMarkdown(session));
    await writeText(statusHtmlFile, await buildStatusHtml(session, sessionDir));
  };
  if (!cli.dryRun) {
    try {
      const control = await startControlServer();
      session.monitor = {
        statusFile: toRelative(statusFile),
        statusMarkdownFile: toRelative(statusMarkdownFile),
        statusHtmlFile: toRelative(statusHtmlFile),
        stopAllUrl: control.stopAllUrl,
        autoStart: await autoStartMonitor(statusHtmlFile)
      };
    } catch (error) {
      session.monitor = {
        statusFile: toRelative(statusFile),
        statusMarkdownFile: toRelative(statusMarkdownFile),
        statusHtmlFile: toRelative(statusHtmlFile),
        autoStart: {
          started: false,
          reason: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
  await persistSession();

  const runtime = new FactSimRuntime({ repoRoot, preferredPort: 8123, logger: () => {} });
  try {
    const quick = await runtime.runEngineTests(makeEngineTestOptions(cli, "quick", { artifactLabel: [cli.label, "preflight-quick"].filter(Boolean).join("-") }));
    await writeJson(path.join(sessionDir, "preflight-quick.json"), quick);
    if (quick.status === "FAIL") {
      session.status = "FAIL";
      session.finishedAt = nowIso();
      session.preflight = { quick: quick.status };
      await persistSession();
      process.exitCode = 1;
      return;
    }

    const standard = await runtime.runEngineTests(makeEngineTestOptions(cli, "standard", { artifactLabel: [cli.label, "preflight-standard"].filter(Boolean).join("-") }));
    await writeJson(path.join(sessionDir, "preflight-standard.json"), standard);
    if (standard.status === "FAIL") {
      session.status = "FAIL";
      session.finishedAt = nowIso();
      session.preflight = { quick: quick.status, standard: standard.status };
      await persistSession();
      process.exitCode = 1;
      return;
    }

    await prepareBenchmarkExample(runtime, cli);
    let baselineBenchmark = await runtime.runBenchmark(cli.benchmarkWallMs);
    session.baselineBenchmark = benchmarkByMode(baselineBenchmark);
    session.bestBenchmark = benchmarkByMode(baselineBenchmark);
    session.initialTargetSpeed = targetSpeed(baselineBenchmark, cli.targetEngine);
    session.bestTargetSpeed = session.initialTargetSpeed;
    session.currentImprovementPct = 0;
    await writeJson(path.join(sessionDir, "benchmark-baseline.json"), baselineBenchmark);
    await persistSession();

    const minRuntimeMs = Math.max(0, Number(cli.minRuntimeHours || 0) * 3600000);
    for (let iterationIndex = 1; iterationIndex <= cli.maxIterations; iterationIndex += 1) {
      const mustContinueForTime = elapsedMsSince(session.startedAt) < minRuntimeMs;
      const canContinueByExploration = Number(session.consecutiveNoImprovement || 0) < Number(cli.maxNoImprovementIterations || 0);
      if (iterationIndex > 1 && !mustContinueForTime && !canContinueByExploration) break;
      const request = buildOptimizationRequest(session, baselineBenchmark, cli.targetEngine, iterationIndex);
      const requestPath = path.join(sessionDir, `optimization-request.iteration-${iterationIndex}.json`);
      const latestRequestPath = path.join(sessionDir, "optimization-request.json");
      await writeJson(requestPath, request);
      await writeJson(latestRequestPath, request);

      const iterationRecord = {
        index: iterationIndex,
        status: "pending",
        baselineSpeed: targetSpeed(baselineBenchmark, cli.targetEngine),
        requestPath: toRelative(requestPath)
      };
      session.iterations.push(iterationRecord);
      await persistSession();

      if (cli.dryRun) {
        iterationRecord.status = "dry-run";
        iterationRecord.note = "Dry run only. No delegate executed.";
        session.status = "DRY-RUN";
        session.finishedAt = nowIso();
        await persistSession();
        return;
      }

      const allowedPaths = normalizeFileList(request.constraints.allowedPaths);
      const beforeStatus = await gitStatus();
      const beforeSnapshots = await snapshotFiles(allowedPaths);
      const promptPath = path.join(sessionDir, `optimize-prompt.iteration-${iterationIndex}.md`);
      const patchDiffPath = path.join(sessionDir, `patch.iteration-${iterationIndex}.diff`);
      const patchResultPath = path.join(sessionDir, `patch-result.iteration-${iterationIndex}.json`);
      await writeText(promptPath, buildOptimizePrompt(request));
      iterationRecord.optimizePromptPath = toRelative(promptPath);
      iterationRecord.patchResultPath = toRelative(patchResultPath);
      iterationRecord.status = "patching";
      iterationRecord.patchStartedAt = nowIso();
      iterationRecord.note = "Delegate running.";
      await persistSession();

      let delegateExit = 0;
      if (cli.patchCommand) {
        const response = await runShellDelegate(cli.patchCommand, {
          FACT_SIM_SESSION_DIR: sessionDir,
          FACT_SIM_REPO_ROOT: repoRoot,
          FACT_SIM_OPTIMIZATION_REQUEST: latestRequestPath,
          FACT_SIM_TARGET_ENGINE: cli.targetEngine,
          FACT_SIM_ITERATION: String(iterationIndex)
        });
        delegateExit = Number(response.code || 1);
      } else if (await hasCodexCli()) {
        const response = await runDefaultPatchDelegate(sessionDir, latestRequestPath, iterationIndex, {
          timeoutMs: cli.delegateTimeoutMs,
          heartbeatMs: 15000,
          onHeartbeat: async () => {
            const elapsedSec = Math.max(0, Math.round((Date.now() - new Date(iterationRecord.patchStartedAt).getTime()) / 1000));
            iterationRecord.status = "patching";
            iterationRecord.note = `Delegate running for ${elapsedSec}s.`;
            await persistSession();
          }
        });
        delegateExit = Number(response.code || 1);
      } else {
        iterationRecord.status = "blocked";
        iterationRecord.note = "No patch delegate configured and codex CLI was not available.";
        session.status = "FAIL";
        session.finishedAt = nowIso();
        await persistSession();
        process.exitCode = 1;
        return;
      }

      iterationRecord.delegateExitCode = delegateExit;
      let patchResult = null;
      try {
        patchResult = await readJson(patchResultPath);
      } catch (_error) {}
      if (patchResult && typeof patchResult === "object") {
        iterationRecord.delegatePromptPath = patchResult.promptPath || null;
        iterationRecord.delegateMessagePath = patchResult.delegateMessagePath || null;
        iterationRecord.delegateStdoutPath = patchResult.delegateStdoutPath || null;
        iterationRecord.delegateStderrPath = patchResult.delegateStderrPath || null;
        iterationRecord.patchDiffPath = patchResult.patchDiffPath || iterationRecord.patchDiffPath || null;
      }
      if (delegateExit !== 0) {
        if (patchResult && typeof patchResult.status === "string") {
          iterationRecord.status = patchResult.status;
          iterationRecord.note = Array.isArray(patchResult.notes) ? patchResult.notes.join(" ") : "";
          iterationRecord.changedPaths = normalizeFileList(patchResult.changedPaths);
          iterationRecord.patchDiffPath = patchResult.patchDiffPath || undefined;
          session.consecutiveNoImprovement += 1;
          await persistSession();
          continue;
        }
        iterationRecord.status = "delegate-failed";
        iterationRecord.note = `Delegate exited with code ${delegateExit}.`;
        session.consecutiveNoImprovement += 1;
        await persistSession();
        continue;
      }

      const afterStatus = await gitStatus();
      const touchedPaths = computeTouchedPaths(beforeStatus, afterStatus).filter((item) => !/^artifacts\//.test(item));
      iterationRecord.touchedPaths = touchedPaths;
      const forbiddenPaths = touchedPaths.filter((item) => !allowedPaths.includes(item));
      if (forbiddenPaths.length) {
        iterationRecord.status = "forbidden-paths";
        iterationRecord.note = `Delegate touched forbidden paths: ${forbiddenPaths.join(", ")}`;
        await revertForbiddenChanges(forbiddenPaths);
        session.consecutiveNoImprovement += 1;
        await restoreSnapshots(beforeSnapshots);
        await persistSession();
        continue;
      }

      const allowedChanged = [];
      for (const allowedPath of allowedPaths) {
        const currentPath = path.join(repoRoot, allowedPath);
        let currentContent = null;
        try {
          currentContent = await readFile(currentPath, "utf8");
        } catch (_error) {
          currentContent = null;
        }
        const previous = beforeSnapshots.get(allowedPath);
        const previousContent = previous && previous.exists ? previous.content : null;
        if (currentContent !== previousContent) allowedChanged.push(allowedPath);
      }
      iterationRecord.changedPaths = allowedChanged;
      if (allowedChanged.length) {
        await writeText(patchDiffPath, await gitDiff(allowedChanged));
        iterationRecord.patchDiffPath = toRelative(patchDiffPath);
      }
      if (!allowedChanged.length) {
        iterationRecord.status = "no-op";
        iterationRecord.note = "Delegate finished without changing the target engine files.";
        session.consecutiveNoImprovement += 1;
        await persistSession();
        continue;
      }

      const quickAfter = await runtime.runEngineTests(makeEngineTestOptions(cli, "quick", { artifactLabel: [cli.label, `iter${iterationIndex}-quick`].filter(Boolean).join("-") }));
      await writeJson(path.join(sessionDir, `engine-test-quick.iteration-${iterationIndex}.json`), quickAfter);
      if (quickAfter.status === "FAIL") {
        iterationRecord.status = "reverted-quick-fail";
        iterationRecord.note = "Quick verification failed; reverted patch.";
        session.consecutiveNoImprovement += 1;
        await restoreSnapshots(beforeSnapshots);
        await persistSession();
        continue;
      }

      const standardAfter = await runtime.runEngineTests(makeEngineTestOptions(cli, "standard", { artifactLabel: [cli.label, `iter${iterationIndex}-standard`].filter(Boolean).join("-") }));
      await writeJson(path.join(sessionDir, `engine-test-standard.iteration-${iterationIndex}.json`), standardAfter);
      if (standardAfter.status === "FAIL") {
        iterationRecord.status = "reverted-standard-fail";
        iterationRecord.note = "Standard verification failed; reverted patch.";
        session.consecutiveNoImprovement += 1;
        await restoreSnapshots(beforeSnapshots);
        await persistSession();
        continue;
      }

      await prepareBenchmarkExample(runtime, cli);
      const benchmarkAfter = await runtime.runBenchmark(cli.benchmarkWallMs);
      await writeJson(path.join(sessionDir, `benchmark-after.iteration-${iterationIndex}.json`), benchmarkAfter);
      const beforeSpeed = targetSpeed(baselineBenchmark, cli.targetEngine);
      const afterSpeed = targetSpeed(benchmarkAfter, cli.targetEngine);
      const deltaPct = beforeSpeed > 0 ? ((afterSpeed - beforeSpeed) / beforeSpeed) * 100 : 0;
      iterationRecord.afterSpeed = afterSpeed;
      iterationRecord.deltaPct = deltaPct;
      await writeJson(path.join(sessionDir, `benchmark-delta.iteration-${iterationIndex}.json`), {
        targetEngine: cli.targetEngine,
        beforeSpeed,
        afterSpeed,
        deltaPct,
        minImprovementPct: cli.minImprovementPct
      });

      if (!Number.isFinite(deltaPct) || deltaPct < cli.minImprovementPct) {
        iterationRecord.status = "reverted-no-improvement";
        iterationRecord.note = `Improvement ${Number.isFinite(deltaPct) ? deltaPct.toFixed(2) : "NaN"}% was below threshold ${cli.minImprovementPct}%.`;
        session.consecutiveNoImprovement += 1;
        await restoreSnapshots(beforeSnapshots);
        await persistSession();
        continue;
      }

      iterationRecord.status = "accepted";
      baselineBenchmark = benchmarkAfter;
      session.bestBenchmark = benchmarkByMode(benchmarkAfter);
      session.bestTargetSpeed = targetSpeed(benchmarkAfter, cli.targetEngine);
      session.currentImprovementPct = session.initialTargetSpeed > 0
        ? ((session.bestTargetSpeed - session.initialTargetSpeed) / session.initialTargetSpeed) * 100
        : 0;
      session.consecutiveNoImprovement = 0;
      await writeJson(path.join(sessionDir, "benchmark-best.json"), benchmarkAfter);
      await persistSession();
    }

    const accepted = session.iterations.filter((row) => row.status === "accepted");
    session.status = accepted.length ? "PASS" : "WARN";
    session.finishedAt = nowIso();
    await persistSession();
  } finally {
    await runtime.close();
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  try {
    const sessionDir = currentSessionDir || path.join(repoRoot, "artifacts", "auto-optimize", `${stamp()}__error`);
    await ensureDir(sessionDir);
    await writeJson(path.join(sessionDir, "session.json"), {
      version: 1,
      startedAt: nowIso(),
      finishedAt: nowIso(),
      status: "ERROR",
      message
    });
  } catch (_writeErr) {}
  console.error(message);
  process.exit(1);
});
