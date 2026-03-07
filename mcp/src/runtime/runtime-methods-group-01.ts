import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";

import { Browser, BrowserContext, Page, chromium } from "playwright";

import type {
  BenchmarkOutput,
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
      const page = await this.ensureReady();
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


