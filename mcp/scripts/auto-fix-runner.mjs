import path from "node:path";
import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import { FactSimRuntime } from "../dist/fact-sim-runtime.js";

const cwd = process.cwd();
const repoRoot = path.resolve(cwd, "..");

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
    profile: "nightly",
    label: "",
    includeSoak: false,
    engines: null,
    examples: null,
    seeds: null,
    benchmarkWallMs: 2000,
    maxLoops: null,
    targetSimMs: null,
    strict: true,
    reruns: 2,
    stopOnFirstFailure: true,
    includeCurrentGraph: true,
    includeExamples: true,
    patchCommand: "",
    maxIterations: 1
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
      case "profile":
        out.profile = String(takeValue() || out.profile).trim() || out.profile;
        break;
      case "label":
        out.label = String(takeValue() || "").trim();
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
      case "benchmark-wall-ms":
        out.benchmarkWallMs = Math.max(100, Number(takeValue()) || out.benchmarkWallMs);
        break;
      case "max-loops":
        out.maxLoops = Math.max(1, Math.floor(Number(takeValue()) || 0)) || null;
        break;
      case "target-sim-ms":
        out.targetSimMs = Math.max(1000, Math.floor(Number(takeValue()) || 0)) || null;
        break;
      case "reruns":
        out.reruns = Math.max(0, Math.floor(Number(takeValue()) || out.reruns));
        break;
      case "patch-command":
        out.patchCommand = String(takeValue() || "").trim();
        break;
      case "max-iterations":
        out.maxIterations = Math.max(1, Math.floor(Number(takeValue()) || out.maxIterations));
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
      case "include-soak":
        out.includeSoak = true;
        break;
      case "no-current-graph":
        out.includeCurrentGraph = false;
        break;
      case "examples-only":
        out.includeCurrentGraph = false;
        out.includeExamples = true;
        break;
      default:
        break;
    }
  }
  return out;
}

function makeStageOptions(name, cli, extra = {}) {
  return {
    suite: name,
    includeCurrentGraph: cli.includeCurrentGraph,
    includeExamples: cli.includeExamples,
    examples: Array.isArray(cli.examples) && cli.examples.length ? cli.examples : undefined,
    engines: Array.isArray(cli.engines) && cli.engines.length ? cli.engines : undefined,
    seeds: Array.isArray(cli.seeds) && cli.seeds.length ? cli.seeds : undefined,
    strictFinalParity: cli.strict,
    reruns: cli.reruns,
    stopOnFirstFailure: cli.stopOnFirstFailure,
    maxLoops: Number.isFinite(cli.maxLoops) ? cli.maxLoops : undefined,
    targetSimMs: Number.isFinite(cli.targetSimMs) ? cli.targetSimMs : undefined,
    saveArtifacts: true,
    artifactLabel: [cli.label, name].filter(Boolean).join("-"),
    ...extra
  };
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, String(value), "utf8");
}

function toRelative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function buildTargetFailure(report) {
  const issues = [
    ...(Array.isArray(report?.failures) ? report.failures : []),
    ...(Array.isArray(report?.warnings) ? report.warnings : [])
  ];
  if (!issues.length) return null;
  return {
    ...issues[0],
    reportStatus: report?.status ?? null,
    suite: report?.summary?.suite ?? report?.options?.suite ?? null
  };
}

function recommendFilesForFailure(targetFailure) {
  const engine = String(targetFailure?.engine ?? "");
  const code = String(targetFailure?.code ?? "");
  const files = new Set();
  if (engine.startsWith("event-fast-par")) {
    files.add("js/app/engine-fast-par-host.js");
    files.add("js/app/engine-fast-par-worker.js");
    files.add("js/app/engine-fast-par-partitioner.js");
  } else if (engine.startsWith("event-fast-worker")) {
    files.add("js/app/engine-fast-worker-host.js");
    files.add("js/app/engine-fast-worker.js");
  } else if (engine.startsWith("event-fast")) {
    files.add("js/app/engine-fast-runtime.js");
    files.add("js/app/engine-fast-compat.js");
    files.add("js/app/engine-fast-kernels.js");
  }
  if (/LIVE_|TIMELINE|WORKFLOW|STATE/.test(code)) {
    files.add("js/app/engine-test.js");
  }
  return Array.from(files);
}

