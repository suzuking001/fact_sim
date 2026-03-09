import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import { FactSimRuntime } from "../fact-sim-runtime.js";
import { errorMessage, failure, log, success } from "./tool-helpers.js";

const nodeIdSchema = z.union([z.string().min(1), z.number()]);
const portKindSchema = z.enum(["work", "signal", "carrier", "pallet"]);
const jsonRecordSchema = z.record(z.string(), z.unknown());
const unknownArraySchema = z.array(z.record(z.string(), z.unknown()));
type BatchRefs = Map<string, string | number>;

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

function summarizeEngineTest(result: Awaited<ReturnType<FactSimRuntime["runEngineTests"]>> | Awaited<ReturnType<FactSimRuntime["getLatestEngineTestReport"]>>) {
  if (!result) {
    return { report: null };
  }
  return {
    ok: result.ok,
    status: result.status,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    engines: result.engines,
    summary: result.summary,
    comparisons: result.comparisons,
    results: result.results.map((row) => ({
      engine: row.engine,
      scenario: row.scenario,
      sourceKind: row.sourceKind,
      status: row.status,
      simTimeMs: Number(row.metrics.simTimeMs.toFixed(3)),
      wallMs: Number(row.metrics.wallMs.toFixed(3)),
      loops: row.metrics.loops,
      totalCompleted: row.metrics.totalCompleted,
      sinkCount: row.metrics.sinkCount,
      failureCount: row.failures.length,
      warningCount: row.warnings.length
    })),
    issues: [...result.failures, ...result.warnings].map((entry) => ({
      severity: entry.severity,
      code: entry.code,
      engine: entry.engine ?? null,
      scenario: entry.scenario ?? null,
      path: entry.path ?? null,
      nodeId: typeof entry.nodeId === "undefined" ? null : entry.nodeId,
      message: entry.message
    })),
    mcpHint: result.mcpHint ?? null
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
    wallMs?: number;
    mode?: "dt" | "event" | "event-fast";
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
  const effectiveWallMs = typeof wallMs === "number" ? wallMs : 1000;
  const effectiveTopN = typeof topN === "number" ? topN : 5;
  const effectiveReset = typeof reset === "boolean" ? reset : !!example;
  const effectiveIncludeNodes = !!includeNodes;
  const effectiveMaxNodes = effectiveIncludeNodes ? (typeof maxNodes === "number" ? maxNodes : 12) : 0;

  let loadedExample: { example: string; nodeCount: number } | null = null;
  if (example) {
    loadedExample = await runtime.loadExample(example);
  }
  if (effectiveReset) {
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

  const run = await runtime.runSimulationFor(effectiveWallMs, mode, fastest, false, undefined);
  const bottlenecks = await runtime.getBottleneckReport(effectiveTopN, minSampleSec);
  const overview = await runtime.getGraphOverview(effectiveIncludeNodes, effectiveMaxNodes);

  return {
    example: loadedExample?.example ?? null,
    loadedNodeCount: loadedExample?.nodeCount ?? null,
    run: summarizeRun(run),
    kpi: summarizeKpi(run.kpi),
    bottlenecks: summarizeBottlenecks(bottlenecks),
    overview: summarizeOverview(overview)
  };
}

function resolveBatchNodeId(value: unknown, refs: BatchRefs): string | number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  if (!value.startsWith("$")) {
    return value;
  }
  const refName = value.slice(1).trim();
  if (!refName) {
    throw new Error("Invalid empty batch node reference");
  }
  if (!refs.has(refName)) {
    throw new Error(`Unknown batch node reference: ${value}`);
  }
  return refs.get(refName);
}

function storeBatchRef(refs: BatchRefs, refName: string | undefined, result: unknown): void {
  if (!refName) {
    return;
  }
  if (!result || typeof result !== "object") {
    return;
  }
  const raw = result as Record<string, unknown>;
  const nodeId = raw.nodeId ?? raw.removedNodeId ?? null;
  if (typeof nodeId === "string" || typeof nodeId === "number") {
    refs.set(refName, nodeId);
    return;
  }
  if (Array.isArray(raw.createdNodes)) {
    for (const entry of raw.createdNodes) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const node = entry as Record<string, unknown>;
      const key = typeof node.key === "string" ? node.key.trim() : "";
      const createdId = node.nodeId;
      if (!key || (typeof createdId !== "string" && typeof createdId !== "number")) {
        continue;
      }
      refs.set(key, createdId);
    }
  }
}

