import path from "node:path";
import process from "node:process";
import os from "node:os";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";

const cwd = process.cwd();
const repoRoot = path.resolve(cwd, "..");
const DEFAULT_CODEX_TIMEOUT_MS = 15 * 60 * 1000;

function getCodexTimeoutMs() {
  const raw = Number(process.env.FACT_SIM_CODEX_TIMEOUT_MS || DEFAULT_CODEX_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CODEX_TIMEOUT_MS;
}

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const out = {
    patchRequestPath: "",
    targetFailurePath: "",
    sessionDir: "",
    delegate: "",
    dryRun: false,
    useCodex: true,
    iteration: null
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
      case "patch-request":
        out.patchRequestPath = String(takeValue() || "").trim();
        break;
      case "target-failure":
        out.targetFailurePath = String(takeValue() || "").trim();
        break;
      case "session-dir":
        out.sessionDir = String(takeValue() || "").trim();
        break;
      case "delegate":
        out.delegate = String(takeValue() || "").trim();
        break;
      case "iteration":
        out.iteration = String(takeValue() || "").trim() || null;
        break;
      case "dry-run":
        out.dryRun = true;
        break;
      case "no-codex":
        out.useCodex = false;
        break;
      default:
        break;
    }
  }
  return out;
}

function toRelative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(String(text || "").replace(/^\uFEFF/, ""));
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, String(value ?? ""), "utf8");
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (_error) {
    return false;
  }
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

function isArtifactPath(filePath) {
  return /^artifacts\//.test(filePath);
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
  for (const row of rows) {
    map.set(row.path, row.status);
  }
  return map;
}

function computeNewTouchedPaths(beforeRows, afterRows) {
  const before = mapStatusByPath(beforeRows);
  const after = mapStatusByPath(afterRows);
  const touched = [];
  for (const row of afterRows) {
    if (before.get(row.path) !== row.status) touched.push(row.path);
  }
  return normalizeFileList(touched);
}

async function killProcessTree(pid) {
  await runCommand("taskkill", ["/PID", String(pid), "/T", "/F"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  }).catch(() => null);
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
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
    let timeoutHandle = null;
    if (Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0) {
      timeoutHandle = setTimeout(async () => {
        if (settled) return;
        settled = true;
        await killProcessTree(child.pid).catch(() => null);
        resolve({ code: 124, stdout, stderr, timedOut: true });
      }, Number(options.timeoutMs));
    }
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({ code: Number(code ?? 1), stdout, stderr });
    });
    if (options.stdinText && child.stdin) {
      child.stdin.write(options.stdinText);
      child.stdin.end();
    }
  });
}

async function gitStatus() {
  const result = await runCommand("git", ["status", "--porcelain=v1"], { cwd: repoRoot });
  if (result.code !== 0) throw new Error(`git status failed: ${result.stderr || result.stdout}`);
  return parseGitStatusPorcelain(result.stdout);
}

