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

export function registerRuntimeMethodsGroup09(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).updateNode = async function (this: any, nodeId: string | number, title?: string, properties?: Record<string, unknown>, mergeProperties?: boolean): Promise<UpdateNodeOutput> {
      const hasTitle = typeof title === "string";
      const hasProperties = !!properties && typeof properties === "object" && !Array.isArray(properties);
      if (!hasTitle && !hasProperties) {
        throw new Error("update_node requires title and/or properties");
      }
  
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
        properties?: Record<string, unknown>;
      };
  
      const resolvedId = nodeAs.id;
      if (typeof resolvedId !== "string" && typeof resolvedId !== "number") {
        throw new Error("selected node has invalid id");
      }
  
      let updatedTitle = false;
      if (hasTitle) {
        const normalizedTitle = String(title ?? "");
        nodeAs.title = normalizedTitle;
        updatedTitle = true;
      }
  
      const merged = typeof mergeProperties === "boolean" ? mergeProperties : true;
      const updatedPropertyKeys: string[] = [];
      if (hasProperties) {
        const incoming = properties as Record<string, unknown>;
        const source = merged
          ? nodeAs.properties && typeof nodeAs.properties === "object" && !Array.isArray(nodeAs.properties)
            ? nodeAs.properties
            : {}
          : {};
        nodeAs.properties = {
          ...source,
          ...incoming
        };
        updatedPropertyKeys.push(...Object.keys(incoming));
      }
  
      graph.nodes = nodes;
      await this.importGraphJson(JSON.stringify(graph));
  
      const links = this.canonicalizeSerializedLinks(graph.links);
      return {
        nodeId: resolvedId,
        nodeType: typeof nodeAs.type === "string" ? nodeAs.type : null,
        title: String(nodeAs.title ?? ""),
        properties:
          nodeAs.properties && typeof nodeAs.properties === "object" && !Array.isArray(nodeAs.properties)
            ? nodeAs.properties
            : {},
        updatedTitle,
        updatedPropertyKeys: [...new Set(updatedPropertyKeys)],
        mergedProperties: merged,
        nodeCount: nodes.length,
        linkCount: links.length
      };
    };

  (FactSimRuntimeClass.prototype as any).connectNodes = async function (this: any, fromNodeId: string | number, toNodeId: string | number, fromSlot?: number, toSlot?: number, allowDuplicate?: boolean): Promise<ConnectNodesOutput> {
      const exported = await this.exportGraphJson(false);
      const graph = this.parseGraphJsonObject(exported.json);
      const nodes = this.getSerializedNodes(graph);
      const fromNode = this.findSerializedNode(nodes, fromNodeId);
      const toNode = this.findSerializedNode(nodes, toNodeId);
  
      if (!fromNode) {
        throw new Error("fromNodeId not found: " + String(fromNodeId));
      }
      if (!toNode) {
        throw new Error("toNodeId not found: " + String(toNodeId));
      }
  
      const fromNodeAs = fromNode as { id?: unknown; outputs?: unknown[] };
      const toNodeAs = toNode as { id?: unknown; inputs?: unknown[] };
      const safeFromSlot = this.normalizeSlot(fromSlot, 0);
      const safeToSlot = this.normalizeSlot(toSlot, 0);
      const outputCount = Array.isArray(fromNodeAs.outputs) ? fromNodeAs.outputs.length : 0;
      const inputCount = Array.isArray(toNodeAs.inputs) ? toNodeAs.inputs.length : 0;
  
      if (outputCount <= safeFromSlot) {
        throw new Error("fromSlot out of range: " + safeFromSlot + " (outputs: " + outputCount + ")");
      }
      if (inputCount <= safeToSlot) {
        throw new Error("toSlot out of range: " + safeToSlot + " (inputs: " + inputCount + ")");
      }
  
      const fromIdRaw = fromNodeAs.id;
      const toIdRaw = toNodeAs.id;
      if ((typeof fromIdRaw !== "string" && typeof fromIdRaw !== "number") || (typeof toIdRaw !== "string" && typeof toIdRaw !== "number")) {
        throw new Error("node id is invalid in graph JSON");
      }
  
      const links = this.canonicalizeSerializedLinks(graph.links);
      const fromKey = this.normalizeNodeId(fromIdRaw);
      const toKey = this.normalizeNodeId(toIdRaw);
  
      const existing = links.find(
        (link: any) =>
          this.normalizeNodeId(link[1]) === fromKey &&
          this.normalizeNodeId(link[3]) === toKey &&
          link[2] === safeFromSlot &&
          link[4] === safeToSlot
      );
  
      if (existing && !allowDuplicate) {
        return {
          created: false,
          linkId: existing[0],
          fromNodeId: fromIdRaw,
          toNodeId: toIdRaw,
          fromSlot: safeFromSlot,
          toSlot: safeToSlot,
          nodeCount: nodes.length,
          linkCount: links.length
        };
      }
  
      const nextId = links.reduce((max: number, link: any) => Math.max(max, link[0]), 0) + 1;
      links.push([nextId, fromIdRaw, safeFromSlot, toIdRaw, safeToSlot, 0]);
      graph.links = links;
      await this.importGraphJson(JSON.stringify(graph));
  
      return {
        created: true,
        linkId: nextId,
        fromNodeId: fromIdRaw,
        toNodeId: toIdRaw,
        fromSlot: safeFromSlot,
        toSlot: safeToSlot,
        nodeCount: nodes.length,
        linkCount: links.length
      };
    };

  (FactSimRuntimeClass.prototype as any).disconnectNodes = async function (this: any, options: {
      linkId?: number;
      fromNodeId?: string | number;
      toNodeId?: string | number;
      fromSlot?: number;
      toSlot?: number;
      removeAllMatches?: boolean;
    }): Promise<DisconnectNodesOutput> {
      const exported = await this.exportGraphJson(false);
      const graph = this.parseGraphJsonObject(exported.json);
      const links = this.canonicalizeSerializedLinks(graph.links);
      const nodes = this.getSerializedNodes(graph);
  
      const hasAnyCriteria =
        typeof options.linkId === "number" ||
        typeof options.fromNodeId === "string" ||
        typeof options.fromNodeId === "number" ||
        typeof options.toNodeId === "string" ||
        typeof options.toNodeId === "number" ||
        typeof options.fromSlot === "number" ||
        typeof options.toSlot === "number";
  
      if (!hasAnyCriteria) {
        throw new Error("disconnect requires linkId or endpoint criteria");
      }
  
      const matchIds: number[] = [];
      const fromNodeKey =
        typeof options.fromNodeId === "string" || typeof options.fromNodeId === "number"
          ? this.normalizeNodeId(options.fromNodeId)
          : null;
      const toNodeKey =
        typeof options.toNodeId === "string" || typeof options.toNodeId === "number"
          ? this.normalizeNodeId(options.toNodeId)
          : null;
  
      for (const link of links) {
        if (typeof options.linkId === "number" && link[0] !== options.linkId) {
          continue;
        }
        if (fromNodeKey !== null && this.normalizeNodeId(link[1]) !== fromNodeKey) {
          continue;
        }
        if (toNodeKey !== null && this.normalizeNodeId(link[3]) !== toNodeKey) {
          continue;
        }
        if (typeof options.fromSlot === "number" && link[2] !== this.normalizeSlot(options.fromSlot, 0)) {
          continue;
        }
        if (typeof options.toSlot === "number" && link[4] !== this.normalizeSlot(options.toSlot, 0)) {
          continue;
        }
        matchIds.push(link[0]);
      }
  
      if (!matchIds.length) {
        return {
          removedCount: 0,
          removedLinkIds: [],
          nodeCount: nodes.length,
          linkCount: links.length
        };
      }
  
      const removeAll = !!options.removeAllMatches;
      const removeSet = new Set<number>(removeAll ? matchIds : [matchIds[0]]);
      const nextLinks = links.filter((link: any) => !removeSet.has(link[0]));
  
      graph.links = nextLinks;
      await this.importGraphJson(JSON.stringify(graph));
  
      return {
        removedCount: removeSet.size,
        removedLinkIds: [...removeSet],
        nodeCount: nodes.length,
        linkCount: nextLinks.length
      };
    };

  (FactSimRuntimeClass.prototype as any).removeNode = async function (this: any, nodeId: string | number): Promise<RemoveNodeOutput> {
      const exported = await this.exportGraphJson(false);
      const graph = this.parseGraphJsonObject(exported.json);
      const nodes = this.getSerializedNodes(graph);
      const nodeKey = this.normalizeNodeId(nodeId);
  
      const remainingNodes: Record<string, unknown>[] = [];
      let removedNodeId: string | number | null = null;
  
      for (const node of nodes) {
        const currentId = (node as { id?: unknown }).id;
        if ((typeof currentId === "string" || typeof currentId === "number") && this.normalizeNodeId(currentId) === nodeKey) {
          removedNodeId = currentId;
          continue;
        }
        remainingNodes.push(node);
      }
  
      if (removedNodeId === null) {
        throw new Error("nodeId not found: " + String(nodeId));
      }
  
      const links = this.canonicalizeSerializedLinks(graph.links);
      const nextLinks = links.filter(
        (link: any) => this.normalizeNodeId(link[1]) !== nodeKey && this.normalizeNodeId(link[3]) !== nodeKey
      );
  
      graph.nodes = remainingNodes;
      graph.links = nextLinks;
      await this.importGraphJson(JSON.stringify(graph));
  
      return {
        removedNodeId,
        removedLinkCount: links.length - nextLinks.length,
        nodeCount: remainingNodes.length,
        linkCount: nextLinks.length
      };
    };
}


