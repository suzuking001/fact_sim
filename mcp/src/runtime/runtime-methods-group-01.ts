import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";

import { Browser, BrowserContext, Page, chromium } from "playwright";

import type {
  BenchmarkOutput,
  EngineTestOutput,
  SimulationStatus,
  SinkKpi,
  KpiSummary,
  ScenarioBenchmarkSummary,
  ScenarioMatrixItem,
  ScenarioMatrixOutput,
  ExampleListOutput,
  SetSimulationModeOutput,
  PlaybackSpeedOutput,
  ResetSimulationClockOutput,
  SnapshotOutput,
  ExportGraphJsonOutput,
  ImportGraphJsonOutput,
  SetSimulationTimeOutput,
  GraphOverviewNode,
  GraphOverviewOutput,
  ExportEmbeddedHtmlOutput,
  SaveTimelineCsvOutput,
  SaveGraphJsonOutput,
  LoadGraphJsonFileOutput,
  SaveScenarioReportOutput,
  ValidateGraphJsonOutput,
  SaveKpiSummaryOutput,
  SaveGraphOverviewOutput,
  OptimizationObjective,
  CandidateEvaluationOutput,
  CandidateRankingItem,
  CandidateRankingOutput,
  TopologySuggestion,
  TopologyImprovementOutput,
  NodeTypesOutput,
  AddNodeOutput,
  NodePortInfo,
  NodePortsOutput,
  ConnectNodesOutput,
  DisconnectNodesOutput,
  RemoveNodeOutput,
  UpdateNodeOutput,
  PortKind,
  PortKindSlot,
  PortKindSlotsOutput,
  ConnectByPortKindOutput,
  ClearGraphOutput,
  RepairGraphLinksOutput,
  RunSimulationForOutput,
  BottleneckNodeReport,
  BottleneckReportOutput,
  NodeTypeDescriptionOutput,
  BlueprintNodeInput,
  BlueprintEdgeInput,
  BuildGraphFromBlueprintOutput,
  LineOptimizationStep,
  OptimizeLineByBottleneckOutput,
  BlueprintBuildOptions,
  OptimizeLineOptions,
  ObjectiveWeights,
  SetTaktTargetOutput,
  LayoutDistanceViolation,
  ForbiddenAdjacencyViolation,
  LayoutValidationOutput,
  DoeParameterInput,
  DoeParamGridInput,
  DoeExperimentRow,
  DesignOfExperimentsOutput,
  SetRandomSeedOutput,
  GetRandomSeedOutput,
} from "./runtime-types.js";
import type { FactSimRuntime } from "../fact-sim-runtime.js";

