(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  class WorkRenderer3D {
    constructor(scene){
      const B = root.BABYLON;
      this.entries = new Map(); this.nodes = new Map(); this.sampleAt = 0; this.interval = 50;
      this.prototype = B.MeshBuilder.CreateBox('work-prototype', { size:0.24 }, scene);
      const material = new B.StandardMaterial('work-material', scene);
      material.diffuseColor = B.Color3.FromHexString('#555a64'); material.emissiveColor = B.Color3.FromHexString('#202124');
      this.prototype.material = material; this.prototype.isVisible = false; this.prototype.isPickable = false;
    }
    position(work){
      const from = view3d.graphToWorldPosition(work.fromPosition), to = view3d.graphToWorldPosition(work.toPosition);
      const a = view3d.nodeDimensions(this.nodes.get(work.from) || { size:[0,0] }).height;
      const b = view3d.nodeDimensions(this.nodes.get(work.to) || { size:[0,0] }).height;
      return new root.BABYLON.Vector3(from.x + (to.x - from.x) * work.progress,
        a + (b - a) * work.progress + 0.22, from.z + (to.z - from.z) * work.progress);
    }
    update(state, now){
      this.nodes = new Map(state.nodes.map(node => [node.id, node]));
      this.interval = Math.max(1, Math.min(100, now - this.sampleAt || 50)); this.sampleAt = now;
      const live = new Set(state.works.map(work => work.id));
      for(const [id, entry] of this.entries) if(!live.has(id)){ entry.mesh.dispose(); this.entries.delete(id); }
      for(const work of state.works){
        let entry = this.entries.get(work.id);
        const position = this.position(work);
        if(!entry){
          const mesh = this.prototype.createInstance('work:' + work.id); mesh.isPickable = false;
          mesh.position.copyFrom(position);
          entry = { mesh, work, previous:position.clone(), target:position }; this.entries.set(work.id, entry);
        }else{
          // Smooth only on the same active route. Reset, holding, and route changes
          // snap to the authoritative position, never inventing simulation time.
          const smooth = state.running && !work.stationary && !entry.work.stationary &&
            work.from === entry.work.from && work.to === entry.work.to && work.progress >= entry.work.progress;
          entry.previous = smooth ? entry.mesh.position.clone() : position.clone();
          entry.target = position; entry.work = work;
        }
      }
    }
    render(now){
      const progress = Math.max(0, Math.min(1, (now - this.sampleAt) / this.interval));
      for(const entry of this.entries.values()) root.BABYLON.Vector3.LerpToRef(entry.previous, entry.target, progress, entry.mesh.position);
    }
    dispose(){
      for(const entry of this.entries.values()) entry.mesh.dispose();
      this.entries.clear(); this.prototype.material.dispose(); this.prototype.dispose();
    }
  }
  view3d.WorkRenderer3D = WorkRenderer3D;
})(window);
