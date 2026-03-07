import { createReadStream } from "node:fs";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";

import { Browser, BrowserContext, Page, chromium } from "playwright";

type Logger = (message: string, details?: unknown) => void;

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

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
  GetRandomSeedOutput
} from "./runtime/runtime-types.js";

export type {
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
  GetRandomSeedOutput
} from "./runtime/runtime-types.js";

import { registerRuntimeMethodsGroup01 } from "./runtime/runtime-methods-group-01.js";
import { registerRuntimeMethodsGroup02 } from "./runtime/runtime-methods-group-02.js";
import { registerRuntimeMethodsGroup03 } from "./runtime/runtime-methods-group-03.js";
import { registerRuntimeMethodsGroup04 } from "./runtime/runtime-methods-group-04.js";
import { registerRuntimeMethodsGroup05 } from "./runtime/runtime-methods-group-05.js";
import { registerRuntimeMethodsGroup06 } from "./runtime/runtime-methods-group-06.js";
import { registerRuntimeMethodsGroup07 } from "./runtime/runtime-methods-group-07.js";
import { registerRuntimeMethodsGroup08 } from "./runtime/runtime-methods-group-08.js";
import { registerRuntimeMethodsGroup09 } from "./runtime/runtime-methods-group-09.js";
import { registerRuntimeMethodsGroup10 } from "./runtime/runtime-methods-group-10.js";
import { registerRuntimeMethodsGroup11 } from "./runtime/runtime-methods-group-11.js";
import { registerRuntimeMethodsGroup12 } from "./runtime/runtime-methods-group-12.js";
import { registerRuntimeMethodsGroup13 } from "./runtime/runtime-methods-group-13.js";

export class FactSimRuntime {
  private readonly repoRoot: string;

  private readonly preferredPort: number;

  private readonly logger: Logger;

  private staticServer: ReturnType<typeof createServer> | null = null;

  private port = 0;

  private browser: Browser | null = null;

  private browserContext: BrowserContext | null = null;

  private page: Page | null = null;

  private initializing: Promise<void> | null = null;

  private taktTargetSec: number | null = null;

  private objectiveWeights: ObjectiveWeights = {
      throughput: 1,
      taktGap: 2,
      cycleTime: 0.2,
      nodeCount: 0.05,
      linkCount: 0.02,
      completion: 0.01
    };

  constructor(options: { repoRoot: string; preferredPort?: number; logger?: Logger }) {
      this.repoRoot = path.resolve(options.repoRoot);
      this.preferredPort = options.preferredPort ?? 8123;
      this.logger = options.logger ?? (() => undefined);
    }
}

