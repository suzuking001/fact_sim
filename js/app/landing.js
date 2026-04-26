// Landing page + loading progress controller

(function(){
  const LANDING_PREVIEW_SPEED = 8;
  const html = document.documentElement;
  const skipLanding = html.classList.contains('skip-landing');
  const body = document.body;
  const landing = document.getElementById('landing');
  const appRoot = document.getElementById('appRoot');
  const progressBar = document.getElementById('landingProgressBar');
  const progressFill = document.getElementById('landingProgressFill');
  const progressValue = document.getElementById('landingProgressValue');
  const progressLabel = document.getElementById('landingProgressLabel');
  const progressHint = document.getElementById('landingProgressHint');
  const progressState = document.getElementById('landingProgressState');
  const openBtn = document.getElementById('landingOpenBtn');
  const openButtons = Array.from(document.querySelectorAll('[data-landing-open]'));

  if(!body || !landing || !appRoot || !progressBar || !progressFill || !progressValue || !openBtn){
    return;
  }

  function clonePayload(data){
    try{
      return JSON.parse(JSON.stringify(data));
    }catch(_e){
      return null;
    }
  }

  function setStatus(label, hint, state){
    if(progressLabel && label) progressLabel.textContent = label;
    if(progressHint && hint) progressHint.textContent = hint;
    if(progressState && state) progressState.textContent = state;
  }

  function revealApp(){
    body.classList.add('landing-hidden');
    body.classList.remove('landing-preview-pending', 'landing-preview-live');
    appRoot.setAttribute('aria-hidden', 'false');
    // App initializes while landing is visible, so force a post-reveal relayout.
    window.requestAnimationFrame(()=>{
      window.requestAnimationFrame(()=>{
        try{
          window.dispatchEvent(new Event('resize'));
        }catch(_e){}
        try{
          if(window.App && App.canvas && typeof App.canvas.draw === 'function'){
            App.canvas.draw(true, true);
          }
        }catch(_e){}
        try{
          if(window.App && App.timelineChart && typeof App.timelineChart.resize === 'function'){
            App.timelineChart.resize();
          }
        }catch(_e){}
      });
    });
  }

  if(skipLanding){
    revealApp();
    return;
  }

  appRoot.setAttribute('aria-hidden', 'true');
  body.classList.add('landing-preview-pending');

  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const previewBootDeadlineMs = 18000;
  let progress = 0;
  let realTarget = 6;
  let ready = false;
  let bootstrapReady = false;
  let previewReady = false;
  let previewStarted = false;
  let opening = false;
  let animationHandle = 0;
  let previewRetryHandle = 0;
  let previewSnapshot = null;
  const startTime = performance.now();

  function setProgress(next){
    const p = Math.max(0, Math.min(100, Number(next) || 0));
    progress = p;
    const shown = Math.round(p);
    progressFill.style.width = `${p.toFixed(2)}%`;
    progressValue.textContent = `${shown}%`;
    progressBar.setAttribute('aria-valuenow', String(shown));
  }

  function enableOpen(){
    openButtons.forEach((btn)=>{
      btn.disabled = false;
      btn.setAttribute('aria-disabled', 'false');
      if(btn.tagName === 'BUTTON') btn.textContent = 'Open Simulator';
    });
  }

  function disableOpen(label){
    openButtons.forEach((btn)=>{
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      if(btn.tagName === 'BUTTON' && label) btn.textContent = label;
    });
  }

  function maybeAllowOpen(){
    if(ready || !bootstrapReady || !previewReady) return;
    ready = true;
    body.classList.add('landing-preview-live');
    body.classList.remove('landing-preview-pending');
    setStatus(
      'Live preview ready',
      'The simulation is already running behind this glass surface. Opening the editor resets the model to its initial state.',
      'Preview'
    );
    enableOpen();
  }

  function markBootstrapReady(){
    if(bootstrapReady) return;
    bootstrapReady = true;
    maybeAllowOpen();
  }

  function markPreviewReady(){
    if(previewReady) return;
    previewReady = true;
    body.classList.add('landing-preview-live');
    body.classList.remove('landing-preview-pending');
    maybeAllowOpen();
  }

  function focusEditorChrome(){
    const firstFocus = document.getElementById('sidebarDragRail') || document.getElementById('btnStart');
    if(firstFocus && typeof firstFocus.focus === 'function'){
      try{ firstFocus.focus({ preventScroll:true }); }catch(_e){ firstFocus.focus(); }
    }
  }

  function canStartPreview(){
    if(opening || body.classList.contains('landing-hidden')) return false;
    if(!window.App || !App.graph || !App.canvas) return false;
    if(typeof App.serializeGraphData !== 'function' || typeof App.applyGraphData !== 'function') return false;
    if(typeof window.startSimulation !== 'function' || typeof window.stopSimulation !== 'function') return false;
    const revision = (typeof App.getGraphLoadRevision === 'function')
      ? App.getGraphLoadRevision()
      : (Number(App._graphLoadRevision) || 0);
    if(revision <= 0) return false;
    if(!Array.isArray(App.graph._nodes) || !App.graph._nodes.length) return false;
    return true;
  }

  function fitPreviewViewport(){
    try{
      window.dispatchEvent(new Event('resize'));
    }catch(_e){}
    try{
      if(typeof window.fitToScreen === 'function'){
        window.fitToScreen({ silent:true });
      }else if(window.App && App.canvas && typeof App.canvas.draw === 'function'){
        App.canvas.draw(true, true);
      }
    }catch(_e){}
  }

  function applyPreviewSpeed(){
    try{
      if(typeof window.setFastestMode === 'function') window.setFastestMode(false);
      if(typeof window.setSpeed === 'function') window.setSpeed(LANDING_PREVIEW_SPEED);
    }catch(_e){}
  }

  function restoreEditorSpeed(){
    try{
      if(typeof window.setFastestMode === 'function') window.setFastestMode(false);
      if(typeof window.setSpeed === 'function') window.setSpeed(1);
    }catch(_e){}
  }

  function startPreview(){
    if(previewStarted || previewReady) return true;
    if(!canStartPreview()) return false;
    const snapshot = clonePayload(App.serializeGraphData());
    if(!snapshot) return false;
    previewSnapshot = snapshot;
    previewStarted = true;
    setStatus(
      'Starting live preview...',
      'Loading the actual simulation canvas behind the landing glass.',
      'Preview'
    );
    window.requestAnimationFrame(()=>{
      window.requestAnimationFrame(()=>{
        if(opening || body.classList.contains('landing-hidden')) return;
        fitPreviewViewport();
        try{
          applyPreviewSpeed();
          window.startSimulation();
          markPreviewReady();
          if(!bootstrapReady){
            setStatus(
              'Preview is running...',
              'The live simulation is moving in the background while the editor finishes loading.',
              'Preview'
            );
          }
        }catch(err){
          previewStarted = false;
          console.error(err);
          queuePreviewBoot(280);
        }
      });
    });
    return true;
  }

  function queuePreviewBoot(delayMs){
    if(previewReady || previewStarted || opening || body.classList.contains('landing-hidden')) return;
    if(previewRetryHandle){
      window.clearTimeout(previewRetryHandle);
      previewRetryHandle = 0;
    }
    previewRetryHandle = window.setTimeout(()=>{
      previewRetryHandle = 0;
      if(startPreview()) return;
      if((performance.now() - startTime) >= previewBootDeadlineMs){
        console.warn('[landing] live preview did not boot before timeout; allowing entry');
        markPreviewReady();
        return;
      }
      queuePreviewBoot(260);
    }, Math.max(40, Number(delayMs) || 0));
  }

  function resetToInitialState(){
    try{
      if(typeof window.stopSimulation === 'function') window.stopSimulation();
    }catch(_e){}
    restoreEditorSpeed();

    const snapshot = clonePayload(previewSnapshot);
    if(snapshot && typeof App.applyGraphData === 'function'){
      App.applyGraphData(snapshot, { source: 'landing-reset' });
      return true;
    }

    if(typeof App.resetToInitialState === 'function'){
      return Promise.resolve(App.resetToInitialState()).then(()=> true);
    }

    const sel = document.getElementById('exampleSelect');
    const exampleKey = String((sel && sel.value) || 'sample_line2').trim() || 'sample_line2';
    if(typeof window.makeExample === 'function'){
      return Promise.resolve(window.makeExample(exampleKey)).then(()=> true);
    }
    return false;
  }

  async function onOpen(){
    if(!ready || opening) return;
    opening = true;
    disableOpen('Preparing Workspace...');
    setStatus(
      'Resetting workspace...',
      'Stopping the landing preview and restoring the editor to its initial state.',
      'Reset'
    );
    if(previewRetryHandle){
      window.clearTimeout(previewRetryHandle);
      previewRetryHandle = 0;
    }
    try{
      await Promise.resolve(resetToInitialState());
    }catch(err){
      console.error(err);
    }
    revealApp();
    focusEditorChrome();
  }

  openButtons.forEach((btn)=>{
    btn.addEventListener('click', onOpen);
    btn.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        onOpen();
      }
    });
  });

  function updateFromReadyState(){
    const rs = document.readyState;
    if(rs === 'interactive'){
      realTarget = Math.max(realTarget, 62);
      if(!previewReady){
        setStatus(
          'Initializing editor...',
          'Bootstrapping the UI shell and preparing interaction handlers.',
          'Initializing'
        );
      }
    }else if(rs === 'complete'){
      realTarget = Math.max(realTarget, 84);
      if(!previewReady){
        setStatus(
          'Loading simulator...',
          'Loading graph, rendering, and simulation modules.',
          'Loading'
        );
      }
    }
  }
  updateFromReadyState();
  document.addEventListener('readystatechange', updateFromReadyState);

  if('PerformanceObserver' in window){
    try{
      let seenResources = 0;
      const po = new PerformanceObserver((list)=>{
        const entries = list.getEntries();
        if(!entries || !entries.length) return;
        seenResources += entries.length;
        realTarget = Math.max(realTarget, Math.min(88, 10 + seenResources * 1.5));
        if(!previewReady){
          if(seenResources > 8){
            setStatus(
              'Linking modules...',
              'Resolving editor modules, examples, and simulation nodes.',
              'Linking'
            );
          }else{
            setStatus(
              'Loading simulator...',
              'Loading graph, rendering, and simulation modules.',
              'Loading'
            );
          }
        }
      });
      po.observe({ type:'resource', buffered:true });
    }catch(_e){}
  }

  window.addEventListener('factsim:graph-applied', ()=>{
    queuePreviewBoot(80);
  });

  window.addEventListener('load', ()=>{
    realTarget = 100;
    if(!previewReady){
      setStatus(
        'Finalizing...',
        'Running final layout checks before the simulator is ready.',
        'Finalizing'
      );
    }
    queuePreviewBoot(120);
  });

  // Fallback to avoid being stuck due edge-case load event behavior.
  window.setTimeout(()=>{
    realTarget = 100;
    queuePreviewBoot(120);
  }, 30000);

  function tick(){
    const elapsed = performance.now() - startTime;
    const pseudoCap = Math.min(92, 8 + elapsed * 0.018);
    const target = Math.max(realTarget, pseudoCap);
    if(target >= 100){
      const speed = reduceMotion ? 1 : 0.28;
      setProgress(progress + (100 - progress) * speed);
      if(progress >= 99.7){
        setProgress(100);
        markBootstrapReady();
        return;
      }
    }else{
      const gain = reduceMotion ? 0.55 : 0.12;
      const floorStep = reduceMotion ? 0.6 : 0.22;
      const delta = Math.max(floorStep, (target - progress) * gain);
      setProgress(Math.min(99, progress + delta));
    }
    animationHandle = window.requestAnimationFrame(tick);
  }

  setProgress(0);
  setStatus(
    'Loading simulator assets...',
    'Preparing the browser runtime, UI, and simulation modules.',
    'Booting'
  );
  animationHandle = window.requestAnimationFrame(tick);
})();
