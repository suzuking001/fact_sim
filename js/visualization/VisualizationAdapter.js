// The only visualization layer that reads LiteGraph / Flow runtime objects.
// Snapshots contain plain data; renderers never receive a graph, cell, or entity.
(function(root){
  'use strict';
  const App = root.App = root.App || {};
  const copy = value => JSON.parse(JSON.stringify(value));
  const point = value => [Number(value?.[0]) || 0, Number(value?.[1]) || 0];
  class VisualizationAdapter {
    getStateColor(state){
      return root._getNodeStatePalette(state).accent;
    }
    getSelection(){
      return Object.values(App.canvas?.selected_nodes || {}).map(node => node.id);
    }
    selectNode(id, additive = false){
      const node = App.graph?.getNodeById(id);
      if(!node || !App.canvas) return false;
      App.canvas.selected_group = null;
      App.canvas.selectNodes([node], additive);
      App.canvas.setDirty(true, true);
      App.timelineChart?.selectNodeFromGraph?.(node, { ensureVisible:true, draw:true });
      App.nodePropsPanel?.selectNodeFromGraph?.(node, { ensureVisible:true, syncTimeline:false });
      App.selectionInspector?.setNode?.(node);
      return true;
    }
    getVisualizationState(){
      const graph = App.graph;
      const timeMs = Number(root.simNow?.()) || 0;
      const nodes = (graph?._nodes || []).map(node => {
        const state = String(node._state ?? node._stateName ?? 'IDLE').toUpperCase();
        const kind = node.properties?.view3d?.kind || node.view3d?.kind ||
          (['source','sink','buffer','carrier','conveyor'].includes(node.properties?.role) ? node.properties.role :
            /carrier|shuttle|conveyor/i.test(node.title + ' ' + node.type) ? 'carrier' :
            /buffer/i.test(node.title + ' ' + node.type) ? 'buffer' : 'equipment');
        return { id:node.id, name:String(node.title || node.type || node.id), kind,
          position:point(node.pos), size:point(node.size), state, color:this.getStateColor(state),
          view3d:copy(node.view3d || node.properties?.view3d || {}) };
      });
      const connections = Object.values(graph?.links || {}).filter(Boolean).flatMap(link => {
        const from = graph.getNodeById(link.origin_id), to = graph.getNodeById(link.target_id);
        if(!from || !to) return [];
        return [{ id:link.id, from:from.id, to:to.id, kind:String(link.type || 'entity'),
          fromPosition:point(from.getConnectionPos(false, link.origin_slot)),
          toPosition:point(to.getConnectionPos(true, link.target_slot)) }];
      });
      const links = new Map(connections.map(link => [String(link.id), link]));
      const works = (root.WorkLinkAnimator?.sample(graph, timeMs) || []).map(row => {
        const link = links.get(String(row.linkId));
        const node = graph.getNodeById(row.nodeId);
        // Use exactly the same held-output rule as the 2D animation layer.
        const held = row.stationary || row.waitingOutputSlot !== undefined || !link;
        const heldPoint = held && App.canvas ? root.WorkLinkAnimator.position(App.canvas, row) : null;
        const position = held && node ? point(heldPoint ||
          [node.pos[0] + node.size[0] / 2, node.pos[1] + node.size[1] / 2]) : null;
        return { id:String(row.entityId), name:String(row.entity?.id || row.entityId), nodeId:row.nodeId,
          from:held ? row.nodeId : link.from, to:held ? row.nodeId : link.to,
          fromPosition:held ? position : link.fromPosition, toPosition:held ? position : link.toPosition,
          progress:held ? 1 : Math.max(0, Math.min(1, Number(row.progress) || 0)),
          stationary:!!held, waiting:!!row.waiting };
      }).filter(work => work.fromPosition && work.toPosition);
      return { schemaVersion:1, time:timeMs / 1000, running:!!root.isSimRunning?.(),
        fastest:!!root.isFastestMode?.(), selectedNodeIds:this.getSelection(), nodes, connections, works };
    }
  }
  App.VisualizationAdapter = VisualizationAdapter;
  App.visualization = new VisualizationAdapter();
  App.getVisualizationState = () => App.visualization.getVisualizationState();
})(window);
