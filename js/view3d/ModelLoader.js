(function(root){
  'use strict';
  const view3d = root.FactSim3D;
  const base = new URL('../../', document.currentScript.src);
  let loadersPromise;
  view3d.loadScript = url => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error('Could not load 3D resource: ' + url)); };
    document.head.appendChild(script);
  });
  view3d.loadBabylon = async () => {
    if(!root.BABYLON) await view3d.loadScript(new URL('js/vendor/babylon/babylon.js', base).href);
    return root.BABYLON;
  };
  class ModelLoader {
    constructor(scene, registry = view3d.models){ this.scene = scene; this.registry = registry; this.cache = new Map(); this.disposed = false; }
    async instantiate(key, parent){
      const source = this.registry.get(key);
      if(!source) return null;
      if(!loadersPromise){
        loadersPromise = view3d.loadScript(new URL('js/vendor/babylon/babylonjs.loaders.min.js', base).href)
          .catch(error => { loadersPromise = null; throw error; });
      }
      await loadersPromise;
      if(this.disposed) return null;
      if(!this.cache.has(source)){
        const resolved = typeof source === 'string' ? new URL(source, base).href : source;
        const pending = root.BABYLON.LoadAssetContainerAsync(resolved, this.scene).then(container => {
          if(this.disposed){ container.dispose(); return null; }
          return container;
        }).catch(error => { this.cache.delete(source); throw error; });
        this.cache.set(source, pending);
      }
      const container = await this.cache.get(source);
      if(!container || this.disposed || parent.isDisposed()) return null;
      const instance = container.instantiateModelsToScene(name => key + ':' + name);
      instance.rootNodes.forEach(node => { node.parent = parent; });
      return instance;
    }
    dispose(){
      this.disposed = true;
      for(const pending of this.cache.values()) pending.then(container => container?.dispose()).catch(() => {});
      this.cache.clear();
    }
  }
  view3d.ModelLoader = ModelLoader;
})(window);
