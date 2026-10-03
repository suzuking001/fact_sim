(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  class CameraController {
    constructor(scene, canvas){
      const B = root.BABYLON;
      this.camera = new B.ArcRotateCamera('factory-camera', -Math.PI / 2, Math.PI / 3, 20, B.Vector3.Zero(), scene);
      this.camera.attachControl(canvas, true);
      this.camera.lowerRadiusLimit = 1;
      this.camera.upperRadiusLimit = 100000;
      this.camera.minZ = 0.01;
      this.camera.maxZ = 1000000;
      this.camera.wheelDeltaPercentage = 0.01;
      this.mode = 'perspective';
      this.bounds = { minX:-5, maxX:5, minZ:-5, maxZ:5, maxY:1 };
      this.camera.onViewMatrixChangedObservable.add(() => this.resize());
    }
    perspective(){
      const B = root.BABYLON;
      this.mode = 'perspective'; this.camera.mode = B.Camera.PERSPECTIVE_CAMERA;
      this.camera.lowerBetaLimit = 0.05; this.camera.upperBetaLimit = Math.PI / 2 - 0.03;
      this.camera.alpha = -Math.PI / 2; this.camera.beta = Math.PI / 3;
      this.fit();
    }
    top(){
      this.mode = 'top'; this.camera.mode = root.BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      this.camera.alpha = -Math.PI / 2; this.camera.beta = 0.001;
      this.camera.lowerBetaLimit = 0.001; this.camera.upperBetaLimit = 0.001;
      this.fit();
    }
    fit(bounds = this.bounds){
      this.bounds = bounds;
      const camera = this.camera, engine = camera.getScene().getEngine();
      const aspect = Math.max(0.1, engine.getRenderWidth() / Math.max(1, engine.getRenderHeight()));
      const dx = Math.max(3, bounds.maxX - bounds.minX), dz = Math.max(3, bounds.maxZ - bounds.minZ), dy = bounds.maxY || 1;
      camera.setTarget(new root.BABYLON.Vector3((bounds.minX + bounds.maxX) / 2, dy / 2, (bounds.minZ + bounds.maxZ) / 2), false, false, true);
      camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
      camera.inertialPanningX = camera.inertialPanningY = 0;
      if(this.mode === 'top') camera.radius = Math.max(dz, dx / aspect) * 0.65;
      else {
        // Fit all eight corners in the current camera basis. A sphere is too
        // conservative for the long, shallow layouts common in factory graphs.
        const ca = Math.cos(camera.alpha), sa = Math.sin(camera.alpha), cb = Math.cos(camera.beta), sb = Math.sin(camera.beta);
        const tanV = Math.tan(camera.fov / 2), tanH = tanV * aspect;
        let distance = 1;
        for(const x of [-dx / 2, dx / 2]) for(const y of [-dy / 2, dy / 2]) for(const z of [-dz / 2, dz / 2]){
          const horizontal = -sa * x + ca * z, vertical = -ca * cb * x + sb * y - sa * cb * z;
          const near = ca * sb * x + cb * y + sa * sb * z;
          distance = Math.max(distance, near + Math.abs(horizontal) / tanH, near + Math.abs(vertical) / tanV);
        }
        camera.radius = distance * 1.2;
      }
      this.resize();
    }
    focus(node){
      if(!node) return false;
      const center = view3d.nodePosition(node), size = view3d.nodeDimensions(node);
      this.fit({ minX:center.x - size.width, maxX:center.x + size.width,
        minZ:center.z - size.depth, maxZ:center.z + size.depth, maxY:size.height });
      return true;
    }
    resize(){
      if(this.mode !== 'top') return;
      const engine = this.camera.getScene().getEngine();
      const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
      const extent = this.camera.radius;
      this.camera.orthoLeft = -extent * aspect; this.camera.orthoRight = extent * aspect;
      this.camera.orthoTop = extent; this.camera.orthoBottom = -extent;
    }
    dispose(){ this.camera.dispose(); }
  }
  view3d.CameraController = CameraController;
})(window);
