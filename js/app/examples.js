// Example graphs and loaders

var App = window.App || (window.App = {});

const EXAMPLE_ALIASES = {
  agv_config: 'carrier',
  carrier_config: 'carrier'
};
const DEFAULT_EXAMPLE_KEY = 'sample_line2';
const EXAMPLE_HANDLE_DB = 'fact-sim-example-writer-v1';
const EXAMPLE_HANDLE_STORE = 'handles';
const EXAMPLE_HANDLE_KEY = 'sample-root';
const _exampleUtf8Encoder = new TextEncoder();

const EXAMPLE_FILES = {
  simple: 'sample/simple.json?v=20260824f',
  branch: 'sample/branch.json?v=20260824f',
  parallel_benchmark: 'sample/parallel_benchmark.json?v=20260824f',
  shuttle_line5: 'sample/shuttle_line5.json?v=20260824f',
  carrier: 'sample/graph (3).json?v=20260824f',
  pallet_station_demo: 'sample/pallet_station_demo.json?v=20260824f',
  sample_line1: 'sample/sample_line1.json?v=20260824f',
  sample_line2: 'sample/sample_line2.json?v=20260824f'
};

App._exampleWriteState = App._exampleWriteState || {
  rootHandle: null,
  sampleHandle: null,
  pathKind: '',
  lastLinkedAt: 0
};

function supportsExampleOverwrite(){
  return !!(
    window.isSecureContext &&
    typeof window.showDirectoryPicker === 'function' &&
    typeof window.FileSystemHandle !== 'undefined'
  );
}

function stripQueryAndHash(path){
  const raw = String(path || '');
  const qIndex = raw.indexOf('?');
  const hashIndex = raw.indexOf('#');
  const splitIndex = [qIndex, hashIndex].filter((v)=> v >= 0).sort((a, b)=> a - b)[0];
  return splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
}

function splitRelativePath(path){
  return stripQueryAndHash(path)
    .split('/')
    .map((part)=> String(part || '').trim())
    .filter(Boolean);
}

function getExampleJsonPath(key){
  return stripQueryAndHash(EXAMPLE_FILES[key] || `sample/${key}.json`);
}

function getExampleJsPath(key){
  return `sample/${key}.js`;
}

function cloneExampleData(data){
  try{
    return JSON.parse(JSON.stringify(data));
  }catch(_e){
    return data;
  }
}

