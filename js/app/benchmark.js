// Benchmark helpers for simulation engines

var App = window.App || (window.App = {});

(function(){
  function nowSimMs(){
    return (typeof window.simNow === 'function') ? window.simNow() : 0;
  }

  function normalizeRenderCase(value){
    const v = String(value || '').toLowerCase();
    if(v === 'render' || v === 'with-render' || v === 'draw' || v === 'on' || v === 'true' || v === '1'){
      return 'render';
    }
    return 'headless';
  }

  function getRenderCaseLabel(renderCase){
    return (renderCase === 'render') ? 'render:on' : 'render:off';
  }

  function getDefaultRenderViewport(){
    const fallback = { width: 1280, height: 720 };
    const canvasEl = App.canvas && App.canvas.canvas;
    if(!canvasEl) return fallback;

    const rect = canvasEl.getBoundingClientRect ? canvasEl.getBoundingClientRect() : null;
    const width = Math.max(
      320,
      Math.round((rect && rect.width) || canvasEl.clientWidth || canvasEl.width || fallback.width)
    );
    const height = Math.max(
      200,
      Math.round((rect && rect.height) || canvasEl.clientHeight || canvasEl.height || fallback.height)
    );
    return { width, height };
  }

  function createRenderHarness(graph, options){
    const opts = options || {};
    const viewport = getDefaultRenderViewport();
    const width = Math.max(320, Number(opts.renderWidth) || viewport.width);
    const height = Math.max(200, Number(opts.renderHeight) || viewport.height);

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-20000px';
    host.style.top = '-20000px';
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';

    const el = document.createElement('canvas');
    el.width = width;
    el.height = height;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    host.appendChild(el);
    document.body.appendChild(host);

    const canvas = new LGraphCanvas(el, graph);
    canvas.read_only = true;
    canvas.allow_dragcanvas = false;
    if(typeof canvas.resize === 'function') canvas.resize(width, height);
    if(typeof canvas.stopRendering === 'function') canvas.stopRendering();

    return {
      draw: ()=>{
        try{ canvas.draw(true, true); }catch(_e){}
      },
      dispose: ()=>{
        try{
          if(typeof canvas.destroy === 'function') canvas.destroy();
          else{
            if(typeof canvas.stopRendering === 'function') canvas.stopRendering();
            if(typeof canvas.setGraph === 'function') canvas.setGraph(null);
            if(typeof canvas.clear === 'function') canvas.clear();
          }
        }catch(_e){}
        try{
          if(host.parentNode) host.parentNode.removeChild(host);
        }catch(_e){}
      }
    };
  }

  function createBenchmarkConfig(options){
    const opts = options || {};
    const wallMs = Math.max(100, Number(opts.wallMs) || 1200);
    const realStepMs = Math.max(1, Number(opts.realStepMs) || 16);
    const requestedModes = (Array.isArray(opts.modes) && opts.modes.length)
      ? opts.modes
      : ['dt', 'event'];
    const requestedRenderCases = (Array.isArray(opts.renderCases) && opts.renderCases.length)
      ? opts.renderCases
      : ((opts.includeRender === false) ? ['headless'] : ['headless', 'render']);
    const modes = requestedModes
      .map(m=> App.normalizeSimMode(m))
      .filter((m, i, arr)=> arr.indexOf(m) === i);
    const renderCases = requestedRenderCases
      .map(normalizeRenderCase)
      .filter((m, i, arr)=> arr.indexOf(m) === i);

    const runs = [];
    for(const renderCase of renderCases){
      for(const mode of modes){
        runs.push({ mode, renderCase });
      }
    }
    return { opts, wallMs, realStepMs, modes, renderCases, runs };
  }

  function createBenchmarkRunContext(){
    if(!App.graph) throw new Error('graph is not initialized');
    const snapshot = App.graph.serialize();
    if(App.stopGroups && typeof App.stopGroups.injectSerializedData === 'function'){
      App.stopGroups.injectSerializedData(snapshot, App.graph);
    }
    const originalTime = nowSimMs();
    const originalMode = App.getSimMode();
    const prevSuspendTimeline = !!App._suspendTimeline;
    const cloneData = ()=> JSON.parse(JSON.stringify(snapshot));
    return { originalTime, originalMode, prevSuspendTimeline, cloneData };
  }

  function applyBenchmarkRunContext(ctx){
    App._suspendTimeline = ctx.prevSuspendTimeline;
    App.setSimMode(ctx.originalMode);
    if(typeof window.setSimTime === 'function') window.setSimTime(ctx.originalTime);
    if(typeof window.updateSimTime === 'function') window.updateSimTime();
  }

  function rafYield(){
    return new Promise(resolve=>{
      if(typeof window.requestAnimationFrame === 'function'){
        window.requestAnimationFrame(()=> resolve());
      }else{
        setTimeout(resolve, 0);
      }
    });
  }

  App.runEngineBenchmarkAsync = async function(options){
    const { opts, wallMs, realStepMs, runs } = createBenchmarkConfig(options);
    if(!runs.length) throw new Error('benchmark runs are empty');
    const yieldEveryMs = Math.max(8, Number(opts.yieldEveryMs) || 24);
    const onProgress = (typeof opts.onProgress === 'function') ? opts.onProgress : null;
    const ctx = createBenchmarkRunContext();
    const results = [];

    const emitProgress = (value, info)=>{
      if(!onProgress) return;
      try{
        const clamped = Math.max(0, Math.min(1, Number(value) || 0));
        onProgress(clamped, info || null);
      }catch(_e){}
    };

    try{
      App._suspendTimeline = true;
      emitProgress(0);

      for(let runIndex = 0; runIndex < runs.length; runIndex++){
        const run = runs[runIndex];
        const mode = run.mode;
        const renderCase = run.renderCase;
        const renderLabel = getRenderCaseLabel(renderCase);
        const progressInfo = {
          mode,
          modeLabel: App.getSimModeLabel(mode),
          renderCase,
          renderLabel,
          runIndex,
          totalRuns: runs.length
        };

        const graph = new LGraph();
        const data = ctx.cloneData();
        graph.configure(data);
        if(App.repairGraphLinks && typeof App.repairGraphLinks === "function"){
          App.repairGraphLinks(graph);
        }
        if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
          App.stopGroups.restoreSerializedData(graph, data, false);
        }
        if(typeof configureGraphClock === 'function') configureGraphClock(graph);

        const engine = App.createSimEngine(mode, graph);
        if(engine && typeof engine.reset === 'function') engine.reset();
        const renderHarness = (renderCase === 'render') ? createRenderHarness(graph, opts) : null;

        try{
          graph.status = LGraph.STATUS_RUNNING;
          graph.starttime = LiteGraph.getTime();
          graph.last_update_time = graph.starttime;
          try{ graph.sendEventToAllNodes('onStart'); }catch(_e){}

          if(typeof window.setSimTime === 'function') window.setSimTime(0);

          const started = performance.now();
          let now = started;
          let loops = 0;

          while((now - started) < wallMs){
            const burstStarted = now;
            while((now - started) < wallMs && (now - burstStarted) < yieldEveryMs){
              if(engine && typeof engine.update === 'function') engine.update(realStepMs);
              if(renderHarness) renderHarness.draw();
              loops++;
              now = performance.now();
            }

            const runProgress = Math.min(1, (now - started) / wallMs);
            emitProgress((runIndex + runProgress) / runs.length, progressInfo);

            if((now - started) < wallMs){
              await rafYield();
              now = performance.now();
            }
          }

          const simMs = nowSimMs();
          const spentMs = Math.max(0, now - started);
          try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}

          results.push({
            mode,
            modeLabel: App.getSimModeLabel(mode),
            renderCase,
            renderLabel,
            wallMs: spentMs,
            simMs,
            loops,
            simSec: simMs / 1000,
            speed: simMs / Math.max(1, spentMs)
          });
        }finally{
          if(renderHarness) renderHarness.dispose();
        }

        emitProgress((runIndex + 1) / runs.length, progressInfo);
        await rafYield();
      }
    }finally{
      applyBenchmarkRunContext(ctx);
    }

    return {
      wallMs,
      realStepMs,
      results
    };
  };

  App.runEngineBenchmark = function(options){
    const { opts, wallMs, realStepMs, runs } = createBenchmarkConfig(options);
    if(!runs.length) throw new Error('benchmark runs are empty');
    const ctx = createBenchmarkRunContext();
    const results = [];

    try{
      App._suspendTimeline = true;
      for(const run of runs){
        const mode = run.mode;
        const renderCase = run.renderCase;
        const renderLabel = getRenderCaseLabel(renderCase);
        const graph = new LGraph();
        const data = ctx.cloneData();
        graph.configure(data);
        if(App.repairGraphLinks && typeof App.repairGraphLinks === "function"){
          App.repairGraphLinks(graph);
        }
        if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
          App.stopGroups.restoreSerializedData(graph, data, false);
        }
        if(typeof configureGraphClock === 'function') configureGraphClock(graph);

        const engine = App.createSimEngine(mode, graph);
        if(engine && typeof engine.reset === 'function') engine.reset();
        const renderHarness = (renderCase === 'render') ? createRenderHarness(graph, opts) : null;

        try{
          graph.status = LGraph.STATUS_RUNNING;
          graph.starttime = LiteGraph.getTime();
          graph.last_update_time = graph.starttime;
          try{ graph.sendEventToAllNodes('onStart'); }catch(_e){}

          if(typeof window.setSimTime === 'function') window.setSimTime(0);
          const started = performance.now();
          let now = started;
          let loops = 0;

          while((now - started) < wallMs){
            if(engine && typeof engine.update === 'function') engine.update(realStepMs);
            if(renderHarness) renderHarness.draw();
            loops++;
            now = performance.now();
          }

          const simMs = nowSimMs();
          const spentMs = Math.max(0, now - started);
          try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}

          results.push({
            mode,
            modeLabel: App.getSimModeLabel(mode),
            renderCase,
            renderLabel,
            wallMs: spentMs,
            simMs,
            loops,
            simSec: simMs / 1000,
            speed: simMs / Math.max(1, spentMs)
          });
        }finally{
          if(renderHarness) renderHarness.dispose();
        }
      }
    }finally{
      applyBenchmarkRunContext(ctx);
    }

    return {
      wallMs,
      realStepMs,
      results
    };
  };
})();


