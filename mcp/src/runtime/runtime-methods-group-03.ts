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

export function registerRuntimeMethodsGroup03(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).repairGraphLinks = async function (this: any): Promise<RepairGraphLinksOutput> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as
          | {
              graph?: {
                _nodes?: unknown[];
                links?: Record<string, unknown>;
                last_link_id?: number;
              };
              canvas?: { draw?: (a?: boolean, b?: boolean) => void };
              repairGraphLinks?: (graph?: unknown) => Record<string, unknown>;
            }
          | undefined;
  
        const graph = app?.graph;
        if (!graph) {
          throw new Error("App.graph is not available");
        }
  
        const fallbackRepair = () => {
          const nodes = Array.isArray(graph._nodes) ? graph._nodes : [];
          const sourceLinks = graph.links && typeof graph.links === "object" ? graph.links : {};
  
          const nodeById = new Map<string, Record<string, unknown>>();
          for (const node of nodes) {
            const nodeAs = node as { id?: unknown };
            if (typeof nodeAs.id === "string" || typeof nodeAs.id === "number") {
              nodeById.set(String(nodeAs.id), node as Record<string, unknown>);
            }
          }
  
          for (const node of nodes) {
            const nodeAs = node as {
              inputs?: Array<Record<string, unknown>>;
              outputs?: Array<Record<string, unknown>>;
            };
  
            if (Array.isArray(nodeAs.inputs)) {
              for (const input of nodeAs.inputs) {
                input.link = null;
              }
            }
            if (Array.isArray(nodeAs.outputs)) {
              for (const output of nodeAs.outputs) {
                output.links = null;
              }
            }
          }
  
          let repairedInputCount = 0;
          let repairedOutputCount = 0;
          let droppedDanglingLinks = 0;
          let droppedInvalidSlotLinks = 0;
          let droppedDuplicateInputLinks = 0;
  
          const repairedLinks: Record<string, unknown> = {};
          let maxLinkId = 0;
  
          for (const [rawKey, rawLink] of Object.entries(sourceLinks)) {
            if (!rawLink || typeof rawLink !== "object") {
              droppedInvalidSlotLinks += 1;
              continue;
            }
  
            const link = rawLink as {
              id?: unknown;
              origin_id?: unknown;
              target_id?: unknown;
              origin_slot?: unknown;
              target_slot?: unknown;
            };
  
            let linkId = Number(link.id);
            if (!Number.isFinite(linkId) || linkId <= 0) {
              const fromKey = Number(rawKey);
              if (!Number.isFinite(fromKey) || fromKey <= 0) {
                droppedInvalidSlotLinks += 1;
                continue;
              }
              linkId = Math.floor(fromKey);
            } else {
              linkId = Math.floor(linkId);
            }
  
            const originId = link.origin_id;
            const targetId = link.target_id;
            const originSlot = Number(link.origin_slot);
            const targetSlot = Number(link.target_slot);
  
            if (
              (typeof originId !== "string" && typeof originId !== "number") ||
              (typeof targetId !== "string" && typeof targetId !== "number") ||
              !Number.isFinite(originSlot) ||
              !Number.isFinite(targetSlot)
            ) {
              droppedInvalidSlotLinks += 1;
              continue;
            }
  
            const originNode = nodeById.get(String(originId)) as
              | { outputs?: Array<Record<string, unknown>> }
              | undefined;
            const targetNode = nodeById.get(String(targetId)) as
              | { inputs?: Array<Record<string, unknown>> }
              | undefined;
  
            if (!originNode || !targetNode) {
              droppedDanglingLinks += 1;
              continue;
            }
  
            const os = Math.floor(originSlot);
            const ts = Math.floor(targetSlot);
  
            if (
              !Array.isArray(originNode.outputs) ||
              !Array.isArray(targetNode.inputs) ||
              os < 0 ||
              ts < 0 ||
              os >= originNode.outputs.length ||
              ts >= targetNode.inputs.length
            ) {
              droppedInvalidSlotLinks += 1;
              continue;
            }
  
            const outputPort = originNode.outputs[os] as { links?: unknown };
            const inputPort = targetNode.inputs[ts] as { link?: unknown };
  
            if (
              inputPort.link !== null &&
              typeof inputPort.link !== "undefined" &&
              Number(inputPort.link) !== linkId
            ) {
              droppedDuplicateInputLinks += 1;
              continue;
            }
  
            if (!Array.isArray(outputPort.links)) {
              outputPort.links = [];
            }
            const outputLinks = outputPort.links as number[];
            if (!outputLinks.includes(linkId)) {
              outputLinks.push(linkId);
              repairedOutputCount += 1;
            }
  
            if (inputPort.link === null || typeof inputPort.link === "undefined") {
              inputPort.link = linkId;
              repairedInputCount += 1;
            }
  
            link.id = linkId;
            link.origin_slot = os;
            link.target_slot = ts;
            repairedLinks[String(linkId)] = link;
            if (linkId > maxLinkId) maxLinkId = linkId;
          }
  
          for (const node of nodes) {
            const nodeAs = node as { outputs?: Array<{ links?: unknown }> };
            if (!Array.isArray(nodeAs.outputs)) continue;
            for (const output of nodeAs.outputs) {
              if (!Array.isArray(output.links)) continue;
              if (!output.links.length) {
                output.links = null;
                continue;
              }
              output.links.sort((a, b) => Number(a) - Number(b));
            }
          }
  
          graph.links = repairedLinks;
          if (typeof graph.last_link_id === "number") {
            graph.last_link_id = Math.max(graph.last_link_id, maxLinkId);
          } else {
            graph.last_link_id = maxLinkId;
          }
  
          return {
            nodeCount: nodes.length,
            linkCount: Object.keys(repairedLinks).length,
            repairedInputCount,
            repairedOutputCount,
            droppedDanglingLinks,
            droppedInvalidSlotLinks,
            droppedDuplicateInputLinks
          };
        };
  
        let summary: Record<string, unknown>;
        if (app && typeof app.repairGraphLinks === "function") {
          summary = app.repairGraphLinks(graph) as Record<string, unknown>;
        } else {
          summary = fallbackRepair();
        }
  
        if (app?.canvas && typeof app.canvas.draw === "function") {
          app.canvas.draw(true, true);
        }
  
        const output: RepairGraphLinksOutput = {
          nodeCount: Number(summary.nodeCount ?? 0) || 0,
          linkCount: Number(summary.linkCount ?? 0) || 0,
          repairedInputCount: Number(summary.repairedInputCount ?? 0) || 0,
          repairedOutputCount: Number(summary.repairedOutputCount ?? 0) || 0,
          droppedDanglingLinks: Number(summary.droppedDanglingLinks ?? 0) || 0,
          droppedInvalidSlotLinks: Number(summary.droppedInvalidSlotLinks ?? 0) || 0,
          droppedDuplicateInputLinks: Number(summary.droppedDuplicateInputLinks ?? 0) || 0,
          warnings: []
        };
  
        if (output.droppedDanglingLinks > 0) {
          output.warnings.push(String(output.droppedDanglingLinks) + " dangling links were removed.");
        }
        if (output.droppedInvalidSlotLinks > 0) {
          output.warnings.push(String(output.droppedInvalidSlotLinks) + " invalid-slot links were removed.");
        }
        if (output.droppedDuplicateInputLinks > 0) {
          output.warnings.push(String(output.droppedDuplicateInputLinks) + " duplicate input links were removed.");
        }
  
        return output;
      });
    };

  (FactSimRuntimeClass.prototype as any).runSimulationFor = async function (this: any, wallMs: number, mode?: "dt" | "event", fastest?: boolean, includeBenchmark?: boolean, benchmarkWallMs?: number): Promise<RunSimulationForOutput> {
      const waitMs = Math.max(100, Math.min(10 * 60 * 1000, Math.floor(Number(wallMs) || 0)));
      if (!Number.isFinite(waitMs)) {
        throw new Error("wallMs must be a finite number");
      }
  
      if (mode === "dt" || mode === "event") {
        await this.setSimulationMode(mode);
      }
  
      if (typeof fastest === "boolean") {
        await this.setPlaybackSpeed(undefined, fastest);
      }
  
      const started = await this.startSimulation();
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), waitMs);
      });
      const stopped = await this.stopSimulation();
      const status = await this.getSimulationStatus();
      const kpi = await this.getKpiSummary();
  
      let benchmarkSummary: ScenarioBenchmarkSummary | null = null;
      if (includeBenchmark) {
        const bench = await this.runBenchmark(benchmarkWallMs);
        benchmarkSummary = this.summarizeBenchmark(bench);
      }
  
      const startTime = typeof started.simTimeMs === "number" ? started.simTimeMs : null;
      const endTime = typeof stopped.simTimeMs === "number" ? stopped.simTimeMs : null;
  
      return {
        wallMs: waitMs,
        running: stopped.running,
        mode: status.mode,
        fastestMode: status.fastestMode,
        startSimTimeMs: startTime,
        simTimeMs: endTime,
        advancedSimMs: startTime !== null && endTime !== null ? Math.max(0, endTime - startTime) : null,
        kpi,
        benchmarkSummary
      };
    };
}
