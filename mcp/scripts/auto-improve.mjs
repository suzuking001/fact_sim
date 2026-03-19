import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(mcpRoot, "..");

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
    job: "",
    label: "",
    profile: "",
    targetEngine: "",
    optimizeEngines: null,
    engines: null,
    examples: null,
    seeds: null,
    benchmarkExample: "",
    benchmarkWallMs: null,
    delegateTimeoutMs: null,
    minImprovementPct: null,
    maxIterations: null,
    minRuntimeHours: null,
    maxNoImprovementIterations: null,
    promptMode: "",
    scopeMode: "",
    statusFile: "",
    patchCommand: "",
    includeCurrentGraph: null,
    strict: null,
    reruns: null,
    stopOnFirstFailure: null,
    allowDirty: false,
    dryRun: false
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
      case "label":
        out.label = String(takeValue() || "").trim();
        break;
      case "profile":
        out.profile = String(takeValue() || "").trim();
        break;
      case "target-engine":
        out.targetEngine = String(takeValue() || "").trim();
        break;
      case "optimize-engines":
        out.optimizeEngines = parseList(takeValue());
        break;
      case "engines":
        out.engines = parseList(takeValue());
        break;
      case "examples":
        out.examples = parseList(takeValue());
        break;
      case "seeds":
        out.seeds = parseIntList(takeValue());
        break;
      case "benchmark-example":
        out.benchmarkExample = String(takeValue() || "").trim();
        break;
      case "benchmark-wall-ms":
        out.benchmarkWallMs = Math.max(100, Number(takeValue()) || 0);
        break;
      case "delegate-timeout-ms":
        out.delegateTimeoutMs = Math.max(30000, Number(takeValue()) || 0);
        break;
      case "min-improvement-pct":
        out.minImprovementPct = Number(takeValue());
        break;
      case "max-iterations":
        out.maxIterations = Math.max(1, Math.floor(Number(takeValue()) || 0));
        break;
      case "min-runtime-hours":
        out.minRuntimeHours = Math.max(0, Number(takeValue()) || 0);
        break;
      case "max-no-improvement-iterations":
        out.maxNoImprovementIterations = Math.max(1, Math.floor(Number(takeValue()) || 0));
        break;
      case "prompt-mode":
        out.promptMode = String(takeValue() || "").trim().toLowerCase();
        break;
      case "scope-mode":
        out.scopeMode = String(takeValue() || "").trim().toLowerCase();
        break;
      case "status-file":
        out.statusFile = String(takeValue() || "").trim();
        break;
      case "patch-command":
        out.patchCommand = String(takeValue() || "").trim();
        break;
      case "reruns":
        out.reruns = Math.max(0, Math.floor(Number(takeValue()) || 0));
        break;
      case "include-current-graph":
        out.includeCurrentGraph = true;
        break;
      case "no-current-graph":
        out.includeCurrentGraph = false;
        break;
      case "strict":
        out.strict = true;
        break;
      case "no-strict":
        out.strict = false;
        break;
      case "stop-on-first-failure":
        out.stopOnFirstFailure = true;
        break;
      case "no-stop-on-first-failure":
        out.stopOnFirstFailure = false;
        break;
      case "allow-dirty":
        out.allowDirty = true;
        break;
      case "dry-run":
        out.dryRun = true;
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

function resolveJobPath(jobValue) {
  if (!jobValue) throw new Error("--job is required");
  return path.isAbsolute(jobValue)
    ? jobValue
    : path.resolve(repoRoot, jobValue);
}

function pick(cliValue, jobValue, fallback = null) {
  if (cliValue === null || cliValue === undefined || cliValue === "") return jobValue ?? fallback;
  return cliValue;
}

function pushValueArg(args, name, value) {
  if (value === null || value === undefined || value === "") return;
  if (Array.isArray(value)) {
    if (!value.length) return;
    args.push(name, value.join(","));
    return;
  }
  args.push(name, String(value));
}

function pushBooleanArg(args, positiveName, negativeName, value) {
  if (value === true) args.push(positiveName);
  else if (value === false) args.push(negativeName);
}