export interface FactSimRuntime {
  loadExample(example: string): Promise<{ example: string; nodeCount: number }>;
  startSimulation(): Promise<{ running: boolean; mode: string | null; simTimeMs: number | null }>;
  stopSimulation(): Promise<{ running: boolean; simTimeMs: number | null }>;
  runBenchmark(wallMs?: number): Promise<BenchmarkOutput>;
  exportTimelineCsv(): Promise<{ lineCount: number; csv: string }>;
  buildShareUrl(): Promise<{ url: string; length: number }>;
  getSimulationStatus(): Promise<SimulationStatus>;
  getKpiSummary(): Promise<KpiSummary>;
  runScenarioMatrix(examples: string[], wallMs?: number): Promise<ScenarioMatrixOutput>;
  listExamples(): Promise<ExampleListOutput>;
  setSimulationMode(mode: string): Promise<SetSimulationModeOutput>;
  setPlaybackSpeed(speed?: number, fastest?: boolean): Promise<PlaybackSpeedOutput>;
  resetSimulationClock(): Promise<ResetSimulationClockOutput>;
  setRandomSeed(seed: number): Promise<SetRandomSeedOutput>;
  getRandomSeed(): Promise<GetRandomSeedOutput>;
  clearGraph(): Promise<ClearGraphOutput>;
  repairGraphLinks(): Promise<RepairGraphLinksOutput>;
  runSimulationFor(wallMs: number, mode?: "dt" | "event", fastest?: boolean, includeBenchmark?: boolean, benchmarkWallMs?: number): Promise<RunSimulationForOutput>;
  getBottleneckReport(topN?: number, minSampleSec?: number): Promise<BottleneckReportOutput>;
  captureSnapshotPng(fileName?: string): Promise<SnapshotOutput>;
  exportGraphJson(pretty?: boolean): Promise<ExportGraphJsonOutput>;
  importGraphJson(graphJson: string): Promise<ImportGraphJsonOutput>;
  setSimulationTime(simTimeMs: number): Promise<SetSimulationTimeOutput>;
  getGraphOverview(includeNodes?: boolean, maxNodes?: number): Promise<GraphOverviewOutput>;
  exportEmbeddedHtml(fileName?: string): Promise<ExportEmbeddedHtmlOutput>;
  saveTimelineCsv(fileName?: string): Promise<SaveTimelineCsvOutput>;
  saveGraphJson(fileName?: string, pretty?: boolean): Promise<SaveGraphJsonOutput>;
  loadGraphJsonFile(filePath: string): Promise<LoadGraphJsonFileOutput>;
  runMatrixAndSaveReport(examples: string[], wallMs?: number, fileName?: string): Promise<SaveScenarioReportOutput>;
  validateGraphJson(graphJson: string): Promise<ValidateGraphJsonOutput>;
  saveKpiSummaryJson(fileName?: string, pretty?: boolean): Promise<SaveKpiSummaryOutput>;
  saveGraphOverviewJson(fileName?: string, includeNodes?: boolean, maxNodes?: number, pretty?: boolean): Promise<SaveGraphOverviewOutput>;
  listNodeTypes(): Promise<NodeTypesOutput>;
  describeNodeType(nodeType: string): Promise<NodeTypeDescriptionOutput>;
  buildGraphFromBlueprint(nodes: BlueprintNodeInput[], edges: BlueprintEdgeInput[], options?: BlueprintBuildOptions): Promise<BuildGraphFromBlueprintOutput>;
  optimizeLineByBottleneck(options?: OptimizeLineOptions): Promise<OptimizeLineByBottleneckOutput>;
  setTaktTargetAndObjective(taktSec: number, objectiveWeights?: Partial<ObjectiveWeights>): Promise<SetTaktTargetOutput>;
  validateLayoutRules(minDistance?: number, forbiddenAdjacency?: string[]): Promise<LayoutValidationOutput>;
  runDesignOfExperiments(paramGrid: DoeParamGridInput, wallMs?: number): Promise<DesignOfExperimentsOutput>;
  addNode(nodeType: string, title?: string, x?: number, y?: number, properties?: Record<string, unknown>): Promise<AddNodeOutput>;
  getNodePorts(nodeId: string | number): Promise<NodePortsOutput>;
  getNodePortsByKind(nodeId: string | number, portKind: PortKind): Promise<PortKindSlotsOutput>;
  connectNodesByPortKind(fromNodeId: string | number, toNodeId: string | number, portKind: PortKind, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput>;
  connectWorkPorts(fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput>;
  connectSignalPorts(fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput>;
  connectCarrierPorts(fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput>;
  connectPalletPorts(fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput>;
  updateNode(nodeId: string | number, title?: string, properties?: Record<string, unknown>, mergeProperties?: boolean): Promise<UpdateNodeOutput>;
  connectNodes(fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectNodesOutput>;
  disconnectNodes(options: {
    linkId?: number;
    fromNodeId?: string | number;
    toNodeId?: string | number;
    fromSlot?: number;
    toSlot?: number;
    removeAllMatches?: boolean;
  }): Promise<DisconnectNodesOutput>;
  removeNode(nodeId: string | number): Promise<RemoveNodeOutput>;
  evaluateCandidateGraph(graphJson: string, wallMs?: number, objective?: OptimizationObjective): Promise<CandidateEvaluationOutput>;
  rankCandidateGraphs(candidates: string[], wallMs?: number, objective?: OptimizationObjective, topK?: number): Promise<CandidateRankingOutput>;
  suggestTopologyImprovements(graphJson: string, maxSuggestions?: number): Promise<TopologyImprovementOutput>;
  close(): Promise<void>;
}

registerRuntimeMethodsGroup01(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup02(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup03(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup04(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup05(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup06(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup07(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup08(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup09(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup10(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup11(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup12(FactSimRuntime, { getMimeType, toErrorMessage });
registerRuntimeMethodsGroup13(FactSimRuntime, { getMimeType, toErrorMessage });
