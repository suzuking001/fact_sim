export type BenchmarkOutput = {
  wallMs: number;
  realStepMs: number;
  results: Array<{
    mode: string;
    modeLabel: string;
    renderCase: string;
    renderLabel: string;
    wallMs: number;
    simMs: number;
    loops: number;
    simSec: number;
    speed: number;
  }>;
};

export type SimulationStatus = {
  running: boolean;
  mode: string | null;
  simTimeMs: number | null;
  fastestMode: boolean | null;
  graphStatus: number | null;
  nodeCount: number;
  linkCount: number;
};

export type SinkKpi = {
  id: string | number | null;
  title: string;
  type: string | null;
  completedCount: number;
  throughputPerHour: number;
  averageCycleTimeSec: number | null;
  recentSamples: number;
};

export type KpiSummary = {
  running: boolean;
  mode: string | null;
  simTimeMs: number | null;
  simHours: number;
  nodeCount: number;
  linkCount: number;
  sinkCount: number;
  totalCompleted: number;
  throughputPerHourTotal: number;
  throughputPerHourAverage: number;
  projectedThroughputPerHour: number | null;
  sinkKpis: SinkKpi[];
  nodeTypeCounts: Record<string, number>;
};

export type ScenarioBenchmarkSummary = {
  bestHeadlessMode: string | null;
  bestHeadlessSpeed: number | null;
  headlessDtSpeed: number | null;
  headlessEventSpeed: number | null;
  renderDtSpeed: number | null;
  renderEventSpeed: number | null;
};

export type ScenarioMatrixItem = {
  example: string;
  ok: boolean;
  nodeCount: number | null;
  benchmark: BenchmarkOutput | null;
  summary: ScenarioBenchmarkSummary | null;
  error?: string;
};

export type ScenarioMatrixOutput = {
  requestedExamples: number;
  executedExamples: number;
  wallMs: number | null;
  scenarios: ScenarioMatrixItem[];
  totals: {
    succeeded: number;
    failed: number;
  };
};

export type ExampleListOutput = {
  examples: string[];
};

export type SetSimulationModeOutput = {
  previousMode: string | null;
  mode: string | null;
  restarted: boolean;
};

export type PlaybackSpeedOutput = {
  fastestMode: boolean | null;
  speedLabel: string | null;
};

export type ResetSimulationClockOutput = {
  running: boolean;
  simTimeMs: number | null;
};

export type SnapshotOutput = {
  savedTo: string;
};

export type ExportGraphJsonOutput = {
  nodeCount: number;
  linkCount: number;
  json: string;
};

export type ImportGraphJsonOutput = {
  nodeCount: number;
  linkCount: number;
  running: boolean;
  simTimeMs: number | null;
};

export type SetSimulationTimeOutput = {
  running: boolean;
  simTimeMs: number | null;
};

export type GraphOverviewNode = {
  id: string | number | null;
  type: string | null;
  title: string;
  pos: [number, number] | null;
};

export type GraphOverviewOutput = {
  nodeCount: number;
  linkCount: number;
  nodeTypeCounts: Record<string, number>;
  nodes?: GraphOverviewNode[];
  truncated?: boolean;
};

export type ExportEmbeddedHtmlOutput = {
  savedTo: string;
  length: number;
};

export type SaveTimelineCsvOutput = {
  savedTo: string;
  lineCount: number;
};

export type SaveGraphJsonOutput = {
  savedTo: string;
  nodeCount: number;
  linkCount: number;
  bytes: number;
};

export type LoadGraphJsonFileOutput = {
  sourcePath: string;
  nodeCount: number;
  linkCount: number;
  running: boolean;
  simTimeMs: number | null;
};

export type SaveScenarioReportOutput = {
  savedTo: string;
  executedExamples: number;
  succeeded: number;
  failed: number;
  bytes: number;
};

export type ValidateGraphJsonOutput = {
  valid: boolean;
  nodeCount: number;
  linkCount: number;
  warnings: string[];
};

export type SaveKpiSummaryOutput = {
  savedTo: string;
  sinkCount: number;
  totalCompleted: number;
  bytes: number;
};

export type SaveGraphOverviewOutput = {
  savedTo: string;
  nodeCount: number;
  linkCount: number;
  includeNodes: boolean;
  bytes: number;
};

export type OptimizationObjective = "throughput" | "throughput_per_node" | "balanced";

export type CandidateEvaluationOutput = {
  objective: OptimizationObjective;
  wallMs: number | null;
  score: number;
  benchmarkSummary: ScenarioBenchmarkSummary;
  graph: {
    nodeCount: number;
    linkCount: number;
  };
  kpi: {
    throughputPerHourTotal: number;
    projectedThroughputPerHour: number | null;
    totalCompleted: number;
    sinkCount: number;
  };
  warnings: string[];
};

export type CandidateRankingItem = {
  index: number;
  ok: boolean;
  score: number | null;
  nodeCount: number | null;
  linkCount: number | null;
  throughputPerHourTotal: number | null;
  bestHeadlessSpeed: number | null;
  error?: string;
};

