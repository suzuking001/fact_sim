import type { FactSimRuntime } from "../fact-sim-runtime.js";

export function registerRuntimeMethodsGroup14(
  FactSimRuntimeClass: typeof FactSimRuntime,
  _helpers: Record<string, unknown>
): void {
  (FactSimRuntimeClass.prototype as any).addSyncroGroup = async function (this: any, name: string) {
    const page = await this.ensureReady();
    return page.evaluate((name: string) => {
      const app=(window as any).App;
      return app.FlowModel.addSyncroGroup(app.graph,name);
    },name);
  };
  (FactSimRuntimeClass.prototype as any).listEntityTypes = async function (this: any) {
    const page = await this.ensureReady();
    return page.evaluate(() => {
      const app = (window as any).App;
      const registry = app?.entityModelForGraph?.(app.graph);
      return { schemaVersion: app?.ENTITY_MODEL_SCHEMA_VERSION ?? 3, types: registry?.list?.() ?? [] };
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

  (FactSimRuntimeClass.prototype as any).getNodeFlow = async function (this: any, nodeId: string | number) {
    const page = await this.ensureReady();
    return page.evaluate((id: any) => {
      const app = (window as any).App, node = app.graph.getNodeById(id);
      if (!node) throw new Error(`Node not found: ${id}`);
      return { nodeId: node.id, role: node.properties.role, flow: node.properties.flow,
        source: node.properties.source, errors: app.FlowModel.validate(node.properties.flow, node),
        syncroGroups: app.graph.extra?.syncroGroups || [] };
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



  (FactSimRuntimeClass.prototype as any).upsertEntityType = async function (this: any, entityType: Record<string, unknown>) {
    const page = await this.ensureReady();
    return page.evaluate((requestedType: any) => {
      const app = (window as any).App;
      const registry = app?.entityModelForGraph?.(app.graph);
      if(!registry) throw new Error("Entity Type registry is unavailable");
      app.FlowModel.pause();
      app.graph.beforeChange?.();
      const result = registry.upsert(requestedType);
      app.graph.afterChange?.();
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
      app.FlowModel.pause();
      app.graph.beforeChange?.();
      const removed = registry.remove(requestedTypeId);
      app.graph.afterChange?.();
      app?.refreshEntityTypeManager?.();
      return { typeId: requestedTypeId, removed };
    }, typeId);
  };

  (FactSimRuntimeClass.prototype as any).setNodeInitialContents = async function (this: any, nodeId: string | number, initialContents: unknown[]) {
    const page = await this.ensureReady();
    return page.evaluate(({ id, contents }: any) => {
      const app = (window as any).App, node = app.graph.getNodeById(id);
      if (!node) throw new Error(`Node not found: ${id}`);
      app.FlowModel.pause();
      const recipes = contents.map((row: any) => app.normalizeEntityRecipe(row));
      const validation = app.runtimeInstancesForGraph(app.graph).validateInitialContents({ properties: { initialContents: recipes } });
      if (!validation.ok) throw new Error(JSON.stringify(validation.errors));
      app.graph.beforeChange?.();
      node.properties.initialContents = recipes;
      node.__initialContentsDirty = true;
      app.graph.afterChange?.();
      node.setDirtyCanvas?.(true, true);
      return { nodeId: node.id, initialContents: recipes, resetRequired: true };
    }, { id: nodeId, contents: initialContents });
  };

  (FactSimRuntimeClass.prototype as any).setNodeFlow = async function (this: any, nodeId: string | number, flow: Record<string, unknown>) {
    const page = await this.ensureReady();
    return page.evaluate(({ id, flow }: any) => {
      const app = (window as any).App, node = app.graph.getNodeById(id);
      if (!node) throw new Error(`Node not found: ${id}`);
      if (!flow || flow.version !== 2 || !Array.isArray(flow.nodes) || !Array.isArray(flow.links))
        throw new Error("A version 2 Flow with nodes and links is required.");
      const errors = app.FlowModel.commit(node, flow);
      app.selectionInspector?.refresh?.();
      return { nodeId: node.id, flow: node.properties.flow, errors };
    }, { id: nodeId, flow });
  };

  (FactSimRuntimeClass.prototype as any).applyBasicTemplate = async function (this: any, nodeId: string | number, templateId: string) {
    const page = await this.ensureReady();
    return page.evaluate(({ requestedNodeId, requestedTemplate }: any) => {
      const app = (window as any).App;
      const node = app?.graph?.getNodeById?.(requestedNodeId) ?? app?.graph?.getNodeById?.(Number(requestedNodeId));
      if(!node) throw new Error(`Node not found: ${requestedNodeId}`);
      if(typeof node.applyTemplate !== "function") throw new Error("Node is not a Basic Node");
      app.FlowModel.pause();
      app.graph.beforeChange?.();
      node.applyTemplate(requestedTemplate, false);
      app.graph.afterChange?.();
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


}
