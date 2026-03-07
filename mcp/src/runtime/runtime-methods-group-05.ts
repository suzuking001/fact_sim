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

export function registerRuntimeMethodsGroup05(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).exportEmbeddedHtml = async function (this: any, fileName?: string): Promise<ExportEmbeddedHtmlOutput> {
      const page = await this.ensureReady();
      const result = await page.evaluate(async () => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as { buildEmbeddedExportHtml?: () => Promise<string> } | undefined;
        if (!app || typeof app.buildEmbeddedExportHtml !== "function") {
          throw new Error("App.buildEmbeddedExportHtml is not available");
        }
  
        const html = await app.buildEmbeddedExportHtml();
        return {
          html,
          length: html.length
        };
      });
  
      const targetPath = this.resolveHtmlPath(fileName);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, result.html, "utf8");
  
      return {
        savedTo: targetPath,
        length: result.length
      };
    };

  (FactSimRuntimeClass.prototype as any).saveTimelineCsv = async function (this: any, fileName?: string): Promise<SaveTimelineCsvOutput> {
      const result = await this.exportTimelineCsv();
      const targetPath = this.resolveCsvPath(fileName);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, result.csv, "utf8");
  
      return {
        savedTo: targetPath,
        lineCount: result.lineCount
      };
    };

  (FactSimRuntimeClass.prototype as any).saveGraphJson = async function (this: any, fileName?: string, pretty?: boolean): Promise<SaveGraphJsonOutput> {
      const result = await this.exportGraphJson(pretty);
      const targetPath = this.resolveJsonPath(fileName);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, result.json, "utf8");
  
      return {
        savedTo: targetPath,
        nodeCount: result.nodeCount,
        linkCount: result.linkCount,
        bytes: result.json.length
      };
    };

  (FactSimRuntimeClass.prototype as any).loadGraphJsonFile = async function (this: any, filePath: string): Promise<LoadGraphJsonFileOutput> {
      const sourcePath = this.resolveAbsolutePath(filePath);
      const raw = await readFile(sourcePath, "utf8");
      const imported = await this.importGraphJson(raw);
  
      return {
        sourcePath,
        nodeCount: imported.nodeCount,
        linkCount: imported.linkCount,
        running: imported.running,
        simTimeMs: imported.simTimeMs
      };
    };

  (FactSimRuntimeClass.prototype as any).runMatrixAndSaveReport = async function (this: any, examples: string[], wallMs?: number, fileName?: string): Promise<SaveScenarioReportOutput> {
      const matrix = await this.runScenarioMatrix(examples, wallMs);
      const status = await this.getSimulationStatus();
      const kpi = await this.getKpiSummary();
  
      const report = {
        generatedAt: new Date().toISOString(),
        matrix,
        status,
        kpi
      };
  
      const json = JSON.stringify(report, null, 2);
      const targetPath = this.resolveReportPath(fileName);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, json, "utf8");
  
      return {
        savedTo: targetPath,
        executedExamples: matrix.executedExamples,
        succeeded: matrix.totals.succeeded,
        failed: matrix.totals.failed,
        bytes: json.length
      };
    };

  (FactSimRuntimeClass.prototype as any).validateGraphJson = async function (this: any, graphJson: string): Promise<ValidateGraphJsonOutput> {
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
          : null;
  
      if (!Array.isArray(candidate.nodes)) {
        warnings.push('"nodes" array is missing (used fallback check).');
      }
  
      let linkCount = 0;
      let hasValidLinks = false;
      if (Array.isArray(candidate.links)) {
        linkCount = candidate.links.length;
        hasValidLinks = true;
      } else if (candidate.links && typeof candidate.links === "object") {
        linkCount = Object.keys(candidate.links as Record<string, unknown>).length;
        hasValidLinks = true;
      } else {
        warnings.push('"links" should be an object or array.');
      }
  
      const nodeCount = nodesRaw ? nodesRaw.length : 0;
      if (!nodesRaw) {
        warnings.push("No node list found in graph JSON.");
      } else {
        const nonObjectNodes = nodesRaw.filter((node) => !node || typeof node !== "object").length;
        if (nonObjectNodes > 0) {
          warnings.push(String(nonObjectNodes) + " node entries are not JSON objects.");
        }
      }
  
      return {
        valid: !!nodesRaw && hasValidLinks,
        nodeCount,
        linkCount,
        warnings
      };
    };

  (FactSimRuntimeClass.prototype as any).saveKpiSummaryJson = async function (this: any, fileName?: string, pretty?: boolean): Promise<SaveKpiSummaryOutput> {
      const summary = await this.getKpiSummary();
      const targetPath = fileName
        ? this.resolveJsonPath(fileName)
        : path.resolve(process.cwd(), "artifacts", "fact-sim-kpi-" + Date.now() + ".json");
      const usePretty = typeof pretty === "boolean" ? pretty : true;
      const json = usePretty ? JSON.stringify(summary, null, 2) : JSON.stringify(summary);
  
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, json, "utf8");
  
      return {
        savedTo: targetPath,
        sinkCount: summary.sinkCount,
        totalCompleted: summary.totalCompleted,
        bytes: Buffer.byteLength(json, "utf8")
      };
    };

  (FactSimRuntimeClass.prototype as any).saveGraphOverviewJson = async function (this: any, fileName?: string, includeNodes?: boolean, maxNodes?: number, pretty?: boolean): Promise<SaveGraphOverviewOutput> {
      const overview = await this.getGraphOverview(includeNodes, maxNodes);
      const targetPath = fileName
        ? this.resolveJsonPath(fileName)
        : path.resolve(process.cwd(), "artifacts", "fact-sim-overview-" + Date.now() + ".json");
      const usePretty = typeof pretty === "boolean" ? pretty : true;
      const json = usePretty ? JSON.stringify(overview, null, 2) : JSON.stringify(overview);
  
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, json, "utf8");
  
      return {
        savedTo: targetPath,
        nodeCount: overview.nodeCount,
        linkCount: overview.linkCount,
        includeNodes: !!includeNodes,
        bytes: Buffer.byteLength(json, "utf8")
      };
    };

  (FactSimRuntimeClass.prototype as any).listNodeTypes = async function (this: any): Promise<NodeTypesOutput> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const liteGraph = w.LiteGraph as { registered_node_types?: Record<string, unknown> } | undefined;
        const registered =
          liteGraph?.registered_node_types && typeof liteGraph.registered_node_types === "object"
            ? Object.keys(liteGraph.registered_node_types)
            : [];
        const types = [...new Set(registered.map((x) => String(x).trim()).filter((x) => x.length > 0))].sort((a, b) =>
          a.localeCompare(b)
        );
        return {
          count: types.length,
          types
        };
      });
    };

  (FactSimRuntimeClass.prototype as any).describeNodeType = async function (this: any, nodeType: string): Promise<NodeTypeDescriptionOutput> {
      const page = await this.ensureReady();
      return page.evaluate((requestedNodeType: any) => {
        const w = window as unknown as Record<string, unknown>;
        const liteGraph = w.LiteGraph as { createNode?: (type: string) => unknown; registered_node_types?: Record<string, unknown> } | undefined;
        if (!liteGraph || typeof liteGraph.createNode !== "function") {
          throw new Error("LiteGraph.createNode is not available");
        }
  
        const typeRaw = String(requestedNodeType ?? "").trim();
        if (!typeRaw) {
          throw new Error("nodeType is required");
        }
  
        const node = liteGraph.createNode(typeRaw) as
          | {
              type?: unknown;
              title?: unknown;
              properties?: Record<string, unknown>;
              inputs?: Array<{ name?: unknown; type?: unknown; link?: unknown }>;
              outputs?: Array<{ name?: unknown; type?: unknown; links?: unknown }>;
            }
          | null;
  
        if (!node) {
          const knownTypes =
            liteGraph.registered_node_types && typeof liteGraph.registered_node_types === "object"
              ? Object.keys(liteGraph.registered_node_types).slice(0, 30)
              : [];
          throw new Error("Unknown nodeType: " + typeRaw + (knownTypes.length ? " (examples: " + knownTypes.join(", ") + ")" : ""));
        }
  
        const inputs = Array.isArray(node.inputs)
          ? node.inputs.map((input, index) => {
              const hasLink = typeof input?.link === "number" || typeof input?.link === "string";
              return {
                slot: index,
                name: String(input?.name ?? ""),
                type: typeof input?.type === "string" ? input.type : input?.type === null ? null : String(input?.type ?? ""),
                hasLink,
                linkCount: hasLink ? 1 : 0
              };
            })
          : [];
  
        const outputs = Array.isArray(node.outputs)
          ? node.outputs.map((output, index) => {
              const links = Array.isArray(output?.links) ? output.links : [];
              return {
                slot: index,
                name: String(output?.name ?? ""),
                type: typeof output?.type === "string" ? output.type : output?.type === null ? null : String(output?.type ?? ""),
                hasLink: links.length > 0,
                linkCount: links.length
              };
            })
          : [];
  
        const defaultProperties =
          node.properties && typeof node.properties === "object" && !Array.isArray(node.properties)
            ? JSON.parse(JSON.stringify(node.properties))
            : {};
  
        return {
          nodeType: typeof node.type === "string" ? node.type : typeRaw,
          title: String(node.title ?? ""),
          inputCount: inputs.length,
          outputCount: outputs.length,
          inputs,
          outputs,
          defaultProperties
        };
      }, nodeType);
    };
}