function buildOptimizeArgs(job, cli) {
  const defaults = job.defaults || {};
  const runtime = job.runtime || {};
  const target = job.target || {};
  const args = [path.join("scripts", "auto-optimize-event-fast.mjs")];

  const profile = pick(cli.profile, defaults.profile, "nightly");
  const profileChanged = Boolean(cli.profile) && String(cli.profile).trim() !== String(defaults.profile || "").trim();
  const label = cli.label || job.key || job.name || "";
  const targetEngine = pick(cli.targetEngine, target.engine, "event-fast-par");
  const optimizeEngines = cli.optimizeEngines !== null
    ? cli.optimizeEngines
    : (profileChanged ? null : (defaults.optimizeEngines ?? [targetEngine]));
  const engines = cli.engines !== null
    ? cli.engines
    : (profileChanged ? null : (defaults.engines ?? ["dt", "event", targetEngine]));
  const examples = cli.examples !== null ? cli.examples : defaults.examples;
  const seeds = pick(cli.seeds, defaults.seeds, [1]);
  const benchmarkExample = pick(cli.benchmarkExample, runtime.benchmarkExample, "");
  const benchmarkWallMs = cli.benchmarkWallMs !== null
    ? cli.benchmarkWallMs
    : (profileChanged ? null : (runtime.benchmarkWallMs ?? 2000));
  const delegateTimeoutMs = cli.delegateTimeoutMs !== null
    ? cli.delegateTimeoutMs
    : (profileChanged ? null : (runtime.delegateTimeoutMs ?? 900000));
  const minImprovementPct = pick(cli.minImprovementPct, runtime.minImprovementPct, 1);
  const maxIterations = pick(cli.maxIterations, runtime.maxIterations, 9999);
  const minRuntimeHours = pick(cli.minRuntimeHours, runtime.minRuntimeHours, 0);
  const maxNoImprovementIterations = cli.maxNoImprovementIterations !== null
    ? cli.maxNoImprovementIterations
    : (profileChanged ? null : (runtime.maxNoImprovementIterations ?? 60));
  const promptMode = pick(cli.promptMode, runtime.promptMode, "");
  const scopeMode = pick(cli.scopeMode, runtime.scopeMode, "");
  const statusFile = pick(cli.statusFile, job.statusFile, "");
  const includeCurrentGraph = pick(cli.includeCurrentGraph, defaults.includeCurrentGraph, false);
  const strict = cli.strict !== null
    ? cli.strict
    : (profileChanged ? null : (defaults.strict ?? true));
  const reruns = cli.reruns !== null
    ? cli.reruns
    : (profileChanged ? null : (defaults.reruns ?? 2));
  const stopOnFirstFailure = cli.stopOnFirstFailure !== null
    ? cli.stopOnFirstFailure
    : (profileChanged ? null : (defaults.stopOnFirstFailure ?? true));

  pushValueArg(args, "--profile", profile);
  pushValueArg(args, "--label", label);
  pushValueArg(args, "--target-engine", targetEngine);
  pushValueArg(args, "--optimize-engines", optimizeEngines);
  pushValueArg(args, "--engines", engines);
  if (examples !== null) pushValueArg(args, "--examples", examples);
  pushValueArg(args, "--seeds", seeds);
  pushValueArg(args, "--benchmark-example", benchmarkExample);
  pushValueArg(args, "--benchmark-wall-ms", benchmarkWallMs);
  pushValueArg(args, "--delegate-timeout-ms", delegateTimeoutMs);
  pushValueArg(args, "--min-improvement-pct", minImprovementPct);
  pushValueArg(args, "--max-iterations", maxIterations);
  pushValueArg(args, "--min-runtime-hours", minRuntimeHours);
  pushValueArg(args, "--max-no-improvement-iterations", maxNoImprovementIterations);
  pushValueArg(args, "--prompt-mode", promptMode);
  pushValueArg(args, "--scope-mode", scopeMode);
  pushValueArg(args, "--status-file", statusFile);
  pushValueArg(args, "--patch-command", cli.patchCommand || job.delegate?.command || "");
  pushValueArg(args, "--reruns", reruns);
  pushBooleanArg(args, "--include-current-graph", "--no-current-graph", includeCurrentGraph);
  pushBooleanArg(args, "--strict", "--no-strict", strict);
  pushBooleanArg(args, "--stop-on-first-failure", "--no-stop-on-first-failure", stopOnFirstFailure);
  if (cli.allowDirty) args.push("--allow-dirty");
  if (cli.dryRun) args.push("--dry-run");
  return args;
}

async function run() {
  const cli = parseArgs(process.argv.slice(2));
  const jobPath = resolveJobPath(cli.job);
  const job = await readJson(jobPath);
  if (String(job.kind || "").trim() !== "engine-optimize") {
    throw new Error(`Unsupported job kind: ${job.kind || "(missing)"}`);
  }

  const args = buildOptimizeArgs(job, cli);
  const child = spawn(process.execPath, args, {
    cwd: mcpRoot,
    env: process.env,
    stdio: "inherit",
    shell: false
  });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      process.exitCode = Number(code ?? 1);
      resolve();
    });
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
