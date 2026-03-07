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

export function registerRuntimeMethodsGroup02(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).runScenarioMatrix = async function (this: any, examples: string[], wallMs?: number): Promise<ScenarioMatrixOutput> {
      const normalizedExamples = examples.map((example) => String(example).trim()).filter((example) => example.length > 0);
      const uniqueExamples = [...new Set(normalizedExamples)];
      if (!uniqueExamples.length) {
        throw new Error("run_scenario_matrix requires at least one valid example name");
      }
  
      const scenarioRows: ScenarioMatrixItem[] = [];
      const sanitizedWallMs =
        typeof wallMs === "number" && Number.isFinite(wallMs) ? Math.max(100, Math.floor(wallMs)) : undefined;
  
      for (const example of uniqueExamples) {
        try {
          await this.stopSimulation();
        } catch (_error) {
          // Ignore stop failures when simulation is not active.
        }
  
        try {
          const load = await this.loadExample(example);
          const benchmark = await this.runBenchmark(sanitizedWallMs);
          scenarioRows.push({
            example,
            ok: true,
            nodeCount: load.nodeCount,
            benchmark,
            summary: this.summarizeBenchmark(benchmark)
          });
        } catch (error) {
          scenarioRows.push({
            example,
            ok: false,
            nodeCount: null,
            benchmark: null,
            summary: null,
            error: toErrorMessage(error)
          });
        }
      }
  
      const succeeded = scenarioRows.filter((row) => row.ok).length;
  
      return {
        requestedExamples: examples.length,
        executedExamples: uniqueExamples.length,
        wallMs: sanitizedWallMs ?? null,
        scenarios: scenarioRows,
        totals: {
          succeeded,
          failed: scenarioRows.length - succeeded
        }
      };
    };

  (FactSimRuntimeClass.prototype as any).listExamples = async function (this: any): Promise<ExampleListOutput> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const fallback = [
          "simple",
          "branch",
          "shuttle_line5",
          "carrier_config",
          "pallet_station_demo",
          "sample_line1"
        ];
  
        const select = document.getElementById("exampleSelect") as
          | { options?: ArrayLike<{ value?: unknown }> }
          | null;
        const fromSelect = select?.options
          ? Array.from(select.options)
              .map((opt) => String(opt?.value ?? "").trim())
              .filter((value) => value.length > 0)
          : [];
  
        const examples = [...new Set([...fromSelect, ...fallback])];
        return { examples };
      });
    };

  (FactSimRuntimeClass.prototype as any).setSimulationMode = async function (this: any, mode: string): Promise<SetSimulationModeOutput> {
      const page = await this.ensureReady();
      return page.evaluate((requestedMode: any) => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as
          | {
              setSimMode?: (mode: string) => string;
              getSimMode?: () => string;
              simMode?: string;
            }
          | undefined;
        if (!app || typeof app.setSimMode !== "function") {
          throw new Error("App.setSimMode is not available");
        }
  
        const target = String(requestedMode ?? "").trim();
        if (!target) {
          throw new Error("mode is required");
        }
  
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
        const stopSimulation = w.stopSimulation as undefined | (() => void);
        const startSimulation = w.startSimulation as undefined | (() => void);
  
        const running = typeof isSimRunning === "function" ? !!isSimRunning() : false;
        const canRestart = typeof stopSimulation === "function" && typeof startSimulation === "function";
        const restarted = running && canRestart;
  
        const previousMode = app.getSimMode?.() ?? app.simMode ?? null;
        if (restarted) {
          stopSimulation();
        }
  
        const nextMode = app.setSimMode(target);
  
        if (restarted) {
          startSimulation();
        }
  
        return {
          previousMode,
          mode: nextMode ?? app.getSimMode?.() ?? app.simMode ?? null,
          restarted
        };
      }, mode);
    };

  (FactSimRuntimeClass.prototype as any).setPlaybackSpeed = async function (this: any, speed?: number, fastest?: boolean): Promise<PlaybackSpeedOutput> {
      const page = await this.ensureReady();
      return page.evaluate(
        ({ requestedSpeed, requestedFastest }: { requestedSpeed: number | null; requestedFastest: boolean | null }) => {
          const w = window as unknown as Record<string, unknown>;
          const setSpeed = w.setSpeed as undefined | ((value: number) => void);
          const setFastestMode = w.setFastestMode as undefined | ((enabled: boolean) => void);
          const isFastestMode = w.isFastestMode as undefined | (() => boolean);
  
          const hasSpeed = typeof requestedSpeed === "number" && Number.isFinite(requestedSpeed);
          const hasFastest = typeof requestedFastest === "boolean";
          if (!hasSpeed && !hasFastest) {
            throw new Error("either speed or fastest must be provided");
          }
  
          if (hasSpeed) {
            if (typeof setSpeed !== "function") {
              throw new Error("setSpeed is not available");
            }
            setSpeed(Number(requestedSpeed));
          }
  
          if (hasFastest) {
            if (typeof setFastestMode !== "function") {
              throw new Error("setFastestMode is not available");
            }
            setFastestMode(Boolean(requestedFastest));
          }
  
          const fastestMode = typeof isFastestMode === "function" ? !!isFastestMode() : null;
          const speedEl = document.getElementById("speedFactor") as { textContent?: unknown } | null;
          const speedLabelRaw = speedEl?.textContent;
  
          return {
            fastestMode,
            speedLabel: typeof speedLabelRaw === "string" ? speedLabelRaw.trim() : null
          };
        },
        {
          requestedSpeed: typeof speed === "number" && Number.isFinite(speed) ? speed : null,
          requestedFastest: typeof fastest === "boolean" ? fastest : null
        }
      );
    };

  (FactSimRuntimeClass.prototype as any).resetSimulationClock = async function (this: any): Promise<ResetSimulationClockOutput> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
        const stopSimulation = w.stopSimulation as undefined | (() => void);
        const resetSimClock = w.resetSimClock as undefined | (() => void);
        const simNow = w.simNow as undefined | (() => number);
  
        if (typeof resetSimClock !== "function") {
          throw new Error("resetSimClock is not available");
        }
  
        if (typeof isSimRunning === "function" && isSimRunning() && typeof stopSimulation === "function") {
          stopSimulation();
        }
  
        resetSimClock();
  
        return {
          running: typeof isSimRunning === "function" ? !!isSimRunning() : false,
          simTimeMs: typeof simNow === "function" ? Number(simNow()) : null
        };
      });
    };

  (FactSimRuntimeClass.prototype as any).setRandomSeed = async function (this: any, seed: number): Promise<SetRandomSeedOutput> {
      const page = await this.ensureReady();
      return page.evaluate((requestedSeed: any) => {
        const w = window as unknown as Record<string, unknown>;
        const normalizedRaw = Number(requestedSeed);
        if (!Number.isFinite(normalizedRaw)) {
          throw new Error("seed must be a finite number");
        }
  
        const originalKey = "__factSimMcpOriginalRandom";
        const seedKey = "__factSimMcpRandomSeed";
        const stateKey = "__factSimMcpRandomState";
        const enabledKey = "__factSimMcpSeededRandomEnabled";
  
        let normalized = Math.floor(Math.abs(normalizedRaw));
        normalized %= 2147483647;
        if (normalized === 0) {
          normalized = 1;
        }
  
        if (typeof w[originalKey] !== "function") {
          w[originalKey] = Math.random.bind(Math);
        }
  
        w[seedKey] = normalized;
        w[stateKey] = normalized;
  
        (Math as unknown as { random: () => number }).random = (() => {
          const currentRaw = Number(w[stateKey]);
          let current = Number.isFinite(currentRaw) ? Math.floor(Math.abs(currentRaw)) : 1;
          current %= 2147483647;
          if (current === 0) {
            current = 1;
          }
  
          const next = (current * 16807) % 2147483647;
          w[stateKey] = next;
          return (next - 1) / 2147483646;
        }) as () => number;
  
        w[enabledKey] = true;
  
        return {
          seed: normalized,
          deterministicRandomEnabled: true
        };
      }, seed);
    };

  (FactSimRuntimeClass.prototype as any).getRandomSeed = async function (this: any): Promise<GetRandomSeedOutput> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const seedKey = "__factSimMcpRandomSeed";
        const stateKey = "__factSimMcpRandomState";
        const enabledKey = "__factSimMcpSeededRandomEnabled";
  
        const seedRaw = Number(w[seedKey]);
        const stateRaw = Number(w[stateKey]);
        const enabled = w[enabledKey] === true;
  
        return {
          seed: Number.isFinite(seedRaw) && seedRaw > 0 ? Math.floor(seedRaw) : null,
          currentState: Number.isFinite(stateRaw) && stateRaw > 0 ? Math.floor(stateRaw) : null,
          deterministicRandomEnabled: enabled
        };
      });
    };

  (FactSimRuntimeClass.prototype as any).clearGraph = async function (this: any): Promise<ClearGraphOutput> {
      const page = await this.ensureReady();
      return page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as
          | {
              graph?: {
                clear?: () => void;
                _nodes?: unknown[];
                links?: Record<string, unknown>;
              };
              canvas?: { draw?: (a?: boolean, b?: boolean) => void };
            }
          | undefined;
  
        const graph = app?.graph;
        if (!graph || typeof graph.clear !== "function") {
          throw new Error("App.graph.clear is not available");
        }
  
        const nodes = Array.isArray(graph._nodes) ? graph._nodes : [];
        const links = graph.links && typeof graph.links === "object" ? graph.links : {};
        const removedNodeCount = nodes.length;
        const removedLinkCount = Object.keys(links).length;
  
        const isSimRunning = w.isSimRunning as undefined | (() => boolean);
        const stopSimulation = w.stopSimulation as undefined | (() => void);
        const resetSimClock = w.resetSimClock as undefined | (() => void);
  
        if (typeof isSimRunning === "function" && isSimRunning() && typeof stopSimulation === "function") {
          stopSimulation();
        }
  
        graph.clear();
        if (typeof resetSimClock === "function") {
          resetSimClock();
        }
  
        if (app?.canvas && typeof app.canvas.draw === "function") {
          app.canvas.draw(true, true);
        }
  
        const afterNodes = Array.isArray(graph._nodes) ? graph._nodes.length : 0;
        const afterLinks = graph.links && typeof graph.links === "object" ? Object.keys(graph.links).length : 0;
  
        return {
          removedNodeCount,
          removedLinkCount,
          nodeCount: afterNodes,
          linkCount: afterLinks
        };
      });
    };
}


