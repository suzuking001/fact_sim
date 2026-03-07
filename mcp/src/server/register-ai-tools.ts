import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import { FactSimRuntime } from "../fact-sim-runtime.js";
import { errorMessage, failure, log, success } from "./tool-helpers.js";

const nodeIdSchema = z.union([z.string().min(1), z.number()]);
const portKindSchema = z.enum(["work", "signal", "carrier", "pallet"]);
const jsonRecordSchema = z.record(z.string(), z.unknown());
const unknownArraySchema = z.array(z.record(z.string(), z.unknown()));

function summarizeStatus(result: Awaited<ReturnType<FactSimRuntime["getSimulationStatus"]>>) {
  return {
    running: result.running,
    mode: result.mode,
    simTimeMs: result.simTimeMs,
    fastestMode: result.fastestMode,
    nodeCount: result.nodeCount,
    linkCount: result.linkCount
  };
}

function summarizeOverview(result: Awaited<ReturnType<FactSimRuntime["getGraphOverview"]>>) {
  return {
    nodeCount: result.nodeCount,
    linkCount: result.linkCount,
    nodeTypeCounts: result.nodeTypeCounts,
    nodes: result.nodes ?? [],
    truncated: !!result.truncated
  };
}

function summarizeKpi(result: Awaited<ReturnType<FactSimRuntime["getKpiSummary"]>>) {
  return {
    running: result.running,
    mode: result.mode,
    simTimeMs: result.simTimeMs,
    simHours: result.simHours,
    nodeCount: result.nodeCount,
    linkCount: result.linkCount,
    sinkCount: result.sinkCount,
    totalCompleted: result.totalCompleted,
    throughputPerHourTotal: result.throughputPerHourTotal,
    throughputPerHourAverage: result.throughputPerHourAverage,
    projectedThroughputPerHour: result.projectedThroughputPerHour,
    sinks: result.sinkKpis.map((sink) => ({
      id: sink.id,
      title: sink.title,
      completedCount: sink.completedCount,
      throughputPerHour: sink.throughputPerHour,
      averageCycleTimeSec: sink.averageCycleTimeSec
    }))
  };
}

function summarizeBenchmark(result: Awaited<ReturnType<FactSimRuntime["runBenchmark"]>>) {
  return {
    wallMs: result.wallMs,
    realStepMs: result.realStepMs,
    results: result.results.map((row) => ({
      mode: row.mode,
      renderCase: row.renderCase,
      speed: Number(row.speed.toFixed(3)),
      simSec: Number(row.simSec.toFixed(3)),
      wallMs: row.wallMs
    }))
  };
}

function summarizePorts(result: Awaited<ReturnType<FactSimRuntime["getNodePorts"]>>) {
  return {
    nodeId: result.nodeId,
    nodeType: result.nodeType,
    title: result.title,
    inputs: result.inputs.map((port) => ({
      slot: port.slot,
      name: port.name,
      type: port.type,
      hasLink: port.hasLink,
      linkCount: port.linkCount
    })),
    outputs: result.outputs.map((port) => ({
      slot: port.slot,
      name: port.name,
      type: port.type,
      hasLink: port.hasLink,
      linkCount: port.linkCount
    }))
  };
}

function summarizePortKind(result: Awaited<ReturnType<FactSimRuntime["getNodePortsByKind"]>>) {
  return {
    nodeId: result.nodeId,
    nodeType: result.nodeType,
    title: result.title,
    portKind: result.portKind,
    inputs: result.inputs,
    outputs: result.outputs
  };
}

function summarizeRun(result: Awaited<ReturnType<FactSimRuntime["runSimulationFor"]>>) {
  return {
    wallMs: result.wallMs,
    running: result.running,
    mode: result.mode,
    fastestMode: result.fastestMode,
    startSimTimeMs: result.startSimTimeMs,
    simTimeMs: result.simTimeMs,
    advancedSimMs: result.advancedSimMs,
    totalCompleted: result.kpi.totalCompleted,
    throughputPerHourTotal: result.kpi.throughputPerHourTotal,
    sinkCount: result.kpi.sinkCount,
    benchmarkSummary: result.benchmarkSummary
  };
}