function buildPatchRequest(session, targetFailure, stage) {
  if (!targetFailure) return null;
  return {
    version: 1,
    sessionId: session.sessionId,
    status: session.status,
    targetFailure,
    recommendedFiles: recommendFilesForFailure(targetFailure),
    constraints: {
      protectEngines: ["dt", "event"],
      allowedPaths: [
        "js/app/engine-fast-runtime.js",
        "js/app/engine-fast-compat.js",
        "js/app/engine-fast-kernels.js",
        "js/app/engine-fast-worker.js",
        "js/app/engine-fast-worker-host.js",
        "js/app/engine-fast-par-worker.js",
        "js/app/engine-fast-par-host.js",
        "js/app/engine-fast-par-partitioner.js",
        "js/app/engine-test.js"
      ]
    },
    verify: {
      reruns: session.config.reruns,
      strict: session.config.strict,
      benchmarkWallMs: session.config.benchmarkWallMs
    },
    artifactDir: stage?.artifactDir ?? null
  };
}

function benchmarkSummary(benchmark) {
  const results = Array.isArray(benchmark?.results) ? benchmark.results : [];
  const byMode = new Map();
  for (const row of results) {
    const mode = String(row?.mode ?? "");
    if (!mode) continue;
    const current = byMode.get(mode);
    if (!current || Number(row?.speed ?? 0) > Number(current?.speed ?? 0)) {
      byMode.set(mode, row);
    }
  }
  return {
    wallMs: benchmark?.wallMs ?? null,
    realStepMs: benchmark?.realStepMs ?? null,
    bestByMode: Object.fromEntries(
      Array.from(byMode.entries()).map(([mode, row]) => [
        mode,
        {
          renderCase: row.renderCase,
          speed: row.speed,
          simSec: row.simSec,
          wallMs: row.wallMs
        }
      ])
    )
  };
}

function buildSummaryMarkdown(session) {
  const lines = [];
  lines.push("# Auto Fix Session");
  lines.push("");
  lines.push(`- Session ID: \`${session.sessionId}\``);
  lines.push(`- Status: \`${session.status}\``);
  lines.push(`- Started: \`${session.startedAt}\``);
  lines.push(`- Finished: \`${session.finishedAt || ""}\``);
  lines.push("");
  lines.push("## Stages");
  lines.push("");
  for (const stage of session.stages) {
    lines.push(`- ${stage.iteration ? `iter${stage.iteration}.` : ""}${stage.name}: \`${stage.status}\``);
    if (stage.artifactDir) lines.push(`  Artifact: \`${stage.artifactDir}\``);
    if (stage.summary) lines.push(`  Summary: ${JSON.stringify(stage.summary)}`);
  }
  if (session.targetFailure) {
    lines.push("");
    lines.push("## Target Failure");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(session.targetFailure, null, 2));
    lines.push("```");
  }
  if (Array.isArray(session.iterations) && session.iterations.length) {
    lines.push("");
    lines.push("## Iterations");
    lines.push("");
    for (const iteration of session.iterations) {
      lines.push(`- #${iteration.index}: \`${iteration.status}\``);
      if (iteration.note) lines.push(`  Note: ${iteration.note}`);
      if (iteration.patchRequestPath) lines.push(`  Patch request: \`${iteration.patchRequestPath}\``);
      if (iteration.targetFailurePath) lines.push(`  Target failure: \`${iteration.targetFailurePath}\``);
    }
  }
  return lines.join("\n");
}

