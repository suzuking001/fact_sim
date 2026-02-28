// Save / Load handlers + URL share helpers

var App = window.App || (window.App = {});

const SHARE_SCHEMA = 'fact-sim-share-v1';

const _utf8Encoder = new TextEncoder();
const _utf8Decoder = new TextDecoder();

function _serializeGraph(){
  if(!App.graph) throw new Error('graph is not initialized');
  const serialized = App.graph.serialize();
  if(App.stopGroups && typeof App.stopGroups.injectSerializedData === 'function'){
    App.stopGroups.injectSerializedData(serialized, App.graph);
  }
  return _compactGraphData(serialized);
}

function _findScriptedNodes(data){
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const scripted = [];
  for(const node of nodes){
    const script = node?.properties?.script;
    if(typeof script !== 'string') continue;
    if(!script.trim()) continue;
    scripted.push(node);
  }
  return scripted;
}

function _stripNodeScripts(data){
  const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
  for(const node of nodes){
    if(!node || !node.properties || typeof node.properties !== 'object') continue;
    const hasScript = Object.prototype.hasOwnProperty.call(node.properties, 'script');
    if(!hasScript) continue;
    node.properties.script = '';
    // Keep explicit runtime flag so node-side evaluators can hard-disable scripts.
    node.properties.scriptDisabled = true;
  }
}

function _applyGraphData(data, options){
  if(!App.graph) throw new Error('graph is not initialized');
  if(!data || typeof data !== 'object') throw new Error('invalid graph payload');
  const opts = options || {};
  const expectedRevision = Number(opts.expectedRevision);
  if(isFinite(expectedRevision)){
    const currentRevision = (typeof App.getGraphLoadRevision === 'function')
      ? App.getGraphLoadRevision()
      : (Number(App._graphLoadRevision) || 0);
    if(currentRevision !== expectedRevision){
      return false;
    }
  }
  const source = String(opts.source || '').toLowerCase();
  if(source === 'share'){
    const scriptedNodes = _findScriptedNodes(data);
    if(scriptedNodes.length){
      let trusted = false;
      try{
        trusted = !!window.confirm(
          `This shared URL contains executable scripts in ${scriptedNodes.length} node(s).\n\n` +
          'OK: trust and load scripts\n' +
          'Cancel: load with scripts disabled'
        );
      }catch(_e){
        trusted = false;
      }
      if(!trusted){
        _stripNodeScripts(data);
        if(typeof App.showToast === 'function'){
          App.showToast('Loaded shared graph with custom scripts stripped');
        }
      }
    }
  }
  App.history.lock = true;
  try{
    App.graph.clear();
    App.graph.configure(data);
    if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
      App.stopGroups.restoreSerializedData(App.graph, data, false);
    }
  }finally{
    App.history.lock = false;
  }
  configureGraphClock(App.graph);
  if(typeof window.resetSimClock === 'function') window.resetSimClock();
  if(typeof updateSimTime === 'function') updateSimTime();
  resetHistory();
  attachTimeline();
  try{ if(App.canvas && App.canvas.draw) App.canvas.draw(true,true); }catch(_e){}
  return true;
}

