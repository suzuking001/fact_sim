// Simulation engine implementations (dt / event)

var App = window.App || (window.App = {});

(function(){
  const DT_STEP_LIMIT = 200;
  const DT_SETTLE_LIMIT = 5;
  const EVENT_LOOP_LIMIT = 500;
  const EVENT_SAME_TIME_LIMIT = 64;
  const DIRTY_EXEC_LIMIT = 2500;
  const EPSILON_MS = 0.001;

  function nowSimMs(){
    return (typeof window.simNow === 'function') ? window.simNow() : 0;
  }

  function createStopGroupRuntime(graph){
    if(!App.stopGroups || typeof App.stopGroups.createRuntime !== 'function') return null;
    try{
      return App.stopGroups.createRuntime(graph);
    }catch(err){
      console.error(err);
      return null;
    }
  }

  function settleGraph(graph, limit){
    if(!graph) return;
    graph.__outputDirty = false;
    graph.runStep(0, !graph.catch_errors);
    let settle = 0;
    while(graph.__outputDirty && settle++ < limit){
      graph.__outputDirty = false;
      graph.runStep(0, !graph.catch_errors);
    }
  }

  function captureTimeline(){
    if(App._suspendTimeline) return;
    if(App.timelineChart && typeof App.timelineChart.onStep === 'function'){
      App.timelineChart.onStep(false);
    }
  }

  function drawTimeline(){
    if(typeof App.isRenderSuppressed === 'function' && App.isRenderSuppressed()) return;
    if(App._suspendTimeline) return;
    if(App.timelineChart && typeof App.timelineChart.draw === 'function'){
      if(typeof App.shouldRenderFrame === 'function' && !App.shouldRenderFrame('timeline', false)) return;
      App.timelineChart.draw();
      return;
    }
    if(App.timelineChart && typeof App.timelineChart.onStep === 'function'){
      App.timelineChart.onStep();
    }
  }

  function hasTimedState(node){
    if(!node) return false;
    const state = String(node._state || '').toUpperCase();
    if(state === 'PROCESS' || state === 'DOWN') return true;
    const stateName = String(node._stateName || '').toLowerCase();
    if(stateName.indexOf('process') >= 0) return true;
    if(stateName.indexOf('down') >= 0) return true;
    return false;
  }

  function getTimedUntil(node, nowMs){
    if(!hasTimedState(node)) return NaN;
    const until = Number(node && node._until);
    if(!isFinite(until)) return NaN;
    if(until <= nowMs + EPSILON_MS){
      if(until >= nowMs - EPSILON_MS) return nowMs;
      return NaN;
    }
    return until;
  }

  function collectAliveNodeIds(graph){
    const ids = new Set();
    if(!graph || !Array.isArray(graph._nodes)) return ids;
    for(const node of graph._nodes){
      if(!node || typeof node.id === 'undefined') continue;
      ids.add(node.id);
    }
    return ids;
  }

  class IndexedEventHeap{
    constructor(){
      this.items = [];
      this.indexByNodeId = new Map();
      this.seq = 0;
    }

    get size(){
      return this.items.length;
    }

    clear(){
      this.items.length = 0;
      this.indexByNodeId.clear();
      this.seq = 0;
    }

    nodeIds(){
      return this.indexByNodeId.keys();
    }

    peek(){
      return this.items.length ? this.items[0] : null;
    }

    pop(){
      if(!this.items.length) return null;
      return this._removeAt(0);
    }

    remove(nodeId){
      const idx = this.indexByNodeId.get(nodeId);
      if(typeof idx === 'undefined') return null;
      return this._removeAt(idx);
    }

    upsert(nodeId, t){
      const time = Number(t);
      const idx = this.indexByNodeId.get(nodeId);

      if(typeof idx === 'undefined'){
        const item = { nodeId, t: time, seq: ++this.seq };
        this.items.push(item);
        const last = this.items.length - 1;
        this.indexByNodeId.set(nodeId, last);
        this._bubbleUp(last);
        return item;
      }

      const item = this.items[idx];
      const prevT = item.t;
      item.t = time;
      if(time < prevT) this._bubbleUp(idx);
      else if(time > prevT) this._bubbleDown(idx);
      return item;
    }

    _removeAt(idx){
      const lastIndex = this.items.length - 1;
      const removed = this.items[idx];
      this.indexByNodeId.delete(removed.nodeId);

      if(idx === lastIndex){
        this.items.pop();
        return removed;
      }

      const last = this.items[lastIndex];
      this.items[idx] = last;
      this.items.pop();
      this.indexByNodeId.set(last.nodeId, idx);

      const upIdx = this._bubbleUp(idx);
      if(upIdx === idx) this._bubbleDown(idx);

      return removed;
    }

    _isLess(a, b){
      return a.t < b.t || (a.t === b.t && a.seq < b.seq);
    }

    _swap(i, j){
      const a = this.items[i];
      const b = this.items[j];
      this.items[i] = b;
      this.items[j] = a;
      this.indexByNodeId.set(a.nodeId, j);
      this.indexByNodeId.set(b.nodeId, i);
    }

    _bubbleUp(start){
      let i = start;
      while(i > 0){
        const p = ((i - 1) >> 1);
        if(this._isLess(this.items[p], this.items[i])) break;
        this._swap(i, p);
        i = p;
      }
      return i;
    }

    _bubbleDown(start){
      let i = start;
      while(true){
        const l = i * 2 + 1;
        const r = l + 1;
        if(l >= this.items.length) break;
        let s = l;
        if(r < this.items.length && this._isLess(this.items[r], this.items[l])) s = r;
        if(this._isLess(this.items[i], this.items[s])) break;
        this._swap(i, s);
        i = s;
      }
      return i;
    }
  }

  class DirtyExecEngineBase{
    constructor(graph){
      this.graph = graph;
      this.dirtyQueue = [];
      this.dirtyQueued = Object.create(null);
      this.dirtyReadIndex = 0;
      this.trackedNodeIds = new Set();
      this.lastNodeCount = -1;
    }

    resetDirty(){
      this._clearDirtyQueue();
      this.trackedNodeIds.clear();
      this.lastNodeCount = -1;
      this._ensureTrackedNodes();
      if(!this.graph || !Array.isArray(this.graph._nodes)) return;
      for(const node of this.graph._nodes){
        if(!node || typeof node.id === 'undefined') continue;
        this._markNodeDirty(node.id);
      }
    }

    _clearDirtyQueue(){
      this.dirtyQueue.length = 0;
      this.dirtyReadIndex = 0;
      this.dirtyQueued = Object.create(null);
    }

    _markNodeDirty(nodeId){
      if(typeof nodeId === 'undefined' || nodeId === null) return;
      const key = String(nodeId);
      if(this.dirtyQueued[key]) return;
      this.dirtyQueued[key] = 1;
      this.dirtyQueue.push(nodeId);
    }

    _markConnectedNodesDirty(node){
      if(!node || !this.graph) return;
      if(Array.isArray(node.outputs)){
        for(const out of node.outputs){
          if(!out || !out.links) continue;
          for(const lid of out.links){
            const link = this.graph.links && this.graph.links[lid];
            if(link && typeof link.target_id !== 'undefined') this._markNodeDirty(link.target_id);
          }
        }
      }
      if(Array.isArray(node.inputs)){
        for(const inp of node.inputs){
          if(!inp || inp.link == null) continue;
          const link = this.graph.links && this.graph.links[inp.link];
          if(link && typeof link.origin_id !== 'undefined') this._markNodeDirty(link.origin_id);
        }
      }
    }

    _pullGraphDirtyIds(){
      const g = this.graph;
      if(!g || !g.__dirtyNodeIds || !g.__dirtyNodeIds.size) return;
      for(const id of g.__dirtyNodeIds) this._markNodeDirty(id);
      g.__dirtyNodeIds.clear();
    }

    _ensureTrackedNodes(){
      if(!this.graph || !Array.isArray(this.graph._nodes)) return;
      const nodeCount = this.graph._nodes.length;
      if(this.lastNodeCount === nodeCount) return;
      if(this.lastNodeCount > nodeCount){
        this.trackedNodeIds.clear();
        this._onTrackedNodeSetChanged();
      }
      for(const node of this.graph._nodes){
        if(!node || typeof node.id === 'undefined') continue;
        if(this.trackedNodeIds.has(node.id)) continue;
        this._trackNode(node);
        this.trackedNodeIds.add(node.id);
        this._markNodeDirty(node.id);
      }
      this.lastNodeCount = nodeCount;
    }

    _onTrackedNodeSetChanged(){
      // override in derived engines
    }

    _trackNode(node){
      const nodeId = node.id;
      const onUntilChanged = ()=> this._markNodeDirty(nodeId);

      if(node.__simDirtyUntilPatched){
        node.__simDirtyOnUntilChanged = onUntilChanged;
        return;
      }

      let patched = false;
      let untilVal = Number(node._until);
      if(!isFinite(untilVal)) untilVal = 0;

      try{
        Object.defineProperty(node, '_until', {
          configurable: true,
          enumerable: true,
          get(){ return untilVal; },
          set(v){
            const n = Number(v);
            untilVal = isFinite(n) ? n : 0;
            if(typeof node.__simDirtyOnUntilChanged === 'function') node.__simDirtyOnUntilChanged();
          }
        });
        patched = true;
      }catch(_e){
        patched = false;
      }

      node.__simDirtyUntilPatched = patched;
      node.__simDirtyOnUntilChanged = onUntilChanged;
    }

    _safeExecuteNode(node){
      if(!node || typeof node.onExecute !== 'function') return;
      const graph = this.graph;
      if(graph && graph.catch_errors === false){
        node.onExecute();
        return;
      }
      try{
        node.onExecute();
      }catch(err){
        console.error(err);
      }
    }

    _onNodeExecuted(node, nowMs){
      // override in derived engines
    }

    _runDirtyQueue(nowMs){
      if(!this.graph) return;
      this._pullGraphDirtyIds();

      let loops = 0;
      while(this.dirtyReadIndex < this.dirtyQueue.length && loops++ < DIRTY_EXEC_LIMIT){
        const nodeId = this.dirtyQueue[this.dirtyReadIndex++];
        delete this.dirtyQueued[String(nodeId)];

        const node = this.graph.getNodeById(nodeId);
        if(!node) continue;

        const preState = node._state;
        const preStateName = node._stateName;
        const preUntil = Number(node._until);

        this._safeExecuteNode(node);

        const postState = node._state;
        const postStateName = node._stateName;
        const postUntil = Number(node._until);
        if(preState !== postState || preStateName !== postStateName || preUntil !== postUntil){
          this._markConnectedNodesDirty(node);
        }

        this._onNodeExecuted(node, nowMs);
        this._pullGraphDirtyIds();
      }

      if(this.dirtyReadIndex >= this.dirtyQueue.length){
        this._clearDirtyQueue();
      }

      if(loops >= DIRTY_EXEC_LIMIT){
        this._clearDirtyQueue();
        if(this.graph.__dirtyNodeIds) this.graph.__dirtyNodeIds.clear();
      }
    }
  }

  class DtEngine{
    constructor(graph){
      this.graph = graph;
      this.accumMs = 0;
      this.stopGroupRuntime = createStopGroupRuntime(graph);
    }

    reset(){
      this.accumMs = 0;
      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.reset === 'function'){
        this.stopGroupRuntime.reset(nowSimMs());
      }
    }

    stop(){
      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.stop === 'function'){
        this.stopGroupRuntime.stop();
      }
    }

    update(simDeltaMs){
      const graph = this.graph;
      if(!graph) return;
      const delta = Number(simDeltaMs);
      if(!isFinite(delta) || delta <= 0) return;

      const dtMs = ((typeof window.getSimDtSec === 'function') ? window.getSimDtSec() : 0.1) * 1000;
      this.accumMs += delta;

      let steps = 0;
      let timelineCaptured = false;
      while(this.accumMs >= dtMs && steps < DT_STEP_LIMIT){
        const nowMs = nowSimMs();
        if(this.stopGroupRuntime && typeof this.stopGroupRuntime.beforeAdvance === 'function'){
          this.stopGroupRuntime.beforeAdvance(nowMs, dtMs);
        }
        graph.__outputDirty = false;
        graph.runStep(1, !graph.catch_errors);
        settleGraph(graph, DT_SETTLE_LIMIT);

        if(typeof window.advanceSimTime === 'function') window.advanceSimTime(dtMs);
        if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
          this.stopGroupRuntime.update(nowMs + dtMs);
        }
        captureTimeline();
        timelineCaptured = true;
        this.accumMs -= dtMs;
        steps++;
      }

      if(steps === DT_STEP_LIMIT) this.accumMs = 0;
      if(timelineCaptured) drawTimeline();
    }
  }

  class EventHeapEngine extends DirtyExecEngineBase{
    constructor(graph){
      super(graph);
      this.eventHeap = new IndexedEventHeap();
      this.stopGroupRuntime = createStopGroupRuntime(graph);
    }

    reset(){
      this.eventHeap.clear();
      this.resetDirty();
      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.reset === 'function'){
        this.stopGroupRuntime.reset(nowSimMs());
      }
    }

    stop(){
      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.stop === 'function'){
        this.stopGroupRuntime.stop();
      }
    }

    _onTrackedNodeSetChanged(){
      const alive = collectAliveNodeIds(this.graph);
      const existingIds = Array.from(this.eventHeap.nodeIds());
      for(const nodeId of existingIds){
        if(!alive.has(nodeId)) this.eventHeap.remove(nodeId);
      }
    }

    _upsertNodeEvent(node, nowMs){
      if(!node || typeof node.id === 'undefined') return;
      const until = getTimedUntil(node, nowMs);
      if(!isFinite(until)){
        this.eventHeap.remove(node.id);
        return;
      }
      this.eventHeap.upsert(node.id, until);
    }

    _onNodeExecuted(node, nowMs){
      this._upsertNodeEvent(node, nowMs);
    }

    _peekNextValid(nowMs){
      while(this.eventHeap.size){
        const top = this.eventHeap.peek();
        if(!top) return null;

        const node = this.graph && this.graph.getNodeById(top.nodeId);
        if(!node){
          this.eventHeap.remove(top.nodeId);
          continue;
        }

        const until = getTimedUntil(node, nowMs);
        if(!isFinite(until)){
          this.eventHeap.remove(top.nodeId);
          continue;
        }

        if(Math.abs(until - top.t) > EPSILON_MS){
          this.eventHeap.upsert(top.nodeId, until);
          continue;
        }

        return top;
      }
      return null;
    }

    _drainDue(nowMs){
      let count = 0;
      while(true){
        const top = this._peekNextValid(nowMs);
        if(!top) break;
        if(top.t > nowMs + EPSILON_MS) break;
        this.eventHeap.pop();
        this._markNodeDirty(top.nodeId);
        count++;
      }
      return count;
    }

    update(simDeltaMs){
      if(!this.graph) return;
      let budgetMs = Number(simDeltaMs);
      if(!isFinite(budgetMs) || budgetMs <= 0) return;

      this._ensureTrackedNodes();

      let loops = 0;
      let sameTimeSpins = 0;
      let nowMs = nowSimMs();
      let timelineCaptured = false;

      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
        this.stopGroupRuntime.update(nowMs);
      }

      this._runDirtyQueue(nowMs);
      captureTimeline();
      timelineCaptured = true;

      while(budgetMs > 0 && loops++ < EVENT_LOOP_LIMIT){
        const next = this._peekNextValid(nowMs);
        const boundaryMs = (this.stopGroupRuntime && typeof this.stopGroupRuntime.getNextTransitionMs === 'function')
          ? this.stopGroupRuntime.getNextTransitionMs(nowMs)
          : Infinity;
        const hasBoundary = isFinite(boundaryMs);
        const hasNext = !!next;

        let targetMs = Infinity;
        if(hasNext) targetMs = next.t;
        if(hasBoundary && boundaryMs < targetMs) targetMs = boundaryMs;

        if(!isFinite(targetMs)){
          if(this.stopGroupRuntime && typeof this.stopGroupRuntime.beforeAdvance === 'function'){
            this.stopGroupRuntime.beforeAdvance(nowMs, budgetMs);
          }
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(budgetMs);
          nowMs += budgetMs;
          if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
            this.stopGroupRuntime.update(nowMs);
          }
          captureTimeline();
          timelineCaptured = true;
          budgetMs = 0;
          break;
        }

        let jumpMs = targetMs - nowMs;
        if(jumpMs < EPSILON_MS) jumpMs = 0;

        if(jumpMs > 0){
          const stepMs = Math.min(jumpMs, budgetMs);
          if(this.stopGroupRuntime && typeof this.stopGroupRuntime.beforeAdvance === 'function'){
            this.stopGroupRuntime.beforeAdvance(nowMs, stepMs);
          }
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(stepMs);
          budgetMs -= stepMs;
          nowMs += stepMs;
          if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
            this.stopGroupRuntime.update(nowMs);
          }
          captureTimeline();
          timelineCaptured = true;
          sameTimeSpins = 0;
          continue;
        }

        if(hasNext && Math.abs(next.t - nowMs) <= EPSILON_MS){
          const due = this._drainDue(nowMs);
          if(due > 0){
            this._runDirtyQueue(nowMs);
            nowMs = nowSimMs();
            if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
              this.stopGroupRuntime.update(nowMs);
            }
            captureTimeline();
            timelineCaptured = true;
            sameTimeSpins = 0;
            continue;
          }
        }

        if(hasBoundary && Math.abs(boundaryMs - nowMs) <= EPSILON_MS){
          if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
            this.stopGroupRuntime.update(nowMs);
          }
          captureTimeline();
          timelineCaptured = true;
          sameTimeSpins = 0;
          continue;
        }

        sameTimeSpins++;
        if(sameTimeSpins > EVENT_SAME_TIME_LIMIT){
          if(budgetMs <= EPSILON_MS) break;
          if(this.stopGroupRuntime && typeof this.stopGroupRuntime.beforeAdvance === 'function'){
            this.stopGroupRuntime.beforeAdvance(nowMs, EPSILON_MS);
          }
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(EPSILON_MS);
          budgetMs -= EPSILON_MS;
          nowMs += EPSILON_MS;
          if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
            this.stopGroupRuntime.update(nowMs);
          }
          captureTimeline();
          timelineCaptured = true;
          sameTimeSpins = 0;
        }
      }

      this._runDirtyQueue(nowMs);
      captureTimeline();
      timelineCaptured = true;
      if(timelineCaptured) drawTimeline();
    }
  }

  class EventEngine extends EventHeapEngine{}

  App.getSupportedSimModes = function(){
    return ['dt', 'event'];
  };

  App.normalizeSimMode = function(mode){
    const m = String(mode || '').toLowerCase();
    if(m === 'eventq' || m === 'event-queue' || m === 'queue') return 'event';
    if(m === 'event' || m === 'event-lite' || m === 'lite') return 'event';
    return 'dt';
  };

  App.getSimModeLabel = function(mode){
    const m = App.normalizeSimMode(mode);
    if(m === 'event') return 'event';
    return 'dt';
  };

  App.getSimMode = function(){
    App.simMode = App.normalizeSimMode(App.simMode);
    return App.simMode;
  };

  App.setSimMode = function(mode){
    App.simMode = App.normalizeSimMode(mode);
    return App.simMode;
  };

  App.createSimEngine = function(mode, graph){
    const m = App.normalizeSimMode(mode);
    if(m === 'event') return new EventEngine(graph);
    return new DtEngine(graph);
  };
})();