function summarizeBottlenecks(result: Awaited<ReturnType<FactSimRuntime["getBottleneckReport"]>>) {
  return {
    lineCount: result.lineCount,
    nodeCount: result.nodeCount,
    totalObservedSec: result.totalObservedSec,
    topN: result.topN,
    rows: result.rows.map((row) => ({
      nodeId: row.nodeId,
      title: row.title,
      type: row.type,
      bottleneckScore: Number(row.bottleneckScore.toFixed(4)),
      processRatio: Number(row.processRatio.toFixed(4)),
      waitRatio: Number(row.waitRatio.toFixed(4)),
      downRatio: Number(row.downRatio.toFixed(4)),
      idleRatio: Number(row.idleRatio.toFixed(4))
    }))
  };
}

async function collectRunReport(
  runtime: FactSimRuntime,
  options: {
    example?: string;
    wallMs: number;
    mode?: "dt" | "event";
    speed?: number;
    fastest?: boolean;
    seed?: number;
    reset?: boolean;
    topN?: number;
    minSampleSec?: number;
    includeNodes?: boolean;
    maxNodes?: number;
  }
) {
  const {
    example,
    wallMs,
    mode,
    speed,
    fastest,
    seed,
    reset,
    topN,
    minSampleSec,
    includeNodes,
    maxNodes
  } = options;

  let loadedExample: { example: string; nodeCount: number } | null = null;
  if (example) {
    loadedExample = await runtime.loadExample(example);
  }
  if (reset) {
    await runtime.resetSimulationClock();
  }
  if (typeof seed === "number") {
    await runtime.setRandomSeed(seed);
  }
  if (mode) {
    await runtime.setSimulationMode(mode);
  }
  if (typeof speed === "number" || typeof fastest === "boolean") {
    await runtime.setPlaybackSpeed(speed, fastest);
  }

  const run = await runtime.runSimulationFor(wallMs, mode, fastest, false, undefined);
  const bottlenecks = await runtime.getBottleneckReport(topN, minSampleSec);
  const overview = await runtime.getGraphOverview(includeNodes, maxNodes);

  return {
    example: loadedExample?.example ?? null,
    loadedNodeCount: loadedExample?.nodeCount ?? null,
    run: summarizeRun(run),
    kpi: summarizeKpi(run.kpi),
    bottlenecks: summarizeBottlenecks(bottlenecks),
    overview: summarizeOverview(overview)
  };
}

async function invokeTool<T>(
  requestId: string,
  toolName: string,
  details: unknown,
  runner: () => Promise<T>
) {
  log("INFO", `${toolName} called`, requestId, details);
  try {
    const result = await runner();
    log("INFO", `${toolName} completed`, requestId);
    return success(result);
  } catch (error) {
    const msg = errorMessage(error);
    log("ERROR", `${toolName} failed`, requestId, msg);
    return failure(msg);
  }
}

