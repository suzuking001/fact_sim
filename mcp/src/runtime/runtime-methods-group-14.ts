import type { FactSimRuntime } from "../fact-sim-runtime.js";

export function registerRuntimeMethodsGroup14(
  FactSimRuntimeClass: typeof FactSimRuntime,
  _helpers: Record<string, unknown>
): void {
  (FactSimRuntimeClass.prototype as any).listEntityTypes = async function (this: any) {
    const page = await this.ensureReady();
    return page.evaluate(() => {
      const app = (window as any).App;
      const registry = app?.entityModelForGraph?.(app.graph);
      return { schemaVersion: app?.ENTITY_MODEL_SCHEMA_VERSION ?? 1, types: registry?.list?.() ?? [] };
    });
  };

  (FactSimRuntimeClass.prototype as any).getNodeContents = async function (this: any, nodeId: string | number, includeInstances?: boolean) {
    const page = await this.ensureReady();
    return page.evaluate(({ requestedNodeId, requestedInstances }: any) => {
      const app = (window as any).App;
      const node = app?.graph?.getNodeById?.(requestedNodeId) ?? app?.graph?.getNodeById?.(Number(requestedNodeId));
      if(!node) throw new Error(`Node not found: ${requestedNodeId}`);
      const current = typeof node.getCurrentContents === "function"
        ? node.getCurrentContents({ includeInstances: requestedInstances })
        : (app?.currentContentsForNode?.(node, { includeInstances: requestedInstances }) ?? { summary: [], instances: [] });
      return {
        nodeId: node.id,
        initialContents: Array.isArray(node.properties?.initialContents) ? node.properties.initialContents : [],
        current: {
          summary: current?.summary ?? [],
          instances: requestedInstances ? (current?.instances ?? []) : undefined
        }
      };
    }, { requestedNodeId: nodeId, requestedInstances: includeInstances === true });
  };

  (FactSimRuntimeClass.prototype as any).getNodeFlowRules = async function (this: any, nodeId: string | number) {
    const page = await this.ensureReady();
    return page.evaluate((requestedNodeId: any) => {
      const app = (window as any).App;
      const node = app?.graph?.getNodeById?.(requestedNodeId) ?? app?.graph?.getNodeById?.(Number(requestedNodeId));
      if(!node) throw new Error(`Node not found: ${requestedNodeId}`);
      return {
        nodeId: node.id,
        behavior: app?.basicNodeBehavior?.(node) ?? "basic",
        selection: node.properties?.selection ?? "first-available",
        inputPolicy: node.properties?.inputPolicy ?? { mode:"first", requiredPortIds:[], match:null },
        operations: Array.isArray(node.properties?.operations) ? node.properties.operations : [],
        inputRules: Array.isArray(node.properties?.inputRules) ? node.properties.inputRules : [],
        outputRules: Array.isArray(node.properties?.outputRules) ? node.properties.outputRules : []
      };
    }, nodeId);
  };

  (FactSimRuntimeClass.prototype as any).validateEntityModel = async function (this: any) {
    const page = await this.ensureReady();
    return page.evaluate(() => {
      const app = (window as any).App;
      if(typeof app?.validateEntityModel !== "function") throw new Error("Entity model API is unavailable");
      return app.validateEntityModel(app.graph);
    });
  };

  (FactSimRuntimeClass.prototype as any).previewEntityMigration = async function (this: any) {
    const page = await this.ensureReady();
    return page.evaluate(() => {
      const app = (window as any).App;
      if(typeof app?.serializeGraphData !== "function" || typeof app?.previewBasicNodeMigration !== "function") {
        throw new Error("Migration preview API is unavailable");
      }
      return app.previewBasicNodeMigration(app.serializeGraphData());
    });
  };

  (FactSimRuntimeClass.prototype as any).upsertEntityType = async function (this: any, entityType: Record<string, unknown>) {
    const page = await this.ensureReady();
    return page.evaluate((requestedType: any) => {
      const app = (window as any).App;
      const registry = app?.entityModelForGraph?.(app.graph);
      if(!registry) throw new Error("Entity Type registry is unavailable");
      const result = registry.upsert(requestedType);
      app?.refreshEntityTypeManager?.();
      return result;
    }, entityType);
  };

  (FactSimRuntimeClass.prototype as any).removeEntityType = async function (this: any, typeId: string) {
    const page = await this.ensureReady();
    return page.evaluate((requestedTypeId: any) => {
      const app = (window as any).App;
      const registry = app?.entityModelForGraph?.(app.graph);
      if(!registry) throw new Error("Entity Type registry is unavailable");
      const removed = registry.remove(requestedTypeId);
      app?.refreshEntityTypeManager?.();
      return { typeId: requestedTypeId, removed };
    }, typeId);
  };

  (FactSimRuntimeClass.prototype as any).setNodeInitialContents = async function (this: any, nodeId: string | number, initialContents: unknown[]) {
    const page = await this.ensureReady();
    return page.evaluate(({ requestedNodeId, requestedContents }: any) => {
      const app = (window as any).App;
      const node = app?.graph?.getNodeById?.(requestedNodeId) ?? app?.graph?.getNodeById?.(Number(requestedNodeId));
      if(!node) throw new Error(`Node not found: ${requestedNodeId}`);
      node.properties = node.properties || {};
      node.properties.initialContents = requestedContents.map((row: any)=>app.normalizeEntityRecipe(row));
      const store = app.runtimeInstancesForGraph(app.graph);
      const validation = store.validateInitialContents(node);
      if(!validation.ok) throw new Error(JSON.stringify(validation.errors));
      node.__initialContentsDirty = true;
      node.setDirtyCanvas?.(true, true);
      return { nodeId: node.id, initialContents: node.properties.initialContents, resetRequired: true };
    }, { requestedNodeId: nodeId, requestedContents: initialContents });
  };

  (FactSimRuntimeClass.prototype as any).setNodeFlowRules = async function (this: any, nodeId: string | number, inputRules?: unknown[], outputRules?: unknown[], nodeOperations?: unknown[], inputPolicy?: Record<string, unknown>) {
    const page = await this.ensureReady();
    return page.evaluate(({ requestedNodeId, requestedInput, requestedOutput, requestedOperations, requestedInputPolicy }: any) => {
      const app = (window as any).App;
      const node = app?.graph?.getNodeById?.(requestedNodeId) ?? app?.graph?.getNodeById?.(Number(requestedNodeId));
      if(!node) throw new Error(`Node not found: ${requestedNodeId}`);
      node.properties = node.properties || {};
      if(Array.isArray(requestedInput)) node.properties.inputRules = app.normalizeEntityRules(requestedInput, "input");
      if(Array.isArray(requestedOutput)){
        node.properties.outputRules = app.normalizeEntityRules(requestedOutput, "output");
        node.onPropertyChanged?.('outputRules');
      }
      if(Array.isArray(requestedOperations)){
        node.properties.operations = app.normalizeBasicOperations(requestedOperations);
        node.onPropertyChanged?.('operations');
      }
      if(requestedInputPolicy && typeof requestedInputPolicy === 'object') node.properties.inputPolicy = requestedInputPolicy;
      const sync = typeof app.syncBasicFlowPorts === "function"
        ? app.syncBasicFlowPorts(node, { dirty:false })
        : { created:[], warnings:["Flow port synchronization is unavailable"] };
      node.setDirtyCanvas?.(true, true);
      return {
        nodeId: node.id,
        behavior: app.basicNodeBehavior?.(node) || 'basic',
        inputPolicy: node.properties.inputPolicy,
        operations: node.properties.operations || [],
        inputRules: node.properties.inputRules || [],
        outputRules: node.properties.outputRules || [],
        inputs: (node.inputs || []).map((port: any)=>({ portId:port.portId, name:port.name, channel:port.channel || 'entity', flowManaged:!!port.flowManaged })),
        outputs: (node.outputs || []).map((port: any)=>({ portId:port.portId, name:port.name, channel:port.channel || 'entity', flowManaged:!!port.flowManaged })),
        portTimings: node.properties.portTimings || { inputs:{}, outputs:{} },
        createdPorts: sync.created || [],
        warnings: sync.warnings || []
      };
    }, { requestedNodeId: nodeId, requestedInput: inputRules, requestedOutput: outputRules, requestedOperations: nodeOperations, requestedInputPolicy: inputPolicy });
  };

  (FactSimRuntimeClass.prototype as any).applyBasicTemplate = async function (this: any, nodeId: string | number, templateId: string) {
    const page = await this.ensureReady();
    return page.evaluate(({ requestedNodeId, requestedTemplate }: any) => {
      const app = (window as any).App;
      const node = app?.graph?.getNodeById?.(requestedNodeId) ?? app?.graph?.getNodeById?.(Number(requestedNodeId));
      if(!node) throw new Error(`Node not found: ${requestedNodeId}`);
      if(typeof node.applyTemplate !== "function") throw new Error("Node is not a Basic Node");
      node.applyTemplate(requestedTemplate, false);
      node.setDirtyCanvas?.(true, true);
      const serialized = typeof node.serialize === "function" ? node.serialize() : null;
      return {
        nodeId: node.id,
        templateApplied: requestedTemplate,
        behavior: app.basicNodeBehavior?.(node),
        title: node.title,
        properties: serialized?.properties || {}
      };
    }, { requestedNodeId: nodeId, requestedTemplate: templateId });
  };

  (FactSimRuntimeClass.prototype as any).migrateCurrentGraphToBasic = async function (this: any) {
    const page = await this.ensureReady();
    return page.evaluate(() => {
      const app = (window as any).App;
      const current = app.serializeGraphData();
      const result = app.prepareSerializedGraphForSave(current);
      if(result.preview?.blocked) return result.preview;
      app.applyGraphData(result.data, { source: "migration", captureInitialState: false, fitViewport: false });
      return result.preview;
    });
  };
}
