(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  class NodeRenderer3D {
    constructor(scene, labels, models){ this.scene = scene; this.labels = labels; this.models = models; this.entries = new Map(); this.materials = new Map(); }
    material(color){
      if(!this.materials.has(color)){
        const B = root.BABYLON, material = new B.StandardMaterial('state:' + color, this.scene);
        material.diffuseColor = B.Color3.FromHexString(color); material.specularColor = new B.Color3(0.12, 0.12, 0.12);
        this.materials.set(color, material);
      }
      return this.materials.get(color);
    }
    update(nodes, selectedIds){
      const B = root.BABYLON, live = new Set(nodes.map(node => node.id)), selected = new Set(selectedIds);
      for(const [id, entry] of this.entries) if(!live.has(id)){
        this.labels.remove(id); entry.model?.dispose(); entry.parent.dispose(); this.entries.delete(id);
      }
      const bounds = { minX:Infinity, maxX:-Infinity, minZ:Infinity, maxZ:-Infinity, maxY:1 };
      for(const node of nodes){
        const size = view3d.nodeDimensions(node), center = view3d.nodePosition(node);
        let entry = this.entries.get(node.id);
        if(!entry){
          const parent = new B.TransformNode('node:' + node.id, this.scene);
          const mesh = B.MeshBuilder.CreateBox('equipment:' + node.id, { size:1 }, this.scene);
          mesh.parent = parent; mesh.metadata = { nodeId:node.id }; mesh.outlineWidth = 0.045;
          entry = { parent, mesh, modelKey:null, model:null, modelError:null }; this.entries.set(node.id, entry);
        }
        entry.parent.position.set(center.x, 0, center.z);
        entry.parent.rotation.y = (Number(node.view3d.rotation) || 0) * Math.PI / 180;
        entry.mesh.position.y = size.height / 2;
        entry.mesh.scaling.set(size.width, size.height, size.depth);
        entry.mesh.material = this.material(node.color);
        entry.mesh.renderOutline = selected.has(node.id);
        entry.mesh.outlineColor = B.Color3.FromHexString('#202124');
        // GLB loading is lazy and optional; a failed model keeps its primitive.
        const modelKey = node.view3d.model || '';
        if(entry.modelKey !== modelKey){
          entry.model?.dispose(); entry.model = null; entry.modelError = null; entry.mesh.visibility = 1;
          entry.modelKey = modelKey;
          if(this.models.registry.get(modelKey)) this.models.instantiate(modelKey, entry.parent).then(instance => {
            if(!instance) return;
            if(entry.parent.isDisposed() || entry.modelKey !== modelKey){ instance.dispose(); return; }
            entry.model = instance;
            instance.rootNodes.forEach(model => model.getChildMeshes().forEach(mesh => { mesh.metadata = { nodeId:node.id }; }));
            entry.mesh.visibility = 0.22; // shared state / selection envelope over optional model
          }).catch(error => { entry.modelError = error.message; });
        }
        this.labels.update(node, entry.parent, size.height);
        // Include the full rotated footprint, so Fit never cuts off equipment.
        const angle = entry.parent.rotation.y, width = Math.abs(Math.cos(angle)) * size.width + Math.abs(Math.sin(angle)) * size.depth;
        const depth = Math.abs(Math.sin(angle)) * size.width + Math.abs(Math.cos(angle)) * size.depth;
        bounds.minX = Math.min(bounds.minX, center.x - width / 2); bounds.maxX = Math.max(bounds.maxX, center.x + width / 2);
        bounds.minZ = Math.min(bounds.minZ, center.z - depth / 2); bounds.maxZ = Math.max(bounds.maxZ, center.z + depth / 2);
        bounds.maxY = Math.max(bounds.maxY, size.height + 1.2);
      }
      return nodes.length ? bounds : { minX:-5, maxX:5, minZ:-5, maxZ:5, maxY:1 };
    }
    dispose(){
      for(const entry of this.entries.values()){ entry.model?.dispose(); entry.parent.dispose(); }
      for(const material of this.materials.values()) material.dispose();
      this.entries.clear(); this.materials.clear();
    }
  }
  view3d.NodeRenderer3D = NodeRenderer3D;
})(window);