export function registerAiTools(server: McpServer, runtime: FactSimRuntime): void {
  server.registerTool(
    "prepare_session",
    {
      description: "One-shot session setup for example, mode, speed, fastest, seed, and optional reset.",
      inputSchema: {
        example: z.string().min(1).optional(),
        mode: z.enum(["dt", "event"]).optional(),
        speed: z.number().positive().optional(),
        fastest: z.boolean().optional(),
        seed: z.number().int().optional(),
        reset: z.boolean().optional()
      }
    },
    async ({ example, mode, speed, fastest, seed, reset }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(
        requestId,
        "prepare_session",
        {
          example: example ?? null,
          mode: mode ?? null,
          speed: speed ?? null,
          fastest: typeof fastest === "boolean" ? fastest : null,
          seed: typeof seed === "number" ? seed : null,
          reset: !!reset
        },
        async () => {
          let loaded: { example: string; nodeCount: number } | null = null;
          if (example) {
            loaded = await runtime.loadExample(example);
          }
          if (reset) {
            await runtime.resetSimulationClock();
          }
          if (typeof seed === "number") {
            await runtime.setRandomSeed(seed);
          }
          const modeResult = mode ? await runtime.setSimulationMode(mode) : null;
          const speedResult =
            typeof speed === "number" || typeof fastest === "boolean"
              ? await runtime.setPlaybackSpeed(speed, fastest)
              : null;
          const status = await runtime.getSimulationStatus();
          return {
            loaded,
            modeResult,
            speedResult,
            status: summarizeStatus(status)
          };
        }
      );
    }
  );

  server.registerTool(
    "examples",
    {
      description: "List built-in examples or load one example.",
      inputSchema: {
        action: z.enum(["list", "load"]),
        name: z.string().min(1).optional()
      }
    },
    async ({ action, name }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "examples", { action, name: name ?? null }, async () => {
        if (action === "list") {
          return runtime.listExamples();
        }

        if (!name) {
          throw new Error("name is required when action=load");
        }

        const loaded = await runtime.loadExample(name);
        const overview = await runtime.getGraphOverview(false, 0);
        return {
          action,
          example: loaded.example,
          nodeCount: loaded.nodeCount,
          linkCount: overview.linkCount
        };
      });
    }
  );

  server.registerTool(
    "simulate",
    {
      description: "Control simulation, mode, time, speed, and random seed.",
      inputSchema: {
        action: z.enum([
          "status",
          "start",
          "stop",
          "run_for",
          "set_mode",
          "set_speed",
          "reset",
          "set_time",
          "set_seed",
          "get_seed"
        ]),
        mode: z.enum(["dt", "event"]).optional(),
        wallMs: z.number().int().positive().optional(),
        speed: z.number().positive().optional(),
        fastest: z.boolean().optional(),
        simTimeMs: z.number().nonnegative().optional(),
        seed: z.number().int().optional(),
        includeBenchmark: z.boolean().optional(),
        benchmarkWallMs: z.number().int().positive().optional()
      }
    },
    async ({ action, mode, wallMs, speed, fastest, simTimeMs, seed, includeBenchmark, benchmarkWallMs }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(
        requestId,
        "simulate",
        {
          action,
          mode: mode ?? null,
          wallMs: wallMs ?? null,
          speed: speed ?? null,
          fastest: typeof fastest === "boolean" ? fastest : null,
          simTimeMs: simTimeMs ?? null,
          seed: typeof seed === "number" ? seed : null
        },
        async () => {
          switch (action) {
            case "status":
              return summarizeStatus(await runtime.getSimulationStatus());
            case "start":
              return runtime.startSimulation();
            case "stop":
              return runtime.stopSimulation();
            case "run_for":
              if (typeof wallMs !== "number") {
                throw new Error("wallMs is required when action=run_for");
              }
              return summarizeRun(
                await runtime.runSimulationFor(
                  wallMs,
                  mode,
                  fastest,
                  includeBenchmark,
                  benchmarkWallMs
                )
              );
            case "set_mode":
              if (!mode) {
                throw new Error("mode is required when action=set_mode");
              }
              return runtime.setSimulationMode(mode);
            case "set_speed":
              return runtime.setPlaybackSpeed(speed, fastest);
            case "reset":
              return runtime.resetSimulationClock();
            case "set_time":
              if (typeof simTimeMs !== "number") {
                throw new Error("simTimeMs is required when action=set_time");
              }
              return runtime.setSimulationTime(simTimeMs);
            case "set_seed":
              if (typeof seed !== "number") {
                throw new Error("seed is required when action=set_seed");
              }
              return runtime.setRandomSeed(seed);
            case "get_seed":
              return runtime.getRandomSeed();
            default:
              throw new Error(`Unsupported action: ${String(action)}`);
          }
        }
      );
    }
  );

  server.registerTool(
    "run_report",
    {
      description: "Load optional example, run simulation for a fixed wall time, and return compact KPI + bottleneck + overview summary.",
      inputSchema: {
        example: z.string().min(1).optional(),
        wallMs: z.number().int().positive(),
        mode: z.enum(["dt", "event"]).optional(),
        speed: z.number().positive().optional(),
        fastest: z.boolean().optional(),
        seed: z.number().int().optional(),
        reset: z.boolean().optional(),
        topN: z.number().int().positive().optional(),
        minSampleSec: z.number().positive().optional(),
        includeNodes: z.boolean().optional(),
        maxNodes: z.number().int().nonnegative().optional()
      }
    },
    async ({ example, wallMs, mode, speed, fastest, seed, reset, topN, minSampleSec, includeNodes, maxNodes }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(
        requestId,
        "run_report",
        {
          example: example ?? null,
          wallMs,
          mode: mode ?? null
        },
        async () =>
          collectRunReport(runtime, {
            example,
            wallMs,
            mode,
            speed,
            fastest,
            seed,
            reset,
            topN,
            minSampleSec,
            includeNodes,
            maxNodes
          })
      );
    }
  );

  server.registerTool(
    "build_blueprint_report",
    {
      description: "Build graph from a blueprint, then run and return compact KPI + bottleneck + overview summary.",
      inputSchema: {
        nodes: unknownArraySchema,
        edges: unknownArraySchema.optional(),
        clearExisting: z.boolean().optional(),
        originX: z.number().optional(),
        originY: z.number().optional(),
        xPitch: z.number().positive().optional(),
        yPitch: z.number().positive().optional(),
        wallMs: z.number().int().positive(),
        mode: z.enum(["dt", "event"]).optional(),
        speed: z.number().positive().optional(),
        fastest: z.boolean().optional(),
        seed: z.number().int().optional(),
        reset: z.boolean().optional(),
        topN: z.number().int().positive().optional(),
        minSampleSec: z.number().positive().optional(),
        includeNodes: z.boolean().optional(),
        maxNodes: z.number().int().nonnegative().optional()
      }
    },
    async ({ nodes, edges, clearExisting, originX, originY, xPitch, yPitch, wallMs, mode, speed, fastest, seed, reset, topN, minSampleSec, includeNodes, maxNodes }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(
        requestId,
        "build_blueprint_report",
        {
          nodeCount: nodes.length,
          edgeCount: Array.isArray(edges) ? edges.length : 0,
          wallMs,
          mode: mode ?? null
        },
        async () => {
          const build = await runtime.buildGraphFromBlueprint(
            nodes as any,
            (edges ?? []) as any,
            {
              clearExisting,
              originX,
              originY,
              xPitch,
              yPitch
            }
          );
          const report = await collectRunReport(runtime, {
            wallMs,
            mode,
            speed,
            fastest,
            seed,
            reset,
            topN,
            minSampleSec,
            includeNodes,
            maxNodes
          });
          return {
            build: {
              createdNodeCount: build.createdNodes.length,
              createdLinkCount: build.createdLinks.length,
              nodeCount: build.nodeCount,
              linkCount: build.linkCount
            },
            ...report
          };
        }
      );
    }
  );

  server.registerTool(
    "graph",
    {
      description: "Inspect, import/export, save, or repair the current graph.",
      inputSchema: {
        action: z.enum([
          "overview",
          "export_json",
          "import_json",
          "load_json_file",
          "save_json",
          "share_url",
          "export_html",
          "snapshot",
          "clear",
          "repair",
          "node_types",
          "describe_node_type",
          "node_ports",
          "ports_by_kind",
          "validate_json"
        ]),
        graphJson: z.string().min(2).optional(),
        filePath: z.string().min(1).optional(),
        fileName: z.string().min(1).optional(),
        pretty: z.boolean().optional(),
        returnJson: z.boolean().optional(),
        includeNodes: z.boolean().optional(),
        maxNodes: z.number().int().nonnegative().optional(),
        nodeType: z.string().min(1).optional(),
        nodeId: nodeIdSchema.optional(),
        portKind: portKindSchema.optional()
      }
    },
    async ({ action, graphJson, filePath, fileName, pretty, returnJson, includeNodes, maxNodes, nodeType, nodeId, portKind }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "graph", { action }, async () => {
        switch (action) {
          case "overview":
            return summarizeOverview(await runtime.getGraphOverview(includeNodes, maxNodes));
          case "export_json": {
            const result = await runtime.exportGraphJson(pretty);
            if (returnJson) {
              return result;
            }
            return {
              nodeCount: result.nodeCount,
              linkCount: result.linkCount,
              bytes: result.json.length
            };
          }
          case "import_json":
            if (!graphJson) {
              throw new Error("graphJson is required when action=import_json");
            }
            return runtime.importGraphJson(graphJson);
          case "load_json_file":
            if (!filePath) {
              throw new Error("filePath is required when action=load_json_file");
            }
            return runtime.loadGraphJsonFile(filePath);
          case "save_json":
            return runtime.saveGraphJson(fileName, pretty);
          case "share_url":
            return runtime.buildShareUrl();
          case "export_html":
            return runtime.exportEmbeddedHtml(fileName);
          case "snapshot":
            return runtime.captureSnapshotPng(fileName);
          case "clear":
            return runtime.clearGraph();
          case "repair":
            return runtime.repairGraphLinks();
          case "node_types":
            return runtime.listNodeTypes();
          case "describe_node_type":
            if (!nodeType) {
              throw new Error("nodeType is required when action=describe_node_type");
            }
            return runtime.describeNodeType(nodeType);
          case "node_ports":
            if (typeof nodeId === "undefined") {
              throw new Error("nodeId is required when action=node_ports");
            }
            return summarizePorts(await runtime.getNodePorts(nodeId));
          case "ports_by_kind":
            if (typeof nodeId === "undefined") {
              throw new Error("nodeId is required when action=ports_by_kind");
            }
            if (!portKind) {
              throw new Error("portKind is required when action=ports_by_kind");
            }
            return summarizePortKind(await runtime.getNodePortsByKind(nodeId, portKind));
          case "validate_json":
            if (!graphJson) {
              throw new Error("graphJson is required when action=validate_json");
            }
            return runtime.validateGraphJson(graphJson);
          default:
            throw new Error(`Unsupported action: ${String(action)}`);
        }
      });
    }
  );

  server.registerTool(
    "edit_graph",
    {
      description: "Add, update, remove, connect, disconnect, or build nodes and links.",
      inputSchema: {
        action: z.enum(["add", "update", "remove", "connect", "disconnect", "build"]),
        nodeType: z.string().min(1).optional(),
        title: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        properties: jsonRecordSchema.optional(),
        mergeProperties: z.boolean().optional(),
        nodeId: nodeIdSchema.optional(),
        fromNodeId: nodeIdSchema.optional(),
        toNodeId: nodeIdSchema.optional(),
        fromSlot: z.number().int().nonnegative().optional(),
        toSlot: z.number().int().nonnegative().optional(),
        portKind: portKindSchema.optional(),
        allowDuplicate: z.boolean().optional(),
        linkId: z.number().int().positive().optional(),
        removeAllMatches: z.boolean().optional(),
        nodes: unknownArraySchema.optional(),
        edges: unknownArraySchema.optional(),
        clearExisting: z.boolean().optional(),
        originX: z.number().optional(),
        originY: z.number().optional(),
        xPitch: z.number().positive().optional(),
        yPitch: z.number().positive().optional()
      }
    },
    async ({ action, nodeType, title, x, y, properties, mergeProperties, nodeId, fromNodeId, toNodeId, fromSlot, toSlot, portKind, allowDuplicate, linkId, removeAllMatches, nodes, edges, clearExisting, originX, originY, xPitch, yPitch }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "edit_graph", { action }, async () => {
        switch (action) {
          case "add":
            if (!nodeType) {
              throw new Error("nodeType is required when action=add");
            }
            return runtime.addNode(nodeType, title, x, y, properties);
          case "update":
            if (typeof nodeId === "undefined") {
              throw new Error("nodeId is required when action=update");
            }
            return runtime.updateNode(nodeId, title, properties, mergeProperties);
          case "remove":
            if (typeof nodeId === "undefined") {
              throw new Error("nodeId is required when action=remove");
            }
            return runtime.removeNode(nodeId);
          case "connect":
            if (typeof fromNodeId === "undefined" || typeof toNodeId === "undefined") {
              throw new Error("fromNodeId and toNodeId are required when action=connect");
            }
            if (portKind) {
              return runtime.connectNodesByPortKind(fromNodeId, toNodeId, portKind, fromSlot, toSlot, allowDuplicate);
            }
            return runtime.connectNodes(fromNodeId, toNodeId, fromSlot, toSlot, allowDuplicate);
          case "disconnect":
            return runtime.disconnectNodes({
              linkId,
              fromNodeId,
              toNodeId,
              fromSlot,
              toSlot,
              removeAllMatches
            });
          case "build":
            if (!nodes || nodes.length === 0) {
              throw new Error("nodes is required when action=build");
            }
            return runtime.buildGraphFromBlueprint(
              nodes as any,
              (edges ?? []) as any,
              {
                clearExisting,
                originX,
                originY,
                xPitch,
                yPitch
              }
            );
          default:
            throw new Error(`Unsupported action: ${String(action)}`);
        }
      });
    }
  );

  server.registerTool(
    "metrics",
    {
      description: "Get KPI, bottlenecks, benchmark, or save timeline CSV.",
      inputSchema: {
        action: z.enum(["kpi", "bottlenecks", "benchmark", "save_timeline_csv"]),
        wallMs: z.number().int().positive().optional(),
        topN: z.number().int().positive().optional(),
        minSampleSec: z.number().positive().optional(),
        fileName: z.string().min(1).optional()
      }
    },
    async ({ action, wallMs, topN, minSampleSec, fileName }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "metrics", { action }, async () => {
        switch (action) {
          case "kpi":
            return summarizeKpi(await runtime.getKpiSummary());
          case "bottlenecks":
            return summarizeBottlenecks(await runtime.getBottleneckReport(topN, minSampleSec));
          case "benchmark":
            return summarizeBenchmark(await runtime.runBenchmark(wallMs));
          case "save_timeline_csv":
            return runtime.saveTimelineCsv(fileName);
          default:
            throw new Error(`Unsupported action: ${String(action)}`);
        }
      });
    }
  );

  server.registerTool(
    "optimize",
    {
      description: "Run topology suggestions, scoring, DOE, layout validation, or bottleneck optimization.",
      inputSchema: {
        action: z.enum([
          "set_objective",
          "evaluate_candidate",
          "rank_candidates",
          "suggest_topology",
          "optimize_bottleneck",
          "validate_layout",
          "doe"
        ]),
        taktSec: z.number().positive().optional(),
        objectiveWeights: jsonRecordSchema.optional(),
        graphJson: z.string().min(2).optional(),
        candidates: z.array(z.string().min(2)).optional(),
        wallMs: z.number().int().positive().optional(),
        objective: z.enum(["throughput", "throughput_per_node", "balanced"]).optional(),
        topK: z.number().int().positive().optional(),
        maxSuggestions: z.number().int().positive().optional(),
        iterations: z.number().int().positive().optional(),
        runWallMs: z.number().int().positive().optional(),
        bottleneckTopN: z.number().int().positive().optional(),
        minSampleSec: z.number().positive().optional(),
        maxNodesPerIteration: z.number().int().positive().optional(),
        processReductionRatio: z.number().positive().optional(),
        downReductionRatio: z.number().positive().optional(),
        minProcessTime: z.number().nonnegative().optional(),
        minDownTime: z.number().nonnegative().optional(),
        minDistance: z.number().nonnegative().optional(),
        forbiddenAdjacency: z.array(z.string().min(1)).optional(),
        paramGrid: jsonRecordSchema.optional()
      }
    },
    async ({ action, taktSec, objectiveWeights, graphJson, candidates, wallMs, objective, topK, maxSuggestions, iterations, runWallMs, bottleneckTopN, minSampleSec, maxNodesPerIteration, processReductionRatio, downReductionRatio, minProcessTime, minDownTime, minDistance, forbiddenAdjacency, paramGrid }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "optimize", { action }, async () => {
        switch (action) {
          case "set_objective":
            if (typeof taktSec !== "number") {
              throw new Error("taktSec is required when action=set_objective");
            }
            return runtime.setTaktTargetAndObjective(taktSec, objectiveWeights as any);
          case "evaluate_candidate":
            if (!graphJson) {
              throw new Error("graphJson is required when action=evaluate_candidate");
            }
            return runtime.evaluateCandidateGraph(graphJson, wallMs, objective);
          case "rank_candidates":
            if (!candidates || candidates.length === 0) {
              throw new Error("candidates is required when action=rank_candidates");
            }
            return runtime.rankCandidateGraphs(candidates, wallMs, objective, topK);
          case "suggest_topology":
            if (!graphJson) {
              throw new Error("graphJson is required when action=suggest_topology");
            }
            return runtime.suggestTopologyImprovements(graphJson, maxSuggestions);
          case "optimize_bottleneck":
            return runtime.optimizeLineByBottleneck({
              iterations,
              runWallMs,
              bottleneckTopN,
              minSampleSec,
              maxNodesPerIteration,
              processReductionRatio,
              downReductionRatio,
              minProcessTime,
              minDownTime
            });
          case "validate_layout":
            return runtime.validateLayoutRules(minDistance, forbiddenAdjacency);
          case "doe":
            if (!paramGrid) {
              throw new Error("paramGrid is required when action=doe");
            }
            return runtime.runDesignOfExperiments(paramGrid as any, wallMs);
          default:
            throw new Error(`Unsupported action: ${String(action)}`);
        }
      });
    }
  );
}