async function applyEditOperation(
  runtime: FactSimRuntime,
  refs: BatchRefs,
  operation: {
    action: string;
    ref?: string;
    nodeType?: string;
    title?: string;
    x?: number;
    y?: number;
    properties?: Record<string, unknown>;
    mergeProperties?: boolean;
    nodeId?: string | number;
    fromNodeId?: string | number;
    toNodeId?: string | number;
    fromSlot?: number;
    toSlot?: number;
    portKind?: "work" | "signal" | "carrier" | "pallet";
    allowDuplicate?: boolean;
    linkId?: number;
    removeAllMatches?: boolean;
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
    clearExisting?: boolean;
    originX?: number;
    originY?: number;
    xPitch?: number;
    yPitch?: number;
  }
) {
  const {
    action,
    nodeType,
    title,
    x,
    y,
    properties,
    mergeProperties,
    nodeId,
    fromNodeId,
    toNodeId,
    fromSlot,
    toSlot,
    portKind,
    allowDuplicate,
    linkId,
    removeAllMatches,
    nodes,
    edges,
    clearExisting,
    originX,
    originY,
    xPitch,
    yPitch
  } = operation;

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
      return runtime.updateNode(resolveBatchNodeId(nodeId, refs) as string | number, title, properties, mergeProperties);
    case "remove":
      if (typeof nodeId === "undefined") {
        throw new Error("nodeId is required when action=remove");
      }
      return runtime.removeNode(resolveBatchNodeId(nodeId, refs) as string | number);
    case "connect":
      if (typeof fromNodeId === "undefined" || typeof toNodeId === "undefined") {
        throw new Error("fromNodeId and toNodeId are required when action=connect");
      }
      if (portKind) {
        return runtime.connectNodesByPortKind(
          resolveBatchNodeId(fromNodeId, refs) as string | number,
          resolveBatchNodeId(toNodeId, refs) as string | number,
          portKind,
          fromSlot,
          toSlot,
          allowDuplicate
        );
      }
      return runtime.connectNodes(
        resolveBatchNodeId(fromNodeId, refs) as string | number,
        resolveBatchNodeId(toNodeId, refs) as string | number,
        fromSlot,
        toSlot,
        allowDuplicate
      );
    case "disconnect":
      return runtime.disconnectNodes({
        linkId,
        fromNodeId: typeof fromNodeId === "undefined" ? undefined : resolveBatchNodeId(fromNodeId, refs),
        toNodeId: typeof toNodeId === "undefined" ? undefined : resolveBatchNodeId(toNodeId, refs),
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
        mode: z.enum(["dt", "event", "event-fast"]).optional(),
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
        mode: z.enum(["dt", "event", "event-fast"]).optional(),
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
        wallMs: z.number().int().positive().optional(),
        mode: z.enum(["dt", "event", "event-fast"]).optional(),
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
      const effectiveWallMs = typeof wallMs === "number" ? wallMs : 1000;
      return invokeTool(
        requestId,
        "run_report",
        {
          example: example ?? null,
          wallMs: effectiveWallMs,
          mode: mode ?? null
        },
        async () =>
          collectRunReport(runtime, {
            example,
            wallMs: effectiveWallMs,
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
        wallMs: z.number().int().positive().optional(),
        mode: z.enum(["dt", "event", "event-fast"]).optional(),
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
      const effectiveWallMs = typeof wallMs === "number" ? wallMs : 1000;
      return invokeTool(
        requestId,
        "build_blueprint_report",
        {
          nodeCount: nodes.length,
          edgeCount: Array.isArray(edges) ? edges.length : 0,
          wallMs: effectiveWallMs,
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
            wallMs: effectiveWallMs,
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
        action: z.enum(["add", "update", "remove", "connect", "disconnect", "build", "batch"]),
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
        yPitch: z.number().positive().optional(),
        operations: unknownArraySchema.optional(),
        ref: z.string().min(1).optional()
      }
    },
    async ({ action, nodeType, title, x, y, properties, mergeProperties, nodeId, fromNodeId, toNodeId, fromSlot, toSlot, portKind, allowDuplicate, linkId, removeAllMatches, nodes, edges, clearExisting, originX, originY, xPitch, yPitch, operations, ref }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "edit_graph", { action }, async () => {
        if (action === "batch") {
          if (!operations || operations.length === 0) {
            throw new Error("operations is required when action=batch");
          }
          const refs = new Map<string, string | number>();
          const results = [];
          for (let index = 0; index < operations.length; index += 1) {
            const current = operations[index] as Record<string, unknown>;
            const currentRef = typeof current.ref === "string" ? current.ref.trim() : "";
            const result = await applyEditOperation(runtime, refs, {
              action: String(current.action ?? ""),
              ref: currentRef || undefined,
              nodeType: typeof current.nodeType === "string" ? current.nodeType : undefined,
              title: typeof current.title === "string" ? current.title : undefined,
              x: typeof current.x === "number" ? current.x : undefined,
              y: typeof current.y === "number" ? current.y : undefined,
              properties:
                current.properties && typeof current.properties === "object"
                  ? (current.properties as Record<string, unknown>)
                  : undefined,
              mergeProperties: typeof current.mergeProperties === "boolean" ? current.mergeProperties : undefined,
              nodeId:
                typeof current.nodeId === "string" || typeof current.nodeId === "number"
                  ? (current.nodeId as string | number)
                  : undefined,
              fromNodeId:
                typeof current.fromNodeId === "string" || typeof current.fromNodeId === "number"
                  ? (current.fromNodeId as string | number)
                  : undefined,
              toNodeId:
                typeof current.toNodeId === "string" || typeof current.toNodeId === "number"
                  ? (current.toNodeId as string | number)
                  : undefined,
              fromSlot: typeof current.fromSlot === "number" ? current.fromSlot : undefined,
              toSlot: typeof current.toSlot === "number" ? current.toSlot : undefined,
              portKind:
                current.portKind === "work" ||
                current.portKind === "signal" ||
                current.portKind === "carrier" ||
                current.portKind === "pallet"
                  ? current.portKind
                  : undefined,
              allowDuplicate: typeof current.allowDuplicate === "boolean" ? current.allowDuplicate : undefined,
              linkId: typeof current.linkId === "number" ? current.linkId : undefined,
              removeAllMatches: typeof current.removeAllMatches === "boolean" ? current.removeAllMatches : undefined,
              nodes: Array.isArray(current.nodes) ? (current.nodes as Array<Record<string, unknown>>) : undefined,
              edges: Array.isArray(current.edges) ? (current.edges as Array<Record<string, unknown>>) : undefined,
              clearExisting: typeof current.clearExisting === "boolean" ? current.clearExisting : undefined,
              originX: typeof current.originX === "number" ? current.originX : undefined,
              originY: typeof current.originY === "number" ? current.originY : undefined,
              xPitch: typeof current.xPitch === "number" ? current.xPitch : undefined,
              yPitch: typeof current.yPitch === "number" ? current.yPitch : undefined
            });
            storeBatchRef(refs, currentRef || undefined, result);
            results.push({ index, action: String(current.action ?? ""), ref: currentRef || null, result });
          }
          return {
            operationCount: results.length,
            refs: Object.fromEntries(refs),
            results
          };
        }

        const result = await applyEditOperation(runtime, new Map<string, string | number>(), {
          action,
          ref,
          nodeType,
          title,
          x,
          y,
          properties,
          mergeProperties,
          nodeId,
          fromNodeId,
          toNodeId,
          fromSlot,
          toSlot,
          portKind,
          allowDuplicate,
          linkId,
          removeAllMatches,
          nodes: nodes as Array<Record<string, unknown>> | undefined,
          edges: edges as Array<Record<string, unknown>> | undefined,
          clearExisting,
          originX,
          originY,
          xPitch,
          yPitch
        });
        return result;
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
    "engine_test",
    {
      description: "Run engine correctness tests or return the latest engine test report.",
      inputSchema: {
        action: z.enum(["run", "latest"]),
        engines: z.array(z.string().min(1)).optional(),
        includeCurrentGraph: z.boolean().optional(),
        includeExamples: z.boolean().optional(),
        examples: z.array(z.string().min(1)).optional(),
        targetSimMs: z.number().int().positive().optional(),
        maxWallMs: z.number().int().positive().optional(),
        realStepMs: z.number().int().positive().optional(),
        maxLoops: z.number().int().positive().optional(),
        seed: z.number().int().optional()
      }
    },
    async ({ action, engines, includeCurrentGraph, includeExamples, examples, targetSimMs, maxWallMs, realStepMs, maxLoops, seed }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "engine_test", { action }, async () => {
        if (action === "latest") {
          return summarizeEngineTest(await runtime.getLatestEngineTestReport());
        }
        return summarizeEngineTest(
          await runtime.runEngineTests({
            engines,
            includeCurrentGraph,
            includeExamples,
            examples,
            targetSimMs,
            maxWallMs,
            realStepMs,
            maxLoops,
            seed
          })
        );
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

  server.registerTool(
    "load_example",
    {
      description: "Legacy alias of examples(load).",
      inputSchema: {
        example: z.string().min(1)
      }
    },
    async ({ example }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "load_example", { example }, async () => {
        const loaded = await runtime.loadExample(example);
        const overview = await runtime.getGraphOverview(false, 0);
        return {
          example: loaded.example,
          nodeCount: loaded.nodeCount,
          linkCount: overview.linkCount
        };
      });
    }
  );

  server.registerTool(
    "start_simulation",
    {
      description: "Legacy alias of simulate(start)."
    },
    async (extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "start_simulation", {}, async () => runtime.startSimulation());
    }
  );

  server.registerTool(
    "stop_simulation",
    {
      description: "Legacy alias of simulate(stop)."
    },
    async (extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "stop_simulation", {}, async () => runtime.stopSimulation());
    }
  );

  server.registerTool(
    "run_simulation_for",
    {
      description: "Legacy alias of simulate(run_for).",
      inputSchema: {
        wallMs: z.number().int().positive(),
        mode: z.enum(["dt", "event", "event-fast"]).optional(),
        fastest: z.boolean().optional(),
        includeBenchmark: z.boolean().optional(),
        benchmarkWallMs: z.number().int().positive().optional()
      }
    },
    async ({ wallMs, mode, fastest, includeBenchmark, benchmarkWallMs }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "run_simulation_for", { wallMs, mode: mode ?? null }, async () =>
        summarizeRun(await runtime.runSimulationFor(wallMs, mode, fastest, includeBenchmark, benchmarkWallMs))
      );
    }
  );

  server.registerTool(
    "get_simulation_status",
    {
      description: "Legacy alias of simulate(status)."
    },
    async (extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "get_simulation_status", {}, async () =>
        summarizeStatus(await runtime.getSimulationStatus())
      );
    }
  );

  server.registerTool(
    "get_kpi_summary",
    {
      description: "Legacy alias of metrics(kpi)."
    },
    async (extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "get_kpi_summary", {}, async () =>
        summarizeKpi(await runtime.getKpiSummary())
      );
    }
  );

  server.registerTool(
    "run_benchmark",
    {
      description: "Legacy alias of metrics(benchmark).",
      inputSchema: {
        wallMs: z.number().int().positive().optional()
      }
    },
    async ({ wallMs }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "run_benchmark", { wallMs: wallMs ?? null }, async () =>
        summarizeBenchmark(await runtime.runBenchmark(wallMs))
      );
    }
  );

  server.registerTool(
    "get_graph_overview",
    {
      description: "Legacy alias of graph(overview).",
      inputSchema: {
        includeNodes: z.boolean().optional(),
        maxNodes: z.number().int().nonnegative().optional()
      }
    },
    async ({ includeNodes, maxNodes }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "get_graph_overview", { includeNodes: !!includeNodes }, async () =>
        summarizeOverview(await runtime.getGraphOverview(includeNodes, maxNodes))
      );
    }
  );

  server.registerTool(
    "add_node",
    {
      description: "Legacy alias of edit_graph(add).",
      inputSchema: {
        nodeType: z.string().min(1),
        title: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        properties: jsonRecordSchema.optional()
      }
    },
    async ({ nodeType, title, x, y, properties }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "add_node", { nodeType }, async () =>
        runtime.addNode(nodeType, title, x, y, properties)
      );
    }
  );

  server.registerTool(
    "update_node",
    {
      description: "Legacy alias of edit_graph(update).",
      inputSchema: {
        nodeId: nodeIdSchema,
        title: z.string().optional(),
        properties: jsonRecordSchema.optional(),
        mergeProperties: z.boolean().optional()
      }
    },
    async ({ nodeId, title, properties, mergeProperties }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "update_node", { nodeId }, async () =>
        runtime.updateNode(nodeId, title, properties, mergeProperties)
      );
    }
  );

  server.registerTool(
    "connect_nodes",
    {
      description: "Legacy alias of edit_graph(connect).",
      inputSchema: {
        fromNodeId: nodeIdSchema,
        toNodeId: nodeIdSchema,
        fromSlot: z.number().int().nonnegative().optional(),
        toSlot: z.number().int().nonnegative().optional(),
        allowDuplicate: z.boolean().optional()
      }
    },
    async ({ fromNodeId, toNodeId, fromSlot, toSlot, allowDuplicate }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "connect_nodes", { fromNodeId, toNodeId }, async () =>
        runtime.connectNodes(fromNodeId, toNodeId, fromSlot, toSlot, allowDuplicate)
      );
    }
  );

  server.registerTool(
    "connect_nodes_by_port_kind",
    {
      description: "Legacy alias of edit_graph(connect with portKind).",
      inputSchema: {
        fromNodeId: nodeIdSchema,
        toNodeId: nodeIdSchema,
        portKind: portKindSchema,
        fromSlot: z.number().int().nonnegative().optional(),
        toSlot: z.number().int().nonnegative().optional(),
        allowDuplicate: z.boolean().optional()
      }
    },
    async ({ fromNodeId, toNodeId, portKind, fromSlot, toSlot, allowDuplicate }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "connect_nodes_by_port_kind", { fromNodeId, toNodeId, portKind }, async () =>
        runtime.connectNodesByPortKind(fromNodeId, toNodeId, portKind, fromSlot, toSlot, allowDuplicate)
      );
    }
  );

  server.registerTool(
    "remove_node",
    {
      description: "Legacy alias of edit_graph(remove).",
      inputSchema: {
        nodeId: nodeIdSchema
      }
    },
    async ({ nodeId }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "remove_node", { nodeId }, async () => runtime.removeNode(nodeId));
    }
  );

  server.registerTool(
    "build_graph_from_blueprint",
    {
      description: "Legacy alias of edit_graph(build).",
      inputSchema: {
        nodes: unknownArraySchema,
        edges: unknownArraySchema.optional(),
        clearExisting: z.boolean().optional(),
        originX: z.number().optional(),
        originY: z.number().optional(),
        xPitch: z.number().positive().optional(),
        yPitch: z.number().positive().optional()
      }
    },
    async ({ nodes, edges, clearExisting, originX, originY, xPitch, yPitch }, extra) => {
      const requestId = String(extra.requestId);
      return invokeTool(requestId, "build_graph_from_blueprint", { nodeCount: nodes.length }, async () =>
        runtime.buildGraphFromBlueprint(nodes as any, (edges ?? []) as any, {
          clearExisting,
          originX,
          originY,
          xPitch,
          yPitch
        })
      );
    }
  );
}
