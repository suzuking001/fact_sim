// Landing page start-workflow controller

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
  const actionButtons = Array.from(document.querySelectorAll('[data-landing-action]'));
  const fileInput = document.getElementById('fileInput');

  if(!body || !landing || !appRoot || !progressBar || !progressFill || !progressValue){
    return;
  }

  let ready = false;
  let opening = false;
  let pendingFileOpen = false;
  let progress = 0;
  let progressTarget = 8;
  let pollHandle = 0;
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function setStatus(label, hint, state){
    if(progressLabel && label) progressLabel.textContent = label;
    if(progressHint && hint) progressHint.textContent = hint;
    if(progressState && state) progressState.textContent = state;
  }

  function setProgress(next){
    const value = Math.max(0, Math.min(100, Number(next) || 0));
    progress = value;
    const shown = Math.round(value);
    progressFill.style.width = `${value.toFixed(2)}%`;
    progressValue.textContent = `${shown}%`;
    progressBar.setAttribute('aria-valuenow', String(shown));
  }

  function setActionsEnabled(enabled){
    actionButtons.forEach((button)=>{
      button.disabled = !enabled;
      button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    });
  }

  function focusEditorChrome(){
    const firstFocus = document.getElementById('sidebarDragRail') || document.getElementById('btnStart');
    if(firstFocus && typeof firstFocus.focus === 'function'){
      try{ firstFocus.focus({ preventScroll:true }); }catch(_e){ firstFocus.focus(); }
    }
  }

  function revealApp(options){
    const opts = options || {};
    body.classList.add('landing-hidden');
    body.classList.remove('landing-choice-pending', 'landing-choice-ready');
    appRoot.setAttribute('aria-hidden', 'false');
    window.requestAnimationFrame(()=>{
      window.requestAnimationFrame(()=>{
        try{ window.dispatchEvent(new Event('resize')); }catch(_e){}
        if(opts.fit && typeof window.fitToScreen === 'function'){
          try{ window.fitToScreen({ silent:true }); }catch(_e){}
        }
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
  body.classList.add('landing-choice-pending');
  setActionsEnabled(false);

  function isWorkspaceReady(){
    if(!window.App || !App.graph || !App.canvas) return false;
    if(typeof window.makeExample !== 'function' || typeof window.initGraph !== 'function') return false;
    if(!fileInput) return false;
    const revision = (typeof App.getGraphApplyRevision === 'function')
      ? App.getGraphApplyRevision()
      : (Number(App._graphApplyRevision) || 0);
    return revision > 0;
  }

  function markReady(){
    if(ready || !isWorkspaceReady()) return false;
    ready = true;
    progressTarget = 100;
    setProgress(100);
    body.classList.add('landing-choice-ready');
    body.classList.remove('landing-choice-pending');
    setStatus(
      '準備ができました',
      '目的に合う開始方法を選んでください。',
      '選択できます'
    );
    setActionsEnabled(true);
    return true;
  }

  function scheduleReadyPoll(){
    if(ready || body.classList.contains('landing-hidden')) return;
    if(markReady()) return;
    pollHandle = window.setTimeout(scheduleReadyPoll, 180);
  }

  function stopCurrentSimulation(){
    try{
      if(typeof window.stopSimulation === 'function') window.stopSimulation();
    }catch(_e){}
  }

  function markStarterGraphApplied(){
    const applyRevision = (typeof App.markGraphApplied === 'function')
      ? App.markGraphApplied()
      : ((App._graphApplyRevision = (Number(App._graphApplyRevision) || 0) + 1));
    try{
      window.dispatchEvent(new CustomEvent('factsim:graph-applied', {
        detail: { source: 'starter', applyRevision }
      }));
    }catch(_e){}
  }

  function createStarterGraph(){
    if(typeof App.bumpGraphLoadRevision === 'function') App.bumpGraphLoadRevision();
    stopCurrentSimulation();
    window.initGraph();

    const nodes = Array.isArray(App.graph && App.graph._nodes) ? App.graph._nodes : [];
    const equipment = nodes.find((node)=> node && node.type === 'factory/equip');
    const sink = LiteGraph.createNode('factory/sink');
    if(!equipment || !sink) throw new Error('Starter graph nodes could not be created');
    sink.pos = [660, 180];
    if(typeof window.enforceNodeOverlayMinSize === 'function'){
      try{ window.enforceNodeOverlayMinSize(sink); }catch(_e){}
    }
    App.history.lock = true;
    try{
      App.graph.add(sink);
      equipment.connect(0, sink, 0);
    }finally{
      App.history.lock = false;
    }

    const exampleSelect = document.getElementById('exampleSelect');
    if(exampleSelect) exampleSelect.value = '';
    if(typeof window.resetHistory === 'function') window.resetHistory();
    if(typeof window.attachTimeline === 'function') window.attachTimeline();
    try{
      if(App.canvas && typeof App.canvas.deselectAllNodes === 'function') App.canvas.deselectAllNodes();
      if(App.canvas && typeof App.canvas.draw === 'function') App.canvas.draw(true, true);
    }catch(_e){}
    if(typeof App.captureInitialGraphState === 'function') App.captureInitialGraphState();
    markStarterGraphApplied();
  }

  async function openSample(){
    stopCurrentSimulation();
    const loaded = await Promise.resolve(window.makeExample('sample_line2'));
    if(loaded === false) throw new Error('Sample Line2 could not be loaded');
    const exampleSelect = document.getElementById('exampleSelect');
    if(exampleSelect) exampleSelect.value = 'sample_line2';
    revealApp();
    focusEditorChrome();
  }

  function openNewGraph(){
    createStarterGraph();
    revealApp({ fit:true });
    focusEditorChrome();
  }

  function openFilePicker(){
    if(!fileInput) throw new Error('File picker is unavailable');
    pendingFileOpen = true;
    setStatus(
      'JSONファイルを選択してください',
      '選択をキャンセルした場合は、この画面に戻ります。',
      'ファイル選択'
    );
    fileInput.click();
  }

  async function runAction(action){
    if(!ready || opening) return;
    pendingFileOpen = false;
    if(action === 'file'){
      try{ openFilePicker(); }catch(err){ handleActionError(err); }
      return;
    }
    opening = true;
    setActionsEnabled(false);
    setStatus(
      action === 'sample' ? 'Sample Line2を読み込んでいます...' : '新しいグラフを作成しています...',
      '開始状態を準備しています。',
      '準備中'
    );
    try{
      if(action === 'sample') await openSample();
      else if(action === 'new') openNewGraph();
      else throw new Error('Unknown landing action');
    }catch(err){
      handleActionError(err);
    }
  }

  function handleActionError(err){
    console.error(err);
    opening = false;
    pendingFileOpen = false;
    setStatus(
      '開始できませんでした',
      (err && err.message) ? err.message : 'もう一度お試しください。',
      'エラー'
    );
    setActionsEnabled(true);
  }

  actionButtons.forEach((button)=>{
    button.addEventListener('click', ()=> runAction(String(button.dataset.landingAction || '')));
  });

  if(fileInput){
    fileInput.addEventListener('change', ()=>{
      if(!pendingFileOpen) return;
      if(!fileInput.files || !fileInput.files.length){
        pendingFileOpen = false;
        setStatus('準備ができました', '目的に合う開始方法を選んでください。', '選択できます');
        return;
      }
      opening = true;
      setActionsEnabled(false);
      setStatus('JSONファイルを開いています...', 'グラフを検証して読み込んでいます。', '読込中');
    }, true);
    fileInput.addEventListener('cancel', ()=>{
      pendingFileOpen = false;
      setStatus('準備ができました', '目的に合う開始方法を選んでください。', '選択できます');
      setActionsEnabled(true);
    });
  }

  window.addEventListener('factsim:graph-applied', (event)=>{
    const source = String(event && event.detail && event.detail.source || '').toLowerCase();
    if(pendingFileOpen && source === 'file'){
      pendingFileOpen = false;
      revealApp();
      focusEditorChrome();
      return;
    }
    progressTarget = Math.max(progressTarget, 92);
    markReady();
  });

  window.addEventListener('factsim:file-load-failed', (event)=>{
    if(!pendingFileOpen && !opening) return;
    const message = event && event.detail && event.detail.message;
    handleActionError(new Error(message || 'JSONファイルを読み込めませんでした'));
  });

  window.addEventListener('focus', ()=>{
    if(!pendingFileOpen || opening) return;
    window.setTimeout(()=>{
      if(!pendingFileOpen || opening) return;
      if(fileInput && fileInput.files && fileInput.files.length) return;
      pendingFileOpen = false;
      setStatus('準備ができました', '目的に合う開始方法を選んでください。', '選択できます');
      setActionsEnabled(true);
    }, 220);
  });

  document.addEventListener('readystatechange', ()=>{
    if(document.readyState === 'interactive') progressTarget = Math.max(progressTarget, 56);
    if(document.readyState === 'complete') progressTarget = Math.max(progressTarget, 84);
  });
  window.addEventListener('load', ()=>{
    progressTarget = Math.max(progressTarget, 92);
    markReady();
  });

  function tick(){
    if(ready || body.classList.contains('landing-hidden')) return;
    const gain = reduceMotion ? 0.42 : 0.14;
    const step = Math.max(reduceMotion ? 0.8 : 0.22, (progressTarget - progress) * gain);
    setProgress(Math.min(96, progress + step));
    window.requestAnimationFrame(tick);
  }

  setProgress(0);
  setStatus('シミュレーターを準備しています...', '開始方法を選べるように、編集機能を読み込んでいます。', '起動中');
  window.requestAnimationFrame(tick);
  scheduleReadyPoll();

  window.addEventListener('beforeunload', ()=>{
    if(pollHandle) window.clearTimeout(pollHandle);
  });
})();
