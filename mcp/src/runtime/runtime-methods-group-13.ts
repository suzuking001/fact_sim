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

export function registerRuntimeMethodsGroup13(
  FactSimRuntimeClass: typeof FactSimRuntime,
  helpers: {
    getMimeType: (filePath: string) => string;
    toErrorMessage: (error: unknown) => string;
  }
): void {
  const { getMimeType, toErrorMessage } = helpers;

  (FactSimRuntimeClass.prototype as any).extractLinkEndpoints = function (this: any, linkEntry: unknown): { fromId: string | number | null; toId: string | number | null } | null {
      if (Array.isArray(linkEntry)) {
        const fromId = linkEntry.length > 1 ? linkEntry[1] : null;
        const toId = linkEntry.length > 3 ? linkEntry[3] : null;
        const fromValid = typeof fromId === "string" || typeof fromId === "number";
        const toValid = typeof toId === "string" || typeof toId === "number";
        if (fromValid && toValid) {
          return { fromId, toId };
        }
        return null;
      }
  
      if (!linkEntry || typeof linkEntry !== "object") {
        return null;
      }
  
      const raw = linkEntry as Record<string, unknown>;
      const fromId = raw.origin_id ?? raw.from ?? raw.from_id ?? raw["1"] ?? null;
      const toId = raw.target_id ?? raw.to ?? raw.to_id ?? raw["3"] ?? null;
      const fromValid = typeof fromId === "string" || typeof fromId === "number";
      const toValid = typeof toId === "string" || typeof toId === "number";
      if (!fromValid || !toValid) {
        return null;
      }
  
      return {
        fromId,
        toId
      };
    };

  (FactSimRuntimeClass.prototype as any).hasDirectedCycle = function (this: any, adjacency: Map<string, Set<string>>): boolean {
      const state = new Map<string, 0 | 1 | 2>();
  
      const visit = (node: string): boolean => {
        const currentState = state.get(node) ?? 0;
        if (currentState === 1) return true;
        if (currentState === 2) return false;
  
        state.set(node, 1);
        for (const next of adjacency.get(node) ?? []) {
          if (visit(next)) {
            return true;
          }
        }
        state.set(node, 2);
        return false;
      };
  
      for (const key of adjacency.keys()) {
        if ((state.get(key) ?? 0) === 0 && visit(key)) {
          return true;
        }
      }
  
      return false;
    };

  (FactSimRuntimeClass.prototype as any).summarizeBenchmark = function (this: any, result: BenchmarkOutput): ScenarioBenchmarkSummary {
      const speedFor = (mode: string, renderCase: string): number | null => {
        const row = result.results.find((item) => item.mode === mode && item.renderCase === renderCase);
        if (!row || !Number.isFinite(row.speed)) return null;
        return Number(row.speed);
      };

      const headlessByMode: Record<string, number | null> = {};
      const renderByMode: Record<string, number | null> = {};
      const modeSet = new Set<string>();
      for (const row of result.results) {
        if (row && typeof row.mode === "string" && row.mode.trim()) {
          modeSet.add(row.mode.trim());
        }
      }
      for (const mode of modeSet) {
        headlessByMode[mode] = speedFor(mode, "headless");
        renderByMode[mode] = speedFor(mode, "render");
      }
  
      const headlessDtSpeed = speedFor("dt", "headless");
      const headlessEventSpeed = speedFor("event", "headless");
      const renderDtSpeed = speedFor("dt", "render");
      const renderEventSpeed = speedFor("event", "render");
  
      const headlessCandidates = Object.entries(headlessByMode)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .map(([mode, speed]) => ({ mode, speed }));
  
      const bestHeadless =
        headlessCandidates.length > 0
          ? headlessCandidates.reduce((best, current) => (current.speed > best.speed ? current : best))
          : null;
  
      return {
        bestHeadlessMode: bestHeadless?.mode ?? null,
        bestHeadlessSpeed: bestHeadless?.speed ?? null,
        headlessDtSpeed,
        headlessEventSpeed,
        renderDtSpeed,
        renderEventSpeed,
        headlessByMode,
        renderByMode
      };
    };

  (FactSimRuntimeClass.prototype as any).waitForAppGraph = async function (this: any, page: Page): Promise<void> {
      await page.waitForFunction(() => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as { graph?: unknown } | undefined;
        return !!app?.graph;
      }, undefined, { timeout: 30000 });
    };

  (FactSimRuntimeClass.prototype as any).getAppUrl = function (this: any, cacheBust?: string): string {
      const suffix = String(cacheBust ?? "").trim();
      const query = suffix ? `?skipLanding=1&v=${encodeURIComponent(suffix)}` : "?skipLanding=1";
      return `http://127.0.0.1:${this.port}/index.html${query}`;
    };

  (FactSimRuntimeClass.prototype as any).pageHasHeadlessTools = async function (
      this: any,
      page: Page,
      requiredModes?: string[]
    ): Promise<boolean> {
      return page.evaluate((requestedModes: unknown) => {
        const w = window as unknown as Record<string, unknown>;
        const app = w.App as
          | {
              runEngineBenchmarkAsync?: unknown;
              runEngineTestsAsync?: unknown;
              createHeadlessSimRunner?: unknown;
              getBenchmarkSimModes?: unknown;
              getEngineTestModes?: unknown;
              normalizeHeadlessSimMode?: unknown;
            }
          | undefined;

        if (
          !app
          || typeof app.runEngineBenchmarkAsync !== "function"
          || typeof app.runEngineTestsAsync !== "function"
          || typeof app.createHeadlessSimRunner !== "function"
          || typeof app.getBenchmarkSimModes !== "function"
          || typeof app.getEngineTestModes !== "function"
        ) {
          return false;
        }

        const rawRequired = Array.isArray(requestedModes) ? requestedModes : [];
        if (!rawRequired.length) return true;

        const normalize = typeof app.normalizeHeadlessSimMode === "function"
          ? app.normalizeHeadlessSimMode as (mode: unknown) => string
          : (mode: unknown) => String(mode ?? "").trim().toLowerCase();
        const supported = new Set(
          (app.getEngineTestModes as () => unknown[])()
            .map((mode) => normalize(mode))
            .filter((mode) => !!mode)
        );
        return rawRequired.every((mode) => supported.has(normalize(mode)));
      }, Array.isArray(requiredModes) ? requiredModes : []);
    };

  (FactSimRuntimeClass.prototype as any).reloadPage = async function (this: any): Promise<Page> {
      const page = await this.ensureReady();
      const cacheBust = Date.now().toString(36);
      await page.goto(this.getAppUrl(cacheBust), { waitUntil: "domcontentloaded", timeout: 30000 });
      await this.waitForAppGraph(page);
      return page;
    };

  (FactSimRuntimeClass.prototype as any).ensureHeadlessToolsReady = async function (
      this: any,
      requiredModes?: string[]
    ): Promise<Page> {
      const page = await this.ensureReady();
      if (await this.pageHasHeadlessTools(page, requiredModes)) {
        return page;
      }

      const reloaded = await this.reloadPage();
      if (await this.pageHasHeadlessTools(reloaded, requiredModes)) {
        return reloaded;
      }

      throw new Error("Headless benchmark/test capabilities are not available after page reload");
    };

  (FactSimRuntimeClass.prototype as any).resolveSnapshotPath = function (this: any, fileName?: string): string {
      const trimmed = String(fileName ?? "").trim();
      if (!trimmed) {
        return path.resolve(process.cwd(), "tmp", "fact-sim-snapshot-" + Date.now() + ".png");
      }
  
      const normalized = trimmed.replace(/\\/g, "/");
      const hasPngExt = normalized.toLowerCase().endsWith(".png");
      const withExt = hasPngExt ? normalized : normalized + ".png";
      if (path.isAbsolute(withExt)) {
        return path.normalize(withExt);
      }
  
      return path.resolve(process.cwd(), withExt);
    };

  (FactSimRuntimeClass.prototype as any).resolveHtmlPath = function (this: any, fileName?: string): string {
      const trimmed = String(fileName ?? "").trim();
      if (!trimmed) {
        return path.resolve(process.cwd(), "artifacts", "fact-sim-export-" + Date.now() + ".html");
      }
  
      const normalized = trimmed.replace(/\\/g, "/");
      const hasHtmlExt = normalized.toLowerCase().endsWith(".html");
      const withExt = hasHtmlExt ? normalized : normalized + ".html";
      if (path.isAbsolute(withExt)) {
        return path.normalize(withExt);
      }
  
      return path.resolve(process.cwd(), withExt);
    };

  (FactSimRuntimeClass.prototype as any).resolveAbsolutePath = function (this: any, filePath: string): string {
      const trimmed = String(filePath ?? "").trim();
      if (!trimmed) {
        throw new Error("filePath is required");
      }
  
      if (path.isAbsolute(trimmed)) {
        return path.normalize(trimmed);
      }
  
      return path.resolve(process.cwd(), trimmed);
    };

  (FactSimRuntimeClass.prototype as any).resolveCsvPath = function (this: any, fileName?: string): string {
      const trimmed = String(fileName ?? "").trim();
      if (!trimmed) {
        return path.resolve(process.cwd(), "artifacts", "fact-sim-timeline-" + Date.now() + ".csv");
      }
  
      const normalized = trimmed.replace(/\\/g, "/");
      const withExt = normalized.toLowerCase().endsWith(".csv") ? normalized : normalized + ".csv";
      return this.resolveAbsolutePath(withExt);
    };

  (FactSimRuntimeClass.prototype as any).resolveJsonPath = function (this: any, fileName?: string): string {
      const trimmed = String(fileName ?? "").trim();
      if (!trimmed) {
        return path.resolve(process.cwd(), "artifacts", "fact-sim-graph-" + Date.now() + ".json");
      }
  
      const normalized = trimmed.replace(/\\/g, "/");
      const withExt = normalized.toLowerCase().endsWith(".json") ? normalized : normalized + ".json";
      return this.resolveAbsolutePath(withExt);
    };

  (FactSimRuntimeClass.prototype as any).resolveReportPath = function (this: any, fileName?: string): string {
      const trimmed = String(fileName ?? "").trim();
      if (!trimmed) {
        return path.resolve(process.cwd(), "artifacts", "fact-sim-report-" + Date.now() + ".json");
      }
  
      const normalized = trimmed.replace(/\\/g, "/");
      const withExt = normalized.toLowerCase().endsWith(".json") ? normalized : normalized + ".json";
      return this.resolveAbsolutePath(withExt);
    };

  (FactSimRuntimeClass.prototype as any).ensureReady = async function (this: any): Promise<Page> {
      if (this.page) return this.page;
  
      if (!this.initializing) {
        this.initializing = this.initialize();
      }
      await this.initializing;
  
      if (!this.page) {
        throw new Error("fact_sim page failed to initialize");
      }
      return this.page;
    };

  (FactSimRuntimeClass.prototype as any).initialize = async function (this: any): Promise<void> {
      try {
        await this.ensureStaticServer();
        this.browser = await chromium.launch({
          headless: true
        });
        this.browserContext = await this.browser.newContext({
          viewport: { width: 1440, height: 900 }
        });
        this.page = await this.browserContext.newPage();
  
        const appUrl = this.getAppUrl("bootstrap");
        await this.page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await this.waitForAppGraph(this.page);
      } catch (error) {
        await this.close();
        const message = toErrorMessage(error);
        throw new Error(
          `Failed to initialize fact_sim runtime: ${message}. If Chromium is missing, run "npx playwright install chromium" in fact_sim/mcp.`
        );
      }
    };

  (FactSimRuntimeClass.prototype as any).ensureStaticServer = async function (this: any): Promise<void> {
      if (this.staticServer) return;
  
      this.staticServer = createServer((req, res) => {
        void this.handleStaticRequest(req, res);
      });
  
      try {
        this.port = await this.listenServer(this.staticServer, this.preferredPort);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "EADDRINUSE") {
          throw error;
        }
        this.port = await this.listenServer(this.staticServer, 0);
      }
  
      this.logger("local static server is ready", { port: this.port, root: this.repoRoot });
    };

  (FactSimRuntimeClass.prototype as any).listenServer = async function (this: any, server: ReturnType<typeof createServer>, port: number): Promise<number> {
      return new Promise<number>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          const address = server.address() as AddressInfo | null;
          if (!address) {
            reject(new Error("Static server failed to bind"));
            return;
          }
          resolve(address.port);
        };
  
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
    };

  (FactSimRuntimeClass.prototype as any).handleStaticRequest = async function (this: any, req: IncomingMessage, res: ServerResponse): Promise<void> {
      const method = req.method ?? "GET";
      if (method !== "GET" && method !== "HEAD") {
        res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Method Not Allowed");
        return;
      }
  
      let pathname = "/";
      try {
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        pathname = decodeURIComponent(requestUrl.pathname || "/");
      } catch (_error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Bad Request");
        return;
      }
  
      if (pathname === "/") pathname = "/index.html";
      const candidatePath = path.resolve(this.repoRoot, `.${pathname}`);
      const relative = path.relative(this.repoRoot, candidatePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }
  
      let finalPath = candidatePath;
      try {
        const st = await stat(finalPath);
        if (st.isDirectory()) {
          finalPath = path.join(finalPath, "index.html");
        }
        await access(finalPath);
      } catch (_error) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }
  
      const headers = { "Content-Type": getMimeType(finalPath) };
      if (method === "HEAD") {
        res.writeHead(200, headers);
        res.end();
        return;
      }
  
      res.writeHead(200, headers);
      const stream = createReadStream(finalPath);
      stream.on("error", (error) => {
        this.logger("static file stream error", toErrorMessage(error));
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        }
        res.end("Internal Server Error");
      });
      stream.pipe(res);
    };
}
