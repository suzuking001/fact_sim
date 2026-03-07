export type LineOptimizationStep = {
  iteration: number;
  changedNodeIds: Array<string | number>;
  throughputPerHourTotal: number;
  totalCompleted: number;
  score: number;
  improved: boolean;
};

export type OptimizeLineByBottleneckOutput = {
  iterations: number;
  runWallMs: number;
  bottleneckTopN: number;
  baseline: {
    throughputPerHourTotal: number;
    totalCompleted: number;
    score: number;
  };
  bestIteration: number;
  best: {
    throughputPerHourTotal: number;
    totalCompleted: number;
    score: number;
  };
  history: LineOptimizationStep[];
  warnings: string[];
};

export type BlueprintBuildOptions = {
  clearExisting?: boolean;
  originX?: number;
  originY?: number;
  xPitch?: number;
  yPitch?: number;
};

export type OptimizeLineOptions = {
  iterations?: number;
  runWallMs?: number;
  bottleneckTopN?: number;
  minSampleSec?: number;
  maxNodesPerIteration?: number;
  processReductionRatio?: number;
  downReductionRatio?: number;
  minProcessTime?: number;
  minDownTime?: number;
};

export type ObjectiveWeights = {
  throughput: number;
  taktGap: number;
  cycleTime: number;
  nodeCount: number;
  linkCount: number;
  completion: number;
};

export type SetTaktTargetOutput = {
  taktSec: number;
  targetUnitsPerHour: number;
  objectiveWeights: ObjectiveWeights;
};

export type LayoutDistanceViolation = {
  nodeAId: string | number | null;
  nodeATitle: string;
  nodeBId: string | number | null;
  nodeBTitle: string;
  distance: number;
  minDistance: number;
};

export type ForbiddenAdjacencyViolation = {
  rule: string;
  fromNodeId: string | number | null;
  fromType: string | null;
  fromTitle: string;
  toNodeId: string | number | null;
  toType: string | null;
  toTitle: string;
};

export type LayoutValidationOutput = {
  minDistance: number;
  checkedPairs: number;
  linkCount: number;
  distanceViolationCount: number;
  forbiddenAdjacencyViolationCount: number;
  distanceViolations: LayoutDistanceViolation[];
  forbiddenAdjacencyViolations: ForbiddenAdjacencyViolation[];
  warnings: string[];
  ok: boolean;
};

export type DoeParameterInput = {
  key: string;
  values: number[];
  nodeTypeIncludes?: string[];
  titleIncludes?: string[];
  nodeIds?: Array<string | number>;
};

export type DoeParamGridInput = {
  parameters: DoeParameterInput[];
  topK?: number;
  maxExperiments?: number;
  mode?: "dt" | "event";
  fastest?: boolean;
  includeBenchmark?: boolean;
  benchmarkWallMs?: number;
  applyBest?: boolean;
};

export type DoeExperimentRow = {
  experiment: number;
  score: number;
  throughputPerHourTotal: number;
  totalCompleted: number;
  estimatedTaktSec: number | null;
  cycleTimeSec: number | null;
  nodeCount: number;
  linkCount: number;
  changedNodeCount: number;
  parameterValues: Record<string, number>;
};

export type DesignOfExperimentsOutput = {
  wallMs: number;
  requestedExperiments: number;
  executedExperiments: number;
  truncated: boolean;
  topK: number;
  objective: {
    taktSec: number | null;
    targetUnitsPerHour: number | null;
    objectiveWeights: ObjectiveWeights;
  };
  bestExperiment: number | null;
  bestScore: number | null;
  appliedBestExperiment: boolean;
  rankings: DoeExperimentRow[];
  warnings: string[];
};

export type SetRandomSeedOutput = {
  seed: number;
  deterministicRandomEnabled: boolean;
};

export type GetRandomSeedOutput = {
  seed: number | null;
  currentState: number | null;
  deterministicRandomEnabled: boolean;
};
