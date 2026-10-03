(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  class Viewer3D {
    constructor(canvas, options = {}){
      this.canvas = canvas; this.options = options; this.active = false; this.lastSample = -Infinity;
      this.frames = 0; this.snapshots = 0; this.state = null; this.graphKey = null;
      this.loop = () => {
        if(this.options.shouldPause?.()){ this.stop(); return; }
        const now = performance.now();
        if(now - this.lastSample >= 50 && this.options.getState) this.update(this.options.getState(), now);
        this.works.render(now); this.scene.render(); this.frames++;
      };
    }
    async initialize(){
      const B = await view3d.loadBabylon();
      if(this.disposed) return;
      try{
        // The engine factory is the extension point for a future WebGPU backend.
        this.engine = this.options.engineFactory ? await this.options.engineFactory(this.canvas, B) : new B.Engine(this.canvas, true, { preserveDrawingBuffer:false, stencil:true });
        this.engine.setHardwareScalingLevel(Math.max(1, (root.devicePixelRatio || 1) / 1.5));
        this.sceneManager = new view3d.SceneManager(this.engine); this.scene = this.sceneManager.scene;
        this.camera = new view3d.CameraController(this.scene, this.canvas);
        this.models = new view3d.ModelLoader(this.scene);
        this.labels = new view3d.LabelRenderer3D(this.scene);
        this.nodes = new view3d.NodeRenderer3D(this.scene, this.labels, this.models);
        this.connections = new view3d.ConnectionRenderer3D(this.scene);
        this.works = new view3d.WorkRenderer3D(this.scene);
        this.pickObserver = this.scene.onPointerObservable.add(event => {
          if(event.type !== B.PointerEventTypes.POINTERTAP) return;
          const id = event.pickInfo?.pickedMesh?.metadata?.nodeId;
          if(id !== undefined) this.options.onSelect?.(id, !!(event.event.ctrlKey || event.event.metaKey));
        });
        this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.canvas);
        this.resize();
      }catch(error){ this.dispose(); throw error; }
    }
    update(state, now = performance.now()){
      if(!this.scene || this.disposed) return;
      this.state = state; this.lastSample = now; this.snapshots++;
      this.bounds = this.nodes.update(state.nodes, state.selectedNodeIds || []);
      this.sceneManager.updateBounds(this.bounds);
      this.connections.update(state.connections); this.works.update(state, now);
      const graphKey = state.nodes.map(node => node.id).join('|');
      if(this.graphKey !== graphKey){ this.camera.fit(this.bounds); this.graphKey = graphKey; }
      this.options.onState?.(state);
    }
    start(){ if(!this.engine || this.active || this.disposed) return; this.active = true; this.engine.runRenderLoop(this.loop); }
    stop(){ this.active = false; this.engine?.stopRenderLoop(this.loop); }
    resize(){ if(this.disposed || !this.engine || !this.canvas.clientWidth || !this.canvas.clientHeight) return; this.engine.resize(); this.camera?.resize(); }
    fit(){ this.camera?.fit(this.bounds); }
    focus(id){ return this.camera?.focus(this.state?.nodes.find(node => node.id === id)) || false; }
    dispose(){
      this.stop(); this.disposed = true; this.resizeObserver?.disconnect();
      this.models?.dispose(); this.works?.dispose(); this.connections?.dispose(); this.labels?.dispose(); this.nodes?.dispose();
      this.camera?.dispose(); this.sceneManager?.dispose(); this.engine?.dispose();
      this.scene = null; this.engine = null;
    }
  }
  view3d.Viewer3D = Viewer3D;
})(window);
