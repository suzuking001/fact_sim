import type { FactSimRuntime } from "../fact-sim-runtime.js";

// Live edits preserve active Entities and timer start times.
export function registerRuntimeMethodsGroup09(FactSimRuntimeClass: typeof FactSimRuntime, _helpers: Record<string, unknown>): void {
  (FactSimRuntimeClass.prototype as any).updateNode = async function (this: any, nodeId: string | number, title?: string, properties?: Record<string, unknown>, mergeProperties = true) {
    const page = await this.ensureReady();
    return page.evaluate(({ nodeId, title, properties, mergeProperties }: any) => {
      const app = (window as any).App, graph = app.graph, node = graph.getNodeById(nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);
      if (title === undefined && !properties) throw new Error("Supply title and/or properties.");
      app.FlowModel.pause();
      const next = properties ? { ...(mergeProperties ? node.properties : {}), ...properties } : node.properties;
      if (node.type === 'factory/basic' && (next.basicNodeVersion !== 3 || next.flow?.version !== 2)) throw new Error("Basic Node version 3 and Flow version 2 are required.");
      const holding = node._flowRuntime?.cells?.length || node._flowRuntime?.offers?.length;
      if (holding && Object.keys(properties || {}).some(key => !['flow', 'description'].includes(key) && JSON.stringify(next[key]) !== JSON.stringify(node.properties[key]))) throw new Error("Reset before changing properties of equipment that holds an Entity.");
      if (properties?.flow) app.FlowModel.commit(node, properties.flow);
      graph.beforeChange?.(); node.properties = next;
      if (typeof title === 'string') node.title = title;
      node.setDirtyCanvas?.(true, true); graph.afterChange?.();
      return { nodeId: node.id, nodeType: node.type || null, title: node.title || '', properties: node.properties, updatedTitle: typeof title === 'string', updatedPropertyKeys: Object.keys(properties || {}), mergedProperties: mergeProperties, nodeCount: graph._nodes.length, linkCount: Object.keys(graph.links).length };
    }, { nodeId, title, properties, mergeProperties });
  };
  (FactSimRuntimeClass.prototype as any).connectNodes = async function (this: any, fromNodeId: string | number, toNodeId: string | number, fromSlot = 0, toSlot = 0, _allowDuplicate?: boolean) {
    const page = await this.ensureReady();
    return page.evaluate(({ fromNodeId, toNodeId, fromSlot, toSlot }: any) => {
      const app = (window as any).App, graph = app.graph, from = graph.getNodeById(fromNodeId), to = graph.getNodeById(toNodeId);
      if (!from || !to) throw new Error("Connection endpoint not found.");
      if (!Number.isInteger(fromSlot) || !from.outputs?.[fromSlot] || !Number.isInteger(toSlot) || !to.inputs?.[toSlot]) throw new Error("Port slot is out of range.");
      const existing = Object.values(graph.links).find((l: any) => l.origin_id === from.id && l.target_id === to.id && l.origin_slot === fromSlot && l.target_slot === toSlot) as any;
      const result = (created: boolean, linkId: number) => ({ created, linkId, fromNodeId: from.id, toNodeId: to.id, fromSlot, toSlot, nodeCount: graph._nodes.length, linkCount: Object.keys(graph.links).length });
      if (existing) return result(false, existing.id);
      app.FlowModel.pause();
      if ([from, to].some(n => n._flowRuntime?.cells?.length || n._flowRuntime?.offers?.length)) throw new Error("Reset before changing connections that hold an Entity.");
      if (from.outputs[fromSlot].links?.length) throw new Error("Use entityRouter for multiple output destinations.");
      if (to.inputs[toSlot].link != null) throw new Error("Disconnect the occupied input before connecting another source.");
      graph.beforeChange?.(); const link = from.connect(fromSlot, to, toSlot);
      if (!link) throw new Error("Connection was rejected.");
      graph.afterChange?.(); return result(true, link.id);
    }, { fromNodeId, toNodeId, fromSlot, toSlot });
  };
  (FactSimRuntimeClass.prototype as any).disconnectNodes = async function (this: any, options: Record<string, unknown>) {
    const page = await this.ensureReady();
    return page.evaluate((options: any) => {
      const app = (window as any).App, graph = app.graph;
      const fields = { linkId: 'id', fromNodeId: 'origin_id', toNodeId: 'target_id', fromSlot: 'origin_slot', toSlot: 'target_slot' };
      const criteria = Object.entries(fields).filter(([key]) => options[key] !== undefined);
      if (!criteria.length) throw new Error("Supply a link ID or endpoint criteria.");
      const matches = (Object.values(graph.links) as any[]).filter(l => criteria.every(([key, field]) => String(l[field]) === String(options[key])));
      const selected = options.removeAllMatches ? matches : matches.slice(0, 1);
      app.FlowModel.pause();
      if (selected.some(l => [l.origin_id, l.target_id].some(id => { const r = graph.getNodeById(id)?._flowRuntime; return r?.cells?.length || r?.offers?.length; }))) throw new Error("Reset before disconnecting equipment that holds an Entity.");
      graph.beforeChange?.(); for (const link of selected) graph.removeLink(link.id); graph.afterChange?.();
      return { removedCount: selected.length, removedLinkIds: selected.map(l => l.id), nodeCount: graph._nodes.length, linkCount: Object.keys(graph.links).length };
    }, options);
  };
  (FactSimRuntimeClass.prototype as any).removeNode = async function (this: any, nodeId: string | number) {
    const page = await this.ensureReady();
    return page.evaluate((id: any) => {
      const app = (window as any).App, graph = app.graph, node = graph.getNodeById(id);
      if (!node) throw new Error(`Node not found: ${id}`);
      app.FlowModel.pause();
      const connected = (Object.values(graph.links) as any[]).filter(l => l.origin_id === node.id || l.target_id === node.id);
      if (connected.some(l => [l.origin_id, l.target_id].some(id => { const r = graph.getNodeById(id)?._flowRuntime; return r?.cells?.length || r?.offers?.length; }))) throw new Error("Reset before removing equipment connected to an active Entity.");
      const before = Object.keys(graph.links).length;
      graph.beforeChange?.(); graph.remove(node); graph.afterChange?.();
      return { removedNodeId: node.id, removedLinkCount: before - Object.keys(graph.links).length, nodeCount: graph._nodes.length, linkCount: Object.keys(graph.links).length };
    }, nodeId);
  };
}
