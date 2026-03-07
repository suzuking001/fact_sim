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

export function registerRuntimeMethodsGroup12(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).buildDoeCombinations = function (this: any, valueSets: number[][], maxExperiments: number): { combinations: number[][]; truncated: boolean } {
      const limit = Math.max(1, Math.floor(maxExperiments));
      let combinations: number[][] = [[]];
      let truncated = false;
  
      for (const values of valueSets) {
        const next: number[][] = [];
        for (const prefix of combinations) {
          for (const value of values) {
            if (next.length >= limit) {
              truncated = true;
              break;
            }
            next.push([...prefix, value]);
          }
          if (next.length >= limit) {
            break;
          }
        }
        combinations = next;
        if (truncated) {
          break;
        }
      }
  
      return {
        combinations,
        truncated
      };
    };

  (FactSimRuntimeClass.prototype as any).computeDoeScore = function (this: any, kpi: KpiSummary, taktTargetSec: number | null, weights: ObjectiveWeights): { score: number; estimatedTaktSec: number | null; cycleTimeSec: number | null } {
      const throughput = Number.isFinite(kpi.throughputPerHourTotal) ? Math.max(0, kpi.throughputPerHourTotal) : 0;
      const totalCompleted = Number.isFinite(kpi.totalCompleted) ? Math.max(0, kpi.totalCompleted) : 0;
      const nodeCount = Number.isFinite(kpi.nodeCount) ? Math.max(0, kpi.nodeCount) : 0;
      const linkCount = Number.isFinite(kpi.linkCount) ? Math.max(0, kpi.linkCount) : 0;
  
      const estimatedTaktSec = throughput > 0 ? 3600 / throughput : null;
      const cycleCandidates = kpi.sinkKpis
        .map((x) => Number(x.averageCycleTimeSec))
        .filter((x) => Number.isFinite(x) && x > 0);
      const cycleTimeSec = cycleCandidates.length
        ? cycleCandidates.reduce((acc, x) => acc + x, 0) / cycleCandidates.length
        : null;
  
      const taktGapPenalty =
        taktTargetSec === null
          ? 0
          : estimatedTaktSec === null
            ? taktTargetSec * 2
            : Math.abs(estimatedTaktSec - taktTargetSec);
  
      const score =
        throughput * weights.throughput +
        totalCompleted * weights.completion -
        taktGapPenalty * weights.taktGap -
        (cycleTimeSec ?? 0) * weights.cycleTime -
        nodeCount * weights.nodeCount -
        linkCount * weights.linkCount;
  
      return {
        score,
        estimatedTaktSec: estimatedTaktSec === null ? null : this.roundNumber(estimatedTaktSec, 6),
        cycleTimeSec: cycleTimeSec === null ? null : this.roundNumber(cycleTimeSec, 6)
      };
    };

  (FactSimRuntimeClass.prototype as any).normalizeObjective = function (this: any, objective?: OptimizationObjective): OptimizationObjective {
      const value = String(objective ?? "throughput").trim().toLowerCase();
      if (value === "throughput" || value === "throughput_per_node" || value === "balanced") {
        return value;
      }
      throw new Error("objective must be one of: throughput, throughput_per_node, balanced");
    };

  (FactSimRuntimeClass.prototype as any).computeObjectiveScore = function (this: any, objective: OptimizationObjective, metrics: { throughputPerHourTotal: number; bestHeadlessSpeed: number; nodeCount: number; linkCount: number }): number {
      const throughput = Number.isFinite(metrics.throughputPerHourTotal) ? Math.max(0, metrics.throughputPerHourTotal) : 0;
      const bestHeadlessSpeed = Number.isFinite(metrics.bestHeadlessSpeed) ? Math.max(0, metrics.bestHeadlessSpeed) : 0;
      const nodeCount = Number.isFinite(metrics.nodeCount) ? Math.max(0, metrics.nodeCount) : 0;
      const linkCount = Number.isFinite(metrics.linkCount) ? Math.max(0, metrics.linkCount) : 0;
  
      switch (objective) {
        case "throughput":
          return throughput;
        case "throughput_per_node":
          return throughput / Math.max(1, nodeCount);
        case "balanced": {
          const densityPenalty = Math.max(0, nodeCount * 1.5 - linkCount);
          return throughput + bestHeadlessSpeed * 0.35 - nodeCount * 0.25 - densityPenalty * 0.1;
        }
        default:
          return throughput;
      }
    };

  (FactSimRuntimeClass.prototype as any).sanitizeWallMs = function (this: any, wallMs?: number): number | null {
      if (typeof wallMs !== "number" || !Number.isFinite(wallMs)) {
        return null;
      }
      return Math.max(100, Math.floor(wallMs));
    };

  (FactSimRuntimeClass.prototype as any).sanitizeTopK = function (this: any, topK?: number): number | null {
      if (typeof topK !== "number" || !Number.isFinite(topK)) {
        return null;
      }
      return Math.max(1, Math.min(1000, Math.floor(topK)));
    };

  (FactSimRuntimeClass.prototype as any).sanitizeSuggestionLimit = function (this: any, maxSuggestions?: number): number {
      if (typeof maxSuggestions !== "number" || !Number.isFinite(maxSuggestions)) {
        return 10;
      }
      return Math.max(1, Math.min(50, Math.floor(maxSuggestions)));
    };

  (FactSimRuntimeClass.prototype as any).parseGraphForAnalysis = function (this: any, graphJson: string): {
      nodeCount: number;
      linkCount: number;
      sourceNodeCount: number;
      sinkNodeCount: number;
      isolatedNodeCount: number;
      unreachableNodeCount: number;
      cycleDetected: boolean;
      linkToNodeRatio: number;
      nodeTypeCounts: Record<string, number>;
      warnings: string[];
    } {
      const raw = String(graphJson ?? "").trim();
      if (!raw) {
        throw new Error("graphJson is required");
      }
  
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        throw new Error("Invalid graphJson: " + toErrorMessage(error));
      }
  
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("graphJson root must be a JSON object");
      }
  
      const candidate = parsed as {
        nodes?: unknown;
        _nodes?: unknown;
        links?: unknown;
      };
  
      const warnings: string[] = [];
      const nodesRaw = Array.isArray(candidate.nodes)
        ? candidate.nodes
        : Array.isArray(candidate._nodes)
          ? candidate._nodes
          : [];
  
      if (!Array.isArray(candidate.nodes)) {
        warnings.push('"nodes" array is missing (used fallback check).');
      }
  
      const nodeTypeCounts: Record<string, number> = {};
      const idToKey = new Map<string, string>();
      const nodeInfos = nodesRaw.map((node, index) => {
        const asNode = node as { id?: unknown; type?: unknown; title?: unknown };
        const nodeId = typeof asNode.id === "string" || typeof asNode.id === "number" ? asNode.id : null;
        const key = this.toNodeKey(nodeId, index);
        const type = String(asNode.type ?? "").trim();
        const title = String(asNode.title ?? "").trim();
        const typeKey = type || "unknown";
        nodeTypeCounts[typeKey] = (nodeTypeCounts[typeKey] ?? 0) + 1;
        if (nodeId !== null) {
          idToKey.set(String(nodeId), key);
        }
        return { key, type, title };
      });
  
      const incoming = new Map<string, number>();
      const outgoing = new Map<string, number>();
      const adjacency = new Map<string, Set<string>>();
  
      for (const node of nodeInfos) {
        incoming.set(node.key, 0);
        outgoing.set(node.key, 0);
        adjacency.set(node.key, new Set<string>());
      }
  
      const linkEntries = Array.isArray(candidate.links)
        ? candidate.links
        : candidate.links && typeof candidate.links === "object"
          ? Object.values(candidate.links as Record<string, unknown>)
          : [];
  
      if (!candidate.links || (typeof candidate.links !== "object" && !Array.isArray(candidate.links))) {
        warnings.push('"links" is missing or not an object/array.');
      }
  
      let validLinkCount = 0;
      let invalidLinkCount = 0;
  
      for (const entry of linkEntries) {
        const endpoints = this.extractLinkEndpoints(entry);
        if (!endpoints) {
          invalidLinkCount += 1;
          continue;
        }
  
        const fromKey = endpoints.fromId !== null ? idToKey.get(String(endpoints.fromId)) ?? null : null;
        const toKey = endpoints.toId !== null ? idToKey.get(String(endpoints.toId)) ?? null : null;
        if (!fromKey || !toKey) {
          invalidLinkCount += 1;
          continue;
        }
  
        validLinkCount += 1;
        outgoing.set(fromKey, (outgoing.get(fromKey) ?? 0) + 1);
        incoming.set(toKey, (incoming.get(toKey) ?? 0) + 1);
        adjacency.get(fromKey)?.add(toKey);
      }
  
      if (invalidLinkCount > 0) {
        warnings.push(String(invalidLinkCount) + " link(s) could not be resolved to known node ids.");
      }
  
      let sourceNodeCount = 0;
      let sinkNodeCount = 0;
      let isolatedNodeCount = 0;
  
      for (const node of nodeInfos) {
        const inCount = incoming.get(node.key) ?? 0;
        const outCount = outgoing.get(node.key) ?? 0;
        const lowerType = node.type.toLowerCase();
        const lowerTitle = node.title.toLowerCase();
        const sourceHint = lowerType.includes("source") || lowerTitle.includes("source");
        const sinkHint = lowerType.includes("sink") || lowerTitle.includes("sink");
  
        if (sourceHint || inCount === 0) {
          sourceNodeCount += 1;
        }
        if (sinkHint || outCount === 0) {
          sinkNodeCount += 1;
        }
        if (inCount === 0 && outCount === 0) {
          isolatedNodeCount += 1;
        }
      }
  
      const traversalStarts = nodeInfos.filter((node) => (incoming.get(node.key) ?? 0) === 0).map((node) => node.key);
      if (!traversalStarts.length && nodeInfos.length > 0) {
        traversalStarts.push(nodeInfos[0].key);
      }
  
      const visited = new Set<string>();
      const queue = [...traversalStarts];
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        for (const next of adjacency.get(current) ?? []) {
          if (!visited.has(next)) {
            queue.push(next);
          }
        }
      }
  
      const unreachableNodeCount = nodeInfos.filter((node) => !visited.has(node.key)).length;
      const cycleDetected = this.hasDirectedCycle(adjacency);
      const nodeCount = nodeInfos.length;
      const linkCount = linkEntries.length;
  
      return {
        nodeCount,
        linkCount,
        sourceNodeCount,
        sinkNodeCount,
        isolatedNodeCount,
        unreachableNodeCount,
        cycleDetected,
        linkToNodeRatio: nodeCount > 0 ? validLinkCount / nodeCount : 0,
        nodeTypeCounts,
        warnings
      };
    };

  (FactSimRuntimeClass.prototype as any).toNodeKey = function (this: any, nodeId: string | number | null, index: number): string {
      if (nodeId === null) {
        return `__idx_${index}`;
      }
      return String(nodeId);
    };
}
