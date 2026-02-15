// Simulation engine implementations (dt / event-lite / event-queue)

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

  function notifyTimeline(){
    if(App._suspendTimeline) return;
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

  function isFlowInputPort(port){
    if(!port) return false;
    const name = String(port.name || '').toLowerCase();
    if(name.startsWith('sig')) return false;

    const rawType = port.type;
    const type = String(rawType == null ? '' : rawType).toLowerCase();
    if(type === 'string' || type === 'signal' || type === 'sig') return false;
    if(type === 'work' || type === 'agv' || type === 'number' || type === '*' || type === 'any' || type === '0') return true;
    if(name.indexOf('work') >= 0 || name.indexOf('agv') >= 0) return true;
    return rawType === 0 || rawType == null || type === '';
  }

  function heapPush(heap, item){
    heap.push(item);
    let i = heap.length - 1;
    while(i > 0){
      const p = ((i - 1) >> 1);
      if(heap[p].t < heap[i].t) break;
      if(heap[p].t === heap[i].t && heap[p].seq < heap[i].seq) break;
      const tmp = heap[p];
      heap[p] = heap[i];
      heap[i] = tmp;
      i = p;
    }
  }

  function heapPop(heap){
    if(!heap.length) return null;
    const top = heap[0];
    const last = heap.pop();
    if(heap.length){
      heap[0] = last;
      let i = 0;
      while(true){
        const l = i * 2 + 1;
        const r = l + 1;
        if(l >= heap.length) break;
        let s = l;
        if(r < heap.length){
          const hl = heap[l];
          const hr = heap[r];
          if(hr.t < hl.t || (hr.t === hl.t && hr.seq < hl.seq)) s = r;
        }
        const hs = heap[s];
        const hi = heap[i];
        if(hi.t < hs.t || (hi.t === hs.t && hi.seq <= hs.seq)) break;
        heap[i] = hs;
        heap[s] = hi;
        i = s;
      }
    }
    return top;
  }

  function heapPeek(heap){
    return heap.length ? heap[0] : null;
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
      const flowInputSlots = this._getFlowInputSlots(node);
      for(const slotIndex of flowInputSlots){
        const inp = node.inputs && node.inputs[slotIndex];
        if(!inp || inp.link == null) continue;
        const link = this.graph.links && this.graph.links[inp.link];
        if(link && typeof link.origin_id !== 'undefined') this._markNodeDirty(link.origin_id);
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
      this._collectFlowInputSlots(node);
    }

    _collectFlowInputSlots(node){
      if(!node || !Array.isArray(node.inputs) || !node.inputs.length){
        node.__simFlowInputSlots = [];
        node.__simFlowInputCount = 0;
        return node.__simFlowInputSlots;
      }
      const slots = [];
      for(let i = 0; i < node.inputs.length; i++){
        if(isFlowInputPort(node.inputs[i])) slots.push(i);
      }
      node.__simFlowInputSlots = slots;
      node.__simFlowInputCount = node.inputs.length;
      return slots;
    }

    _getFlowInputSlots(node){
      if(!node || !Array.isArray(node.inputs) || !node.inputs.length) return [];
      if(!Array.isArray(node.__simFlowInputSlots) || node.__simFlowInputCount !== node.inputs.length){
        return this._collectFlowInputSlots(node);
      }
      return node.__simFlowInputSlots;
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
    }

    reset(){
      this.accumMs = 0;
    }

    update(simDeltaMs){
      const graph = this.graph;
      if(!graph) return;
      const delta = Number(simDeltaMs);
      if(!isFinite(delta) || delta <= 0) return;

      const dtMs = ((typeof window.getSimDtSec === 'function') ? window.getSimDtSec() : 0.1) * 1000;
      this.accumMs += delta;

      let steps = 0;
      while(this.accumMs >= dtMs && steps < DT_STEP_LIMIT){
        graph.__outputDirty = false;
        graph.runStep(1, !graph.catch_errors);
        settleGraph(graph, DT_SETTLE_LIMIT);

        if(typeof window.advanceSimTime === 'function') window.advanceSimTime(dtMs);
        this.accumMs -= dtMs;
        steps++;
      }

      if(steps === DT_STEP_LIMIT) this.accumMs = 0;
      if(steps > 0) notifyTimeline();
    }
  }

  class EventLiteEngine extends DirtyExecEngineBase{
    constructor(graph){
      super(graph);
      this.heap = [];
      this.seq = 0;
      this.eventByNodeId = new Map();
    }

    reset(){
      this.heap.length = 0;
      this.seq = 0;
      this.eventByNodeId.clear();
      this.resetDirty();
    }

    _onTrackedNodeSetChanged(){
      const alive = collectAliveNodeIds(this.graph);
      for(const nodeId of this.eventByNodeId.keys()){
        if(!alive.has(nodeId)) this.eventByNodeId.delete(nodeId);
      }
    }

    _scheduleNodeEvent(node, nowMs){
      if(!node || typeof node.id === 'undefined') return;
      const until = getTimedUntil(node, nowMs);
      if(!isFinite(until)){
        this.eventByNodeId.delete(node.id);
        return;
      }
      this.eventByNodeId.set(node.id, until);
      heapPush(this.heap, {
        t: until,
        nodeId: node.id,
        seq: ++this.seq
      });
    }

    _onNodeExecuted(node, nowMs){
      this._scheduleNodeEvent(node, nowMs);
    }

    _peekNextValid(nowMs){
      while(this.heap.length){
        const top = heapPeek(this.heap);
        if(!top) return null;

        const expected = this.eventByNodeId.get(top.nodeId);
        if(!isFinite(expected)){
          heapPop(this.heap);
          continue;
        }

        if(Math.abs(expected - top.t) > EPSILON_MS){
          heapPop(this.heap);
          continue;
        }

        const node = this.graph && this.graph.getNodeById(top.nodeId);
        if(!node){
          heapPop(this.heap);
          this.eventByNodeId.delete(top.nodeId);
          continue;
        }

        const until = getTimedUntil(node, nowMs);
        if(!isFinite(until)){
          heapPop(this.heap);
          this.eventByNodeId.delete(top.nodeId);
          continue;
        }

        if(Math.abs(until - expected) > EPSILON_MS){
          heapPop(this.heap);
          this._scheduleNodeEvent(node, nowMs);
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
        heapPop(this.heap);
        this.eventByNodeId.delete(top.nodeId);
        this._markNodeDirty(top.nodeId);
        count++;
      }
      return count;
    }

    update(simDeltaMs){
      const graph = this.graph;
      if(!graph) return;
      let budgetMs = Number(simDeltaMs);
      if(!isFinite(budgetMs) || budgetMs <= 0) return;

      this._ensureTrackedNodes();

      let loops = 0;
      let sameTimeSpins = 0;
      let nowMs = nowSimMs();

      this._runDirtyQueue(nowMs);

      while(budgetMs > 0 && loops++ < EVENT_LOOP_LIMIT){
        const next = this._peekNextValid(nowMs);

        if(!next){
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(budgetMs);
          budgetMs = 0;
          break;
        }

        let jumpMs = next.t - nowMs;
        if(jumpMs < EPSILON_MS) jumpMs = 0;

        if(jumpMs > 0){
          if(jumpMs > budgetMs){
            if(typeof window.advanceSimTime === 'function') window.advanceSimTime(budgetMs);
            budgetMs = 0;
            break;
          }
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(jumpMs);
          budgetMs -= jumpMs;
          nowMs += jumpMs;
          sameTimeSpins = 0;
          continue;
        }

        const due = this._drainDue(nowMs);
        if(due > 0){
          this._runDirtyQueue(nowMs);
          nowMs = nowSimMs();
          sameTimeSpins = 0;
          continue;
        }

        sameTimeSpins++;
        if(sameTimeSpins > EVENT_SAME_TIME_LIMIT){
          if(budgetMs <= EPSILON_MS) break;
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(EPSILON_MS);
          budgetMs -= EPSILON_MS;
          nowMs += EPSILON_MS;
          sameTimeSpins = 0;
        }
      }

      this._runDirtyQueue(nowMs);
      notifyTimeline();
    }
  }

  class EventQueueEngine extends DirtyExecEngineBase{
    constructor(graph){
      super(graph);
      this.heap = [];
      this.seq = 0;
      this.revisionByNodeId = new Map();
    }

    reset(){
      this.heap.length = 0;
      this.seq = 0;
      this.revisionByNodeId.clear();
      this.resetDirty();
    }

    _onTrackedNodeSetChanged(){
      const alive = collectAliveNodeIds(this.graph);
      for(const nodeId of this.revisionByNodeId.keys()){
        if(!alive.has(nodeId)) this.revisionByNodeId.delete(nodeId);
      }
    }

    _bumpRevision(nodeId){
      const next = (this.revisionByNodeId.get(nodeId) || 0) + 1;
      this.revisionByNodeId.set(nodeId, next);
      return next;
    }

    _pushNodeEvent(node, nowMs){
      if(!node || typeof node.id === 'undefined') return;
      const nodeId = node.id;
      const rev = this._bumpRevision(nodeId);
      const until = getTimedUntil(node, nowMs);
      if(!isFinite(until)) return;
      heapPush(this.heap, {
        t: until,
        nodeId,
        rev,
        seq: ++this.seq
      });
    }

    _onNodeExecuted(node, nowMs){
      this._pushNodeEvent(node, nowMs);
    }

    _peekNextValid(nowMs){
      while(this.heap.length){
        const top = heapPeek(this.heap);
        if(!top) return null;

        const rev = this.revisionByNodeId.get(top.nodeId) || 0;
        if(top.rev !== rev){
          heapPop(this.heap);
          continue;
        }

        const node = this.graph && this.graph.getNodeById(top.nodeId);
        if(!node){
          heapPop(this.heap);
          continue;
        }

        const until = getTimedUntil(node, nowMs);
        if(!isFinite(until)){
          heapPop(this.heap);
          continue;
        }

        if(Math.abs(until - top.t) > EPSILON_MS){
          heapPop(this.heap);
          this._markNodeDirty(top.nodeId);
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
        heapPop(this.heap);
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

      this._runDirtyQueue(nowMs);

      while(budgetMs > 0 && loops++ < EVENT_LOOP_LIMIT){
        const next = this._peekNextValid(nowMs);

        if(!next){
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(budgetMs);
          budgetMs = 0;
          break;
        }

        let jumpMs = next.t - nowMs;
        if(jumpMs < EPSILON_MS) jumpMs = 0;

        if(jumpMs > 0){
          if(jumpMs > budgetMs){
            if(typeof window.advanceSimTime === 'function') window.advanceSimTime(budgetMs);
            budgetMs = 0;
            break;
          }
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(jumpMs);
          budgetMs -= jumpMs;
          nowMs += jumpMs;
          sameTimeSpins = 0;
          continue;
        }

        const due = this._drainDue(nowMs);
        if(due > 0){
          this._runDirtyQueue(nowMs);
          nowMs = nowSimMs();
          sameTimeSpins = 0;
          continue;
        }

        sameTimeSpins++;
        if(sameTimeSpins > EVENT_SAME_TIME_LIMIT){
          if(budgetMs <= EPSILON_MS) break;
          if(typeof window.advanceSimTime === 'function') window.advanceSimTime(EPSILON_MS);
          budgetMs -= EPSILON_MS;
          nowMs += EPSILON_MS;
          sameTimeSpins = 0;
        }
      }

      this._runDirtyQueue(nowMs);
      notifyTimeline();
    }
  }

  App.getSupportedSimModes = function(){
    return ['dt', 'event', 'eventq'];
  };

  App.normalizeSimMode = function(mode){
    const m = String(mode || '').toLowerCase();
    if(m === 'eventq' || m === 'event-queue' || m === 'queue') return 'eventq';
    if(m === 'event' || m === 'event-lite' || m === 'lite') return 'event';
    return 'dt';
  };

  App.getSimModeLabel = function(mode){
    const m = App.normalizeSimMode(mode);
    if(m === 'event') return 'event-lite';
    if(m === 'eventq') return 'event-queue';
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
    if(m === 'eventq') return new EventQueueEngine(graph);
    if(m === 'event') return new EventLiteEngine(graph);
    return new DtEngine(graph);
  };

  App.runEngineBenchmark = function(options){
    if(!App.graph) throw new Error('graph is not initialized');

    const opts = options || {};
    const wallMs = Math.max(100, Number(opts.wallMs) || 1200);
    const realStepMs = Math.max(1, Number(opts.realStepMs) || 16);
    const requestedModes = (Array.isArray(opts.modes) && opts.modes.length)
      ? opts.modes
      : ['dt', 'event', 'eventq'];
    const modes = requestedModes
      .map(m=> App.normalizeSimMode(m))
      .filter((m, i, arr)=> arr.indexOf(m) === i);

    const snapshot = App.graph.serialize();
    const originalTime = nowSimMs();
    const originalMode = App.getSimMode();
    const prevSuspendTimeline = !!App._suspendTimeline;

    const cloneData = ()=> JSON.parse(JSON.stringify(snapshot));
    const results = [];

    try{
      App._suspendTimeline = true;
      for(const mode of modes){
        const graph = new LGraph();
        graph.configure(cloneData());
        if(typeof configureGraphClock === 'function') configureGraphClock(graph);

        const engine = App.createSimEngine(mode, graph);
        if(engine && typeof engine.reset === 'function') engine.reset();

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
          loops++;
          now = performance.now();
        }

        const simMs = nowSimMs();
        const spentMs = Math.max(0, now - started);
        try{ graph.sendEventToAllNodes('onStop'); }catch(_e){}

        results.push({
          mode,
          modeLabel: App.getSimModeLabel(mode),
          wallMs: spentMs,
          simMs,
          loops,
          simSec: simMs / 1000,
          speed: simMs / Math.max(1, spentMs)
        });
      }
    }finally{
      App._suspendTimeline = prevSuspendTimeline;
      App.setSimMode(originalMode);
      if(typeof window.setSimTime === 'function') window.setSimTime(originalTime);
      if(typeof window.updateSimTime === 'function') window.updateSimTime();
    }

    return {
      wallMs,
      realStepMs,
      results
    };
  };
})();