export function registerRuntimeMethodsGroup01(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  function sanitizeArtifactPart(value: unknown): string {
    const text = String(value ?? "").trim();
    if (!text) {
      return "";
    }
    return text
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);
  }

  function makeArtifactTimestamp(value?: string | null): string {
    const source = value && String(value).trim() ? new Date(String(value)) : new Date();
    const iso = Number.isNaN(source.getTime()) ? new Date().toISOString() : source.toISOString();
    return iso.replace(/[:.]/g, "-");
  }

  function toRepoRelative(repoRoot: string, filePath: string): string {
    return path.relative(repoRoot, filePath).replace(/\\/g, "/");
  }

  async function writeJsonArtifact(filePath: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  function extractIssueSeed(entry: { message?: string }): number | null {
    const message = String(entry?.message ?? "");
    const match = message.match(/\bseed\s+(\d+)\b/i);
    return match ? Number(match[1]) : null;
  }

  function buildEngineTestDiff(baseline: any, candidate: any): Record<string, unknown> {
    const baselineCompleted = Number(baseline?.metrics?.totalCompleted ?? 0);
    const candidateCompleted = Number(candidate?.metrics?.totalCompleted ?? 0);
    const baselineSinks = Array.isArray(baseline?.finalSinkSnapshot) ? baseline.finalSinkSnapshot : [];
    const candidateSinks = Array.isArray(candidate?.finalSinkSnapshot) ? candidate.finalSinkSnapshot : [];
    const baselineStates = Array.isArray(baseline?.finalStateSnapshot?.rows) ? baseline.finalStateSnapshot.rows : [];
    const candidateStates = Array.isArray(candidate?.finalStateSnapshot?.rows) ? candidate.finalStateSnapshot.rows : [];
    const baselineWork = Array.isArray(baseline?.finalWorkSnapshot?.observedLinkKeys) ? baseline.finalWorkSnapshot.observedLinkKeys : [];
    const candidateWork = Array.isArray(candidate?.finalWorkSnapshot?.observedLinkKeys) ? candidate.finalWorkSnapshot.observedLinkKeys : [];
    return {
      scenario: candidate?.scenario ?? baseline?.scenario ?? null,
      seed: typeof candidate?.seed === "number" ? candidate.seed : (typeof baseline?.seed === "number" ? baseline.seed : null),
      baselineEngine: baseline?.engine ?? "dt",
      candidateEngine: candidate?.engine ?? null,
      completedDelta: candidateCompleted - baselineCompleted,
      sinkCompletedDelta: candidateSinks.reduce((acc: Array<Record<string, unknown>>, row: any) => {
        const key = String(row?.key ?? "");
        const base = baselineSinks.find((entry: any) => String(entry?.key ?? "") === key);
        const delta = Number(row?.completedCount ?? 0) - Number(base?.completedCount ?? 0);
        if (delta !== 0) {
          acc.push({ key, baseline: Number(base?.completedCount ?? 0), candidate: Number(row?.completedCount ?? 0), delta });
        }
        return acc;
      }, []),
      finalStateDeltaCount: Math.abs(candidateStates.length - baselineStates.length),
      workflowDeltaCount: Math.abs(candidateWork.length - baselineWork.length)
    };
  }

  async function captureCurrentGraphSnapshot(page: Page): Promise<unknown | null> {
    try {
      return await page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as { graph?: { serialize?: () => unknown }; serializeGraphData?: () => unknown } | undefined;
        if (app && typeof app.serializeGraphData === "function") {
          return app.serializeGraphData();
        }
        if (app?.graph && typeof app.graph.serialize === "function") {
          return app.graph.serialize();
        }
        return null;
      });
    } catch {
      return null;
    }
  }

  async function saveEngineTestArtifacts(
    repoRoot: string,
    page: Page,
    report: EngineTestOutput,
    options?: Record<string, unknown>
  ): Promise<{ artifactDir: string; artifactFiles: Record<string, string> }> {
    const label = sanitizeArtifactPart(options?.artifactLabel);
    const dirName = label
      ? `${makeArtifactTimestamp(report.startedAt)}__${label}`
      : makeArtifactTimestamp(report.startedAt);
    const absoluteDir = path.join(repoRoot, "artifacts", "engine-test", dirName);
    await mkdir(absoluteDir, { recursive: true });

    const artifactFiles: Record<string, string> = {};
    const capture = async (name: string, relativePath: string, value: unknown) => {
      const fullPath = path.join(absoluteDir, relativePath);
      await writeJsonArtifact(fullPath, value);
      artifactFiles[name] = toRepoRelative(repoRoot, fullPath);
      return fullPath;
    };

    await capture("session", "session.json", {
      version: 1,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      status: report.status,
      suite: (report.summary && report.summary.suite) || null,
      seeds: Array.isArray((report.options as any)?.seeds) ? (report.options as any).seeds : [],
      engines: report.engines,
      includeCurrentGraph: !!(report.summary && report.summary.includesCurrentGraph),
      includeExamples: !!(report.options as any)?.includeExamples,
      examples: Array.isArray((report.options as any)?.examples) ? (report.options as any).examples : [],
      strictFinalParity: !!(report.options as any)?.strictFinalParity,
      saveArtifacts: !!(report.options as any)?.saveArtifacts,
      artifactLabel: String((report.options as any)?.artifactLabel || "")
    });

    await capture("summary", "summary.json", {
      kind: report.kind,
      version: report.version,
      ok: report.ok,
      status: report.status,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      summary: report.summary
    });

    await capture("cases", "cases.json", report.results);

    const includeCurrentGraph = !!(report.summary && report.summary.includesCurrentGraph);
    if (includeCurrentGraph) {
      const currentGraph = await captureCurrentGraphSnapshot(page);
      if (currentGraph) {
        await capture("graphCurrent", "graph-current.json", currentGraph);
      }
    }

    const grouped = new Map<string, any[]>();
    for (const row of Array.isArray(report.results) ? report.results : []) {
      const scenario = sanitizeArtifactPart((row as any)?.scenario || "scenario");
      const seed = Number.isFinite(Number((row as any)?.seed)) ? Number((row as any).seed) : 0;
      const key = `${scenario}__seed-${seed}`;
      const list = grouped.get(key) || [];
      list.push(row);
      grouped.set(key, list);
    }

    const issueArtifacts = new Map<string, Record<string, string>>();
    for (const [groupKey, rows] of grouped.entries()) {
      const baseline = rows.find((row: any) => row?.engine === "dt") || rows[0];
      if (baseline) {
        const baselinePath = path.join(absoluteDir, "baseline-dt", `${groupKey}.json`);
        await writeJsonArtifact(baselinePath, baseline);
      }
      for (const row of rows) {
        const engine = sanitizeArtifactPart((row as any)?.engine || "engine");
        const rowBaseName = `${engine}__${groupKey}`;
        const candidatePath = path.join(absoluteDir, "candidate", `${rowBaseName}.json`);
        await writeJsonArtifact(candidatePath, row);
        if ((row as any)?.liveTimelineSignature) {
          await writeJsonArtifact(path.join(absoluteDir, "timeline", `${rowBaseName}.json`), (row as any).liveTimelineSignature);
        }
        if ((row as any)?.liveStateProbe) {
          await writeJsonArtifact(path.join(absoluteDir, "state", `${rowBaseName}.json`), (row as any).liveStateProbe);
        }
        if ((row as any)?.liveFlowProbe) {
          await writeJsonArtifact(path.join(absoluteDir, "workflow", `${rowBaseName}.json`), (row as any).liveFlowProbe);
        }
        await writeJsonArtifact(path.join(absoluteDir, "final", `${rowBaseName}.json`), {
          finalStateSnapshot: (row as any)?.finalStateSnapshot ?? null,
          finalWorkSnapshot: (row as any)?.finalWorkSnapshot ?? null,
          finalSinkSnapshot: (row as any)?.finalSinkSnapshot ?? null,
          finalEntityLedger: (row as any)?.finalEntityLedger ?? null
        });

        if (baseline && row !== baseline) {
          const diffPath = path.join(absoluteDir, "diff", `${rowBaseName}.json`);
          await writeJsonArtifact(diffPath, buildEngineTestDiff(baseline, row));
          const reproPayload = {
            action: "run",
            suite: (report.summary && report.summary.suite) || (report.options as any)?.suite || "standard",
            engines: [row.engine],
            includeCurrentGraph: row.sourceKind === "current_graph",
            includeExamples: row.sourceKind !== "current_graph",
            examples: row.sourceKind !== "current_graph" ? [row.scenario] : [],
            seeds: Number.isFinite(Number(row.seed)) ? [Number(row.seed)] : [],
            strictFinalParity: !!(report.options as any)?.strictFinalParity,
            targetSimMs: (report.options as any)?.targetSimMs,
            maxWallMs: (report.options as any)?.maxWallMs,
            realStepMs: (report.options as any)?.realStepMs,
            maxLoops: (report.options as any)?.maxLoops,
            saveArtifacts: true,
            artifactLabel: `repro-${rowBaseName}`
          };
          const reproPath = path.join(absoluteDir, "repro", `${rowBaseName}.json`);
          await writeJsonArtifact(reproPath, reproPayload);
          issueArtifacts.set(`${row.engine}|${row.scenario}|${Number.isFinite(Number(row.seed)) ? Number(row.seed) : ""}`, {
            repro: toRepoRelative(repoRoot, reproPath),
            baseline: toRepoRelative(repoRoot, path.join(absoluteDir, "baseline-dt", `${groupKey}.json`)),
            candidate: toRepoRelative(repoRoot, candidatePath),
            diff: toRepoRelative(repoRoot, diffPath)
          });
        }
      }
    }

    const decorateIssues = (issues: any[]) => issues.map((entry) => {
      const seed = extractIssueSeed(entry);
      const exactKey = `${String(entry?.engine ?? "")}|${String(entry?.scenario ?? "")}|${seed ?? ""}`;
      const fallbackKey = `${String(entry?.engine ?? "")}|${String(entry?.scenario ?? "")}|`;
      const artifacts = issueArtifacts.get(exactKey) || issueArtifacts.get(fallbackKey) || null;
      return artifacts ? { ...entry, artifacts } : entry;
    });

    report.failures = decorateIssues(Array.isArray(report.failures) ? report.failures : []);
    report.warnings = decorateIssues(Array.isArray(report.warnings) ? report.warnings : []);

    await capture("failures", "failures.json", {
      failures: report.failures,
      warnings: report.warnings
    });

    report.artifactDir = toRepoRelative(repoRoot, absoluteDir);
    report.artifactFiles = artifactFiles;
    return {
      artifactDir: report.artifactDir,
      artifactFiles
    };
  }

  (FactSimRuntimeClass.prototype as any).loadExample = async function (this: any, example: string): Promise<{ example: string; nodeCount: number }> {
      const page = await this.ensureReady();
      await page.evaluate(async (requestedExample: any) => {
        const w = window as unknown as Record<string, unknown>;
        const makeExample = w.makeExample as undefined | ((kind: string) => Promise<unknown> | unknown);
        if (typeof makeExample !== "function") {
          throw new Error("makeExample is not available in fact_sim");
        }
  
        await Promise.resolve(makeExample(requestedExample));
      }, example);
  
      const repaired = await this.repairGraphLinks();
      return {
        example,
        nodeCount: repaired.nodeCount
      };
    };

  (FactSimRuntimeClass.prototype as any).startSimulation = async function (this: any): Promise<{ running: boolean; mode: string | null; simTimeMs: number | null }> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const startSimulation = w.startSimulation as undefined | (() => void);
        if (typeof startSimulation !== "function") {
          throw new Error("startSimulation is not available");
        }
  
        startSimulation();
  
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
        const app = w.App as { getSimMode?: () => string; simMode?: string } | undefined;
        const simNow = w.simNow as undefined | (() => number);
        return {
          running: typeof isSimRunning === "function" ? !!isSimRunning() : false,
          mode: app?.getSimMode?.() ?? app?.simMode ?? null,
          simTimeMs: typeof simNow === "function" ? Number(simNow()) : null
        };
      });
    };

  (FactSimRuntimeClass.prototype as any).stopSimulation = async function (this: any): Promise<{ running: boolean; simTimeMs: number | null }> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const stopSimulation = w.stopSimulation as undefined | (() => void);
        if (typeof stopSimulation !== "function") {
          throw new Error("stopSimulation is not available");
        }
  
        stopSimulation();
  
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
        const simNow = w.simNow as undefined | (() => number);
        return {
          running: typeof isSimRunning === "function" ? !!isSimRunning() : false,
          simTimeMs: typeof simNow === "function" ? Number(simNow()) : null
        };
      });
    };

  (FactSimRuntimeClass.prototype as any).runBenchmark = async function (this: any, wallMs?: number): Promise<BenchmarkOutput> {
      const page = await this.ensureHeadlessToolsReady();
      return page.evaluate(async (requestedWallMs: any) => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as { runEngineBenchmarkAsync?: (options: Record<string, unknown>) => Promise<BenchmarkOutput> } | undefined;
  
        if (!app || typeof app.runEngineBenchmarkAsync !== "function") {
          throw new Error("App.runEngineBenchmarkAsync is not available");
        }
  
        const options: Record<string, unknown> = {};
        if (typeof requestedWallMs === "number" && Number.isFinite(requestedWallMs)) {
          options.wallMs = Math.max(100, Math.floor(requestedWallMs));
        }
  
        return app.runEngineBenchmarkAsync(options);
      }, wallMs);
    };

  (FactSimRuntimeClass.prototype as any).runEngineTests = async function (this: any, options?: Record<string, unknown>): Promise<EngineTestOutput> {
      const requestedModes = Array.isArray(options?.engines)
        ? options.engines.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : undefined;
      await this.reloadPage();
      const page = await this.ensureHeadlessToolsReady(requestedModes);
      const report = await page.evaluate(async (requestedOptions: any) => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as {
          runEngineTestsAsync?: (options?: Record<string, unknown>) => Promise<EngineTestOutput>;
        } | undefined;

        if (!app || typeof app.runEngineTestsAsync !== "function") {
          throw new Error("App.runEngineTestsAsync is not available");
        }

        return app.runEngineTestsAsync(
          requestedOptions && typeof requestedOptions === "object" ? requestedOptions : undefined
        );
      }, options ?? null);
      if (options && options.saveArtifacts) {
        await saveEngineTestArtifacts(this.repoRoot, page, report, options);
        await page.evaluate((artifactMeta: any) => {
          const w = window as unknown as Record<string, unknown>;
          const app = w.App as { latestEngineTestReport?: Record<string, unknown> } | undefined;
          if (!app || !app.latestEngineTestReport || typeof app.latestEngineTestReport !== "object") {
            return;
          }
          app.latestEngineTestReport.artifactDir = artifactMeta?.artifactDir ?? null;
          app.latestEngineTestReport.artifactFiles = artifactMeta?.artifactFiles ?? null;
          try {
            localStorage.setItem("fact_sim_latest_engine_test_report", JSON.stringify(app.latestEngineTestReport));
          } catch {
            // ignore storage failures
          }
        }, { artifactDir: report.artifactDir ?? null, artifactFiles: report.artifactFiles ?? null });
      }
      return report;
    };

  (FactSimRuntimeClass.prototype as any).getLatestEngineTestReport = async function (this: any): Promise<EngineTestOutput | null> {
      const page = await this.ensureHeadlessToolsReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as {
          getLatestEngineTestReport?: () => EngineTestOutput | null;
        } | undefined;

        if (!app || typeof app.getLatestEngineTestReport !== "function") {
          throw new Error("App.getLatestEngineTestReport is not available");
        }

        return app.getLatestEngineTestReport();
      });
    };

  (FactSimRuntimeClass.prototype as any).exportTimelineCsv = async function (this: any): Promise<{ lineCount: number; csv: string }> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as { timelineChart?: unknown; graph?: unknown } | undefined;
        const chart = app?.timelineChart as Record<string, unknown> | undefined;
        if (!chart) {
          throw new Error("timelineChart is not available");
        }
        const graph = app?.graph;
        if (!chart.graph && graph) {
          const attachGraph = chart.attachGraph as undefined | ((g: unknown) => void);
          if (typeof attachGraph === "function") {
            attachGraph(graph);
          } else {
            chart.graph = graph;
          }
        }
  
        const nowSec = Number((chart._lastNow as number) ?? 0) || Number((chart._nowSec as (() => number) | undefined)?.());
        const historySec = Number(chart.historySec) || 0;
        const cutoff = nowSec - historySec;
  
        const getNodeList = chart._nodeList as undefined | (() => unknown[]);
        const getNodeKey = chart._nodeKey as undefined | ((node: unknown) => string | number);
        const entries = chart.entries as undefined | Map<string | number, { label?: string; segments?: Array<Record<string, unknown>> }>;
        if (typeof getNodeList !== "function" || typeof getNodeKey !== "function" || !(entries instanceof Map)) {
          throw new Error("timelineChart internals are unavailable");
        }
  
        const esc = (value: unknown): string => {
          if (value === null || typeof value === "undefined") return "";
          const text = String(value);
          if (/[,"\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
          return text;
        };
  
        const rows: string[][] = [];
        rows.push(["node", "nodeId", "nodeOrder", "start", "end", "duration", "state", "workId", "agvId"]);
  
        const nodes = getNodeList.call(chart);
        const orderMap = new Map<string | number, number>();
        nodes.forEach((node, index) => {
          orderMap.set(getNodeKey.call(chart, node), index + 1);
        });
  
        for (const node of nodes) {
          const key = getNodeKey.call(chart, node);
          const entry = entries.get(key);
          if (!entry || !Array.isArray(entry.segments) || !entry.segments.length) {
            continue;
          }
  
          const nodeId = (node as { id?: unknown }).id ?? "";
          const nodeOrder = orderMap.get(key) ?? "";
          for (const seg of entry.segments) {
            const start = Math.max(Number(seg.start) || 0, cutoff);
            const end = Math.min(Number(seg.end) || 0, nowSec);
            if (end <= cutoff || end <= start) continue;
            const duration = Math.max(0, end - start);
            rows.push([
              esc(entry.label ?? ""),
              esc(nodeId),
              String(nodeOrder),
              start.toFixed(3),
              end.toFixed(3),
              duration.toFixed(3),
              String(seg.state ?? "other"),
              esc(seg.workId ?? ""),
              esc(seg.agvId ?? "")
            ]);
          }
        }
  
        const csv = rows.map((row) => row.join(",")).join("\n");
        return {
          lineCount: rows.length,
          csv
        };
      });
    };

  (FactSimRuntimeClass.prototype as any).buildShareUrl = async function (this: any): Promise<{ url: string; length: number }> {
      const page = await this.ensureReady();
      return page.evaluate(async () => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as { buildEmbeddedShareUrl?: () => Promise<string> } | undefined;
        if (!app || typeof app.buildEmbeddedShareUrl !== "function") {
          throw new Error("App.buildEmbeddedShareUrl is not available");
        }
  
        const url = await app.buildEmbeddedShareUrl();
        return {
          url,
          length: url.length
        };
      });
    };

  (FactSimRuntimeClass.prototype as any).getSimulationStatus = async function (this: any): Promise<SimulationStatus> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
        const simNow = w.simNow as undefined | (() => number);
        const isFastestMode = w.isFastestMode as undefined | (() => boolean);
        const app = w.App as
          | {
              graph?: { _nodes?: unknown[]; links?: Record<string, unknown>; status?: number };
              getSimMode?: () => string;
              simMode?: string;
            }
          | undefined;
  
        const nodes = Array.isArray(app?.graph?._nodes) ? app.graph._nodes : [];
        const linkMap =
          app?.graph?.links && typeof app.graph.links === "object"
            ? (app.graph.links as Record<string, unknown>)
            : {};
  
        return {
          running: typeof isSimRunning === "function" ? !!isSimRunning() : false,
          mode: app?.getSimMode?.() ?? app?.simMode ?? null,
          simTimeMs: typeof simNow === "function" ? Number(simNow()) : null,
          fastestMode: typeof isFastestMode === "function" ? !!isFastestMode() : null,
          graphStatus: typeof app?.graph?.status === "number" ? Number(app.graph.status) : null,
          nodeCount: nodes.length,
          linkCount: Object.keys(linkMap).length
        };
      });
    };

  (FactSimRuntimeClass.prototype as any).getKpiSummary = async function (this: any): Promise<KpiSummary> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
        const simNow = w.simNow as undefined | (() => number);
        const app = w.App as
          | {
              graph?: { _nodes?: unknown[]; links?: Record<string, unknown> };
              getSimMode?: () => string;
              simMode?: string;
            }
          | undefined;
  
        const nodes = Array.isArray(app?.graph?._nodes) ? app.graph._nodes : [];
        const linkMap =
          app?.graph?.links && typeof app.graph.links === "object"
            ? (app.graph.links as Record<string, unknown>)
            : {};
  
        const nodeTypeCounts: Record<string, number> = {};
        const sinkKpis: SinkKpi[] = [];
  
        for (const node of nodes) {
          const asNode = node as {
            id?: unknown;
            title?: unknown;
            type?: unknown;
            _recv?: unknown[];
            _history?: Array<{ cycle?: unknown }>;
            getThroughputPerHour?: () => number;
          };
  
          const rawType = String(asNode.type ?? "").trim();
          const typeKey = rawType || "unknown";
          nodeTypeCounts[typeKey] = (nodeTypeCounts[typeKey] ?? 0) + 1;
  
          const title = String(asNode.title ?? "").trim();
          const recv = Array.isArray(asNode._recv) ? asNode._recv : [];
          const hasRecv = Array.isArray(asNode._recv);
          const lowerType = rawType.toLowerCase();
          const lowerTitle = title.toLowerCase();
          const isLikelySink =
            lowerType.includes("sink") ||
            lowerTitle.includes("sink") ||
            (hasRecv && typeof asNode.getThroughputPerHour === "function");
  
          if (!isLikelySink) continue;
  
          let throughput = 0;
          if (typeof asNode.getThroughputPerHour === "function") {
            try {
              const current = Number(asNode.getThroughputPerHour());
              throughput = Number.isFinite(current) && current > 0 ? current : 0;
            } catch (_error) {
              throughput = 0;
            }
          }
  
          const cyclesSec = (Array.isArray(asNode._history) ? asNode._history : [])
            .map((x) => Number(x?.cycle))
            .filter((v) => Number.isFinite(v) && v > 0)
            .map((ms) => ms / 1000);
  
          const avgCycleTimeSec =
            cyclesSec.length > 0
              ? cyclesSec.reduce((sum, value) => sum + value, 0) / cyclesSec.length
              : null;
  
          sinkKpis.push({
            id:
              typeof asNode.id === "string" || typeof asNode.id === "number"
                ? asNode.id
                : null,
            title,
            type: rawType || null,
            completedCount: recv.length,
            throughputPerHour: throughput,
            averageCycleTimeSec: avgCycleTimeSec,
            recentSamples: cyclesSec.length
          });
        }
  
        const simTimeMsRaw = typeof simNow === "function" ? Number(simNow()) : Number.NaN;
        const simTimeMs = Number.isFinite(simTimeMsRaw) ? simTimeMsRaw : null;
        const simHours = simTimeMs !== null && simTimeMs > 0 ? simTimeMs / (1000 * 60 * 60) : 0;
  
        const totalCompleted = sinkKpis.reduce((sum, sink) => sum + sink.completedCount, 0);
        const throughputPerHourTotal = sinkKpis.reduce((sum, sink) => sum + sink.throughputPerHour, 0);
        const throughputPerHourAverage = sinkKpis.length > 0 ? throughputPerHourTotal / sinkKpis.length : 0;
        const projectedThroughputPerHour = simHours > 0 ? totalCompleted / simHours : null;
  
        return {
          running: typeof isSimRunning === "function" ? !!isSimRunning() : false,
          mode: app?.getSimMode?.() ?? app?.simMode ?? null,
          simTimeMs,
          simHours,
          nodeCount: nodes.length,
          linkCount: Object.keys(linkMap).length,
          sinkCount: sinkKpis.length,
          totalCompleted,
          throughputPerHourTotal,
          throughputPerHourAverage,
          projectedThroughputPerHour,
          sinkKpis,
          nodeTypeCounts
        };
      });
    };
}