function _toBase64Url(u8){
  let binary = '';
  const chunk = 0x8000;
  for(let i=0;i<u8.length;i+=chunk){
    const slice = u8.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function _fromBase64Url(text){
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const b64 = padded.replace(/-/g,'+').replace(/_/g,'/');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) out[i] = binary.charCodeAt(i);
  return out;
}

function _to2Tuple(v){
  if(Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0];
  if(v && typeof v === 'object') return [Number(v[0]) || 0, Number(v[1]) || 0];
  return v;
}

function _compactGraphData(graph){
  if(!graph || typeof graph !== 'object') return graph;
  const g = JSON.parse(JSON.stringify(graph));
  if(g.config && typeof g.config === 'object' && Object.keys(g.config).length === 0) delete g.config;
  if(g.extra && typeof g.extra === 'object' && Object.keys(g.extra).length === 0) delete g.extra;

  const defaultScriptText = (typeof window.defaultScript === 'function') ? String(window.defaultScript()) : '';
  const nodes = Array.isArray(g.nodes) ? g.nodes : [];
  for(const n of nodes){
    if(!n || typeof n !== 'object') continue;
    if(typeof n.pos !== 'undefined') n.pos = _to2Tuple(n.pos);
    if(typeof n.size !== 'undefined') n.size = _to2Tuple(n.size);

    if(n.flags && typeof n.flags === 'object' && Object.keys(n.flags).length === 0) delete n.flags;
    if(n.mode === 0) delete n.mode;
    if(n.order === 0) delete n.order;

    delete n.color;
    delete n.bgcolor;
    delete n.boxcolor;
    delete n.shape;

    if(n.properties && typeof n.properties === 'object'){
      if(n.properties.flipIO === false) delete n.properties.flipIO;
      if(n.properties.sigExtra === 0) delete n.properties.sigExtra;
      if(n.properties.sigEnabled === true) delete n.properties.sigEnabled;
      if(defaultScriptText && n.properties.script === defaultScriptText) delete n.properties.script;
      if(Object.keys(n.properties).length === 0) delete n.properties;
    }
  }
  return g;
}

function _hasCompressionStreams(){
  return (typeof CompressionStream === 'function') && (typeof DecompressionStream === 'function');
}

function _hasLzString(){
  return !!(window.LZString &&
    typeof window.LZString.compressToEncodedURIComponent === 'function' &&
    typeof window.LZString.decompressFromEncodedURIComponent === 'function');
}

async function _withTimeout(promise, ms, label){
  let timer = null;
  try{
    return await Promise.race([
      promise,
      new Promise((_, reject)=>{
        timer = setTimeout(()=> reject(new Error(`${label || 'operation'} timeout`)), ms);
      })
    ]);
  }finally{
    if(timer) clearTimeout(timer);
  }
}

async function _gzipBytes(bytes){
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const ab = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(ab);
}

async function _gunzipBytes(bytes){
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  await writer.write(bytes);
  await writer.close();
  const ab = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(ab);
}

function _shareEnvelope(graph){
  return {
    s: SHARE_SCHEMA,
    v: 1,
    g: graph
  };
}

function _unwrapEnvelope(payload){
  if(payload && typeof payload === 'object'){
    if(payload.s === SHARE_SCHEMA && payload.g && typeof payload.g === 'object'){
      return payload.g;
    }
    if(payload.schema === SHARE_SCHEMA && payload.graph && typeof payload.graph === 'object'){
      return payload.graph;
    }
    if(payload.graph && payload.app === 'fact_sim'){
      return payload.graph;
    }
  }
  return payload;
}

async function _packEnvelopeForUrl(envelope){
  const json = JSON.stringify(envelope);
  const raw = _utf8Encoder.encode(json);
  const rawToken = `raw.${_toBase64Url(raw)}`;

  if(_hasLzString()){
    try{
      const compressed = window.LZString.compressToEncodedURIComponent(json);
      const lzToken = `lz.${compressed}`;
      if(lzToken.length < rawToken.length) return lzToken;
    }catch(_e){}
  }

  if(!_hasCompressionStreams()) return rawToken;

  try{
    const compressed = await _withTimeout(_gzipBytes(raw), 1200, 'gzip');
    const zipToken = `gz.${_toBase64Url(compressed)}`;
    // Keep the smaller one for safety on tiny payloads.
    return zipToken.length < rawToken.length ? zipToken : rawToken;
  }catch(_e){
    return rawToken;
  }
}

function _packEnvelopeForEmbeddedHtml(envelope){
  const json = JSON.stringify(envelope);
  const raw = _utf8Encoder.encode(json);
  const rawToken = `raw.${_toBase64Url(raw)}`;
  if(_hasLzString()){
    try{
      const compressed = window.LZString.compressToEncodedURIComponent(json);
      const lzToken = `lz.${compressed}`;
      return lzToken.length < rawToken.length ? lzToken : rawToken;
    }catch(_e){}
  }
  return rawToken;
}

async function _unpackEnvelopeFromUrl(token){
  if(typeof token !== 'string' || !token) throw new Error('share token is empty');
  const dot = token.indexOf('.');
  if(dot <= 0) throw new Error('invalid share token');
  const codec = token.slice(0, dot);
  const body = token.slice(dot + 1);
  if(codec === 'lz'){
    if(!_hasLzString()) throw new Error('compressed share URL is not supported in this browser');
    const json = window.LZString.decompressFromEncodedURIComponent(body);
    if(typeof json !== 'string' || !json.length) throw new Error('failed to decode compressed share URL');
    return JSON.parse(json);
  }

  let bytes = _fromBase64Url(body);
  if(codec === 'gz'){
    if(!_hasCompressionStreams()) throw new Error('compressed share URL is not supported in this browser');
    bytes = await _withTimeout(_gunzipBytes(bytes), 1200, 'gunzip');
  }else if(codec !== 'raw'){
    throw new Error(`unknown codec: ${codec}`);
  }
  const json = _utf8Decoder.decode(bytes);
  return JSON.parse(json);
}

function _shareParamsFromUrl(){
  const u = new URL(window.location.href);
  const qp = u.searchParams;
  const hp = new URLSearchParams(String(u.hash || '').replace(/^#/, ''));
  return {
    g: hp.get('g') || qp.get('g') || ''
  };
}

function _baseAppUrl(){
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  return u;
}

function _asDirectoryUrl(urlLike){
  const u = new URL(String(urlLike || ''), _baseAppUrl().toString());
  const path = String(u.pathname || '/');
  if(/\/[^\/]+\.[a-z0-9]+$/i.test(path)){
    u.pathname = path.replace(/\/[^\/]*$/, '/');
  }else if(!path.endsWith('/')){
    u.pathname = `${path}/`;
  }
  u.search = '';
  u.hash = '';
  return u;
}

function _appRootUrl(){
  return _asDirectoryUrl(_baseAppUrl());
}

function _documentExportBaseFrom(doc){
  const d = doc || document;
  if(!d || !d.querySelector) return '';
  const metaBase = d.querySelector('meta[name="fact-sim-export-base"]');
  const metaValue = String(metaBase?.getAttribute('content') || '').trim();
  if(metaValue) return metaValue;
  const baseEl = d.querySelector('base[data-factsim-export]');
  const href = String(baseEl?.getAttribute('href') || '').trim();
  if(href) return href;
  return '';
}

function _resolveExportAppBase(templateDoc){
  const fallback = _appRootUrl().toString();
  const fromTemplate = _documentExportBaseFrom(templateDoc);
  if(fromTemplate){
    try{ return _asDirectoryUrl(fromTemplate).toString(); }catch(_e){}
  }
  const fromCurrent = _documentExportBaseFrom(document);
  if(fromCurrent){
    try{ return _asDirectoryUrl(fromCurrent).toString(); }catch(_e){}
  }
  return fallback;
}

function _embeddedShareTokenFromHtml(){
  const globalToken = window.__FACT_SIM_EMBEDDED_TOKEN;
  if(typeof globalToken === 'string' && globalToken.trim()){
    return globalToken.trim();
  }
  const el = document.getElementById('factSimEmbeddedToken');
  if(!el) return '';
  const token = String(el.textContent || '').trim();
  return token || '';
}

async function _loadExportHtmlTemplate(){
  let root = _appRootUrl();
  const docBase = _documentExportBaseFrom(document);
  if(docBase){
    try{ root = _asDirectoryUrl(docBase); }catch(_e){}
  }
  const url = new URL('index.html', root.toString()).toString();
  try{
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if(!res.ok) throw new Error(`template fetch HTTP ${res.status}`);
    return await res.text();
  }catch(_e){
    return '<!DOCTYPE html>\n' + String(document.documentElement?.outerHTML || '');
  }
}

function _injectEmbeddedTokenIntoHtml(htmlText, token){
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(htmlText || ''), 'text/html');
  if(!doc || !doc.documentElement) throw new Error('failed to parse export template');

  const appBase = _resolveExportAppBase(doc);
  const head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement;
  let baseEl = head.querySelector('base[data-factsim-export]');
  if(!baseEl){
    baseEl = doc.createElement('base');
    baseEl.setAttribute('data-factsim-export', '1');
    if(head.firstChild) head.insertBefore(baseEl, head.firstChild);
    else head.appendChild(baseEl);
  }
  baseEl.setAttribute('href', appBase);

  let baseMeta = head.querySelector('meta[name="fact-sim-export-base"]');
  if(!baseMeta){
    baseMeta = doc.createElement('meta');
    baseMeta.setAttribute('name', 'fact-sim-export-base');
    head.appendChild(baseMeta);
  }
  baseMeta.setAttribute('content', appBase);

  const oldBoot = doc.getElementById('factSimEmbeddedTokenBootstrap');
  if(oldBoot && oldBoot.parentNode) oldBoot.parentNode.removeChild(oldBoot);
  const boot = doc.createElement('script');
  boot.id = 'factSimEmbeddedTokenBootstrap';
  const tokenJson = JSON.stringify(String(token || ''));
  boot.textContent =
    `(function(){` +
    `var t=${tokenJson};` +
    `window.__FACT_SIM_EMBEDDED_TOKEN=t;` +
    `try{` +
    `if(!(location.hash && /(^|[&#?])g=/.test(location.hash))){location.hash='g='+t;}` +
    `}catch(_e){}` +
    `})();`;
  const firstHeadScript = head.querySelector('script');
  if(firstHeadScript) head.insertBefore(boot, firstHeadScript);
  else head.appendChild(boot);

  const old = doc.getElementById('factSimEmbeddedToken');
  if(old && old.parentNode) old.parentNode.removeChild(old);
  const body = doc.body || doc.documentElement;
  const tokenScript = doc.createElement('script');
  tokenScript.id = 'factSimEmbeddedToken';
  tokenScript.type = 'application/json';
  tokenScript.textContent = token;
  const firstBodyScript = body.querySelector('script');
  if(firstBodyScript) body.insertBefore(tokenScript, firstBodyScript);
  else body.appendChild(tokenScript);

  const marker = doc.createElement('meta');
  marker.setAttribute('name', 'fact-sim-export');
  marker.setAttribute('content', 'embedded-v1');
  const oldMarker = head.querySelector('meta[name="fact-sim-export"]');
  if(oldMarker && oldMarker.parentNode) oldMarker.parentNode.removeChild(oldMarker);
  head.appendChild(marker);

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

async function _copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', 'readonly');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.focus();
  area.select();
  document.execCommand('copy');
  area.remove();
}

App.buildEmbeddedShareUrl = async function(){
  const envelope = _shareEnvelope(_serializeGraph());
  const token = await _packEnvelopeForUrl(envelope);
  const u = _baseAppUrl();
  u.hash = `g=${token}`;
  return u.toString();
};

App.buildEmbeddedExportHtml = async function(){
  const envelope = _shareEnvelope(_serializeGraph());
  const token = _packEnvelopeForEmbeddedHtml(envelope);
  const template = await _loadExportHtmlTemplate();
  return _injectEmbeddedTokenIntoHtml(template, token);
};

App.loadSharedGraphFromUrl = async function(){
  const loadRevision = (typeof App.bumpGraphLoadRevision === 'function')
    ? App.bumpGraphLoadRevision()
    : ((App._graphLoadRevision = (Number(App._graphLoadRevision) || 0) + 1));
  const embeddedToken = _embeddedShareTokenFromHtml();
  if(embeddedToken){
    try{
      const payload = await _unpackEnvelopeFromUrl(embeddedToken);
      const graph = _unwrapEnvelope(payload);
      const applied = _applyGraphData(graph, { source: 'embedded', expectedRevision: loadRevision });
      if(applied){
        App.showToast('Embedded graph loaded');
        return true;
      }
    }catch(err){
      console.warn('[share] embedded token load failed, fallback to #g', err);
      if(typeof App.showToast === 'function'){
        App.showToast('Embedded load failed, fallback to URL/default');
      }
    }
  }

  const p = _shareParamsFromUrl();
  if(!p.g){
    const u = new URL(window.location.href);
    const qp = u.searchParams;
    const hp = new URLSearchParams(String(u.hash || '').replace(/^#/, ''));
    const legacySid = hp.get('sid') || qp.get('sid') || '';
    if(legacySid) throw new Error('Share ID is no longer supported. Please use Share URL (#g=...).');
    return false;
  }
  const payload = await _unpackEnvelopeFromUrl(p.g);
  const graph = _unwrapEnvelope(payload);
  const applied = _applyGraphData(graph, { source: 'share', expectedRevision: loadRevision });
  if(!applied) return false;
  App.showToast('Shared graph loaded');
  return true;
};

(function initShareUrlModal(){
  const modal = document.getElementById('shareUrlModal');
  const closeBtn = document.getElementById('shareUrlClose');
  const valueEl = document.getElementById('shareUrlValue');
  const lenEl = document.getElementById('shareUrlLength');
  const warnEl = document.getElementById('shareUrlWarning');
  const copyBtn = document.getElementById('shareUrlCopyBtn');
  if(!modal || !closeBtn || !valueEl || !lenEl || !warnEl || !copyBtn) return;

  const close = ()=>{
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  };
  const open = ()=>{
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
  };

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e)=>{ if(e.target === modal) close(); });
  window.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && modal.style.display === 'block') close();
  });

  copyBtn.addEventListener('click', async ()=>{
    try{
      await _copyText(valueEl.value || '');
      if(typeof App.showToast === 'function') App.showToast('Share URL copied');
    }catch(err){
      console.error(err);
      alert('Failed to copy Share URL');
    }
  });

  App.showShareUrlModal = function(link){
    const text = String(link || '');
    valueEl.value = text;
    lenEl.textContent = `URL length: ${text.length.toLocaleString()} characters`;
    if(text.length > 8000){
      warnEl.textContent = 'Warning: URL may exceed limits in some environments.';
    }else if(text.length > 4000){
      warnEl.textContent = 'Caution: URL is relatively long for some browsers/tools.';
    }else{
      warnEl.textContent = '';
    }
    open();
    return true;
  };
})();

