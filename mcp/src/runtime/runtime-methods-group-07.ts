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

export function registerRuntimeMethodsGroup07(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).setTaktTargetAndObjective = async function (this: any, taktSec: number, objectiveWeights?: Partial<ObjectiveWeights>): Promise<SetTaktTargetOutput> {
      const normalizedTaktSec = this.sanitizeNumberOption(taktSec, 60, 0.1, 3600);
  
      const merged: ObjectiveWeights = {
        ...this.objectiveWeights
      };
  
      if (objectiveWeights && typeof objectiveWeights === "object") {
        const partial = objectiveWeights as Record<string, unknown>;
        const keys: Array<keyof ObjectiveWeights> = [
          "throughput",
          "taktGap",
          "cycleTime",
          "nodeCount",
          "linkCount",
          "completion"
        ];
        for (const key of keys) {
          const raw = partial[key];
          if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
            continue;
          }
          merged[key] = raw;
        }
      }
  
      this.taktTargetSec = normalizedTaktSec;
      this.objectiveWeights = merged;
  
      return {
        taktSec: normalizedTaktSec,
        targetUnitsPerHour: this.roundNumber(3600 / normalizedTaktSec, 6),
        objectiveWeights: {
          ...merged
        }
      };
    };

  (FactSimRuntimeClass.prototype as any).validateLayoutRules = async function (this: any, minDistance?: number, forbiddenAdjacency?: string[]): Promise<LayoutValidationOutput> {
      const normalizedMinDistance = this.sanitizeNumberOption(minDistance, 180, 1, 5000);
      const rulesRaw = Array.isArray(forbiddenAdjacency)
        ? forbiddenAdjacency.map((x) => String(x).trim()).filter((x) => x.length > 0)
        : [];
  
      const exported = await this.exportGraphJson(false);
      const graph = this.parseGraphJsonObject(exported.json);
      const nodes = this.getSerializedNodes(graph);
      const links = this.canonicalizeSerializedLinks(graph.links);
  
      const nodeRows = nodes.map((node: any) => {
        const asNode = node as { id?: unknown; title?: unknown; type?: unknown; pos?: unknown };
        const id = typeof asNode.id === "string" || typeof asNode.id === "number" ? asNode.id : null;
        const rawPos = Array.isArray(asNode.pos) ? asNode.pos : null;
        const x = rawPos && rawPos.length > 0 ? Number(rawPos[0]) : Number.NaN;
        const y = rawPos && rawPos.length > 1 ? Number(rawPos[1]) : Number.NaN;
        return {
          id,
          key: id === null ? null : this.normalizeNodeId(id),
          title: String(asNode.title ?? ""),
          type: typeof asNode.type === "string" ? asNode.type : null,
          x,
          y
        };
      });
  
      const nodeByKey = new Map<string, (typeof nodeRows)[number]>();
      for (const row of nodeRows) {
        if (row.key !== null) {
          nodeByKey.set(row.key, row);
        }
      }
  
      const distanceViolations: LayoutDistanceViolation[] = [];
      let checkedPairs = 0;
      for (let i = 0; i < nodeRows.length; i += 1) {
        const a = nodeRows[i];
        if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
  
        for (let j = i + 1; j < nodeRows.length; j += 1) {
          const b = nodeRows[j];
          if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
  
          checkedPairs += 1;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < normalizedMinDistance) {
            distanceViolations.push({
              nodeAId: a.id,
              nodeATitle: a.title,
              nodeBId: b.id,
              nodeBTitle: b.title,
              distance: this.roundNumber(distance, 4),
              minDistance: normalizedMinDistance
            });
          }
        }
      }
  
      const warnings: string[] = [];
      const parsedRules: Array<{ raw: string; from: string; to: string }> = [];
      for (const rawRule of rulesRaw) {
        const parsed = this.parseForbiddenAdjacencyRule(rawRule);
        if (!parsed) {
          warnings.push('Invalid forbiddenAdjacency rule ignored: ' + rawRule);
          continue;
        }
        parsedRules.push({ raw: rawRule, from: parsed.from, to: parsed.to });
      }
  
      const forbiddenAdjacencyViolations: ForbiddenAdjacencyViolation[] = [];
      for (const link of links) {
        const fromKey = this.normalizeNodeId(link[1]);
        const toKey = this.normalizeNodeId(link[3]);
        const fromNode = nodeByKey.get(fromKey);
        const toNode = nodeByKey.get(toKey);
        if (!fromNode || !toNode) {
          warnings.push('Link endpoint could not be resolved for adjacency validation: ' + String(link[0]));
          continue;
        }
  
        for (const rule of parsedRules) {
          const fromMatched = this.nodeMatchesPattern({ type: fromNode.type, title: fromNode.title }, rule.from);
          const toMatched = this.nodeMatchesPattern({ type: toNode.type, title: toNode.title }, rule.to);
          if (!fromMatched || !toMatched) {
            continue;
          }
  
          forbiddenAdjacencyViolations.push({
            rule: rule.raw,
            fromNodeId: fromNode.id,
            fromType: fromNode.type,
            fromTitle: fromNode.title,
            toNodeId: toNode.id,
            toType: toNode.type,
            toTitle: toNode.title
          });
        }
      }
  
      return {
        minDistance: normalizedMinDistance,
        checkedPairs,
        linkCount: links.length,
        distanceViolationCount: distanceViolations.length,
        forbiddenAdjacencyViolationCount: forbiddenAdjacencyViolations.length,
        distanceViolations,
        forbiddenAdjacencyViolations,
        warnings,
        ok: distanceViolations.length === 0 && forbiddenAdjacencyViolations.length === 0
      };
    };

  (FactSimRuntimeClass.prototype as any).runDesignOfExperiments = async function (this: any, paramGrid: DoeParamGridInput, wallMs?: number): Promise<DesignOfExperimentsOutput> {
      if (!paramGrid || typeof paramGrid !== "object") {
        throw new Error("paramGrid is required");
      }
  
      const rawParams = Array.isArray(paramGrid.parameters) ? paramGrid.parameters : [];
      if (!rawParams.length) {
        throw new Error("paramGrid.parameters must contain at least one parameter definition");
      }
  
      const normalizedWallMs = this.sanitizeIntegerOption(
        typeof wallMs === "number" ? wallMs : 2000,
        2000,
        200,
        120000
      );
      const normalizedTopK = this.sanitizeIntegerOption(paramGrid.topK, 10, 1, 200);
      const normalizedMaxExperiments = this.sanitizeIntegerOption(paramGrid.maxExperiments, 64, 1, 512);
      const mode = paramGrid.mode === "dt" || paramGrid.mode === "event" ? paramGrid.mode : undefined;
      const fastest = typeof paramGrid.fastest === "boolean" ? paramGrid.fastest : true;
      const includeBenchmark = !!paramGrid.includeBenchmark;
      const benchmarkWallMs = typeof paramGrid.benchmarkWallMs === "number" ? paramGrid.benchmarkWallMs : undefined;
      const applyBest = !!paramGrid.applyBest;
  
      const baseExport = await this.exportGraphJson(false);
      const baseGraph = this.parseGraphJsonObject(baseExport.json);
      const baseNodes = this.getSerializedNodes(baseGraph);
  
      const warnings: string[] = [];
      const normalizedParams = rawParams.map((raw, index) => {
        const key = String(raw?.key ?? "").trim();
        if (!key) {
          throw new Error('paramGrid.parameters[' + index + '].key is required');
        }
  
        const values = Array.isArray(raw.values)
          ? [...new Set(raw.values.map((x) => Number(x)).filter((x) => Number.isFinite(x)))]
          : [];
        if (!values.length) {
          throw new Error('paramGrid.parameters[' + index + '].values must contain finite numbers');
        }
  
        const targetNodeIds = this.resolveDoeTargetNodeIds(baseNodes, raw, warnings, index);
        if (!targetNodeIds.length) {
          warnings.push('parameter "' + key + '" has no target nodes and will be skipped');
        }
  
        return {
          key,
          values,
          targetNodeIds
        };
      }).filter((x) => x.targetNodeIds.length > 0);
  
      if (!normalizedParams.length) {
        throw new Error("No executable DOE parameter remained after target filtering");
      }
  
      let requestedExperiments = 1;
      for (const p of normalizedParams) {
        requestedExperiments *= p.values.length;
        if (!Number.isFinite(requestedExperiments) || requestedExperiments > 1_000_000_000) {
          requestedExperiments = 1_000_000_000;
          break;
        }
      }
  
      const combinationBuild = this.buildDoeCombinations(
        normalizedParams.map((p) => p.values),
        normalizedMaxExperiments
      );
  
      const rows: DoeExperimentRow[] = [];
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestExperiment = -1;
      let bestGraphJson: string | null = null;
  
      for (let comboIndex = 0; comboIndex < combinationBuild.combinations.length; comboIndex += 1) {
        const combo = combinationBuild.combinations[comboIndex];
        await this.importGraphJson(baseExport.json);
  
        const parameterValues: Record<string, number> = {};
        const changedNodeSet = new Set<string>();
  
        for (let i = 0; i < normalizedParams.length; i += 1) {
          const param = normalizedParams[i];
          const value = combo[i];
          parameterValues[param.key] = value;
  
          for (const nodeId of param.targetNodeIds) {
            await this.updateNode(nodeId, undefined, { [param.key]: value }, true);
            changedNodeSet.add(this.normalizeNodeId(nodeId));
          }
        }
  
        const run = await this.runSimulationFor(
          normalizedWallMs,
          mode,
          fastest,
          includeBenchmark,
          benchmarkWallMs
        );
  
        const scoreSummary = this.computeDoeScore(
          run.kpi,
          this.taktTargetSec,
          this.objectiveWeights
        );
  
        const row: DoeExperimentRow = {
          experiment: comboIndex + 1,
          score: this.roundNumber(scoreSummary.score, 6),
          throughputPerHourTotal: this.roundNumber(run.kpi.throughputPerHourTotal, 6),
          totalCompleted: run.kpi.totalCompleted,
          estimatedTaktSec: scoreSummary.estimatedTaktSec,
          cycleTimeSec: scoreSummary.cycleTimeSec,
          nodeCount: run.kpi.nodeCount,
          linkCount: run.kpi.linkCount,
          changedNodeCount: changedNodeSet.size,
          parameterValues
        };
        rows.push(row);
  
        if (row.score > bestScore) {
          bestScore = row.score;
          bestExperiment = row.experiment;
          if (applyBest) {
            bestGraphJson = (await this.exportGraphJson(false)).json;
          }
        }
      }
  
      if (applyBest && bestGraphJson) {
        await this.importGraphJson(bestGraphJson);
      } else {
        await this.importGraphJson(baseExport.json);
      }
  
      const ranked = [...rows].sort((a, b) => b.score - a.score);
      const topRows = ranked.slice(0, normalizedTopK);
  
      return {
        wallMs: normalizedWallMs,
        requestedExperiments,
        executedExperiments: rows.length,
        truncated: combinationBuild.combinations.length < requestedExperiments,
        topK: normalizedTopK,
        objective: {
          taktSec: this.taktTargetSec,
          targetUnitsPerHour: this.taktTargetSec ? this.roundNumber(3600 / this.taktTargetSec, 6) : null,
          objectiveWeights: {
            ...this.objectiveWeights
          }
        },
        bestExperiment: bestExperiment > 0 ? bestExperiment : null,
        bestScore: Number.isFinite(bestScore) ? this.roundNumber(bestScore, 6) : null,
        appliedBestExperiment: applyBest && bestGraphJson !== null,
        rankings: topRows,
        warnings
      };
    };
}

