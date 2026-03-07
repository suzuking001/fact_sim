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

export function registerRuntimeMethodsGroup04(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).getBottleneckReport = async function (this: any, topN?: number, minSampleSec?: number): Promise<BottleneckReportOutput> {
      const timeline = await this.exportTimelineCsv();
      const rows = this.parseTimelineCsv(timeline.csv);
      const normalizedTopN = Math.max(1, Math.min(50, Math.floor(Number(topN) || 5)));
      const minDuration = Number.isFinite(Number(minSampleSec)) ? Math.max(0, Number(minSampleSec)) : 1;
  
      const buckets = new Map<
        string,
        {
          nodeId: string | number | null;
          title: string;
          type: string | null;
          processSec: number;
          waitSec: number;
          downSec: number;
          idleSec: number;
        }
      >();
  
      for (const row of rows) {
        const duration = Number(row.duration);
        if (!Number.isFinite(duration) || duration <= 0) continue;
  
        const title = String(row.node ?? "").trim();
        const nodeIdRaw = String(row.nodeId ?? "").trim();
        const nodeIdNumber = Number(nodeIdRaw);
        const nodeId: string | number | null = nodeIdRaw.length
          ? Number.isFinite(nodeIdNumber)
            ? nodeIdNumber
            : nodeIdRaw
          : null;
  
        const key = (title || "(unknown)") + "|" + String(nodeId ?? "");
        const state = String(row.state ?? "").trim().toLowerCase();
        const bucket =
          buckets.get(key) ??
          {
            nodeId,
            title: title || "(unknown)",
            type: null,
            processSec: 0,
            waitSec: 0,
            downSec: 0,
            idleSec: 0
          };
  
        if (state.includes("process")) {
          bucket.processSec += duration;
        } else if (state.includes("wait")) {
          bucket.waitSec += duration;
        } else if (state.includes("down")) {
          bucket.downSec += duration;
        } else {
          bucket.idleSec += duration;
        }
  
        buckets.set(key, bucket);
      }
  
      const mapped: BottleneckNodeReport[] = [];
      let totalObservedSec = 0;
  
      for (const bucket of buckets.values()) {
        const total = bucket.processSec + bucket.waitSec + bucket.downSec + bucket.idleSec;
        if (total < minDuration) continue;
        totalObservedSec += total;
  
        const processRatio = total > 0 ? bucket.processSec / total : 0;
        const waitRatio = total > 0 ? bucket.waitSec / total : 0;
        const downRatio = total > 0 ? bucket.downSec / total : 0;
        const idleRatio = total > 0 ? bucket.idleSec / total : 0;
  
        const bottleneckScore = total * (processRatio * 1.0 + waitRatio * 0.8 + downRatio * 0.45);
  
        mapped.push({
          nodeId: bucket.nodeId,
          title: bucket.title,
          type: bucket.type,
          totalDurationSec: Number(total.toFixed(3)),
          processSec: Number(bucket.processSec.toFixed(3)),
          waitSec: Number(bucket.waitSec.toFixed(3)),
          downSec: Number(bucket.downSec.toFixed(3)),
          idleSec: Number(bucket.idleSec.toFixed(3)),
          processRatio: Number(processRatio.toFixed(4)),
          waitRatio: Number(waitRatio.toFixed(4)),
          downRatio: Number(downRatio.toFixed(4)),
          idleRatio: Number(idleRatio.toFixed(4)),
          bottleneckScore: Number(bottleneckScore.toFixed(3))
        });
      }
  
      mapped.sort((a, b) => b.bottleneckScore - a.bottleneckScore);
  
      return {
        lineCount: timeline.lineCount,
        nodeCount: mapped.length,
        totalObservedSec: Number(totalObservedSec.toFixed(3)),
        topN: normalizedTopN,
        rows: mapped.slice(0, normalizedTopN)
      };
    };

  (FactSimRuntimeClass.prototype as any).captureSnapshotPng = async function (this: any, fileName?: string): Promise<SnapshotOutput> {
      const page = await this.ensureReady();
      const targetPath = this.resolveSnapshotPath(fileName);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await page.screenshot({
        path: targetPath,
        type: "png",
        fullPage: true
      });
  
      return {
        savedTo: targetPath
      };
    };

  (FactSimRuntimeClass.prototype as any).exportGraphJson = async function (this: any, pretty?: boolean): Promise<ExportGraphJsonOutput> {
      const page = await this.ensureReady();
      return page.evaluate((requestedPretty: any) => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as { graph?: { serialize?: () => unknown } } | undefined;
        const graph = app?.graph as { serialize?: () => unknown } | undefined;
        if (!graph || typeof graph.serialize !== "function") {
          throw new Error("App.graph.serialize is not available");
        }
  
        const data = graph.serialize();
        const nodeCount = Array.isArray((data as { nodes?: unknown[] } | null)?.nodes)
          ? ((data as { nodes?: unknown[] }).nodes?.length ?? 0)
          : 0;
        const linkRaw = (data as { links?: Record<string, unknown> } | null)?.links;
        const linkCount = linkRaw && typeof linkRaw === "object" ? Object.keys(linkRaw).length : 0;
  
        const usePretty = !!requestedPretty;
        const json = usePretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  
        return {
          nodeCount,
          linkCount,
          json
        };
      }, !!pretty);
    };

  (FactSimRuntimeClass.prototype as any).importGraphJson = async function (this: any, graphJson: string): Promise<ImportGraphJsonOutput> {
      const page = await this.ensureReady();
      const imported = await page.evaluate((rawJson: any) => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as
          | {
              graph?: {
                clear?: () => void;
                configure?: (data: unknown) => void;
                fixedtime_lapse?: number;
                fixedtime?: number;
                globaltime?: number;
                elapsed_time?: number;
                iteration?: number;
                status?: number;
              };
              timelineChart?: { attachGraph?: (graph: unknown) => void };
              canvas?: { draw?: (a?: boolean, b?: boolean) => void };
            }
          | undefined;
  
        const graph = app?.graph;
        if (!graph || typeof graph.clear !== "function" || typeof graph.configure !== "function") {
          throw new Error("App.graph.configure is not available");
        }
  
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawJson);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          throw new Error("Invalid graphJson: " + msg);
        }
  
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
        const stopSimulation = w.stopSimulation as undefined | (() => void);
        const setSimTime = w.setSimTime as undefined | ((ms: number) => void);
        const updateSimTime = w.updateSimTime as undefined | (() => void);
        const simNow = w.simNow as undefined | (() => number);
        const getSimDtSec = w.getSimDtSec as undefined | (() => number);
        const liteGraph = w.LGraph as undefined | { STATUS_STOPPED?: number };
  
        if (typeof isSimRunning === "function" && isSimRunning() && typeof stopSimulation === "function") {
          stopSimulation();
        }
  
        graph.clear();
        graph.configure(parsed);
  
        const dtSec = typeof getSimDtSec === "function" ? Number(getSimDtSec()) : 0.1;
        graph.fixedtime_lapse = Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 0.1;
        graph.fixedtime = 0;
        graph.globaltime = 0;
        graph.elapsed_time = 0;
        graph.iteration = 0;
        graph.status = typeof liteGraph?.STATUS_STOPPED === "number" ? liteGraph.STATUS_STOPPED : 1;
  
        if (typeof setSimTime === "function") {
          setSimTime(0);
        }
        if (typeof updateSimTime === "function") {
          updateSimTime();
        }
  
        if (app.timelineChart && typeof app.timelineChart.attachGraph === "function") {
          app.timelineChart.attachGraph(graph);
        }
        if (app.canvas && typeof app.canvas.draw === "function") {
          app.canvas.draw(true, true);
        }
  
        return {
          running: typeof isSimRunning === "function" ? !!isSimRunning() : false,
          simTimeMs: typeof simNow === "function" ? Number(simNow()) : null
        };
      }, graphJson);
  
      const repaired = await this.repairGraphLinks();
      return {
        nodeCount: repaired.nodeCount,
        linkCount: repaired.linkCount,
        running: imported.running,
        simTimeMs: imported.simTimeMs
      };
    };

  (FactSimRuntimeClass.prototype as any).setSimulationTime = async function (this: any, simTimeMs: number): Promise<SetSimulationTimeOutput> {
      const page = await this.ensureReady();
      return page.evaluate((requestedTimeMs: any) => {
        const w = window as unknown as Record<string, unknown>;
        const setSimTime = w.setSimTime as undefined | ((ms: number) => void);
        const updateSimTime = w.updateSimTime as undefined | (() => void);
        const simNow = w.simNow as undefined | (() => number);
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
  
        if (typeof setSimTime !== "function") {
          throw new Error("setSimTime is not available");
        }
  
        const next = Number(requestedTimeMs);
        if (!Number.isFinite(next) || next < 0) {
          throw new Error("simTimeMs must be a non-negative finite number");
        }
  
        setSimTime(next);
        if (typeof updateSimTime === "function") {
          updateSimTime();
        }
  
        return {
          running: typeof isSimRunning === "function" ? !!isSimRunning() : false,
          simTimeMs: typeof simNow === "function" ? Number(simNow()) : next
        };
      }, simTimeMs);
    };

  (FactSimRuntimeClass.prototype as any).getGraphOverview = async function (this: any, includeNodes?: boolean, maxNodes?: number): Promise<GraphOverviewOutput> {
      const page = await this.ensureReady();
      return page.evaluate(
        ({ requestedIncludeNodes, requestedMaxNodes }: { requestedIncludeNodes: boolean; requestedMaxNodes: number | null }) => {
          const w = window as unknown as Record<string, unknown>;
          const app = w.App as
            | {
                graph?: { _nodes?: unknown[]; links?: Record<string, unknown> };
              }
            | undefined;
  
          const graph = app?.graph;
          if (!graph) {
            throw new Error("App.graph is not available");
          }
  
          const nodes = Array.isArray(graph._nodes) ? graph._nodes : [];
          const links = graph.links && typeof graph.links === "object" ? graph.links : {};
          const nodeTypeCounts: Record<string, number> = {};
  
          for (const node of nodes) {
            const type = String((node as { type?: unknown })?.type ?? "").trim() || "unknown";
            nodeTypeCounts[type] = (nodeTypeCounts[type] ?? 0) + 1;
          }
  
          if (!requestedIncludeNodes) {
            return {
              nodeCount: nodes.length,
              linkCount: Object.keys(links).length,
              nodeTypeCounts
            };
          }
  
          const limitRaw = requestedMaxNodes ?? 200;
          const limit = Math.max(1, Math.min(1000, Math.floor(limitRaw)));
          const mapped: GraphOverviewNode[] = nodes.slice(0, limit).map((node) => {
            const asNode = node as { id?: unknown; type?: unknown; title?: unknown; pos?: unknown };
            const rawPos = Array.isArray(asNode.pos) ? asNode.pos : null;
            const x = rawPos && rawPos.length > 0 ? Number(rawPos[0]) : Number.NaN;
            const y = rawPos && rawPos.length > 1 ? Number(rawPos[1]) : Number.NaN;
  
            return {
              id: typeof asNode.id === "string" || typeof asNode.id === "number" ? asNode.id : null,
              type: typeof asNode.type === "string" ? asNode.type : null,
              title: String(asNode.title ?? ""),
              pos: Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
            };
          });
  
          return {
            nodeCount: nodes.length,
            linkCount: Object.keys(links).length,
            nodeTypeCounts,
            nodes: mapped,
            truncated: nodes.length > limit
          };
        },
        {
          requestedIncludeNodes: !!includeNodes,
          requestedMaxNodes: typeof maxNodes === "number" && Number.isFinite(maxNodes) ? maxNodes : null
        }
      );
    };
}



