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

export function registerRuntimeMethodsGroup08(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).addNode = async function (this: any, nodeType: string, title?: string, x?: number, y?: number, properties?: Record<string, unknown>): Promise<AddNodeOutput> {
      const page = await this.ensureReady();
      return page.evaluate(
        ({ requestedNodeType, requestedTitle, requestedX, requestedY, requestedProperties }: any) => {
          const w = window as unknown as Record<string, unknown>;
          const app = w.App as
            | {
                graph?: { add?: (node: unknown) => void; _nodes?: unknown[]; links?: Record<string, unknown> | unknown[] };
                canvas?: { draw?: (a?: boolean, b?: boolean) => void };
              }
            | undefined;
          const liteGraph = w.LiteGraph as { createNode?: (type: string) => unknown; registered_node_types?: Record<string, unknown> } | undefined;
  
          if (!app?.graph || typeof app.graph.add !== "function") {
            throw new Error("App.graph.add is not available");
          }
          if (!liteGraph || typeof liteGraph.createNode !== "function") {
            throw new Error("LiteGraph.createNode is not available");
          }
  
          const typeRaw = String(requestedNodeType ?? "").trim();
          if (!typeRaw) {
            throw new Error("nodeType is required");
          }
  
          const node = liteGraph.createNode(typeRaw) as
            | {
                id?: unknown;
                type?: unknown;
                title?: unknown;
                pos?: unknown;
                properties?: Record<string, unknown>;
                inputs?: unknown[];
                outputs?: unknown[];
              }
            | null;
  
          if (!node) {
            const knownTypes =
              liteGraph.registered_node_types && typeof liteGraph.registered_node_types === "object"
                ? Object.keys(liteGraph.registered_node_types).slice(0, 20)
                : [];
            throw new Error("Unknown nodeType: " + typeRaw + (knownTypes.length ? " (examples: " + knownTypes.join(", ") + ")" : ""));
          }
  
          const xNum = typeof requestedX === "number" && Number.isFinite(requestedX) ? requestedX : 120;
          const yNum = typeof requestedY === "number" && Number.isFinite(requestedY) ? requestedY : 120;
          node.pos = [xNum, yNum];
  
          const titleRaw = String(requestedTitle ?? "").trim();
          if (titleRaw) {
            node.title = titleRaw;
          }
  
          if (requestedProperties && typeof requestedProperties === "object" && !Array.isArray(requestedProperties)) {
            node.properties = {
              ...(node.properties ?? {}),
              ...(requestedProperties as Record<string, unknown>)
            };
          }
  
          app.graph.add(node);
          if (app.canvas && typeof app.canvas.draw === "function") {
            app.canvas.draw(true, true);
          }
  
          const nodes = Array.isArray(app.graph._nodes) ? app.graph._nodes : [];
          const linkMap = app.graph.links;
          const linkCount = Array.isArray(linkMap)
            ? linkMap.length
            : linkMap && typeof linkMap === "object"
              ? Object.keys(linkMap).length
              : 0;
  
          const rawPos = Array.isArray(node.pos) ? node.pos : null;
          const px = rawPos && rawPos.length > 0 ? Number(rawPos[0]) : Number.NaN;
          const py = rawPos && rawPos.length > 1 ? Number(rawPos[1]) : Number.NaN;
  
          return {
            nodeId: typeof node.id === "string" || typeof node.id === "number" ? node.id : null,
            nodeType: typeof node.type === "string" ? node.type : typeRaw,
            title: String(node.title ?? ""),
            pos: Number.isFinite(px) && Number.isFinite(py) ? [px, py] : null,
            inputCount: Array.isArray(node.inputs) ? node.inputs.length : 0,
            outputCount: Array.isArray(node.outputs) ? node.outputs.length : 0,
            nodeCount: nodes.length,
            linkCount
          };
        },
        {
          requestedNodeType: nodeType,
          requestedTitle: title,
          requestedX: typeof x === "number" && Number.isFinite(x) ? x : null,
          requestedY: typeof y === "number" && Number.isFinite(y) ? y : null,
          requestedProperties: properties ?? null
        }
      );
    };

  (FactSimRuntimeClass.prototype as any).getNodePorts = async function (this: any, nodeId: string | number): Promise<NodePortsOutput> {
      const exported = await this.exportGraphJson(false);
      const graph = this.parseGraphJsonObject(exported.json);
      const nodes = this.getSerializedNodes(graph);
      const node = this.findSerializedNode(nodes, nodeId);
      if (!node) {
        throw new Error("nodeId not found: " + String(nodeId));
      }
  
      const nodeAs = node as {
        id?: unknown;
        type?: unknown;
        title?: unknown;
        inputs?: Array<{ name?: unknown; type?: unknown; link?: unknown }>;
        outputs?: Array<{ name?: unknown; type?: unknown; links?: unknown }>;
      };
  
      const inputs = Array.isArray(nodeAs.inputs)
        ? nodeAs.inputs.map((input, index) => {
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
  
      const outputs = Array.isArray(nodeAs.outputs)
        ? nodeAs.outputs.map((output, index) => {
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
  
      const resolvedId = nodeAs.id;
      if (typeof resolvedId !== "string" && typeof resolvedId !== "number") {
        throw new Error("selected node has invalid id");
      }
  
      return {
        nodeId: resolvedId,
        nodeType: typeof nodeAs.type === "string" ? nodeAs.type : null,
        title: String(nodeAs.title ?? ""),
        inputCount: inputs.length,
        outputCount: outputs.length,
        inputs,
        outputs
      };
    };

  (FactSimRuntimeClass.prototype as any).getNodePortsByKind = async function (this: any, nodeId: string | number, portKind: PortKind): Promise<PortKindSlotsOutput> {
      const ports = await this.getNodePorts(nodeId);
      const normalizedKind = this.normalizePortKind(portKind);
      const inputs = ports.inputs.filter((slot: any) => this.isPortSlotOfKind(slot, normalizedKind));
      const outputs = ports.outputs.filter((slot: any) => this.isPortSlotOfKind(slot, normalizedKind));
  
      return {
        nodeId: ports.nodeId,
        nodeType: ports.nodeType,
        title: ports.title,
        portKind: normalizedKind,
        inputs,
        outputs
      };
    };

  (FactSimRuntimeClass.prototype as any).connectNodesByPortKind = async function (this: any, fromNodeId: string | number, toNodeId: string | number, portKind: PortKind, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput> {
      const normalizedKind = this.normalizePortKind(portKind);
      const fromPorts = await this.getNodePortsByKind(fromNodeId, normalizedKind);
      const toPorts = await this.getNodePortsByKind(toNodeId, normalizedKind);
      const fromCandidates = fromPorts.outputs;
      const toCandidates = toPorts.inputs;
  
      if (!fromCandidates.length) {
        throw new Error(
          `fromNodeId ${String(fromNodeId)} has no output ports compatible with portKind "${normalizedKind}".`
        );
      }
      if (!toCandidates.length) {
        throw new Error(
          `toNodeId ${String(toNodeId)} has no input ports compatible with portKind "${normalizedKind}".`
        );
      }
  
      const selectedFrom = this.selectPortSlot(fromCandidates, fromSlot, "fromSlot");
      const selectedTo = this.selectPortSlot(toCandidates, toSlot, "toSlot");
      const connected = await this.connectNodes(
        fromPorts.nodeId,
        toPorts.nodeId,
        selectedFrom.slot,
        selectedTo.slot,
        allowDuplicate
      );
  
      return {
        ...connected,
        portKind: normalizedKind,
        fromCandidates: fromCandidates.length,
        toCandidates: toCandidates.length
      };
    };

  (FactSimRuntimeClass.prototype as any).connectWorkPorts = async function (this: any, fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput> {
      return this.connectNodesByPortKind(fromNodeId, toNodeId, "work", fromSlot, toSlot, allowDuplicate);
    };

  (FactSimRuntimeClass.prototype as any).connectSignalPorts = async function (this: any, fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput> {
      return this.connectNodesByPortKind(fromNodeId, toNodeId, "signal", fromSlot, toSlot, allowDuplicate);
    };

  (FactSimRuntimeClass.prototype as any).connectCarrierPorts = async function (this: any, fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput> {
      return this.connectNodesByPortKind(fromNodeId, toNodeId, "carrier", fromSlot, toSlot, allowDuplicate);
    };

  (FactSimRuntimeClass.prototype as any).connectPalletPorts = async function (this: any, fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectByPortKindOutput> {
      return this.connectNodesByPortKind(fromNodeId, toNodeId, "pallet", fromSlot, toSlot, allowDuplicate);
    };
}



