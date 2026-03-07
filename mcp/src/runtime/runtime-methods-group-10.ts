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

export function registerRuntimeMethodsGroup10(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).evaluateCandidateGraph = async function (this: any, graphJson: string, wallMs?: number, objective?: OptimizationObjective): Promise<CandidateEvaluationOutput> {
      const normalizedObjective = this.normalizeObjective(objective);
      const validation = await this.validateGraphJson(graphJson);
      if (!validation.valid) {
        throw new Error("graphJson validation failed: " + (validation.warnings.join(" ") || "invalid graph structure"));
      }
  
      const imported = await this.importGraphJson(graphJson);
      const benchmark = await this.runBenchmark(wallMs);
      const benchmarkSummary = this.summarizeBenchmark(benchmark);
      const kpi = await this.getKpiSummary();
  
      const throughputPerHourTotal = Number.isFinite(kpi.throughputPerHourTotal) ? kpi.throughputPerHourTotal : 0;
      const bestHeadlessSpeed = Number.isFinite(benchmarkSummary.bestHeadlessSpeed ?? Number.NaN)
        ? Number(benchmarkSummary.bestHeadlessSpeed)
        : 0;
  
      const score = this.computeObjectiveScore(normalizedObjective, {
        throughputPerHourTotal,
        bestHeadlessSpeed,
        nodeCount: imported.nodeCount,
        linkCount: imported.linkCount
      });
  
      const warnings = [...validation.warnings];
      if (kpi.sinkCount === 0) {
        warnings.push("No sink-like node detected in KPI summary.");
      }
  
      return {
        objective: normalizedObjective,
        wallMs: this.sanitizeWallMs(wallMs),
        score,
        benchmarkSummary,
        graph: {
          nodeCount: imported.nodeCount,
          linkCount: imported.linkCount
        },
        kpi: {
          throughputPerHourTotal,
          projectedThroughputPerHour: kpi.projectedThroughputPerHour,
          totalCompleted: kpi.totalCompleted,
          sinkCount: kpi.sinkCount
        },
        warnings
      };
    };

  (FactSimRuntimeClass.prototype as any).rankCandidateGraphs = async function (this: any, candidates: string[], wallMs?: number, objective?: OptimizationObjective, topK?: number): Promise<CandidateRankingOutput> {
      const normalizedObjective = this.normalizeObjective(objective);
      const rows: CandidateRankingItem[] = [];
  
      for (let index = 0; index < candidates.length; index += 1) {
        const graphJson = String(candidates[index] ?? "").trim();
        if (!graphJson) {
          rows.push({
            index,
            ok: false,
            score: null,
            nodeCount: null,
            linkCount: null,
            throughputPerHourTotal: null,
            bestHeadlessSpeed: null,
            error: "graphJson is empty"
          });
          continue;
        }
  
        try {
          const result = await this.evaluateCandidateGraph(graphJson, wallMs, normalizedObjective);
          rows.push({
            index,
            ok: true,
            score: result.score,
            nodeCount: result.graph.nodeCount,
            linkCount: result.graph.linkCount,
            throughputPerHourTotal: result.kpi.throughputPerHourTotal,
            bestHeadlessSpeed: result.benchmarkSummary.bestHeadlessSpeed
          });
        } catch (error) {
          rows.push({
            index,
            ok: false,
            score: null,
            nodeCount: null,
            linkCount: null,
            throughputPerHourTotal: null,
            bestHeadlessSpeed: null,
            error: toErrorMessage(error)
          });
        }
      }
  
      const okRows = rows
        .filter((row) => row.ok)
        .sort((a, b) => Number(b.score ?? Number.NEGATIVE_INFINITY) - Number(a.score ?? Number.NEGATIVE_INFINITY));
      const failedRows = rows.filter((row) => !row.ok);
      const topKLimit = this.sanitizeTopK(topK);
      const rankedOk = topKLimit === null ? okRows : okRows.slice(0, topKLimit);
  
      return {
        objective: normalizedObjective,
        wallMs: this.sanitizeWallMs(wallMs),
        requestedCandidates: candidates.length,
        evaluatedCandidates: rows.length,
        succeeded: okRows.length,
        failed: failedRows.length,
        rankings: [...rankedOk, ...failedRows]
      };
    };

  (FactSimRuntimeClass.prototype as any).suggestTopologyImprovements = async function (this: any, graphJson: string, maxSuggestions?: number): Promise<TopologyImprovementOutput> {
      const analysis = this.parseGraphForAnalysis(graphJson);
      const suggestions: TopologySuggestion[] = [];
  
      if (analysis.nodeCount === 0) {
        suggestions.push({
          severity: "warn",
          code: "graph.empty",
          message: "Graph has no nodes. Start from at least one source and one sink node."
        });
      }
  
      if (analysis.nodeCount > 1 && analysis.linkCount === 0) {
        suggestions.push({
          severity: "warn",
          code: "graph.no_links",
          message: "Graph has multiple nodes but no links. Connect process flow from source to sink."
        });
      }
  
      if (analysis.sourceNodeCount === 0 && analysis.nodeCount > 0) {
        suggestions.push({
          severity: "warn",
          code: "graph.no_source",
          message: "No source-like node detected. Add at least one source/start node."
        });
      }
  
      if (analysis.sinkNodeCount === 0 && analysis.nodeCount > 0) {
        suggestions.push({
          severity: "warn",
          code: "graph.no_sink",
          message: "No sink-like node detected. Add at least one sink/end node for throughput KPIs."
        });
      }
  
      if (analysis.isolatedNodeCount > 0) {
        suggestions.push({
          severity: "warn",
          code: "graph.isolated_nodes",
          message: String(analysis.isolatedNodeCount) + " isolated node(s) detected. Connect or remove them."
        });
      }
  
      if (analysis.unreachableNodeCount > 0) {
        suggestions.push({
          severity: "warn",
          code: "graph.unreachable_nodes",
          message: String(analysis.unreachableNodeCount) + " node(s) are unreachable from source side. Check link direction."
        });
      }
  
      if (analysis.cycleDetected) {
        suggestions.push({
          severity: "warn",
          code: "graph.cycle_detected",
          message: "Directed cycle detected. Verify loops do not create deadlocks or infinite circulation."
        });
      }
  
      if (analysis.nodeCount > 0 && analysis.linkToNodeRatio < 0.8) {
        suggestions.push({
          severity: "info",
          code: "graph.low_connectivity",
          message: "Connectivity is sparse. Consider adding buffers/transport links between stages."
        });
      }
  
      if (analysis.nodeCount > 0 && analysis.linkToNodeRatio > 3.0) {
        suggestions.push({
          severity: "info",
          code: "graph.high_complexity",
          message: "Topology is dense. Simplifying branches may improve maintainability and tuning speed."
        });
      }
  
      if (!suggestions.length) {
        suggestions.push({
          severity: "info",
          code: "graph.topology_balanced",
          message: "No major structural issues detected. Proceed with parameter tuning and benchmark search."
        });
      }
  
      return {
        nodeCount: analysis.nodeCount,
        linkCount: analysis.linkCount,
        sourceNodeCount: analysis.sourceNodeCount,
        sinkNodeCount: analysis.sinkNodeCount,
        isolatedNodeCount: analysis.isolatedNodeCount,
        unreachableNodeCount: analysis.unreachableNodeCount,
        cycleDetected: analysis.cycleDetected,
        linkToNodeRatio: analysis.linkToNodeRatio,
        nodeTypeCounts: analysis.nodeTypeCounts,
        warnings: analysis.warnings,
        suggestions: suggestions.slice(0, this.sanitizeSuggestionLimit(maxSuggestions))
      };
    };

  (FactSimRuntimeClass.prototype as any).close = async function (this: any): Promise<void> {
      const errors: string[] = [];
  
      if (this.page) {
        try {
          await this.page.close();
        } catch (error) {
          errors.push(`page.close failed: ${toErrorMessage(error)}`);
        }
        this.page = null;
      }
  
      if (this.browserContext) {
        try {
          await this.browserContext.close();
        } catch (error) {
          errors.push(`context.close failed: ${toErrorMessage(error)}`);
        }
        this.browserContext = null;
      }
  
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (error) {
          errors.push(`browser.close failed: ${toErrorMessage(error)}`);
        }
        this.browser = null;
      }
  
      if (this.staticServer) {
        const server = this.staticServer;
        this.staticServer = null;
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
  
      this.port = 0;
      this.initializing = null;
  
      if (errors.length) {
        this.logger("runtime close completed with warnings", errors);
      }
    };

  (FactSimRuntimeClass.prototype as any).parseTimelineCsv = function (this: any, csv: string): Array<Record<string, string>> {
      const text = String(csv ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = text.split("\n").filter((line) => line.trim().length > 0);
      if (!lines.length) {
        return [];
      }
  
      const headers = this.parseCsvLine(lines[0]);
      const rows: Array<Record<string, string>> = [];
  
      for (let i = 1; i < lines.length; i += 1) {
        const values = this.parseCsvLine(lines[i]);
        if (!values.length) continue;
        const row: Record<string, string> = {};
        for (let c = 0; c < headers.length; c += 1) {
          row[String(headers[c] ?? `c${c}`)] = String(values[c] ?? "");
        }
        rows.push(row);
      }
  
      return rows;
    };

  (FactSimRuntimeClass.prototype as any).parseCsvLine = function (this: any, line: string): string[] {
      const out: string[] = [];
      let current = "";
      let inQuotes = false;
  
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i += 1;
            continue;
          }
          inQuotes = !inQuotes;
          continue;
        }
  
        if (ch === "," && !inQuotes) {
          out.push(current);
          current = "";
          continue;
        }
  
        current += ch;
      }
  
      out.push(current);
      return out;
    };
}
