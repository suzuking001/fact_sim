// UI / lifecycle boundary. Public methods also support future agent commands.
(function(root){
  'use strict';
  const App = root.App, view3d = root.FactSim3D;
  class View3DController {
    constructor(){
      this.panel = document.getElementById('view3dPanel');
      this.canvas = document.getElementById('view3dCanvas');
      this.status = document.getElementById('view3dStatus');
      this.message = document.getElementById('view3dMessage');
      this.visible = false; this.viewer = null; this.pending = null; this.timer = null;
      this.listeners = new AbortController();
      const options = { signal:this.listeners.signal };
      document.querySelectorAll('[data-visualization-view]').forEach(button => {
        button.addEventListener('click', () => this.setView(button.dataset.visualizationView), options);
      });
      const tabs = [...document.querySelectorAll('#visualizationTabs [role="tab"]')];
      tabs.forEach((button, index) => button.addEventListener('keydown', event => {
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const target = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + 1) % tabs.length];
        target.focus(); this.setView(target.dataset.visualizationView);
      }, options));
      document.querySelectorAll('[data-camera3d]').forEach(button => {
        button.addEventListener('click', () => this.setCamera(button.dataset.camera3d), options);
      });
      document.getElementById('view3dLabels').addEventListener('change', event => this.viewer?.labels.setEnabled(event.target.checked), options);
      document.getElementById('view3dConnections').addEventListener('change', event => this.viewer?.connections.setEnabled(event.target.checked), options);
      document.getElementById('view3dRetry').addEventListener('click', () => this.show(), options);
      root.addEventListener('factsim:run-state-changed', () => {
        // Core dispatches this before completing its suppression / clock update.
        queueMicrotask(() => this.syncActivity(true));
      }, options);
      root.addEventListener('factsim:graph-applied', () => {
        if(this.viewer) this.viewer.graphKey = null;
        this.syncActivity(true);
      }, options);
      document.addEventListener('visibilitychange', () => this.syncActivity(true), options);
      root.addEventListener('resize', () => this.resizeLayout(), options);
      root.addEventListener('pagehide', event => { if(event.persisted) this.hide(); else this.dispose(); }, options);
      root.addEventListener('pageshow', event => { if(event.persisted && document.body.classList.contains('view3d-active')) this.show(); }, options);
      this.bodyObserver = new MutationObserver(() => { this.resizeLayout(); this.syncActivity(); });
      this.bodyObserver.observe(document.body, { attributes:true, attributeFilter:['class'] });
      this.layoutObserver = new ResizeObserver(() => this.resizeLayout());
      for(const id of ['sidebar','timelineDock','aiPanel','view3dToolbar']) this.layoutObserver.observe(document.getElementById(id));
      this.resizeLayout();
    }
    resizeLayout(){
      if(this.disposed) return;
      const body = document.body, mobile = body.classList.contains('mobile-ui');
      const sidebar = document.getElementById('sidebar'), dock = document.getElementById('timelineDock');
      const ai = document.getElementById('aiPanel'), toolbar = document.getElementById('view3dToolbar');
      const nav = document.getElementById(mobile ? 'mobileNav' : 'tabletActionBar');
      // The dock's computed height can exceed --timeline-height when Details is
      // expanded. Observe the actual panels rather than duplicating UI rules.
      const left = body.classList.contains('sidebar-hidden') || mobile ? 0 : sidebar.offsetLeft + sidebar.offsetWidth;
      const right = body.classList.contains('ai-panel-open') && !mobile ? ai.offsetWidth : 0;
      const bottom = mobile ? nav.offsetHeight : Math.max(body.classList.contains('timeline-hidden') ? 0 : dock.offsetHeight,
        body.classList.contains('tablet-ui') ? nav.offsetHeight : 0);
      const top = Math.max(196, toolbar.getBoundingClientRect().bottom + 8);
      for(const [key, value] of Object.entries({ left, right, bottom, top })){
        const next = value + 'px'; if(this.panel.style[key] !== next) this.panel.style[key] = next;
      }
      this.viewer?.resize();
    }
    shouldPause(){
      return !this.visible || document.hidden || !document.body.classList.contains('landing-hidden') ||
        (root.isSimRunning?.() && root.isFastestMode?.()) || App.isRenderSuppressed?.() ||
        (document.body.classList.contains('mobile-ui') &&
          (!document.body.classList.contains('timeline-hidden') || !document.body.classList.contains('sidebar-hidden')));
    }
    setView(view){
      const is3d = view === '3d';
      document.body.classList.toggle('view3d-active', is3d);
      this.panel.hidden = !is3d;
      const graph = document.getElementById('graph');
      graph.setAttribute('aria-hidden', is3d ? 'true' : 'false');
      document.querySelectorAll('#visualizationTabs [role="tab"]').forEach(button => {
        const active = button.dataset.visualizationView === (is3d ? '3d' : 'graph');
        button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      });
      if(is3d) this.show();
      else { this.hide(); App.canvas?.setDirty?.(true, true); }
      App.syncMobileUiState?.();
    }
    initialize(){
      if(this.viewer) return Promise.resolve(this.viewer);
      if(this.pending) return this.pending;
      const viewer = new view3d.Viewer3D(this.canvas, {
        getState:() => App.getVisualizationState(), shouldPause:() => this.shouldPause(),
        onSelect:(id, additive) => { App.visualization.selectNode(id, additive); this.syncActivity(true); },
        onState:state => { this.status.textContent = `Time ${state.time.toFixed(2)} s · ${state.nodes.length} nodes · ${state.works.length} works`; }
      });
      this.message.hidden = false; this.message.querySelector('p').textContent = 'Loading 3D viewer…';
      document.getElementById('view3dRetry').hidden = true;
      this.pending = viewer.initialize().then(() => {
        if(this.disposed){ viewer.dispose(); return null; }
        this.viewer = viewer; this.message.hidden = true;
        viewer.labels.setEnabled(document.getElementById('view3dLabels').checked);
        viewer.connections.setEnabled(document.getElementById('view3dConnections').checked);
        return viewer;
      }).catch(error => {
        viewer.dispose();
        if(!this.disposed){
          this.message.hidden = false; this.message.querySelector('p').textContent = '3D Viewer could not be initialized. ' + error.message;
          document.getElementById('view3dRetry').hidden = false;
        }
        return null;
      }).finally(() => { this.pending = null; });
      return this.pending;
    }
    async show(){
      if(this.disposed) return;
      this.visible = true;
      await this.initialize();
      if(!this.visible || this.disposed || !this.viewer) return;
      if(!this.timer) this.timer = setInterval(() => this.syncActivity(), 120);
      this.resizeLayout(); this.viewer.resize(); this.syncActivity(true);
    }
    hide(){ this.visible = false; clearInterval(this.timer); this.timer = null; this.viewer?.stop(); }
    syncActivity(force = false){
      if(!this.visible || !this.viewer || this.disposed) return;
      const paused = this.shouldPause();
      if(paused){
        this.viewer.stop();
        if(root.isSimRunning?.() && root.isFastestMode?.()) this.status.textContent = 'FASTEST · 3D rendering paused';
        return;
      }
      if(force || !this.viewer.active){
        this.viewer.resize(); this.viewer.update(App.getVisualizationState());
      }
      this.viewer.start();
    }
    setCamera(mode){
      if(!this.viewer) return;
      if(mode === 'top') this.viewer.camera.top();
      else if(mode === 'perspective') this.viewer.camera.perspective();
      else if(mode === 'focus'){
        const id = App.visualization.getSelection()[0];
        if(id === undefined || !this.viewer.focus(id)) App.showToast('Select a node to focus');
      }else this.viewer.fit();
      document.querySelectorAll('[data-camera3d="top"], [data-camera3d="perspective"]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.camera3d === this.viewer.camera.mode));
      });
    }
    dispose(){
      this.hide(); this.disposed = true; this.listeners.abort(); this.bodyObserver.disconnect(); this.layoutObserver.disconnect(); this.viewer?.dispose(); this.viewer = null;
    }
  }
  view3d.View3DController = View3DController;
  App.view3d = new View3DController();
})(window);