function toBase64Utf8(text){
  const bytes = _exampleUtf8Encoder.encode(String(text || ''));
  let binary = '';
  const chunkSize = 0x8000;
  for(let i = 0; i < bytes.length; i += chunkSize){
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

function buildExampleJsBundle(key, payload){
  const jsonText = JSON.stringify(payload, null, 2);
  const base64 = toBase64Utf8(jsonText);
  return [
    '(function(){',
    '  var root = (typeof window !== "undefined") ? window : globalThis;',
    '  root.EXAMPLES = root.EXAMPLES || {};',
    `  var base64 = '${base64}';`,
    '  function decodeBase64Utf8(input){',
    '    if(typeof TextDecoder === "function" && typeof Uint8Array !== "undefined" && typeof atob === "function"){',
    '      var binary = atob(input);',
    '      var bytes = new Uint8Array(binary.length);',
    '      for(var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);',
    '      return new TextDecoder("utf-8").decode(bytes);',
    '    }',
    '    if(typeof Buffer !== "undefined") return Buffer.from(input, "base64").toString("utf8");',
    `    throw new Error("No base64 decoder available for ${key}");`,
    '  }',
    `  root.EXAMPLES.${key} = JSON.parse(decodeBase64Utf8(base64));`,
    '})();',
    ''
  ].join('\n');
}

function openExampleHandleDb(){
  if(typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve)=>{
    try{
      const req = indexedDB.open(EXAMPLE_HANDLE_DB, 1);
      req.onerror = ()=> resolve(null);
      req.onupgradeneeded = ()=>{
        try{
          const db = req.result;
          if(!db.objectStoreNames.contains(EXAMPLE_HANDLE_STORE)){
            db.createObjectStore(EXAMPLE_HANDLE_STORE);
          }
        }catch(_e){}
      };
      req.onsuccess = ()=> resolve(req.result || null);
    }catch(_e){
      resolve(null);
    }
  });
}

async function loadStoredExampleRootHandle(){
  const db = await openExampleHandleDb();
  if(!db) return null;
  return new Promise((resolve)=>{
    try{
      const tx = db.transaction(EXAMPLE_HANDLE_STORE, 'readonly');
      const store = tx.objectStore(EXAMPLE_HANDLE_STORE);
      const req = store.get(EXAMPLE_HANDLE_KEY);
      req.onerror = ()=> resolve(null);
      req.onsuccess = ()=> resolve(req.result || null);
      tx.oncomplete = ()=>{ try{ db.close(); }catch(_e){} };
      tx.onerror = ()=>{ try{ db.close(); }catch(_e){} };
    }catch(_e){
      try{ db.close(); }catch(_closeErr){}
      resolve(null);
    }
  });
}

async function storeExampleRootHandle(handle){
  const db = await openExampleHandleDb();
  if(!db) return false;
  return new Promise((resolve)=>{
    try{
      const tx = db.transaction(EXAMPLE_HANDLE_STORE, 'readwrite');
      tx.objectStore(EXAMPLE_HANDLE_STORE).put(handle, EXAMPLE_HANDLE_KEY);
      tx.oncomplete = ()=>{ try{ db.close(); }catch(_e){} resolve(true); };
      tx.onerror = ()=>{ try{ db.close(); }catch(_e){} resolve(false); };
    }catch(_e){
      try{ db.close(); }catch(_closeErr){}
      resolve(false);
    }
  });
}

async function queryDirectoryPermission(handle){
  if(!handle) return false;
  const opts = { mode: 'readwrite' };
  try{
    if(typeof handle.queryPermission === 'function'){
      const current = await handle.queryPermission(opts);
      if(current === 'granted') return true;
    }
    if(typeof handle.requestPermission === 'function'){
      const next = await handle.requestPermission(opts);
      return next === 'granted';
    }
  }catch(_e){}
  return false;
}

async function directoryContainsAny(handle, names){
  if(!handle || typeof handle.getFileHandle !== 'function') return false;
  for(const name of names){
    try{
      await handle.getFileHandle(name, { create: false });
      return true;
    }catch(_e){}
  }
  return false;
}

async function resolveSampleDirectoryContext(rootHandle){
  if(!rootHandle || rootHandle.kind !== 'directory'){
    throw new Error('Select the project root or the sample folder.');
  }
  const sampleSentinels = ['simple.js', 'sample_line2.js', 'simple.json', 'sample_line2.json'];
  if(await directoryContainsAny(rootHandle, sampleSentinels)){
    return { rootHandle, sampleHandle: rootHandle, pathKind: 'sample' };
  }
  try{
    const sampleHandle = await rootHandle.getDirectoryHandle('sample', { create: false });
    if(await directoryContainsAny(sampleHandle, sampleSentinels)){
      return { rootHandle, sampleHandle, pathKind: 'repo' };
    }
  }catch(_e){}
  throw new Error('Choose the fact_sim project root or its sample folder.');
}

function getWritableParts(pathKind, relativePath){
  const parts = splitRelativePath(relativePath);
  if(pathKind === 'sample' && parts[0] === 'sample'){
    return parts.slice(1);
  }
  return parts;
}

async function writeTextToContext(context, relativePath, text){
  const parts = getWritableParts(context.pathKind, relativePath);
  if(!parts.length) throw new Error(`Invalid save path: ${relativePath}`);
  const fileName = parts.pop();
  let dir = context.pathKind === 'repo' ? context.rootHandle : context.sampleHandle;
  for(const part of parts){
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try{
    await writable.write(String(text || ''));
  } finally {
    await writable.close();
  }
}

async function getExampleWriteContext(forcePrompt){
  const state = App._exampleWriteState || (App._exampleWriteState = {});
  if(!forcePrompt && state.rootHandle && state.sampleHandle){
    const granted = await queryDirectoryPermission(state.rootHandle);
    if(granted) return state;
  }
  let rootHandle = null;
  if(!forcePrompt){
    rootHandle = await loadStoredExampleRootHandle();
  }
  if(rootHandle){
    const granted = await queryDirectoryPermission(rootHandle);
    if(!granted) rootHandle = null;
  }
  if(!rootHandle){
    rootHandle = await window.showDirectoryPicker({
      id: 'fact-sim-example-root',
      mode: 'readwrite'
    });
    const granted = await queryDirectoryPermission(rootHandle);
    if(!granted){
      throw new Error('Write permission was not granted.');
    }
  }
  const context = await resolveSampleDirectoryContext(rootHandle);
  state.rootHandle = context.rootHandle;
  state.sampleHandle = context.sampleHandle;
  state.pathKind = context.pathKind;
  state.lastLinkedAt = Date.now();
  await storeExampleRootHandle(rootHandle);
  return state;
}

function updateExampleSaveUi(){
  const btnLink = document.getElementById('btnLinkExampleFolder');
  const btnOverwrite = document.getElementById('btnOverwriteExample');
  const hint = document.getElementById('exampleSaveHint');
  const sel = document.getElementById('exampleSelect');
  const key = resolveExampleKey(sel && sel.value);
  const supported = supportsExampleOverwrite();
  const linked = !!(App._exampleWriteState && App._exampleWriteState.rootHandle && App._exampleWriteState.sampleHandle);
  if(btnLink){
    btnLink.disabled = !supported;
    btnLink.textContent = linked ? 'Relink Sample Folder' : 'Link Sample Folder';
    btnLink.title = supported ? 'Choose the repo root or sample folder for example overwrite.' : 'Requires File System Access API on localhost or HTTPS.';
  }
  if(btnOverwrite){
    btnOverwrite.disabled = !supported || !key;
    btnOverwrite.title = key ? 'Overwrite the selected example with the current graph.' : 'Choose an example first.';
  }
  if(hint){
    if(!supported){
      hint.innerHTML = 'Overwrite Example requires a Chromium browser on <strong>localhost</strong> or <strong>HTTPS</strong>.';
    }else if(!key){
      hint.textContent = 'Choose an example first, then link the sample folder and overwrite it.';
    }else if(linked){
      hint.textContent = `Ready to overwrite ${key}.json and ${key}.js with the current graph.`;
    }else{
      hint.textContent = 'Link the fact_sim sample folder once, then overwrite the selected example.';
    }
  }
}

async function linkExampleFolder(forcePrompt){
  if(!supportsExampleOverwrite()){
    throw new Error('This browser does not support writable example files here. Use localhost or HTTPS in Chromium.');
  }
  const context = await getExampleWriteContext(!!forcePrompt);
  updateExampleSaveUi();
  return context;
}

async function overwriteSelectedExample(){
  const sel = document.getElementById('exampleSelect');
  const key = resolveExampleKey(sel && sel.value);
  if(!key){
    throw new Error('Choose an example first.');
  }
  if(typeof App.serializeGraphData !== 'function'){
    throw new Error('Graph serialization is not available.');
  }
  let preview = null;
  if(typeof App.previewBasicNodeMigration === 'function'){
    preview = App.previewBasicNodeMigration(App.serializeGraphData());
    if(preview.blocked){
      throw new Error(`Migration blocked: ${preview.warnings.map((row)=>row.type || row.code).join(', ')}`);
    }
  }
  const migrationText = preview && (preview.convertedNodeCount || preview.removedConfigNodeCount)
    ? `\n\nMigration: ${preview.convertedNodeCount} node(s) to Basic Node, ${preview.removedConfigNodeCount} config node(s) absorbed, ${preview.generatedTypeCount} Entity Type(s).`
    : '';
  const confirmed = window.confirm(`Overwrite "${key}" with the current graph? This updates both the JSON file and the bundled JS fallback.${migrationText}`);
  if(!confirmed) return false;
  const context = await linkExampleFolder(false);
  const payload = cloneExampleData(typeof App.serializeGraphDataForSave === 'function'
    ? App.serializeGraphDataForSave()
    : App.serializeGraphData());
  const jsonPath = getExampleJsonPath(key);
  const jsPath = getExampleJsPath(key);
  const jsonText = JSON.stringify(payload, null, 2) + '\n';
  const jsText = buildExampleJsBundle(key, payload);
  await writeTextToContext(context, jsonPath, jsonText);
  await writeTextToContext(context, jsPath, jsText);
  window.EXAMPLES = window.EXAMPLES || {};
  window.EXAMPLES[key] = cloneExampleData(payload);
  EXAMPLE_FILES[key] = `${stripQueryAndHash(jsonPath)}?v=${Date.now()}`;
  updateExampleSaveUi();
  try{
    if(typeof App.showToast === 'function') App.showToast(`Overwrote ${key}`);
  }catch(_e){}
  return {
    key,
    jsonPath,
    jsPath
  };
}

function shouldAutoStartFromUrl(){
  try{
    const qs = new URLSearchParams(window.location.search || '');
    return qs.get('autoStart') === '1';
  }catch(_e){
    return false;
  }
}

function queueAutoStart(){
  let attempts = 0;
  const maxAttempts = 80;
  const tryStart = ()=>{
    if(typeof window.startSimulation !== 'function') return false;
    if(window.App && window.App.graph && typeof window.App.graph.status === 'number' && window.App.graph.status === window.LGraph.STATUS_RUNNING){
      return true;
    }
    try{
      window.startSimulation();
      return true;
    }catch(_e){
      return false;
    }
  };
  if(tryStart()) return;
  const timer = window.setInterval(()=>{
    attempts += 1;
    if(tryStart() || attempts >= maxAttempts){
      window.clearInterval(timer);
    }
  }, 250);
}

function resolveExampleKey(kind){
  const key = String(kind || '').trim();
  if(!key) return '';
  return EXAMPLE_ALIASES[key] || key;
}

function getDefaultExampleKey(){
  return DEFAULT_EXAMPLE_KEY;
}

function syncExampleSelection(kind){
  const sel = document.getElementById('exampleSelect');
  if(!sel) return;
  const key = resolveExampleKey(kind) || DEFAULT_EXAMPLE_KEY;
  sel.value = key;
}

function encodeRequestPath(path){
  const raw = String(path || '');
  const qIndex = raw.indexOf('?');
  const hashIndex = raw.indexOf('#');
  const splitIndex = [qIndex, hashIndex].filter((v)=> v >= 0).sort((a, b)=> a - b)[0];
  const pathname = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const suffix = splitIndex >= 0 ? raw.slice(splitIndex) : '';
  return pathname
    .split('/')
    .map((segment, index)=>{
      if(index === 0 && segment === '') return '';
      return encodeURIComponent(segment);
    })
    .join('/') + suffix;
}

function _nextGraphLoadToken(){
  if(typeof App.bumpGraphLoadRevision === 'function'){
    return App.bumpGraphLoadRevision();
  }
  App._graphLoadRevision = (Number(App._graphLoadRevision) || 0) + 1;
  return App._graphLoadRevision;
}

function _isLatestGraphLoadToken(token){
  const current = (typeof App.getGraphLoadRevision === 'function')
    ? App.getGraphLoadRevision()
    : (Number(App._graphLoadRevision) || 0);
  return token === current;
}

function makeExample(kind){
  const token = _nextGraphLoadToken();
  const key = resolveExampleKey(kind);
  if(!key) return;
  const data = window.EXAMPLES && window.EXAMPLES[key];
  const isFileProtocol = String(window.location?.protocol || '').toLowerCase() === 'file:';
  if(isFileProtocol && data){
    // file:// cannot fetch local JSON in many browsers; use bundled JS examples.
    if(_isLatestGraphLoadToken(token)) applyExampleData(data);
    return Promise.resolve(true);
  }
  const file = EXAMPLE_FILES[key] || `sample/${key}.json`;
  if(file){
    return loadExampleFromFile(file, key, data, token);
  }
  if(data){
    if(_isLatestGraphLoadToken(token)) applyExampleData(data);
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

function applyExampleData(data){
  if(!App.graph) return;
  let payload = data;
  try{
    payload = JSON.parse(JSON.stringify(data));
  }catch(_e){
    payload = data;
  }
  if(!payload.__factSimEntityModel && typeof App.inferEntityModelFromGraph === 'function'){
    payload.__factSimEntityModel = App.inferEntityModelFromGraph(payload);
  }
  if(typeof App.applyGraphData === 'function'){
    App.applyGraphData(payload, { source: 'example' });
  }else{
    stopSimulation();
    App.history.lock = true;
    try{
      App.graph.clear();
      if(typeof App.resetEntityStore === 'function') App.resetEntityStore(App.graph);
      App.graph.configure(payload);
      if(typeof App.restoreEntityModel === 'function'){
        App.restoreEntityModel(App.graph, payload, true);
      }
      if(typeof window.normalizeGraphOverlaySizes === 'function'){
        window.normalizeGraphOverlaySizes(App.graph);
      }
      if(App.repairGraphLinks && typeof App.repairGraphLinks === "function"){
        App.repairGraphLinks(App.graph);
      }
      if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
        App.stopGroups.restoreSerializedData(App.graph, payload, false);
      }
    }finally{
      App.history.lock = false;
    }
    configureGraphClock(App.graph);
    if(typeof window.resetSimClock === 'function') window.resetSimClock();
    updateSimTime();
    if(App.backgroundLayout && typeof App.backgroundLayout.restore === 'function'){
      App.backgroundLayout.restore(payload.__factSimBackground || null);
    }
    try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(e){}
    resetHistory();
    attachTimeline();
  }
  try{
    if(typeof App.refreshSidebarChrome === 'function') App.refreshSidebarChrome();
  }catch(_e){}
}

function loadExampleFromFile(path, key, fallbackData, token){
  if(!App.graph) return Promise.resolve(false);
  const requestPath = encodeRequestPath(path);
  // The launcher intentionally reuses a persistent Chromium profile so the
  // sample-folder permission survives restarts. Never reuse a model JSON from
  // that profile's HTTP cache: its node schema may belong to an older build.
  return fetch(requestPath, { cache: 'no-store' })
    .then(r=>{ if(!r.ok) throw new Error(`Load failed: ${r.status}`); return r.json(); })
    .then(data=>{
      if(!_isLatestGraphLoadToken(token)) return false;
      applyExampleData(data);
      return true;
    })
    .catch(err=>{
      if(!_isLatestGraphLoadToken(token)) return false;
      const fallback = fallbackData || (window.EXAMPLES && window.EXAMPLES[resolveExampleKey(key)]);
      if(fallback){
        console.warn(`[examples] fallback to embedded data for "${key}"`, err);
        applyExampleData(fallback);
        return true;
      }
      alert('Failed to load JSON');
      console.error(err);
      return false;
    });
}

function initExamples(){
  const sel = document.getElementById('exampleSelect');
  const btnLink = document.getElementById('btnLinkExampleFolder');
  const btnOverwrite = document.getElementById('btnOverwriteExample');
  if(sel){
    sel.addEventListener('change', e=>{
      const v = e.target.value; if(!v) return;
      Promise.resolve(makeExample(v)).then(()=>{
        try{
          if(typeof App.refreshSidebarChrome === 'function') App.refreshSidebarChrome();
        }catch(_e){}
      });
      updateExampleSaveUi();
    });
  }
  if(btnLink){
    btnLink.addEventListener('click', ()=>{
      linkExampleFolder(true).then(()=>{
        if(typeof App.showToast === 'function') App.showToast('Sample folder linked');
      }).catch((err)=>{
        if(err && err.name === 'AbortError') return;
        console.error(err);
        if(typeof App.showToast === 'function') App.showToast(err && err.message ? err.message : 'Failed to link sample folder');
      });
    });
  }
  if(btnOverwrite){
    btnOverwrite.addEventListener('click', ()=>{
      overwriteSelectedExample().catch((err)=>{
        if(err && err.name === 'AbortError') return;
        console.error(err);
        if(typeof App.showToast === 'function') App.showToast(err && err.message ? err.message : 'Failed to overwrite example');
      });
    });
  }

  // Default example: sample_line2
  syncExampleSelection(DEFAULT_EXAMPLE_KEY);
  const loadPromise = makeExample(DEFAULT_EXAMPLE_KEY);
  Promise.resolve(loadPromise).then(()=>{
    try{
      if(typeof App.refreshSidebarChrome === 'function') App.refreshSidebarChrome();
    }catch(_e){}
  });
  if(shouldAutoStartFromUrl()){
    Promise.resolve(loadPromise).then(()=>{
      queueAutoStart();
    });
  }
  Promise.resolve(loadStoredExampleRootHandle()).then(async (stored)=>{
    if(!stored) return;
    try{
      const granted = await queryDirectoryPermission(stored);
      if(!granted) return;
      const context = await resolveSampleDirectoryContext(stored);
      App._exampleWriteState.rootHandle = context.rootHandle;
      App._exampleWriteState.sampleHandle = context.sampleHandle;
      App._exampleWriteState.pathKind = context.pathKind;
      App._exampleWriteState.lastLinkedAt = Date.now();
    }catch(_e){}
  }).finally(()=>{
    updateExampleSaveUi();
  });
  updateExampleSaveUi();
}

App.getDefaultExampleKey = getDefaultExampleKey;
App.loadDefaultExample = function(){
  const key = getDefaultExampleKey();
  syncExampleSelection(key);
  return Promise.resolve(makeExample(key));
};
App.resetToInitialState = function(){
  if(typeof window.stopSimulation === 'function'){
    try{ window.stopSimulation(); }catch(_e){}
  }
  // Runtime state lives outside serialized model data. Reconfigure from the
  // current model so edits to Types, Rules, and Initial Contents survive Reset.
  if(typeof App.serializeGraphData === 'function' && typeof App.applyGraphData === 'function'){
    const currentModel = App.serializeGraphData();
    const restored = App.applyGraphData(currentModel, { source: 'reset', captureInitialState: false, fitViewport: false });
    if(restored) return Promise.resolve(true);
  }
  if(typeof App.loadDefaultExample === 'function'){
    return App.loadDefaultExample();
  }
  return Promise.resolve(false);
};
App.linkExampleFolder = linkExampleFolder;
App.overwriteSelectedExample = overwriteSelectedExample;



