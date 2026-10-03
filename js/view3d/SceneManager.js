(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  class SceneManager {
    constructor(engine){
      const B = root.BABYLON;
      this.scene = new B.Scene(engine);
      this.scene.clearColor = B.Color4.FromHexString('#f7f7f8ff');
      const light = new B.HemisphericLight('factory-light', new B.Vector3(0.3, 1, -0.4), this.scene);
      light.intensity = 0.95;
      this.ground = B.MeshBuilder.CreateGround('factory-ground', { width:1, height:1 }, this.scene);
      this.ground.isPickable = false;
      this.material = new B.StandardMaterial('ground-material', this.scene);
      this.material.diffuseColor = B.Color3.FromHexString('#e9eaee');
      this.material.specularColor = B.Color3.Black();
      this.ground.material = this.material;
    }
    updateBounds(bounds){
      this.ground.position.set((bounds.minX + bounds.maxX) / 2, -0.02, (bounds.minZ + bounds.maxZ) / 2);
      this.ground.scaling.set(Math.max(10, bounds.maxX - bounds.minX + 8), 1, Math.max(10, bounds.maxZ - bounds.minZ + 8));
    }
    // A layout adapter may later supply a texture without involving the core.
    setGroundTexture(texture){ this.material.diffuseTexture = texture; }
    dispose(){ this.scene.dispose(); }
  }
  view3d.SceneManager = SceneManager;
})(window);