const btnSave = document.getElementById('btnSave');
if(btnSave){
  btnSave.onclick = ()=>{
    const blob = new Blob([JSON.stringify(_serializeGraph(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graph.json';
    a.click();
    URL.revokeObjectURL(url);
  };
}

const btnLoad = document.getElementById('btnLoad');
if(btnLoad){
  btnLoad.onclick = ()=> document.getElementById('fileInput').click();
}

const btnShareUrl = document.getElementById('btnShareUrl');
if(btnShareUrl){
  btnShareUrl.onclick = async ()=>{
    try{
      const link = await App.buildEmbeddedShareUrl();
      await _copyText(link);
      App.showToast('Share URL copied');
      if(typeof App.showShareUrlModal === 'function'){
        App.showShareUrlModal(link);
      }
    }catch(err){
      alert('Failed to create Share URL');
      console.error(err);
    }
  };
}

const btnExportHtml = document.getElementById('btnExportHtml');
if(btnExportHtml){
  btnExportHtml.onclick = async ()=>{
    try{
      const html = await App.buildEmbeddedExportHtml();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fact_sim_embedded.html';
      a.click();
      URL.revokeObjectURL(url);
      if(typeof App.showToast === 'function') App.showToast('Embedded HTML exported');
    }catch(err){
      console.error(err);
      alert('Failed to export embedded HTML');
    }
  };
}

const fileInput = document.getElementById('fileInput');
if(fileInput){
  fileInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = () => {
      try{
        const parsed = JSON.parse(r.result);
        const loadRevision = (typeof App.bumpGraphLoadRevision === 'function')
          ? App.bumpGraphLoadRevision()
          : ((App._graphLoadRevision = (Number(App._graphLoadRevision) || 0) + 1));
        _applyGraphData(parsed, { source: 'file', expectedRevision: loadRevision });
      }catch(err){
        alert('Failed to load JSON');
        console.error(err);
      }finally{
        e.target.value = '';
      }
    };
    r.readAsText(f);
  });
}