async function runPatchCommand(command, env, cwdArg) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: cwdArg,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        ...env
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(Number(code ?? 1)));
  });
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const sessionId = `${stamp()}${cli.label ? `__${sanitizePart(cli.label)}` : ""}`;
  const sessionDir = path.join(repoRoot, "artifacts", "auto-fix", sessionId);
  await ensureDir(sessionDir);

  const session = {
    version: 1,
    sessionId,
    startedAt: nowIso(),
    finishedAt: null,
    status: "running",
    profile: cli.profile,
    config: {
      engines: cli.engines,
      examples: cli.examples,
      seeds: cli.seeds,
      strict: cli.strict,
      reruns: cli.reruns,
      stopOnFirstFailure: cli.stopOnFirstFailure,
      includeCurrentGraph: cli.includeCurrentGraph,
      includeExamples: cli.includeExamples,
      benchmarkWallMs: cli.benchmarkWallMs,
      includeSoak: cli.includeSoak
    },
    stages: [],
    targetFailure: null,
    benchmark: null,
    iterations: []
  };

  const persistSession = async () => {
    await writeJson(path.join(sessionDir, "session.json"), session);
    await writeText(path.join(sessionDir, "summary.md"), buildSummaryMarkdown(session));
  };

  await persistSession();

  const runtime = new FactSimRuntime({ repoRoot, preferredPort: 8123, logger: () => {} });
  try {
    const stageDefs = [
      { name: "quick", options: makeStageOptions("quick", cli) },
      { name: "standard", options: makeStageOptions("standard", cli) }
    ];
    if (cli.includeSoak || cli.profile === "soak") {
      stageDefs.push({ name: "soak", options: makeStageOptions("soak", cli) });
    }
    for (let iterationIndex = 1; iterationIndex <= cli.maxIterations; iterationIndex += 1) {
      let failedStage = null;
      let failedReport = null;
      for (const stageDef of stageDefs) {
        const startedAt = nowIso();
        const report = await runtime.runEngineTests(stageDef.options);
        const stage = {
          iteration: iterationIndex,
          name: stageDef.name,
          startedAt,
          finishedAt: nowIso(),
          status: report.status,
          artifactDir: report.artifactDir ?? null,
          artifactFiles: report.artifactFiles ?? null,
          summary: report.summary ?? null
        };
        session.stages.push(stage);
        session.targetFailure = session.targetFailure || buildTargetFailure(report);
        await persistSession();
        if (report.status === "FAIL") {
          failedStage = stage;
          failedReport = report;
          break;
        }
      }

      if (!failedReport) {
        const benchmark = await runtime.runBenchmark(cli.benchmarkWallMs);
        session.benchmark = {
          summary: benchmarkSummary(benchmark)
        };
        await writeJson(path.join(sessionDir, "benchmark-result.json"), benchmark);
        session.status = session.targetFailure ? "WARN" : "PASS";
        session.finishedAt = nowIso();
        if (session.targetFailure) {
          await writeJson(path.join(sessionDir, "target-failure.json"), session.targetFailure);
        }
        await persistSession();
        return;
      }

      session.status = "FAIL";
      session.finishedAt = nowIso();
      session.targetFailure = buildTargetFailure(failedReport) || session.targetFailure;
      const targetFailurePath = path.join(sessionDir, `target-failure.iteration-${iterationIndex}.json`);
      const latestTargetFailurePath = path.join(sessionDir, "target-failure.json");
      if (session.targetFailure) {
        await writeJson(targetFailurePath, session.targetFailure);
        await writeJson(latestTargetFailurePath, session.targetFailure);
      }
      const patchRequest = buildPatchRequest(session, session.targetFailure, failedStage);
      const patchRequestPath = path.join(sessionDir, `patch-request.iteration-${iterationIndex}.json`);
      const latestPatchRequestPath = path.join(sessionDir, "patch-request.json");
      if (patchRequest) {
        await writeJson(patchRequestPath, patchRequest);
        await writeJson(latestPatchRequestPath, patchRequest);
      }

      const iterationRecord = {
        index: iterationIndex,
        status: cli.patchCommand ? "pending-patch" : "failed",
        patchRequestPath: patchRequest ? toRelative(patchRequestPath) : null,
        targetFailurePath: session.targetFailure ? toRelative(targetFailurePath) : null,
        note: cli.patchCommand ? "Patch command can be invoked with the generated request." : "Patch command not configured."
      };
      session.iterations.push(iterationRecord);
      await persistSession();

      if (!cli.patchCommand) {
        process.exitCode = 1;
        return;
      }

      const exitCode = await runPatchCommand(cli.patchCommand, {
        FACT_SIM_SESSION_DIR: sessionDir,
        FACT_SIM_TARGET_FAILURE: latestTargetFailurePath,
        FACT_SIM_PATCH_REQUEST: latestPatchRequestPath,
        FACT_SIM_REPO_ROOT: repoRoot,
        FACT_SIM_STAGE_ARTIFACT: failedStage?.artifactDir || "",
        FACT_SIM_ITERATION: String(iterationIndex)
      }, repoRoot);
      iterationRecord.patchExitCode = exitCode;
      iterationRecord.status = exitCode === 0 ? "patch-command-finished" : "patch-command-failed";
      await persistSession();
      if (exitCode !== 0) {
        process.exitCode = 1;
        return;
      }
    }

    session.status = "FAIL";
    session.finishedAt = nowIso();
    await persistSession();
    process.exitCode = 1;
  } finally {
    await runtime.close();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
