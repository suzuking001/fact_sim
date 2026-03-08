// Stop group model/runtime (random stop / scheduled stop)

var App = window.App || (window.App = {});

(function(){
  const EXTRA_KEY = 'stopGroupsV1';
  const GROUP_MIN_W = 220;
  const GROUP_MIN_H = 140;
  const GROUP_DEFAULT_W = 360;
  const GROUP_DEFAULT_H = 220;
  const ACTIVE_STOP_COLOR = '#fca5a5';
  const EPS_MS = 0.001;

  const TYPE_DEFS = Object.create(null);
  let groupRevision = 0;
  let uidCounter = 0;
  let activeRuntime = null;
  let pausedNodeIds = new Set();

  function bumpRevision(draw){
    groupRevision++;
    if(draw && App.canvas && typeof App.canvas.draw === 'function'){
      App.canvas.draw(true, true);
    }
  }

  function toNum(v, fallback){
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function clampNonNegative(v, fallback){
    const n = toNum(v, fallback);
    return n < 0 ? 0 : n;
  }

  function clampInt(v, fallback){
    const n = Math.round(toNum(v, fallback));
    return isFinite(n) ? n : fallback;
  }

  function asTitle(text, fallback){
    const t = String(text == null ? '' : text).trim();
    return t || fallback;
  }

  function createUid(){
    uidCounter++;
    return `sg-${Date.now().toString(36)}-${uidCounter.toString(36)}`;
  }

  function hashSeed(seed){
    const s = String(seed == null ? '' : seed);
    let h = 2166136261 >>> 0;
    for(let i = 0; i < s.length; i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    if(h === 0) h = 0x9e3779b9;
    return h >>> 0;
  }

  function makeXorShift32(seed){
    let x = hashSeed(seed) >>> 0;
    return function(){
      x ^= (x << 13) >>> 0;
      x ^= (x >>> 17) >>> 0;
      x ^= (x << 5) >>> 0;
      return (x >>> 0) / 4294967296;
    };
  }

  function sampleNormal(rng, mean, sigma){
    const m = toNum(mean, 0);
    const s = Math.max(0, toNum(sigma, 0));
    if(s <= 0) return m;

    let u1 = 0;
    let u2 = 0;
    while(u1 <= Number.EPSILON) u1 = rng();
    u2 = rng();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    return m + z0 * s;
  }

  function normalizeType(type){
    const key = String(type || '').trim().toLowerCase();
    if(!key) return 'random_stop';
    if(TYPE_DEFS[key]) return key;
    if(key === 'random') return 'random_stop';
    if(key === 'scheduled' || key === 'periodic') return 'scheduled_stop';
    return key;
  }

  function getTypeDef(type){
    return TYPE_DEFS[normalizeType(type)] || TYPE_DEFS.random_stop;
  }

  function normalizeRandomProps(raw){
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      intervalMedianSec: clampNonNegative(src.intervalMedianSec ?? src.stopIntervalMedianSec, 300),
      intervalSigmaSec: clampNonNegative(src.intervalSigmaSec ?? src.stopIntervalSigmaSec, 30),
      durationMedianSec: clampNonNegative(src.durationMedianSec ?? src.stopDurationMedianSec, 45),
      durationSigmaSec: clampNonNegative(src.durationSigmaSec ?? src.stopDurationSigmaSec, 8),
      randomSeed: String(src.randomSeed == null ? '1' : src.randomSeed)
    };
  }

  function normalizeScheduledProps(raw){
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      intervalSec: clampNonNegative(src.intervalSec ?? src.stopIntervalSec, 600),
      durationSec: clampNonNegative(src.durationSec ?? src.stopDurationSec, 60)
    };
  }

  function estimateStopRatePercent(type, props){
    const def = getTypeDef(type);
    if(def && typeof def.estimateStopRatePercent === 'function'){
      const p = Number(def.estimateStopRatePercent(props));
      return isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
    }
    return 0;
  }

  function normalizeMeta(meta){
    const src = meta && typeof meta === 'object' ? meta : {};
    const requestedType = normalizeType(src.type);
    const type = TYPE_DEFS[requestedType] ? requestedType : 'random_stop';
    const def = getTypeDef(type);
    const normalizedProps = def && typeof def.normalizeProps === 'function'
      ? def.normalizeProps(src.props || src)
      : (src.props || {});

    return {
      uid: asTitle(src.uid, createUid()),
      type,
      title: asTitle(src.title, def.defaultTitle || 'Stop Group'),
      props: normalizedProps
    };
  }

  function setGroupBounds(group, x, y, w, h){
    if(!group) return;
    const nx = toNum(x, 0);
    const ny = toNum(y, 0);
    const nw = Math.max(GROUP_MIN_W, toNum(w, GROUP_DEFAULT_W));
    const nh = Math.max(GROUP_MIN_H, toNum(h, GROUP_DEFAULT_H));
    if(group._bounding && group._bounding.length >= 4){
      group._bounding[0] = nx;
      group._bounding[1] = ny;
      group._bounding[2] = nw;
      group._bounding[3] = nh;
      return;
    }
    if(Array.isArray(group.pos)) group.pos = [nx, ny];
    if(Array.isArray(group.size)) group.size = [nw, nh];
  }

  function applyVisual(group, meta, active){
    if(!group || !meta) return;
    const def = getTypeDef(meta.type);
    const idleColor = def.groupColor || '#f59e0b';
    const activeColor = def.groupActiveColor || ACTIVE_STOP_COLOR;
    group.color = active ? activeColor : idleColor;
    group.title = asTitle(meta.title, def.defaultTitle || 'Stop Group');
    if(group._bounding && group._bounding.length >= 4){
      if(group._bounding[2] < GROUP_MIN_W) group._bounding[2] = GROUP_MIN_W;
      if(group._bounding[3] < GROUP_MIN_H) group._bounding[3] = GROUP_MIN_H;
    }
  }

  function getGroupMeta(group){
    if(!group || !group.__stopGroupMeta) return null;
    return group.__stopGroupMeta;
  }

  function setGroupMeta(group, meta, draw){
    if(!group) return null;
    const normalized = normalizeMeta(meta);
    group.__stopGroupMeta = normalized;
    applyVisual(group, normalized, false);
    bumpRevision(draw !== false);
    return normalized;
  }

  function clearGroupMeta(group, draw){
    if(!group || !group.__stopGroupMeta) return false;
    delete group.__stopGroupMeta;
    bumpRevision(draw !== false);
    return true;
  }

  function listStopGroups(graph){
    const g = graph || App.graph;
    if(!g || !Array.isArray(g._groups)) return [];
    const out = [];
    for(let i = 0; i < g._groups.length; i++){
      const group = g._groups[i];
      const meta = getGroupMeta(group);
      if(!meta) continue;
      out.push({ index: i, group, meta });
    }
    return out;
  }

  function injectSerializedData(serialized, graph){
    if(!serialized || typeof serialized !== 'object') return serialized;
    const list = listStopGroups(graph).map((row)=>({
      index: row.index,
      uid: row.meta.uid,
      type: row.meta.type,
      title: row.meta.title,
      props: row.meta.props
    }));

    if(!list.length){
      if(serialized.extra && typeof serialized.extra === 'object'){
        delete serialized.extra[EXTRA_KEY];
        if(Object.keys(serialized.extra).length === 0) delete serialized.extra;
      }
      return serialized;
    }

    serialized.extra = (serialized.extra && typeof serialized.extra === 'object')
      ? serialized.extra
      : {};
    serialized.extra[EXTRA_KEY] = list;
    return serialized;
  }

  function restoreSerializedData(graph, data, draw){
    const g = graph || App.graph;
    if(!g || !Array.isArray(g._groups)) return 0;

    const list = Array.isArray(data?.extra?.[EXTRA_KEY]) ? data.extra[EXTRA_KEY] : [];
    for(const group of g._groups){
      if(group && group.__stopGroupMeta) delete group.__stopGroupMeta;
    }

    let applied = 0;
    for(const entry of list){
      const index = clampInt(entry?.index, -1);
      if(index < 0 || index >= g._groups.length) continue;
      const group = g._groups[index];
      if(!group) continue;
      const meta = setGroupMeta(group, entry, false);
      applyVisual(group, meta, false);
      applied++;
    }
    bumpRevision(draw !== false);
    return applied;
  }

  function groupBounds(group){
    if(group && group._bounding && group._bounding.length >= 4){
      return {
        x: Number(group._bounding[0]) || 0,
        y: Number(group._bounding[1]) || 0,
        w: Math.max(0, Number(group._bounding[2]) || 0),
        h: Math.max(0, Number(group._bounding[3]) || 0)
      };
    }
    const p = Array.isArray(group?.pos) ? group.pos : [0, 0];
    const s = Array.isArray(group?.size) ? group.size : [0, 0];
    return { x: Number(p[0]) || 0, y: Number(p[1]) || 0, w: Math.max(0, Number(s[0]) || 0), h: Math.max(0, Number(s[1]) || 0) };
  }

  function isNodeInsideGroup(node, group){
    if(!node || !group) return false;
    const b = groupBounds(group);
    if(b.w <= 0 || b.h <= 0) return false;
    const pos = Array.isArray(node.pos) ? node.pos : [0, 0];
    const size = Array.isArray(node.size) ? node.size : [140, 80];
    const cx = (Number(pos[0]) || 0) + (Number(size[0]) || 0) * 0.5;
    const cy = (Number(pos[1]) || 0) + (Number(size[1]) || 0) * 0.5;
    return cx >= b.x && cx <= (b.x + b.w) && cy >= b.y && cy <= (b.y + b.h);
  }

  function collectGroupNodeIds(graph, group, outSet){
    if(!graph || !group || !outSet) return;

    try{
      if(typeof group.recomputeInsideNodes === 'function'){
        group.recomputeInsideNodes();
      }
    }catch(_e){}

    if(Array.isArray(group._nodes) && group._nodes.length){
      for(const node of group._nodes){
        if(!node || typeof node.id === 'undefined') continue;
        outSet.add(node.id);
      }
      return;
    }

    // Fallback: strict full-bounds check.
    const b = groupBounds(group);
    if(b.w <= 0 || b.h <= 0 || !Array.isArray(graph._nodes)) return;
    const bx2 = b.x + b.w;
    const by2 = b.y + b.h;
    const tmp = new Float32Array(4);
    for(const node of graph._nodes){
      if(!node || typeof node.id === 'undefined') continue;
      let nx = 0;
      let ny = 0;
      let nw = 0;
      let nh = 0;
      if(typeof node.getBounding === 'function'){
        try{
          node.getBounding(tmp);
          nx = Number(tmp[0]) || 0;
          ny = Number(tmp[1]) || 0;
          nw = Math.max(0, Number(tmp[2]) || 0);
          nh = Math.max(0, Number(tmp[3]) || 0);
        }catch(_e){
          const pos = Array.isArray(node.pos) ? node.pos : [0, 0];
          const size = Array.isArray(node.size) ? node.size : [0, 0];
          nx = Number(pos[0]) || 0;
          ny = Number(pos[1]) || 0;
          nw = Math.max(0, Number(size[0]) || 0);
          nh = Math.max(0, Number(size[1]) || 0);
        }
      }else{
        const pos = Array.isArray(node.pos) ? node.pos : [0, 0];
        const size = Array.isArray(node.size) ? node.size : [0, 0];
        nx = Number(pos[0]) || 0;
        ny = Number(pos[1]) || 0;
        nw = Math.max(0, Number(size[0]) || 0);
        nh = Math.max(0, Number(size[1]) || 0);
      }
      const nx2 = nx + nw;
      const ny2 = ny + nh;
      if(nx >= b.x && ny >= b.y && nx2 <= bx2 && ny2 <= by2){
        outSet.add(node.id);
      }
    }
  }

  function hasTimedState(node){
    if(!node) return false;
    const state = String(node._state || '').toUpperCase();
    if(state === 'PROCESS' || state === 'DOWN') return true;
    const stateName = String(node._stateName || '').toLowerCase();
    return stateName.indexOf('process') >= 0 || stateName.indexOf('down') >= 0;
  }

  function patchNodeExecution(node){
    if(!node) return;
    if(typeof node.onExecute !== 'function'){
      node.__stopGroupPatched = true;
      return;
    }

    const current = node.onExecute;
    if(current && current.__stopGroupPauseWrapped) return;

    const raw = current;
    const wrapped = function(){
      if(App.stopGroups && typeof App.stopGroups.isNodePaused === 'function'){
        if(App.stopGroups.isNodePaused(this)) return;
      }
      return raw.apply(this, arguments);
    };
    wrapped.__stopGroupPauseWrapped = true;
    wrapped.__stopGroupRawOnExecute = raw;

    node.onExecute = wrapped;
    node.__stopGroupPatched = true;
    node.__stopGroupRawOnExecute = raw;
  }

  class StopGroupRuntime{
    constructor(graph){
      this.graph = graph;
      this.states = [];
      this.signature = '';
      this.lastRevision = -1;
      this.lastNodeCount = -1;
      this._hasPatchedNodes = false;
      this.pausedNodeIds = new Set();
      this._pausedDirty = true;
      this._activeStateSignature = '';
      this._pauseNodeCount = -1;
    }

    reset(nowMs){
      this.states = [];
      this.signature = '';
      this.lastRevision = -1;
      this.lastNodeCount = -1;
      this._hasPatchedNodes = false;
      this.pausedNodeIds = new Set();
      this._pausedDirty = true;
      this._activeStateSignature = '';
      this._pauseNodeCount = -1;
      pausedNodeIds = this.pausedNodeIds;
      this._sync(nowMs);
      this.update(nowMs);
    }

    stop(){
      this.pausedNodeIds.clear();
      if(activeRuntime === this) activeRuntime = null;
      pausedNodeIds = new Set();
      this._hasPatchedNodes = false;
      this._pausedDirty = true;
      this._activeStateSignature = '';
      this._pauseNodeCount = -1;
    }

    _makeSignature(){
      const groups = Array.isArray(this.graph?._groups) ? this.graph._groups : [];
      const keys = [];
      for(let i = 0; i < groups.length; i++){
        const meta = getGroupMeta(groups[i]);
        if(!meta) continue;
        keys.push(`${i}:${meta.uid}:${meta.type}:${meta.title}`);
      }
      return keys.join('|');
    }

    _sync(nowMs){
      if(!this.graph) return;
      const rev = groupRevision;
      const sig = this._makeSignature();
      const needsResync = (sig !== this.signature) || (rev !== this.lastRevision);
      if(!needsResync){
        if(this._hasPatchedNodes && this.states.length){
          this._ensureNodePatch();
        }
        return;
      }

      const prevMap = new Map();
      for(const st of this.states){
        if(st && st.meta && st.meta.uid) prevMap.set(st.meta.uid, st);
      }

      const nextStates = [];
      const groups = Array.isArray(this.graph._groups) ? this.graph._groups : [];
      for(let i = 0; i < groups.length; i++){
        const group = groups[i];
        const meta = getGroupMeta(group);
        if(!meta) continue;

        let st = prevMap.get(meta.uid);
        if(!st || st.meta.type !== meta.type){
          st = this._createState(group, meta, nowMs);
        }else{
          st.group = group;
          st.meta = meta;
        }
        nextStates.push(st);
      }

      this.states = nextStates;
      this.signature = sig;
      this.lastRevision = rev;
      this._hasPatchedNodes = false;
      this._pausedDirty = true;
      if(this.states.length){
        this._ensureNodePatch(true);
      }
    }

    _ensureNodePatch(force){
      const nodes = Array.isArray(this.graph?._nodes) ? this.graph._nodes : [];
      if(!force && this.lastNodeCount === nodes.length){
        for(const node of nodes){
          if(!node || typeof node.onExecute !== 'function') continue;
          if(node.onExecute && node.onExecute.__stopGroupPauseWrapped) continue;
          patchNodeExecution(node);
        }
        this._hasPatchedNodes = true;
        return;
      }
      for(const node of nodes) patchNodeExecution(node);
      this.lastNodeCount = nodes.length;
      this._hasPatchedNodes = true;
    }

    _createState(group, meta, nowMs){
      const def = getTypeDef(meta.type);
      const st = {
        group,
        meta,
        active: false,
        nextTransitionMs: Infinity,
        runtime: null
      };
      if(def && typeof def.createRuntimeState === 'function'){
        st.runtime = def.createRuntimeState(meta.props, nowMs);
        st.active = !!st.runtime.active;
        st.nextTransitionMs = Number(st.runtime.nextTransitionMs);
      }
      if(!isFinite(st.nextTransitionMs)) st.nextTransitionMs = Infinity;
      applyVisual(group, meta, st.active);
      return st;
    }

    _advanceState(st){
      const def = getTypeDef(st.meta.type);
      if(!def || typeof def.advanceRuntimeState !== 'function') return false;
      const changed = !!def.advanceRuntimeState(st.runtime, st.meta.props);
      st.active = !!st.runtime.active;
      st.nextTransitionMs = Number(st.runtime.nextTransitionMs);
      if(!isFinite(st.nextTransitionMs)) st.nextTransitionMs = Infinity;
      if(changed) applyVisual(st.group, st.meta, st.active);
      return changed;
    }

    _updateStates(nowMs){
      let changed = false;
      for(const st of this.states){
        if(!st || !isFinite(st.nextTransitionMs)) continue;
        let guard = 0;
        while(nowMs + EPS_MS >= st.nextTransitionMs && guard++ < 1024){
          const stepChanged = this._advanceState(st);
          changed = changed || stepChanged;
          if(!isFinite(st.nextTransitionMs)) break;
        }
      }
      return changed;
    }

    _computeActiveSignature(){
      if(!this.states.length) return '';
      const keys = [];
      for(let i = 0; i < this.states.length; i++){
        const st = this.states[i];
        if(!st || !st.active || !st.meta) continue;
        keys.push(`${i}:${st.meta.uid}`);
      }
      return keys.join('|');
    }

    _rebuildPausedNodes(){
      const activeStates = this.states.filter((st)=> st && st.active && st.group);
      if(!activeStates.length){
        if(this.pausedNodeIds.size){
          this.pausedNodeIds = new Set();
          pausedNodeIds = this.pausedNodeIds;
        }
        return;
      }

      const next = new Set();
      for(const st of activeStates){
        collectGroupNodeIds(this.graph, st.group, next);
      }
      this.pausedNodeIds = next;
      pausedNodeIds = this.pausedNodeIds;
    }

    update(nowMs){
      const now = Number(nowMs);
      if(!isFinite(now)) return;
      this._sync(now);
      if(!this.states.length){
        if(this.pausedNodeIds.size){
          this.pausedNodeIds = new Set();
          pausedNodeIds = this.pausedNodeIds;
        }
        this._pausedDirty = false;
        this._activeStateSignature = '';
        this._pauseNodeCount = Array.isArray(this.graph?._nodes) ? this.graph._nodes.length : 0;
        activeRuntime = this;
        return;
      }
      const stateChanged = this._updateStates(now);
      if(stateChanged) this._pausedDirty = true;

      const activeSignature = this._computeActiveSignature();
      const nodeCount = Array.isArray(this.graph?._nodes) ? this.graph._nodes.length : 0;
      if(activeSignature !== this._activeStateSignature) this._pausedDirty = true;
      if(nodeCount !== this._pauseNodeCount) this._pausedDirty = true;

      if(this._pausedDirty){
        this._rebuildPausedNodes();
        this._pausedDirty = false;
        this._activeStateSignature = activeSignature;
        this._pauseNodeCount = nodeCount;
      }
      activeRuntime = this;
    }

    getNextTransitionMs(nowMs){
      this.update(nowMs);
      let min = Infinity;
      for(const st of this.states){
        if(!st || !isFinite(st.nextTransitionMs)) continue;
        if(st.nextTransitionMs > nowMs + EPS_MS && st.nextTransitionMs < min){
          min = st.nextTransitionMs;
        }
      }
      return min;
    }

    beforeAdvance(nowMs, deltaMs){
      const now = Number(nowMs);
      const delta = Number(deltaMs);
      if(!isFinite(now) || !isFinite(delta) || delta <= 0) return;
      this.update(now);
      if(!this.pausedNodeIds.size) return;
      if(!this.graph || typeof this.graph.getNodeById !== 'function') return;
      for(const nodeId of this.pausedNodeIds){
        const node = this.graph.getNodeById(nodeId);
        if(!node || !hasTimedState(node)) continue;
        const until = Number(node._until);
        if(!isFinite(until)) continue;
        node._until = until + delta;
      }
    }
  }

  function createRuntime(graph){
    return new StopGroupRuntime(graph);
  }

  function parseUiFieldValue(field, raw, fallback){
    if(!field) return raw;
    if(field.type === 'number'){
      const n = Number(raw);
      if(!isFinite(n)) return fallback;
      return n;
    }
    if(field.type === 'checkbox'){
      return !!raw;
    }
    return raw;
  }

  function describeType(type){
    const key = normalizeType(type);
    if(key === 'random_stop') return 'Randomized shared downtime using interval and duration distributions.';
    if(key === 'scheduled_stop') return 'Fixed shared downtime for breaks, planned stops, and recurring pauses.';
    return 'Shared stop behavior applied to nodes inside this group.';
  }

  function cloneMeta(metaLike, overrides){
    const src = normalizeMeta(metaLike);
    const next = {
      uid: overrides && Object.prototype.hasOwnProperty.call(overrides, 'uid') ? overrides.uid : src.uid,
      type: overrides && Object.prototype.hasOwnProperty.call(overrides, 'type') ? overrides.type : src.type,
      title: overrides && Object.prototype.hasOwnProperty.call(overrides, 'title') ? overrides.title : src.title,
      props: {
        ...(src.props || {}),
        ...((overrides && overrides.props) || {})
      }
    };
    return normalizeMeta(next);
  }

  function createDetachedGroup(metaLike){
    const meta = normalizeMeta(metaLike);
    const group = new LiteGraph.LGraphGroup(meta.title);
    setGroupBounds(group, 40, 160, GROUP_DEFAULT_W, GROUP_DEFAULT_H);
    group.__stopGroupMeta = meta;
    applyVisual(group, meta, false);
    return { group, meta };
  }

  function fitViewToBounds(bounds, options){
    if(!App.canvas || !bounds) return false;
    const canvasEl = App.canvas.canvas;
    if(!canvasEl || !App.canvas.ds) return false;
    const rect = canvasEl.getBoundingClientRect();
    const cw = rect.width || canvasEl.clientWidth || canvasEl.width || 800;
    const ch = rect.height || canvasEl.clientHeight || canvasEl.height || 600;
    const margin = Math.max(24, Number(options?.margin) || 48);
    const w = Math.max(1, Number(bounds.w) || 1);
    const h = Math.max(1, Number(bounds.h) || 1);
    let scale = Math.min((cw - margin * 2) / w, (ch - margin * 2) / h);
    if(App.canvas.ds.max_scale) scale = Math.min(scale, App.canvas.ds.max_scale);
    if(App.canvas.ds.min_scale && scale < App.canvas.ds.min_scale){
      App.canvas.ds.min_scale = scale;
    }
    if(!isFinite(scale) || scale <= 0) scale = 1;
    const cx = (Number(bounds.x) || 0) + w * 0.5;
    const cy = (Number(bounds.y) || 0) + h * 0.5;
    App.canvas.ds.scale = scale;
    App.canvas.ds.offset[0] = (cw * 0.5) / scale - cx;
    App.canvas.ds.offset[1] = (ch * 0.5) / scale - cy;
    App.canvas.setDirty(true, true);
    return true;
  }

  function fitViewToGroup(group, options){
    if(!group) return false;
    return fitViewToBounds(groupBounds(group), options);
  }

  function selectGroupNodes(group){
    if(!App.canvas || !App.graph || !group) return 0;
    const ids = new Set();
    collectGroupNodeIds(App.graph, group, ids);
    const nodes = [];
    for(const id of ids){
      const node = App.graph.getNodeById ? App.graph.getNodeById(id) : null;
      if(node) nodes.push(node);
    }
    if(!nodes.length) return 0;
    try{
      App.canvas.selectNodes(nodes, false);
      App.canvas.setDirty(true, true);
    }catch(_e){}
    return nodes.length;
  }

  function removeGroup(group){
    if(!group || !App.graph) return false;
    try{
      if(typeof App.graph.beforeChange === 'function') App.graph.beforeChange();
      App.graph.remove(group);
      clearGroupMeta(group, false);
      bumpRevision(true);
    }finally{
      if(typeof App.graph.afterChange === 'function') App.graph.afterChange();
    }
    return true;
  }

  function duplicateGroup(group){
    if(!group || !App.graph) return null;
    const meta = getGroupMeta(group);
    if(!meta) return null;
    const duplicated = createDetachedGroup(cloneMeta(meta, {
      uid: createUid(),
      title: `${meta.title} Copy`
    })).group;
    const bounds = groupBounds(group);
    setGroupBounds(duplicated, bounds.x + 28, bounds.y + 28, bounds.w, bounds.h);
    try{
      if(typeof App.graph.beforeChange === 'function') App.graph.beforeChange();
      App.graph.add(duplicated);
      bumpRevision(true);
    }finally{
      if(typeof App.graph.afterChange === 'function') App.graph.afterChange();
    }
    return duplicated;
  }

  function getModalRefs(){
    const modal = document.getElementById('stopGroupModal');
    if(!modal) return null;
    return {
      modal,
      titleEl: document.getElementById('stopGroupModalTitle'),
      typeEl: document.getElementById('stopGroupType'),
      nameEl: document.getElementById('stopGroupTitleInput'),
      descriptionEl: document.getElementById('stopGroupDescription'),
      rateEl: document.getElementById('stopGroupRate'),
      propsEl: document.getElementById('stopGroupFields'),
      saveBtn: document.getElementById('stopGroupSave'),
      cancelBtn: document.getElementById('stopGroupCancel'),
      duplicateBtn: document.getElementById('stopGroupDuplicate'),
      deleteBtn: document.getElementById('stopGroupDelete'),
      selectBtn: document.getElementById('stopGroupSelectNodes'),
      fitBtn: document.getElementById('stopGroupFitView')
    };
  }

  function ensureModalBinding(){
    const refs = getModalRefs();
    if(!refs || refs.modal.__factBound) return refs;
    refs.modal.__factBound = true;

    const modalState = {
      mode: 'edit',
      group: null,
      placementPos: null,
      type: 'random_stop'
    };
    refs.modal.__factState = modalState;

    function makeField(field, value){
      const row = document.createElement('label');
      row.className = 'stopGroupField';
      const label = document.createElement('span');
      label.className = 'stopGroupFieldLabel';
      label.textContent = field.label || field.key;
      row.appendChild(label);

      let input = null;
      if(field.type === 'textarea'){
        input = document.createElement('textarea');
        input.rows = field.rows || 3;
      }else{
        input = document.createElement('input');
        input.type = field.type === 'number' ? 'number' : (field.type || 'text');
      }
      if(field.type === 'number'){
        if(typeof field.step !== 'undefined') input.step = String(field.step);
        if(typeof field.min !== 'undefined') input.min = String(field.min);
        if(typeof field.max !== 'undefined') input.max = String(field.max);
      }
      if(typeof value !== 'undefined' && value !== null){
        input.value = String(value);
      }else if(typeof field.default !== 'undefined'){
        input.value = String(field.default);
      }
      input.dataset.field = field.key;
      input.dataset.fieldType = field.type || 'text';
      row.appendChild(input);
      return row;
    }

    function currentTypeDef(){
      return getTypeDef(refs.typeEl.value || modalState.type || 'random_stop');
    }

    function captureDraftState(){
      const props = {};
      refs.propsEl.querySelectorAll('[data-field]').forEach((input)=>{
        const key = String(input.dataset.field || '').trim();
        if(!key) return;
        const fieldType = String(input.dataset.fieldType || 'text');
        if(fieldType === 'number'){
          const n = Number(input.value);
          props[key] = isFinite(n) ? n : input.value;
        }else{
          props[key] = input.value;
        }
      });
      return {
        title: refs.nameEl.value,
        props
      };
    }

    function readDraftMeta(){
      const def = currentTypeDef();
      const meta = {
        uid: modalState.group ? (getGroupMeta(modalState.group)?.uid || createUid()) : createUid(),
        type: refs.typeEl.value || modalState.type || 'random_stop',
        title: refs.nameEl.value,
        props: {}
      };
      const fields = Array.isArray(def?.uiFields) ? def.uiFields : [];
      for(const field of fields){
        if(!field || !field.key) continue;
        const input = refs.propsEl.querySelector(`[data-field="${field.key}"]`);
        if(!input) continue;
        const raw = input.value;
        meta.props[field.key] = parseUiFieldValue(field, raw, field.default);
      }
      return normalizeMeta(meta);
    }

    function updateRateAndDescription(){
      const draft = readDraftMeta();
      const pct = estimateStopRatePercent(draft.type, draft.props);
      refs.rateEl.textContent = `Reference stop rate: ${pct.toFixed(1)}%`;
      refs.descriptionEl.textContent = describeType(draft.type);
    }

    function renderFields(metaLike, options){
      const meta = cloneMeta(metaLike, { type: refs.typeEl.value || metaLike?.type || modalState.type });
      modalState.type = meta.type;
      refs.typeEl.value = meta.type;
      if(!options?.preserveTitle){
        refs.nameEl.value = meta.title || '';
      }else if(!String(refs.nameEl.value || '').trim()){
        refs.nameEl.value = meta.title || '';
      }
      refs.propsEl.innerHTML = '';
      const def = currentTypeDef();
      const fields = Array.isArray(def?.uiFields) ? def.uiFields : [];
      for(const field of fields){
        const value = Object.prototype.hasOwnProperty.call(meta.props || {}, field.key)
          ? meta.props[field.key]
          : field.default;
        const row = makeField(field, value);
        refs.propsEl.appendChild(row);
      }
      refs.propsEl.querySelectorAll('input,textarea,select').forEach((input)=>{
        input.addEventListener('input', updateRateAndDescription);
        input.addEventListener('change', updateRateAndDescription);
      });
      updateRateAndDescription();
    }

    function closeModal(){
      refs.modal.style.display = 'none';
      refs.modal.setAttribute('aria-hidden', 'true');
      modalState.group = null;
      modalState.placementPos = null;
    }

    function openModal(mode, group, options){
      const meta = group ? getGroupMeta(group) : normalizeMeta(options?.meta || { type: options?.type || 'random_stop' });
      if(!meta) return false;
      modalState.mode = mode;
      modalState.group = group || null;
      modalState.placementPos = Array.isArray(options?.placementPos) ? options.placementPos.slice(0, 2) : null;
      modalState.type = meta.type;

      refs.titleEl.textContent = mode === 'create' ? 'Add Stop Group' : 'Edit Stop Group';
      refs.duplicateBtn.style.display = mode === 'edit' ? '' : 'none';
      refs.deleteBtn.style.display = mode === 'edit' ? '' : 'none';
      refs.selectBtn.style.display = mode === 'edit' ? '' : 'none';
      refs.fitBtn.style.display = mode === 'edit' ? '' : 'none';

      refs.typeEl.innerHTML = '';
      const defs = App.stopGroups.getTypeDefinitions().sort((a, b)=>
        String(a.label || a.key).localeCompare(String(b.label || b.key))
      );
      for(const def of defs){
        const option = document.createElement('option');
        option.value = def.key;
        option.textContent = def.label || def.key;
        refs.typeEl.appendChild(option);
      }
      renderFields(meta);

      refs.modal.style.display = 'block';
      refs.modal.setAttribute('aria-hidden', 'false');
      refs.nameEl.focus();
      refs.nameEl.select();
      return true;
    }

    refs.typeEl.addEventListener('change', ()=>{
      const previous = captureDraftState();
      const baseMeta = modalState.group
        ? cloneMeta(getGroupMeta(modalState.group), {
            type: refs.typeEl.value || modalState.type,
            title: previous.title,
            props: previous.props
          })
        : normalizeMeta({
            type: refs.typeEl.value || modalState.type,
            title: previous.title || refs.nameEl.value,
            props: previous.props
          });
      renderFields(baseMeta, { preserveTitle: true });
    });

    refs.saveBtn.addEventListener('click', ()=>{
      const meta = readDraftMeta();
      if(modalState.mode === 'create'){
        const group = App.stopGroups.createGroup(meta);
        if(modalState.placementPos && App.canvas){
          App.canvas.__last_mouse = modalState.placementPos.slice(0, 2);
        }
        if(typeof window.beginGroupPlacement === 'function'){
          window.beginGroupPlacement(group);
        }else if(App.graph){
          App.graph.add(group);
        }
      }else if(modalState.group){
        try{
          if(App.graph && typeof App.graph.beforeChange === 'function') App.graph.beforeChange();
          setGroupMeta(modalState.group, meta, true);
        }finally{
          if(App.graph && typeof App.graph.afterChange === 'function') App.graph.afterChange();
        }
      }
      closeModal();
    });

    refs.cancelBtn.addEventListener('click', closeModal);
    refs.modal.addEventListener('click', (e)=>{ if(e.target === refs.modal) closeModal(); });
    window.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && refs.modal.style.display === 'block') closeModal();
    });

    refs.duplicateBtn.addEventListener('click', ()=>{
      if(!modalState.group) return;
      const copy = duplicateGroup(modalState.group);
      if(copy){
        App.showToast('Stop group duplicated');
        closeModal();
      }
    });

    refs.deleteBtn.addEventListener('click', ()=>{
      if(!modalState.group) return;
      if(window.confirm('Delete this stop group?')){
        removeGroup(modalState.group);
        closeModal();
      }
    });

    refs.selectBtn.addEventListener('click', ()=>{
      if(!modalState.group) return;
      const count = selectGroupNodes(modalState.group);
      App.showToast(count ? `Selected ${count} nodes` : 'No nodes inside group');
    });

    refs.fitBtn.addEventListener('click', ()=>{
      if(!modalState.group) return;
      if(fitViewToGroup(modalState.group, { margin: 54 })){
        App.showToast('Fit view to group');
      }
    });

    App.stopGroups.openGroupEditor = function(group){
      if(!group || !getGroupMeta(group)) return false;
      return openModal('edit', group, null);
    };

    App.stopGroups.openCreateGroupEditor = function(options){
      return openModal('create', null, options || {});
    };

    return refs;
  }

  App.stopGroups = App.stopGroups || {};
  App.stopGroups.EXTRA_KEY = EXTRA_KEY;

  App.stopGroups.registerType = function(key, definition){
    const type = normalizeType(key);
    if(!definition || typeof definition !== 'object') return false;
    TYPE_DEFS[type] = { ...definition };
    return true;
  };

  App.stopGroups.getTypeDefinition = function(type){
    const key = normalizeType(type);
    const def = TYPE_DEFS[key];
    return def ? { ...def, key } : null;
  };

  App.stopGroups.getTypeDefinitions = function(){
    const out = [];
    for(const key of Object.keys(TYPE_DEFS)){
      out.push({ ...TYPE_DEFS[key], key });
    }
    return out;
  };

  App.stopGroups.normalizeType = normalizeType;
  App.stopGroups.normalizeMeta = normalizeMeta;
  App.stopGroups.estimateStopRatePercent = estimateStopRatePercent;
  App.stopGroups.getGroupMeta = getGroupMeta;
  App.stopGroups.setGroupMeta = setGroupMeta;
  App.stopGroups.clearGroupMeta = clearGroupMeta;
  App.stopGroups.listStopGroups = listStopGroups;
  App.stopGroups.injectSerializedData = injectSerializedData;
  App.stopGroups.restoreSerializedData = restoreSerializedData;
  App.stopGroups.createRuntime = createRuntime;
  App.stopGroups.getRevision = function(){ return groupRevision; };
  App.stopGroups.isNodePaused = function(node){
    return !!(node && pausedNodeIds && pausedNodeIds.has(node.id));
  };
  App.stopGroups.getPausedNodeIds = function(){
    return new Set(pausedNodeIds);
  };
  App.stopGroups.getNextTransitionMs = function(nowMs){
    const now = Number(nowMs);
    if(!activeRuntime || typeof activeRuntime.getNextTransitionMs !== 'function') return Infinity;
    if(!isFinite(now)) return Infinity;
    return activeRuntime.getNextTransitionMs(now);
  };

  App.stopGroups.createGroup = function(metaLike){
    const created = createDetachedGroup(metaLike);
    bumpRevision(true);
    return created.group;
  };
  App.stopGroups.cloneMeta = cloneMeta;
  App.stopGroups.describeType = describeType;
  App.stopGroups.removeGroup = removeGroup;
  App.stopGroups.duplicateGroup = duplicateGroup;
  App.stopGroups.selectGroupNodes = selectGroupNodes;
  App.stopGroups.fitViewToGroup = fitViewToGroup;
  App.stopGroups.getGroupBounds = groupBounds;
  App.stopGroups.setGroupBounds = function(group, boundsLike, draw){
    if(!group || !boundsLike) return false;
    const bounds = boundsLike;
    setGroupBounds(group, bounds.x, bounds.y, bounds.w, bounds.h);
    bumpRevision(draw !== false);
    return true;
  };
  App.stopGroups.listNodesInGroup = function(group, graph){
    const g = graph || App.graph;
    const ids = new Set();
    collectGroupNodeIds(g, group, ids);
    if(!g || typeof g.getNodeById !== 'function') return [];
    const out = [];
    ids.forEach((id)=>{
      const node = g.getNodeById(id);
      if(node) out.push(node);
    });
    return out;
  };
  App.stopGroups.countNodesInGroup = function(group, graph){
    return App.stopGroups.listNodesInGroup(group, graph).length;
  };

  App.stopGroups.onGraphChanged = function(){
    bumpRevision(false);
  };

  App.stopGroups.restyleGroups = function(graph){
    const g = graph || App.graph;
    if(!g || !Array.isArray(g._groups)) return;
    for(const group of g._groups){
      const meta = getGroupMeta(group);
      if(!meta) continue;
      applyVisual(group, meta, false);
    }
  };

  App.stopGroups.clearRuntimeState = function(){
    activeRuntime = null;
    pausedNodeIds = new Set();
  };

  TYPE_DEFS.random_stop = {
    label: 'Random Stop',
    defaultTitle: 'Random Stop Group',
    groupColor: '#f59e0b',
    groupActiveColor: ACTIVE_STOP_COLOR,
    normalizeProps: normalizeRandomProps,
    estimateStopRatePercent: (props)=>{
      const p = normalizeRandomProps(props);
      const run = Math.max(0, p.intervalMedianSec);
      const stop = Math.max(0, p.durationMedianSec);
      const total = run + stop;
      if(total <= 0) return 0;
      return (stop / total) * 100;
    },
    createRuntimeState: (props, nowMs)=>{
      const p = normalizeRandomProps(props);
      const rng = makeXorShift32(p.randomSeed);
      const sec = Math.max(0.001, sampleNormal(rng, p.intervalMedianSec, p.intervalSigmaSec));
      return {
        active: false,
        nextTransitionMs: nowMs + sec * 1000,
        rng
      };
    },
    advanceRuntimeState: (state, props)=>{
      if(!state) return false;
      const p = normalizeRandomProps(props);
      const rng = state.rng || makeXorShift32(p.randomSeed);
      state.rng = rng;
      if(state.active){
        const sec = Math.max(0.001, sampleNormal(rng, p.intervalMedianSec, p.intervalSigmaSec));
        state.active = false;
        state.nextTransitionMs += sec * 1000;
      }else{
        const sec = Math.max(0.001, sampleNormal(rng, p.durationMedianSec, p.durationSigmaSec));
        state.active = true;
        state.nextTransitionMs += sec * 1000;
      }
      return true;
    },
    uiFields: [
      { key: 'title', label: 'Title', type: 'text', target: 'title', default: 'Random Stop Group' },
      { key: 'intervalMedianSec', label: 'Stop Interval Median (s)', type: 'number', min: 0, step: 0.1, default: 300 },
      { key: 'intervalSigmaSec', label: 'Stop Interval Sigma (s)', type: 'number', min: 0, step: 0.1, default: 30 },
      { key: 'durationMedianSec', label: 'Stop Duration Median (s)', type: 'number', min: 0, step: 0.1, default: 45 },
      { key: 'durationSigmaSec', label: 'Stop Duration Sigma (s)', type: 'number', min: 0, step: 0.1, default: 8 },
      { key: 'randomSeed', label: 'Random Seed', type: 'text', default: '1' }
    ]
  };

  TYPE_DEFS.scheduled_stop = {
    label: 'Scheduled Stop',
    defaultTitle: 'Scheduled Stop Group',
    groupColor: '#0ea5e9',
    groupActiveColor: ACTIVE_STOP_COLOR,
    normalizeProps: normalizeScheduledProps,
    estimateStopRatePercent: (props)=>{
      const p = normalizeScheduledProps(props);
      const run = Math.max(0, p.intervalSec);
      const stop = Math.max(0, p.durationSec);
      const total = run + stop;
      if(total <= 0) return 0;
      return (stop / total) * 100;
    },
    createRuntimeState: (props, nowMs)=>{
      const p = normalizeScheduledProps(props);
      const runMs = Math.max(1, p.intervalSec * 1000);
      return {
        active: false,
        nextTransitionMs: nowMs + runMs,
        runMs,
        stopMs: Math.max(1, p.durationSec * 1000)
      };
    },
    advanceRuntimeState: (state, props)=>{
      if(!state) return false;
      const p = normalizeScheduledProps(props);
      state.runMs = Math.max(1, p.intervalSec * 1000);
      state.stopMs = Math.max(1, p.durationSec * 1000);
      if(state.active){
        state.active = false;
        state.nextTransitionMs += state.runMs;
      }else{
        state.active = true;
        state.nextTransitionMs += state.stopMs;
      }
      return true;
    },
    uiFields: [
      { key: 'title', label: 'Title', type: 'text', target: 'title', default: 'Scheduled Stop Group' },
      { key: 'intervalSec', label: 'Stop Interval (s)', type: 'number', min: 0, step: 0.1, default: 900 },
      { key: 'durationSec', label: 'Stop Duration (s)', type: 'number', min: 0, step: 0.1, default: 60 }
    ]
  };

  ensureModalBinding();
})();
