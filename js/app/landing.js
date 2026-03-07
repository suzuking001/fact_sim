// Landing page + loading progress controller

(function(){
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

  function revealApp(){
    body.classList.add('landing-hidden');
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

  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let progress = 0;
  let realTarget = 6;
  let ready = false;
  let animationHandle = 0;
  const startTime = performance.now();

  function setProgress(next){
    const p = Math.max(0, Math.min(100, Number(next) || 0));
    progress = p;
    const shown = Math.round(p);
    progressFill.style.width = `${p.toFixed(2)}%`;
    progressValue.textContent = `${shown}%`;
    progressBar.setAttribute('aria-valuenow', String(shown));
  }

  function allowOpen(){
    if(ready) return;
    ready = true;
    if(progressLabel) progressLabel.textContent = 'Ready';
    if(progressHint) progressHint.textContent = 'Simulator modules are ready. Open the editor when you want to start.';
    if(progressState) progressState.textContent = 'Ready';
    openButtons.forEach((btn)=>{
      btn.disabled = false;
      btn.setAttribute('aria-disabled', 'false');
      if(btn.tagName === 'BUTTON') btn.textContent = 'Open Simulator';
    });
  }

  function onOpen(){
    if(!ready) return;
    revealApp();
    const firstFocus = document.getElementById('menuToggle') || document.getElementById('btnStart');
    if(firstFocus && typeof firstFocus.focus === 'function'){
      try{ firstFocus.focus({ preventScroll:true }); }catch(_e){ firstFocus.focus(); }
    }
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
      if(progressState) progressState.textContent = 'Initializing';
      if(progressHint) progressHint.textContent = 'Bootstrapping the UI shell and preparing interaction handlers.';
    }else if(rs === 'complete'){
      realTarget = Math.max(realTarget, 84);
      if(progressState) progressState.textContent = 'Loading';
      if(progressHint) progressHint.textContent = 'Loading graph, rendering, and simulation modules.';
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
        if(progressState) progressState.textContent = seenResources > 8 ? 'Linking' : 'Loading';
        if(progressHint && seenResources > 8){
          progressHint.textContent = 'Resolving editor modules, examples, and simulation nodes.';
        }
      });
      po.observe({ type:'resource', buffered:true });
    }catch(_e){}
  }

  window.addEventListener('load', ()=>{
    realTarget = 100;
    if(progressLabel) progressLabel.textContent = 'Finalizing...';
    if(progressHint) progressHint.textContent = 'Running final layout checks before the simulator is ready.';
    if(progressState) progressState.textContent = 'Finalizing';
  });

  // Fallback to avoid being stuck due edge-case load event behavior.
  window.setTimeout(()=>{
    realTarget = 100;
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
        allowOpen();
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
  if(progressState) progressState.textContent = 'Booting';
  animationHandle = window.requestAnimationFrame(tick);
})();
