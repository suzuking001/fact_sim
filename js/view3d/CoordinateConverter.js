(function(root){
  'use strict';
  const view3d = root.FactSim3D = root.FactSim3D || {};
  // One graph pixel = 0.01 world units. Graph Y maps to world Z (positive down).
  const SCALE = 0.01;
  view3d.graphToWorldPosition = (position, height = 0) => ({
    x:(Number(position?.[0]) || 0) * SCALE,
    y:Number(height) || 0,
    z:(Number(position?.[1]) || 0) * SCALE
  });
  view3d.nodeDimensions = node => {
    const size = view3d.graphToWorldPosition(node.size);
    const view = node.view3d || {};
    const scale = Math.max(0.05, Math.min(100, Number(view.scale) || 1));
    const defaultHeight = ['carrier','conveyor'].includes(node.kind) ? 0.22 : node.kind === 'buffer' ? 0.55 : 1;
    return { width:Math.max(0.5, size.x) * scale, depth:Math.max(0.5, size.z) * scale,
      height:Math.max(0.05, Math.min(100, Number(view.height) || defaultHeight)) * scale };
  };
  view3d.nodePosition = node => {
    const center = [node.position[0] + node.size[0] / 2, node.position[1] + node.size[1] / 2];
    return view3d.graphToWorldPosition(center, view3d.nodeDimensions(node).height / 2);
  };
  view3d.vector = point => new root.BABYLON.Vector3(point.x, point.y, point.z);
})(window);
