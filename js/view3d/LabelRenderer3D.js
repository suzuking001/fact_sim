(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  class LabelRenderer3D {
    constructor(scene){ this.scene = scene; this.labels = new Map(); this.enabled = true; }
    update(node, parent, height){
      const B = root.BABYLON;
      let entry = this.labels.get(node.id);
      if(!entry){
        const mesh = B.MeshBuilder.CreatePlane('label:' + node.id, { width:2.8, height:0.7 }, this.scene);
        mesh.parent = parent; mesh.isPickable = false; mesh.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
        const texture = new B.DynamicTexture('label-text:' + node.id, { width:512, height:128 }, this.scene, false);
        texture.hasAlpha = true;
        const material = new B.StandardMaterial('label-material:' + node.id, this.scene);
        material.diffuseTexture = texture; material.opacityTexture = texture;
        material.emissiveColor = B.Color3.White(); material.disableLighting = true; material.backFaceCulling = false;
        mesh.material = material;
        entry = { mesh, texture, material, text:'' }; this.labels.set(node.id, entry);
      }
      entry.mesh.position.y = height + 0.6;
      entry.mesh.setEnabled(this.enabled);
      const text = node.name + '\n' + node.kind.toUpperCase() + ' · ' + node.state;
      if(entry.text === text) return;
      entry.text = text;
      const ctx = entry.texture.getContext();
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#202124'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 54px sans-serif'; ctx.fillText(node.name, 256, 38, 490);
      ctx.font = '42px sans-serif'; ctx.fillText(node.kind.toUpperCase() + ' · ' + node.state, 256, 94, 490);
      entry.texture.update();
    }
    setEnabled(enabled){ this.enabled = !!enabled; for(const entry of this.labels.values()) entry.mesh.setEnabled(this.enabled); }
    remove(id){
      const entry = this.labels.get(id); if(!entry) return;
      entry.mesh.dispose(); entry.texture.dispose(); entry.material.dispose(); this.labels.delete(id);
    }
    dispose(){ for(const id of this.labels.keys()) this.remove(id); }
  }
  view3d.LabelRenderer3D = LabelRenderer3D;
})(window);