async function gitDiff(paths) {
  const normalized = normalizeFileList(paths).filter((item) => !isArtifactPath(item));
  const args = ["diff", "--binary", "--"];
  if (normalized.length) args.push(...normalized);
  const result = await runCommand("git", args, { cwd: repoRoot });
  if (result.code !== 0) throw new Error(`git diff failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function hasCodexCli() {
  const probe = await runCommand("codex", ["--version"], { cwd: repoRoot });
  return probe.code === 0;
}

function buildPrompt(patchRequest, targetFailure) {
  const allowedPaths = normalizeFileList(patchRequest?.constraints?.allowedPaths);
  const recommendedFiles = normalizeFileList(patchRequest?.recommendedFiles);
  const protectEngines = normalizeFileList(patchRequest?.constraints?.protectEngines);
  const verify = patchRequest?.verify || {};
  const failure = targetFailure || patchRequest?.targetFailure || {};
  const lines = [];
  lines.push("Use the existing AGENTS.md instructions in this repo.");
  lines.push("Fix the single target failure described below.");
  lines.push("Only edit allowed paths. Do not modify protected engines or unrelated files.");
  lines.push("");
  lines.push("Target failure:");
  lines.push("```json");
  lines.push(JSON.stringify(failure, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`Protected engines: ${protectEngines.join(", ") || "(none)"}`);
  lines.push(`Allowed paths: ${allowedPaths.join(", ") || "(none)"}`);
  if (recommendedFiles.length) lines.push(`Recommended files: ${recommendedFiles.join(", ")}`);
  lines.push("");
  lines.push("Requirements:");
  lines.push("- Apply the smallest defensible patch that resolves this failure.");
  lines.push("- Keep dt and event behavior untouched.");
  lines.push("- Prefer fixing event-fast* engines or engine-test helpers only.");
  lines.push("- Do not ask questions. Do not call request_user_input. Make reasonable assumptions and continue.");
  lines.push("- Do not browse external websites.");
  lines.push("- After editing, run a focused verification for the same failure if possible.");
  lines.push(`- Use reruns=${Number(verify.reruns || 0)} and strictFinalParity=${verify.strict ? "true" : "false"} as guidance.`);
  lines.push(`- Benchmark regressions are not acceptable (wallMs=${Number(verify.benchmarkWallMs || 0)}).`);
  lines.push("");
  lines.push("At the end, summarize:");
  lines.push("1. what changed");
  lines.push("2. which verification you ran");
  lines.push("3. any residual risk");
  return lines.join("\n");
}

async function seedWorkspace(workspaceDir, seedPaths) {
  await rm(workspaceDir, { recursive: true, force: true });
  await ensureDir(workspaceDir);
  for (const relativePath of normalizeFileList(seedPaths)) {
    const sourcePath = path.join(repoRoot, relativePath);
    if (!(await pathExists(sourcePath))) continue;
    const targetPath = path.join(workspaceDir, relativePath);
    await ensureDir(path.dirname(targetPath));
    await copyFile(sourcePath, targetPath);
  }
  const gitInit = await runCommand("git", ["init", "-q"], { cwd: workspaceDir });
  if (gitInit.code === 0) {
    await runCommand("git", ["config", "user.name", "fact-sim-auto-patch"], { cwd: workspaceDir });
    await runCommand("git", ["config", "user.email", "fact-sim-auto-patch@example.invalid"], { cwd: workspaceDir });
  }
}

async function collectWorkspaceFiles(rootDir, baseDir = rootDir) {
  const out = [];
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git") continue;
      out.push(...await collectWorkspaceFiles(nextPath, baseDir));
      continue;
    }
    const relativePath = path.relative(baseDir, nextPath).replace(/\\/g, "/");
    out.push(relativePath);
  }
  return out;
}

async function runCodexDelegate(prompt, outputPath, workspaceDir) {
  const args = [
    "exec",
    "--full-auto",
    "-C",
    workspaceDir,
    "--output-last-message",
    outputPath,
    "-"
  ];
  return runCommand("codex", args, {
    cwd: workspaceDir,
    stdinText: prompt,
    stdio: ["pipe", "pipe", "pipe"],
    timeoutMs: getCodexTimeoutMs()
  });
}

