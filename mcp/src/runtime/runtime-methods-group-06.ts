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

export function registerRuntimeMethodsGroup06(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).buildGraphFromBlueprint = async function (this: any, nodes: BlueprintNodeInput[], edges: BlueprintEdgeInput[], options?: BlueprintBuildOptions): Promise<BuildGraphFromBlueprintOutput> {
      const nodeSpecs = Array.isArray(nodes) ? nodes : [];
      if (!nodeSpecs.length) {
        throw new Error("nodes must contain at least one blueprint node");
      }
  
      const edgeSpecs = Array.isArray(edges) ? edges : [];
      const clearExisting = options?.clearExisting ?? true;
      const originX = this.sanitizeNumberOption(options?.originX, 120);
      const originY = this.sanitizeNumberOption(options?.originY, 120);
      const xPitch = this.sanitizeNumberOption(options?.xPitch, 320, 40);
      const yPitch = this.sanitizeNumberOption(options?.yPitch, 220, 40);
  
      if (clearExisting) {
        await this.clearGraph();
      }
  
      const keyToNodeId = new Map<string, string | number>();
      const laneCursor = new Map<number, number>();
      const createdNodes: BuildGraphFromBlueprintOutput["createdNodes"] = [];
  
      for (const rawNode of nodeSpecs) {
        const key = String(rawNode?.key ?? "").trim();
        const nodeType = String(rawNode?.nodeType ?? "").trim();
        if (!key) {
          throw new Error("blueprint node key is required");
        }
        if (!nodeType) {
          throw new Error('blueprint node "' + key + '" is missing nodeType');
        }
        if (keyToNodeId.has(key)) {
          throw new Error('duplicate blueprint node key: ' + key);
        }
  
        const lane = this.sanitizeIntegerOption(rawNode?.lane, 0);
        const laneIndex = laneCursor.get(lane) ?? 0;
        laneCursor.set(lane, laneIndex + 1);
  
        const posX = this.sanitizeNumberOption(rawNode?.x, originX + laneIndex * xPitch);
        const posY = this.sanitizeNumberOption(rawNode?.y, originY + lane * yPitch);
        const title = typeof rawNode?.title === "string" ? rawNode.title : undefined;
        const properties =
          rawNode?.properties && typeof rawNode.properties === "object" && !Array.isArray(rawNode.properties)
            ? rawNode.properties
            : undefined;
  
        const added = await this.addNode(nodeType, title, posX, posY, properties);
        if (typeof added.nodeId !== "string" && typeof added.nodeId !== "number") {
          throw new Error('failed to create node "' + key + '" (nodeType=' + nodeType + ')');
        }
  
        keyToNodeId.set(key, added.nodeId);
        createdNodes.push({
          key,
          nodeId: added.nodeId,
          nodeType: added.nodeType,
          title: added.title,
          pos: added.pos
        });
      }
  
      const createdLinks: BuildGraphFromBlueprintOutput["createdLinks"] = [];
      for (const rawEdge of edgeSpecs) {
        const fromKey = String(rawEdge?.fromKey ?? "").trim();
        const toKey = String(rawEdge?.toKey ?? "").trim();
        if (!fromKey || !toKey) {
          throw new Error("edge requires fromKey and toKey");
        }
  
        const fromNodeId = keyToNodeId.get(fromKey);
        const toNodeId = keyToNodeId.get(toKey);
        if (typeof fromNodeId === "undefined") {
          throw new Error('edge.fromKey not found in blueprint nodes: ' + fromKey);
        }
        if (typeof toNodeId === "undefined") {
          throw new Error('edge.toKey not found in blueprint nodes: ' + toKey);
        }
  
        const fromSlot = this.readOptionalNonNegativeInt(rawEdge?.fromSlot);
        const toSlot = this.readOptionalNonNegativeInt(rawEdge?.toSlot);
        const allowDuplicate = !!rawEdge?.allowDuplicate;
        const rawKind = typeof rawEdge?.portKind === "string" ? rawEdge.portKind.trim() : "";
  
        if (rawKind) {
          const portKind = this.normalizePortKind(rawKind as PortKind);
          const connected = await this.connectNodesByPortKind(fromNodeId, toNodeId, portKind, fromSlot, toSlot, allowDuplicate);
          createdLinks.push({
            fromKey,
            toKey,
            created: connected.created,
            linkId: connected.linkId,
            portKind,
            fromSlot: connected.fromSlot,
            toSlot: connected.toSlot
          });
          continue;
        }
  
        const connected = await this.connectNodes(fromNodeId, toNodeId, fromSlot, toSlot, allowDuplicate);
        createdLinks.push({
          fromKey,
          toKey,
          created: connected.created,
          linkId: connected.linkId,
          portKind: null,
          fromSlot: connected.fromSlot,
          toSlot: connected.toSlot
        });
      }
  
      const repaired = await this.repairGraphLinks();
      return {
        createdNodes,
        createdLinks,
        nodeCount: repaired.nodeCount,
        linkCount: repaired.linkCount
      };
    };

  (FactSimRuntimeClass.prototype as any).optimizeLineByBottleneck = async function (this: any, options?: OptimizeLineOptions): Promise<OptimizeLineByBottleneckOutput> {
      const normalizedIterations = this.sanitizeIntegerOption(options?.iterations, 3, 1, 20);
      const normalizedRunWallMs = this.sanitizeIntegerOption(options?.runWallMs, 2500, 200, 60000);
      const normalizedBottleneckTopN = this.sanitizeIntegerOption(options?.bottleneckTopN, 5, 1, 50);
      const normalizedMinSampleSec = this.sanitizeNumberOption(options?.minSampleSec, 1, 0);
      const normalizedMaxNodesPerIteration = this.sanitizeIntegerOption(options?.maxNodesPerIteration, 2, 1, 10);
      const normalizedProcessReductionRatio = this.sanitizeNumberOption(options?.processReductionRatio, 0.12, 0.01, 0.8);
      const normalizedDownReductionRatio = this.sanitizeNumberOption(options?.downReductionRatio, 0.2, 0.01, 0.8);
      const normalizedMinProcessTime = this.sanitizeNumberOption(options?.minProcessTime, 0.2, 0);
      const normalizedMinDownTime = this.sanitizeNumberOption(options?.minDownTime, 0.1, 0);
  
      const warnings: string[] = [];
      const baselineRun = await this.runSimulationFor(normalizedRunWallMs, undefined, true, false);
      const baselineScore = this.computeLineOptimizationScore(
        baselineRun.kpi.throughputPerHourTotal,
        baselineRun.kpi.totalCompleted
      );
  
      let bestIteration = 0;
      let bestThroughput = baselineRun.kpi.throughputPerHourTotal;
      let bestCompleted = baselineRun.kpi.totalCompleted;
      let bestScore = baselineScore;
      let bestGraphJson = (await this.exportGraphJson(false)).json;
  
      const history: LineOptimizationStep[] = [];
  
      for (let iteration = 1; iteration <= normalizedIterations; iteration += 1) {
        await this.importGraphJson(bestGraphJson);
        await this.runSimulationFor(normalizedRunWallMs, undefined, true, false);
  
        const exported = await this.exportGraphJson(false);
        const graph = this.parseGraphJsonObject(exported.json);
        const serializedNodes = this.getSerializedNodes(graph);
  
        const titleToNodeIds = new Map<string, Array<string | number>>();
        for (const node of serializedNodes) {
          const nodeAs = node as { id?: unknown; title?: unknown };
          if (typeof nodeAs.id !== "string" && typeof nodeAs.id !== "number") continue;
          const title = String(nodeAs.title ?? "").trim().toLowerCase();
          if (!title) continue;
          const rows = titleToNodeIds.get(title) ?? [];
          rows.push(nodeAs.id);
          titleToNodeIds.set(title, rows);
        }
  
        const bottlenecks = await this.getBottleneckReport(normalizedBottleneckTopN, normalizedMinSampleSec);
        const targetNodeIds: Array<string | number> = [];
        for (const row of bottlenecks.rows) {
          let resolvedId: string | number | null = null;
          if (typeof row.nodeId === "string" || typeof row.nodeId === "number") {
            resolvedId = row.nodeId;
          } else {
            const titleKey = String(row.title ?? "").trim().toLowerCase();
            if (titleKey) {
              const ids = titleToNodeIds.get(titleKey) ?? [];
              if (ids.length === 1) {
                resolvedId = ids[0];
              }
            }
          }
  
          if (resolvedId === null) continue;
          if (targetNodeIds.some((id) => this.normalizeNodeId(id) === this.normalizeNodeId(resolvedId as string | number))) {
            continue;
          }
          targetNodeIds.push(resolvedId);
          if (targetNodeIds.length >= normalizedMaxNodesPerIteration) {
            break;
          }
        }
  
        if (!targetNodeIds.length) {
          warnings.push('iteration ' + iteration + ': no adjustable bottleneck node found.');
          break;
        }
  
        const changedNodeIds: Array<string | number> = [];
        for (const nodeId of targetNodeIds) {
          const node = this.findSerializedNode(serializedNodes, nodeId);
          if (!node) continue;
  
          const nodeAs = node as { properties?: unknown };
          const props =
            nodeAs.properties && typeof nodeAs.properties === "object" && !Array.isArray(nodeAs.properties)
              ? (nodeAs.properties as Record<string, unknown>)
              : {};
  
          const patch: Record<string, unknown> = {};
          const processKeys = ["processTime", "processTime2"];
          for (const key of processKeys) {
            const current = Number(props[key]);
            if (!Number.isFinite(current) || current <= normalizedMinProcessTime) continue;
            const nextValue = this.roundNumber(
              Math.max(normalizedMinProcessTime, current * (1 - normalizedProcessReductionRatio)),
              4
            );
            if (nextValue < current) {
              patch[key] = nextValue;
            }
          }
  
          const downCurrent = Number(props.downTime);
          if (Number.isFinite(downCurrent) && downCurrent > normalizedMinDownTime) {
            const nextDown = this.roundNumber(
              Math.max(normalizedMinDownTime, downCurrent * (1 - normalizedDownReductionRatio)),
              4
            );
            if (nextDown < downCurrent) {
              patch.downTime = nextDown;
            }
          }
  
          if (!Object.keys(patch).length) continue;
          await this.updateNode(nodeId, undefined, patch, true);
          changedNodeIds.push(nodeId);
        }
  
        if (!changedNodeIds.length) {
          warnings.push('iteration ' + iteration + ': candidate nodes had no tunable properties (processTime/processTime2/downTime).');
          break;
        }
  
        const run = await this.runSimulationFor(normalizedRunWallMs, undefined, true, false);
        const score = this.computeLineOptimizationScore(run.kpi.throughputPerHourTotal, run.kpi.totalCompleted);
        const improved = score > bestScore + 1e-9;
  
        history.push({
          iteration,
          changedNodeIds,
          throughputPerHourTotal: this.roundNumber(run.kpi.throughputPerHourTotal, 6),
          totalCompleted: run.kpi.totalCompleted,
          score: this.roundNumber(score, 6),
          improved
        });
  
        if (improved) {
          bestIteration = iteration;
          bestThroughput = run.kpi.throughputPerHourTotal;
          bestCompleted = run.kpi.totalCompleted;
          bestScore = score;
          bestGraphJson = (await this.exportGraphJson(false)).json;
        }
      }
  
      await this.importGraphJson(bestGraphJson);
  
      return {
        iterations: normalizedIterations,
        runWallMs: normalizedRunWallMs,
        bottleneckTopN: normalizedBottleneckTopN,
        baseline: {
          throughputPerHourTotal: this.roundNumber(baselineRun.kpi.throughputPerHourTotal, 6),
          totalCompleted: baselineRun.kpi.totalCompleted,
          score: this.roundNumber(baselineScore, 6)
        },
        bestIteration,
        best: {
          throughputPerHourTotal: this.roundNumber(bestThroughput, 6),
          totalCompleted: bestCompleted,
          score: this.roundNumber(bestScore, 6)
        },
        history,
        warnings
      };
    };
}