export type CandidateRankingOutput = {
  objective: OptimizationObjective;
  wallMs: number | null;
  requestedCandidates: number;
  evaluatedCandidates: number;
  succeeded: number;
  failed: number;
  rankings: CandidateRankingItem[];
};

export type TopologySuggestion = {
  severity: "info" | "warn";
  code: string;
  message: string;
};

export type TopologyImprovementOutput = {
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
  suggestions: TopologySuggestion[];
};

export type NodeTypesOutput = {
  count: number;
  types: string[];
};

export type AddNodeOutput = {
  nodeId: string | number | null;
  nodeType: string;
  title: string;
  pos: [number, number] | null;
  inputCount: number;
  outputCount: number;
  nodeCount: number;
  linkCount: number;
};

export type NodePortInfo = {
  slot: number;
  name: string;
  type: string | null;
  hasLink: boolean;
  linkCount: number;
};

export type NodePortsOutput = {
  nodeId: string | number;
  nodeType: string | null;
  title: string;
  inputCount: number;
  outputCount: number;
  inputs: NodePortInfo[];
  outputs: NodePortInfo[];
};

export type ConnectNodesOutput = {
  created: boolean;
  linkId: number;
  fromNodeId: string | number;
  toNodeId: string | number;
  fromSlot: number;
  toSlot: number;
  nodeCount: number;
  linkCount: number;
};

export type DisconnectNodesOutput = {
  removedCount: number;
  removedLinkIds: number[];
  nodeCount: number;
  linkCount: number;
};

export type RemoveNodeOutput = {
  removedNodeId: string | number;
  removedLinkCount: number;
  nodeCount: number;
  linkCount: number;
};

export type UpdateNodeOutput = {
  nodeId: string | number;
  nodeType: string | null;
  title: string;
  properties: Record<string, unknown>;
  updatedTitle: boolean;
  updatedPropertyKeys: string[];
  mergedProperties: boolean;
  nodeCount: number;
  linkCount: number;
};

export type PortKind = "work" | "signal" | "carrier" | "pallet";

export type PortKindSlot = {
  slot: number;
  name: string;
  type: string | null;
  hasLink: boolean;
  linkCount: number;
};

export type PortKindSlotsOutput = {
  nodeId: string | number;
  nodeType: string | null;
  title: string;
  portKind: PortKind;
  inputs: PortKindSlot[];
  outputs: PortKindSlot[];
};

export type ConnectByPortKindOutput = {
  created: boolean;
  linkId: number;
  fromNodeId: string | number;
  toNodeId: string | number;
  fromSlot: number;
  toSlot: number;
  nodeCount: number;
  linkCount: number;
  portKind: PortKind;
  fromCandidates: number;
  toCandidates: number;
};

export type ClearGraphOutput = {
  removedNodeCount: number;
  removedLinkCount: number;
  nodeCount: number;
  linkCount: number;
};

export type RepairGraphLinksOutput = {
  nodeCount: number;
  linkCount: number;
  repairedInputCount: number;
  repairedOutputCount: number;
  droppedDanglingLinks: number;
  droppedInvalidSlotLinks: number;
  droppedDuplicateInputLinks: number;
  warnings: string[];
};

export type RunSimulationForOutput = {
  wallMs: number;
  running: boolean;
  mode: string | null;
  fastestMode: boolean | null;
  startSimTimeMs: number | null;
  simTimeMs: number | null;
  advancedSimMs: number | null;
  kpi: KpiSummary;
  benchmarkSummary: ScenarioBenchmarkSummary | null;
};

export type BottleneckNodeReport = {
  nodeId: string | number | null;
  title: string;
  type: string | null;
  totalDurationSec: number;
  processSec: number;
  waitSec: number;
  downSec: number;
  idleSec: number;
  processRatio: number;
  waitRatio: number;
  downRatio: number;
  idleRatio: number;
  bottleneckScore: number;
};

export type BottleneckReportOutput = {
  lineCount: number;
  nodeCount: number;
  totalObservedSec: number;
  topN: number;
  rows: BottleneckNodeReport[];
};

export type NodeTypeDescriptionOutput = {
  nodeType: string;
  title: string;
  inputCount: number;
  outputCount: number;
  inputs: NodePortInfo[];
  outputs: NodePortInfo[];
  defaultProperties: Record<string, unknown>;
};

export type BlueprintNodeInput = {
  key: string;
  nodeType: string;
  title?: string;
  x?: number;
  y?: number;
  lane?: number;
  properties?: Record<string, unknown>;
};

export type BlueprintEdgeInput = {
  fromKey: string;
  toKey: string;
  portKind?: PortKind;
  fromSlot?: number;
  toSlot?: number;
  allowDuplicate?: boolean;
};

export type BuildGraphFromBlueprintOutput = {
  createdNodes: Array<{
    key: string;
    nodeId: string | number | null;
    nodeType: string;
    title: string;
    pos: [number, number] | null;
  }>;
  createdLinks: Array<{
    fromKey: string;
    toKey: string;
    created: boolean;
    linkId: number;
    portKind: PortKind | null;
    fromSlot: number;
    toSlot: number;
  }>;
  nodeCount: number;
  linkCount: number;
};

export type {
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
} from "./runtime-advanced-types.js";