async function runShellDelegate(command, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: true
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: Number(code ?? 1) }));
  });
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const sessionDir = path.resolve(cli.sessionDir || process.env.FACT_SIM_SESSION_DIR || path.join(repoRoot, "artifacts", "auto-patch-manual"));
  const patchRequestInput = String(cli.patchRequestPath || process.env.FACT_SIM_PATCH_REQUEST || "").trim();
  const targetFailureInput = String(cli.targetFailurePath || process.env.FACT_SIM_TARGET_FAILURE || "").trim();
  const patchRequestPath = patchRequestInput ? path.resolve(patchRequestInput) : "";
  const targetFailurePath = targetFailureInput ? path.resolve(targetFailureInput) : "";
  const iteration = String(cli.iteration || process.env.FACT_SIM_ITERATION || "").trim() || null;
  const delegate = cli.delegate || process.env.FACT_SIM_PATCH_DELEGATE || "";

  if (!patchRequestPath) throw new Error("patch request path is required");

  await ensureDir(sessionDir);
  const patchRequest = await readJson(patchRequestPath);
  const targetFailure = targetFailurePath ? await readJson(targetFailurePath) : (patchRequest.targetFailure || null);

  const allowedPaths = normalizeFileList(patchRequest?.constraints?.allowedPaths);
  const protectedEngines = normalizeFileList(patchRequest?.constraints?.protectEngines);
  const targetEngine = String(targetFailure?.engine || "").trim();

  const result = {
    version: 1,
    startedAt: nowIso(),
    finishedAt: null,
    status: "running",
    sessionDir: toRelative(sessionDir),
    iteration,
    patchRequestPath: toRelative(patchRequestPath),
    targetFailurePath: targetFailurePath ? toRelative(targetFailurePath) : null,
    targetFailure,
    delegate: delegate || (cli.useCodex ? "codex" : ""),
    recommendedFiles: normalizeFileList(patchRequest?.recommendedFiles),
    allowedPaths,
    protectedEngines,
    changedPaths: [],
    forbiddenPaths: [],
    workspaceExtraPaths: [],
    notes: []
  };

  const prompt = buildPrompt(patchRequest, targetFailure);
  const promptPath = path.join(sessionDir, iteration ? `codex-prompt.iteration-${iteration}.md` : "codex-prompt.md");
  const delegateMessagePath = path.join(sessionDir, iteration ? `delegate-last-message.iteration-${iteration}.txt` : "delegate-last-message.txt");
  const delegateStdoutPath = path.join(sessionDir, iteration ? `delegate-stdout.iteration-${iteration}.log` : "delegate-stdout.log");
  const delegateStderrPath = path.join(sessionDir, iteration ? `delegate-stderr.iteration-${iteration}.log` : "delegate-stderr.log");
  const patchDiffPath = path.join(sessionDir, iteration ? `patch.iteration-${iteration}.diff` : "patch.diff");
  const resultPath = path.join(sessionDir, iteration ? `patch-result.iteration-${iteration}.json` : "patch-result.json");
  await writeText(promptPath, prompt);

  if (protectedEngines.includes(targetEngine)) {
    result.status = "blocked";
    result.notes.push(`Target engine ${targetEngine} is protected and will not be auto-patched.`);
    result.finishedAt = nowIso();
    await writeJson(resultPath, result);
    process.exitCode = 2;
    return;
  }
  if (!result.recommendedFiles.length) {
    result.status = "blocked";
    result.notes.push("No recommended files were provided for this failure.");
    result.finishedAt = nowIso();
    await writeJson(resultPath, result);
    process.exitCode = 2;
    return;
  }

  const beforeStatus = await gitStatus();
  const beforeFiles = new Map();
  for (const relativePath of allowedPaths) {
    const sourcePath = path.join(repoRoot, relativePath);
    beforeFiles.set(relativePath, (await pathExists(sourcePath)) ? await readFile(sourcePath, "utf8") : null);
  }

  if (cli.dryRun) {
    result.status = "dry-run";
    result.notes.push("Dry run only. No delegate executed.");
    result.finishedAt = nowIso();
    await writeJson(resultPath, result);
    return;
  }

  let delegateExit = 0;
  if (delegate) {
    const response = await runShellDelegate(delegate, {
      FACT_SIM_SESSION_DIR: sessionDir,
      FACT_SIM_TARGET_FAILURE: targetFailurePath,
      FACT_SIM_PATCH_REQUEST: patchRequestPath,
      FACT_SIM_REPO_ROOT: repoRoot,
      FACT_SIM_ITERATION: iteration || ""
    });
    delegateExit = Number(response.code || 1);
  } else if (cli.useCodex && await hasCodexCli()) {
    const workspaceRoot = path.join(os.tmpdir(), "fact-sim-auto-patch", `${Date.now()}-${process.pid}`);
    const workspaceSeedPaths = normalizeFileList(["AGENTS.md", ...allowedPaths]);
    const workspaceMessagePath = path.join(workspaceRoot, "delegate-last-message.txt");
    await seedWorkspace(workspaceRoot, workspaceSeedPaths);
    result.workspaceRoot = workspaceRoot;
    const response = await runCodexDelegate(prompt, workspaceMessagePath, workspaceRoot);
    delegateExit = Number(response.code || 1);
    if (response.stdout) await writeText(delegateStdoutPath, response.stdout);
    if (response.stderr) await writeText(delegateStderrPath, response.stderr);
    if (await pathExists(workspaceMessagePath)) {
      await copyFile(workspaceMessagePath, delegateMessagePath);
    }
    const workspaceFiles = await collectWorkspaceFiles(workspaceRoot);
    result.workspaceExtraPaths = workspaceFiles.filter((item) => !workspaceSeedPaths.includes(item));
    if (delegateExit === 0) {
      for (const relativePath of allowedPaths) {
        const workspacePath = path.join(workspaceRoot, relativePath);
        const sourcePath = path.join(repoRoot, relativePath);
        const nextContent = (await pathExists(workspacePath)) ? await readFile(workspacePath, "utf8") : null;
        if (nextContent === beforeFiles.get(relativePath)) continue;
        await ensureDir(path.dirname(sourcePath));
        if (nextContent == null) {
          await rm(sourcePath, { force: true });
        } else {
          await writeFile(sourcePath, nextContent, "utf8");
        }
      }
    }
    await rm(workspaceRoot, { recursive: true, force: true });
  } else {
    result.status = "blocked";
    result.notes.push("No delegate command was provided and codex CLI was not available.");
    result.finishedAt = nowIso();
    await writeJson(resultPath, result);
    process.exitCode = 2;
    return;
  }

  result.delegateExitCode = delegateExit;
  if (delegateExit !== 0) {
    result.status = delegateExit === 124 ? "delegate-timeout" : "delegate-failed";
    if (delegateExit === 124) result.notes.push(`Delegate timed out after ${Math.round(getCodexTimeoutMs() / 60000)} minutes.`);
    result.finishedAt = nowIso();
    await writeJson(resultPath, result);
    process.exitCode = delegateExit || 1;
    return;
  }

  const afterStatus = await gitStatus();
  const changedPaths = computeNewTouchedPaths(beforeStatus, afterStatus).filter((item) => !isArtifactPath(item));
  result.changedPaths = changedPaths;
  result.forbiddenPaths = changedPaths.filter((filePath) => !allowedPaths.includes(filePath));

  if (changedPaths.length) {
    const patchText = await gitDiff(changedPaths);
    await writeText(patchDiffPath, patchText);
    result.patchDiffPath = toRelative(patchDiffPath);
  }

  if (!changedPaths.length) {
    result.status = "no-op";
    result.notes.push("Delegate finished without changing any allowed source files.");
    result.finishedAt = nowIso();
    await writeJson(resultPath, result);
    process.exitCode = 3;
    return;
  }

  if (result.forbiddenPaths.length) {
    result.status = "forbidden-paths";
    result.notes.push("Delegate touched files outside the allowed auto-patch set.");
    result.finishedAt = nowIso();
    await writeJson(resultPath, result);
    process.exitCode = 4;
    return;
  }

  result.status = "patched";
  result.finishedAt = nowIso();
  await writeJson(resultPath, result);
}

main().catch(async (error) => {
  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  try {
    const cli = parseArgs(process.argv.slice(2));
    const sessionDir = path.resolve(cli.sessionDir || process.env.FACT_SIM_SESSION_DIR || path.join(repoRoot, "artifacts", "auto-patch-manual"));
    const iteration = String(cli.iteration || process.env.FACT_SIM_ITERATION || "").trim() || null;
    const resultPath = path.join(sessionDir, iteration ? `patch-result.iteration-${iteration}.json` : "patch-result.json");
    await writeJson(resultPath, {
      version: 1,
      startedAt: nowIso(),
      finishedAt: nowIso(),
      status: "error",
      message
    });
  } catch (_writeErr) {}
  console.error(message);
  process.exit(1);
});
