// Benchmark helpers for simulation engines

var App = window.App || (window.App = {});

(function(){
  function normalizeBenchMode(mode){
    if(window.App && typeof App.normalizeHeadlessSimMode === 'function'){
      return App.normalizeHeadlessSimMode(mode);
    }
    if(window.App && typeof App.normalizeSimMode === 'function'){
      return App.normalizeSimMode(mode);
    }
    return String(mode || '').trim().toLowerCase() === 'event' ? 'event' : 'dt';
  }

  function getModeLabel(mode){
    if(window.App && typeof App.getHeadlessModeLabel === 'function'){
      return App.getHeadlessModeLabel(mode);
    }
    if(window.App && typeof App.getSimModeLabel === 'function'){
      return App.getSimModeLabel(mode);
    }
    return String(mode || '');
  }

  function isHeadlessOnlyMode(mode){
    return !!(window.App
      && typeof App.isHeadlessOnlyBenchmarkMode === 'function'
      && App.isHeadlessOnlyBenchmarkMode(mode));
  }

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

  function getDefaultBenchmarkModes(){
    if(window.App && typeof App.getBenchmarkSimModes === 'function'){
      const modes = App.getBenchmarkSimModes()
        .map(normalizeBenchMode)
        .filter((mode, index, arr)=> mode && arr.indexOf(mode) === index);
      if(modes.length) return modes;
    }
    if(window.App && typeof App.getSupportedSimModes === 'function'){
      const modes = App.getSupportedSimModes()
        .map(normalizeBenchMode)
        .filter((mode, index, arr)=> mode && arr.indexOf(mode) === index);
      if(modes.length) return modes;
    }
    return ['dt', 'event'];
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

    let lastDrawAt = 0;
    return {
      draw: ()=>{
        const fps = (typeof App.getRenderFps === 'function') ? Math.max(1, App.getRenderFps()) : 60;
        const intervalMs = 1000 / fps;
        const now = performance.now();
        if(lastDrawAt > 0 && (now - lastDrawAt) < intervalMs){
          return false;
        }
        lastDrawAt = now;
        try{ canvas.draw(false, false); }catch(_e){}
        return true;
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
    const wallMs = Math.max(100, Number(opts.wallMs) || 2000);
    const realStepMs = Math.max(1, Number(opts.realStepMs) || 16);
    const requestedModes = (Array.isArray(opts.modes) && opts.modes.length)
      ? opts.modes
      : getDefaultBenchmarkModes();
    const requestedRenderCases = (Array.isArray(opts.renderCases) && opts.renderCases.length)
      ? opts.renderCases
      : ((opts.includeRender === false) ? ['headless'] : ['headless', 'render']);
    const modes = requestedModes
      .map(normalizeBenchMode)
      .filter((m, i, arr)=> arr.indexOf(m) === i);
    const renderCases = requestedRenderCases
      .map(normalizeRenderCase)
      .filter((m, i, arr)=> arr.indexOf(m) === i);

    const runs = [];
    for(const mode of modes){
      const modeRenderCases = isHeadlessOnlyMode(mode)
        ? ['headless']
        : renderCases;
      for(const renderCase of modeRenderCases){
        runs.push({ mode, renderCase });
      }
    }
    return { opts, wallMs, realStepMs, modes, renderCases, runs };
  }

  function createBenchmarkRunContext(){
    if(!App.graph) throw new Error('graph is not initialized');
    const snapshot = (typeof App.serializeGraphData === 'function')
      ? App.serializeGraphData()
      : App.graph.serialize();
    if(!(typeof App.serializeGraphData === 'function')
      && App.stopGroups && typeof App.stopGroups.injectSerializedData === 'function'){
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

  function cooperativeYield(){
    return new Promise(resolve=>{
      setTimeout(resolve, 0);
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
          modeLabel: getModeLabel(mode),
          renderCase,
          renderLabel,
          runIndex,
          totalRuns: runs.length
        };

        const data = (typeof App.compactGraphData === 'function') ? App.compactGraphData(ctx.cloneData()) : ctx.cloneData();
        const useHeadlessRunner = isHeadlessOnlyMode(mode) && typeof App.createHeadlessSimRunner === 'function';
        const graph = useHeadlessRunner ? null : new LGraph();
        if(graph){
          graph.configure(data);
          if(App.repairGraphLinks && typeof App.repairGraphLinks === "function"){
            App.repairGraphLinks(graph);
          }
          if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
            App.stopGroups.restoreSerializedData(graph, data, false);
          }
          if(typeof configureGraphClock === 'function') configureGraphClock(graph);
        }

        const runner = useHeadlessRunner
          ? App.createHeadlessSimRunner(mode, data, { reason: 'benchmark', engineOptions: { benchmark: true }, seed: opts.seed })
          : App.createSimEngine(mode, graph);
        if(runner && typeof runner.reset === 'function') runner.reset();
        if(runner && typeof runner.resetAsync === 'function') await runner.resetAsync();
        const renderHarness = (renderCase === 'render') ? createRenderHarness(graph, opts) : null;

        try{
          if(runner && typeof runner.runBenchmarkCaseAsync === 'function'){
            const payload = await runner.runBenchmarkCaseAsync({
              wallMs,
              realStepMs,
              renderCase
            });
            const simMs = Number(payload && payload.simTimeMs) || 0;
            const spentMs = Math.max(0, Number(payload && payload.wallMs) || 0);
            const loops = Math.max(0, Number(payload && payload.loops) || 0);
            results.push({
              mode,
              modeLabel: getModeLabel(mode),
              renderCase,
              renderLabel,
              wallMs: spentMs,
              simMs,
              loops,
              simSec: simMs / 1000,
              speed: simMs / Math.max(1, spentMs)
            });
          }else{
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
                if(runner && typeof runner.update === 'function') runner.update(realStepMs);
                if(renderHarness) renderHarness.draw();
                loops++;
                now = performance.now();
              }

              const runProgress = Math.min(1, (now - started) / wallMs);
              emitProgress((runIndex + runProgress) / runs.length, progressInfo);

              if((now - started) < wallMs){
                await cooperativeYield();
                now = performance.now();
              }
            }
            const simMs = nowSimMs();
            const spentMs = Math.max(0, now - started);
            try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}

            results.push({
              mode,
              modeLabel: getModeLabel(mode),
              renderCase,
              renderLabel,
              wallMs: spentMs,
              simMs,
              loops,
              simSec: simMs / 1000,
              speed: simMs / Math.max(1, spentMs)
            });
          }
        }finally{
          if(renderHarness) renderHarness.dispose();
          if(runner && typeof runner.stopAsync === 'function') await runner.stopAsync();
          if(runner && typeof runner.disposeAsync === 'function') await runner.disposeAsync();
        }

        emitProgress((runIndex + 1) / runs.length, progressInfo);
        await cooperativeYield();
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
        if(isHeadlessOnlyMode(mode)){
          throw new Error(`${mode} requires runEngineBenchmarkAsync()`);
        }
        const graph = new LGraph();
        const data = (typeof App.compactGraphData === 'function') ? App.compactGraphData(ctx.cloneData()) : ctx.cloneData();
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
            modeLabel: getModeLabel(mode),
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


