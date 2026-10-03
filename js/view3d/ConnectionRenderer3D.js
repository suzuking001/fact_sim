(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  class ConnectionRenderer3D {
    constructor(scene){ this.scene = scene; this.mesh = null; this.signature = ''; this.enabled = true; }
    update(connections){
      const signature = JSON.stringify(connections);
      if(signature === this.signature) return;
      this.signature = signature; this.mesh?.dispose(); this.mesh = null;
      if(!connections.length) return;
      const B = root.BABYLON;
      this.mesh = B.MeshBuilder.CreateLineSystem('connections', { lines:connections.map(link => [
        view3d.vector(view3d.graphToWorldPosition(link.fromPosition, 0.12)),
        view3d.vector(view3d.graphToWorldPosition(link.toPosition, 0.12))
      ]) }, this.scene);
      this.mesh.color = B.Color3.FromHexString('#888e99'); this.mesh.isPickable = false;
      this.mesh.setEnabled(this.enabled);
    }
    setEnabled(enabled){ this.enabled = !!enabled; this.mesh?.setEnabled(this.enabled); }
    dispose(){ this.mesh?.dispose(); this.mesh = null; }
  }
  view3d.ConnectionRenderer3D = ConnectionRenderer3D;
})(window);
