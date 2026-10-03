(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  // Models are optional. Unknown keys always use the corresponding primitive.
  class ModelRegistry {
    constructor(){ this.models = new Map(); }
    register(key, source){
      if(!key || !source) throw new Error('Model key and URL or File are required.');
      this.models.set(String(key), source);
    }
    get(key){ return this.models.get(String(key)); }
  }
  view3d.ModelRegistry = ModelRegistry;
  view3d.models = new ModelRegistry();
})(window);
