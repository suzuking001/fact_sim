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

export function registerRuntimeMethodsGroup11(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).parseGraphJsonObject = function (this: any, graphJson: string): Record<string, unknown> {
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
  
      return parsed as Record<string, unknown>;
    };

  (FactSimRuntimeClass.prototype as any).getSerializedNodes = function (this: any, graph: Record<string, unknown>): Record<string, unknown>[] {
      const nodes = Array.isArray(graph.nodes) ? graph.nodes : Array.isArray(graph._nodes) ? graph._nodes : null;
      if (!Array.isArray(nodes)) {
        throw new Error("graph JSON does not contain nodes array");
      }
      return nodes.filter((node) => !!node && typeof node === "object") as Record<string, unknown>[];
    };

  (FactSimRuntimeClass.prototype as any).findSerializedNode = function (this: any, nodes: Record<string, unknown>[], nodeId: string | number): Record<string, unknown> | null {
      const targetKey = this.normalizeNodeId(nodeId);
      for (const node of nodes) {
        const currentId = (node as { id?: unknown }).id;
        if ((typeof currentId === "string" || typeof currentId === "number") && this.normalizeNodeId(currentId) === targetKey) {
          return node;
        }
      }
      return null;
    };

  (FactSimRuntimeClass.prototype as any).normalizeNodeId = function (this: any, nodeId: string | number): string {
      return String(nodeId);
    };

  (FactSimRuntimeClass.prototype as any).normalizePortKind = function (this: any, portKind: PortKind): PortKind {
      const value = String(portKind ?? "").trim().toLowerCase();
      if (value === "work" || value === "signal" || value === "carrier" || value === "pallet") {
        return value;
      }
      throw new Error('portKind must be one of: "work", "signal", "carrier", "pallet"');
    };

  (FactSimRuntimeClass.prototype as any).isPortSlotOfKind = function (this: any, slot: { name: string; type: string | null }, portKind: PortKind): boolean {
      const name = String(slot.name ?? "").trim().toLowerCase();
      const type = String(slot.type ?? "").trim().toLowerCase();
      const isSignal = name.includes("signal") || name.startsWith("sig") || type.includes("signal") || type === "string";
      const isCarrier = name.includes("carrier") || type.includes("carrier") || type.includes("agv");
      const isPallet = name.includes("pallet") || type.includes("pallet");
  
      if (portKind === "signal") {
        return isSignal;
      }
      if (portKind === "carrier") {
        return isCarrier;
      }
      if (portKind === "pallet") {
        return isPallet;
      }
  
      // work ports are usually typed as "0" or "work" and should exclude other special channels.
      if (isSignal || isCarrier || isPallet) {
        return false;
      }
      return type === "0" || type === "work" || name.includes("work");
    };

  (FactSimRuntimeClass.prototype as any).selectPortSlot = function (this: any, slots: PortKindSlot[], explicitSlot: number | undefined, argName: string): PortKindSlot {
      if (!slots.length) {
        throw new Error(`${argName}: no candidate slots are available`);
      }
  
      if (typeof explicitSlot === "number" && Number.isFinite(explicitSlot)) {
        const normalized = this.normalizeSlot(explicitSlot, 0);
        const matched = slots.find((slot) => slot.slot === normalized);
        if (!matched) {
          const candidates = slots.map((slot) => slot.slot).sort((a, b) => a - b);
          throw new Error(`${argName} ${normalized} is not compatible with selected port kind. candidates=[${candidates.join(", ")}]`);
        }
        return matched;
      }
  
      const ranked = [...slots].sort((a, b) => {
        if (a.linkCount !== b.linkCount) {
          return a.linkCount - b.linkCount;
        }
        return a.slot - b.slot;
      });
      return ranked[0];
    };

  (FactSimRuntimeClass.prototype as any).normalizeSlot = function (this: any, slot: number | undefined, fallback: number): number {
      if (typeof slot !== "number" || !Number.isFinite(slot)) {
        return fallback;
      }
      return Math.max(0, Math.floor(slot));
    };

  (FactSimRuntimeClass.prototype as any).parseSerializedLinkRecord = function (this: any, rawEntry: unknown): {
      id: number | null;
      fromId: string | number;
      fromSlot: number;
      toId: string | number;
      toSlot: number;
      type: number;
    } | null {
      if (Array.isArray(rawEntry)) {
        const fromRaw = rawEntry.length > 1 ? rawEntry[1] : null;
        const toRaw = rawEntry.length > 3 ? rawEntry[3] : null;
        if ((typeof fromRaw !== "string" && typeof fromRaw !== "number") || (typeof toRaw !== "string" && typeof toRaw !== "number")) {
          return null;
        }
  
        const idRaw = rawEntry.length > 0 ? Number(rawEntry[0]) : Number.NaN;
        const fromSlotRaw = rawEntry.length > 2 ? Number(rawEntry[2]) : Number.NaN;
        const toSlotRaw = rawEntry.length > 4 ? Number(rawEntry[4]) : Number.NaN;
        const typeRaw = rawEntry.length > 5 ? Number(rawEntry[5]) : Number.NaN;
  
        return {
          id: Number.isFinite(idRaw) && idRaw > 0 ? Math.floor(idRaw) : null,
          fromId: fromRaw,
          fromSlot: Number.isFinite(fromSlotRaw) && fromSlotRaw >= 0 ? Math.floor(fromSlotRaw) : 0,
          toId: toRaw,
          toSlot: Number.isFinite(toSlotRaw) && toSlotRaw >= 0 ? Math.floor(toSlotRaw) : 0,
          type: Number.isFinite(typeRaw) ? typeRaw : 0
        };
      }
  
      if (!rawEntry || typeof rawEntry !== "object") {
        return null;
      }
  
      const entry = rawEntry as Record<string, unknown>;
      const fromRaw = entry.origin_id ?? entry.from ?? entry.from_id ?? entry["1"];
      const toRaw = entry.target_id ?? entry.to ?? entry.to_id ?? entry["3"];
      if ((typeof fromRaw !== "string" && typeof fromRaw !== "number") || (typeof toRaw !== "string" && typeof toRaw !== "number")) {
        return null;
      }
  
      const idRaw = Number(entry.id ?? entry[0] ?? Number.NaN);
      const fromSlotRaw = Number(entry.origin_slot ?? entry.from_slot ?? entry[2] ?? Number.NaN);
      const toSlotRaw = Number(entry.target_slot ?? entry.to_slot ?? entry[4] ?? Number.NaN);
      const typeRaw = Number(entry.type ?? entry[5] ?? Number.NaN);
  
      return {
        id: Number.isFinite(idRaw) && idRaw > 0 ? Math.floor(idRaw) : null,
        fromId: fromRaw,
        fromSlot: Number.isFinite(fromSlotRaw) && fromSlotRaw >= 0 ? Math.floor(fromSlotRaw) : 0,
        toId: toRaw,
        toSlot: Number.isFinite(toSlotRaw) && toSlotRaw >= 0 ? Math.floor(toSlotRaw) : 0,
        type: Number.isFinite(typeRaw) ? typeRaw : 0
      };
    };

  (FactSimRuntimeClass.prototype as any).canonicalizeSerializedLinks = function (this: any, rawLinks: unknown): Array<[number, string | number, number, string | number, number, number]> {
      const entries = Array.isArray(rawLinks)
        ? rawLinks
        : rawLinks && typeof rawLinks === "object"
          ? Object.values(rawLinks as Record<string, unknown>)
          : [];
  
      const result: Array<[number, string | number, number, string | number, number, number]> = [];
      const usedIds = new Set<number>();
      let nextId = 1;
  
      for (const entry of entries) {
        const parsed = this.parseSerializedLinkRecord(entry);
        if (!parsed) continue;
  
        let linkId = parsed.id;
        if (linkId === null || usedIds.has(linkId)) {
          while (usedIds.has(nextId)) {
            nextId += 1;
          }
          linkId = nextId;
        }
  
        usedIds.add(linkId);
        if (linkId >= nextId) {
          nextId = linkId + 1;
        }
  
        result.push([linkId, parsed.fromId, parsed.fromSlot, parsed.toId, parsed.toSlot, parsed.type]);
      }
  
      return result;
    };

  (FactSimRuntimeClass.prototype as any).sanitizeNumberOption = function (this: any, value: unknown, fallback: number, min?: number, max?: number): number {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
      }
  
      let result = value;
      if (typeof min === "number" && Number.isFinite(min)) {
        result = Math.max(min, result);
      }
      if (typeof max === "number" && Number.isFinite(max)) {
        result = Math.min(max, result);
      }
      return result;
    };

  (FactSimRuntimeClass.prototype as any).sanitizeIntegerOption = function (this: any, value: unknown, fallback: number, min?: number, max?: number): number {
      const sanitized = this.sanitizeNumberOption(value, fallback, min, max);
      return Math.floor(sanitized);
    };

  (FactSimRuntimeClass.prototype as any).readOptionalNonNegativeInt = function (this: any, value: unknown): number | undefined {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
      }
      const normalized = Math.floor(value);
      if (normalized < 0) {
        throw new Error("slot must be a non-negative integer");
      }
      return normalized;
    };

  (FactSimRuntimeClass.prototype as any).computeLineOptimizationScore = function (this: any, throughputPerHourTotal: number, totalCompleted: number): number {
      const throughput = Number.isFinite(throughputPerHourTotal) ? Math.max(0, throughputPerHourTotal) : 0;
      const completed = Number.isFinite(totalCompleted) ? Math.max(0, totalCompleted) : 0;
      return throughput + Math.sqrt(completed) * 0.05;
    };

  (FactSimRuntimeClass.prototype as any).roundNumber = function (this: any, value: number, digits: number): number {
      if (!Number.isFinite(value)) {
        return 0;
      }
      const safeDigits = Math.max(0, Math.min(12, Math.floor(digits)));
      const factor = 10 ** safeDigits;
      return Math.round(value * factor) / factor;
    };

  (FactSimRuntimeClass.prototype as any).parseForbiddenAdjacencyRule = function (this: any, rule: string): { from: string; to: string } | null {
      const raw = String(rule ?? "").trim();
      const splitIndex = raw.indexOf("->");
      if (splitIndex <= 0 || splitIndex >= raw.length - 2) {
        return null;
      }
  
      const from = raw.slice(0, splitIndex).trim().toLowerCase();
      const to = raw.slice(splitIndex + 2).trim().toLowerCase();
      if (!from || !to) {
        return null;
      }
      return { from, to };
    };

  (FactSimRuntimeClass.prototype as any).nodeMatchesPattern = function (this: any, node: { type: string | null; title: string }, pattern: string): boolean {
      const p = String(pattern ?? "").trim().toLowerCase();
      if (!p || p === "*") {
        return true;
      }
      const typeText = String(node.type ?? "").toLowerCase();
      const titleText = String(node.title ?? "").toLowerCase();
      return typeText.includes(p) || titleText.includes(p);
    };

  (FactSimRuntimeClass.prototype as any).resolveDoeTargetNodeIds = function (this: any, baseNodes: Record<string, unknown>[], parameter: DoeParameterInput, warnings: string[], index: number): Array<string | number> {
      const explicitIds = Array.isArray(parameter.nodeIds)
        ? parameter.nodeIds.filter((x): x is string | number => typeof x === "string" || typeof x === "number")
        : [];
  
      const normalizedTypeFilters = Array.isArray(parameter.nodeTypeIncludes)
        ? parameter.nodeTypeIncludes.map((x) => String(x).trim().toLowerCase()).filter((x) => x.length > 0)
        : [];
      const normalizedTitleFilters = Array.isArray(parameter.titleIncludes)
        ? parameter.titleIncludes.map((x) => String(x).trim().toLowerCase()).filter((x) => x.length > 0)
        : [];
  
      const nodeRows = baseNodes
        .map((node) => {
          const asNode = node as { id?: unknown; type?: unknown; title?: unknown };
          const id = asNode.id;
          if (typeof id !== "string" && typeof id !== "number") {
            return null;
          }
          return {
            id,
            idKey: this.normalizeNodeId(id),
            type: String(asNode.type ?? "").toLowerCase(),
            title: String(asNode.title ?? "").toLowerCase()
          };
        })
        .filter((x): x is { id: string | number; idKey: string; type: string; title: string } => !!x);
  
      const target: Array<string | number> = [];
      if (explicitIds.length > 0) {
        const known = new Map<string, string | number>();
        for (const row of nodeRows) {
          known.set(row.idKey, row.id);
        }
        for (const requested of explicitIds) {
          const found = known.get(this.normalizeNodeId(requested));
          if (typeof found === "undefined") {
            warnings.push('DOE parameter[' + index + '] nodeId not found: ' + String(requested));
            continue;
          }
          target.push(found);
        }
      } else {
        for (const row of nodeRows) {
          const typeOk = normalizedTypeFilters.length === 0 || normalizedTypeFilters.some((f) => row.type.includes(f));
          const titleOk = normalizedTitleFilters.length === 0 || normalizedTitleFilters.some((f) => row.title.includes(f));
          if (typeOk && titleOk) {
            target.push(row.id);
          }
        }
      }
  
      const dedup = new Map<string, string | number>();
      for (const id of target) {
        dedup.set(this.normalizeNodeId(id), id);
      }
      return [...dedup.values()];
    };
}
