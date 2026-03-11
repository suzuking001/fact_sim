// Event-fast runtime built around compiled graph structures.

var App = window.App || (window.App = {});

(function(){
  const EPSILON_MS = 0.001;
  const UPDATE_LOOP_LIMIT = 8000;
  const SAME_TIME_BATCH_LIMIT = 512;

  function nowSimMs(){
    return (typeof window.simNow === 'function') ? Number(window.simNow()) : 0;
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

  class DenseEventHeap{
    constructor(capacity){
      this.capacity = Math.max(0, capacity | 0);
      this.nodeIndex = new Int32Array(this.capacity);
      this.time = new Float64Array(this.capacity);
      this.seq = new Uint32Array(this.capacity);
      this.posByNode = new Int32Array(this.capacity);
      this.clear();
    }

    clear(){
      this.size = 0;
      this.nextSeq = 1;
      this.posByNode.fill(-1);
    }

    peek(){
      if(this.size <= 0) return null;
      return { nodeIndex: this.nodeIndex[0], time: this.time[0], seq: this.seq[0] };
    }

    pop(){
      if(this.size <= 0) return null;
      return this._removeAt(0);
    }

    remove(nodeIndex){
      const pos = this.posByNode[nodeIndex];
      if(pos < 0 || pos >= this.size) return null;
      return this._removeAt(pos);
    }

    upsert(nodeIndex, time){
      if(this.capacity <= 0) return null;
      const pos = this.posByNode[nodeIndex];
      const nextTime = Number(time);
      if(pos < 0){
        const at = this.size++;
        this.nodeIndex[at] = nodeIndex;
        this.time[at] = nextTime;
        this.seq[at] = this.nextSeq++;
        this.posByNode[nodeIndex] = at;
        this._bubbleUp(at);
        return null;
      }
      const prevTime = this.time[pos];
      this.time[pos] = nextTime;
      if(nextTime < prevTime) this._bubbleUp(pos);
      else if(nextTime > prevTime) this._bubbleDown(pos);
      return null;
    }

    _removeAt(pos){
      const removed = { nodeIndex: this.nodeIndex[pos], time: this.time[pos], seq: this.seq[pos] };
      this.posByNode[removed.nodeIndex] = -1;
      this.size -= 1;
      if(pos !== this.size){
        this.nodeIndex[pos] = this.nodeIndex[this.size];
        this.time[pos] = this.time[this.size];
        this.seq[pos] = this.seq[this.size];
        this.posByNode[this.nodeIndex[pos]] = pos;
        const up = this._bubbleUp(pos);
        if(up === pos) this._bubbleDown(pos);
      }
      return removed;
    }

    _less(a, b){
      return this.time[a] < this.time[b] || (this.time[a] === this.time[b] && this.seq[a] < this.seq[b]);
    }

    _swap(a, b){
      const ni = this.nodeIndex[a];
      const nt = this.time[a];
      const ns = this.seq[a];
      this.nodeIndex[a] = this.nodeIndex[b];
      this.time[a] = this.time[b];
      this.seq[a] = this.seq[b];
      this.nodeIndex[b] = ni;
      this.time[b] = nt;
      this.seq[b] = ns;
      this.posByNode[this.nodeIndex[a]] = a;
      this.posByNode[this.nodeIndex[b]] = b;
    }

    _bubbleUp(start){
      let i = start;
      while(i > 0){
        const p = (i - 1) >> 1;
        if(this._less(p, i)) break;
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
        if(l >= this.size) break;
        let s = l;
        if(r < this.size && this._less(r, l)) s = r;
        if(this._less(i, s)) break;
        this._swap(i, s);
        i = s;
      }
      return i;
    }
  }

  class EventFastEngine{
    constructor(graph, options){
      this.graph = graph;
      this.options = Object.assign({}, options || {});
      this.compiled = App.compileFastGraph(graph, options);
      this.compat = App.createFastCompatAdapter(graph, this.compiled, options);
      this.kernels = App.fastKernels || {};
      this.heap = new DenseEventHeap(this.compiled.nodeCount);
      this.stopGroupRuntime = (App.stopGroups && typeof App.stopGroups.createRuntime === 'function')
        ? App.stopGroups.createRuntime(graph)
        : null;

      this.untilMs = new Float64Array(this.compiled.nodeCount);
      this.stateFlags = new Uint8Array(this.compiled.nodeCount);
      this.inDirtyQueue = new Uint8Array(this.compiled.nodeCount);
      this.queueA = new Int32Array(Math.max(1, this.compiled.nodeCount));
      this.queueB = new Int32Array(Math.max(1, this.compiled.nodeCount));
      this.queueLenA = 0;
      this.queueLenB = 0;
      const meta = this.compiled.meta || {};
      const kernelNodeCount = Number(meta.kernelNodeCount) || 0;
      const fallbackNodeCount = Number(meta.fallbackNodeCount) || 0;
      const fallbackProfile = (this.compat && typeof this.compat.getFallbackProfile === 'function')
        ? this.compat.getFallbackProfile()
        : null;
      this.fallbackProfile = fallbackProfile || {
        totalCount: fallbackNodeCount,
        executableCount: 0,
        passiveCount: fallbackNodeCount,
        executableNodeIds: [],
        executableTypes: [],
        allNodeIds: []
      };
      const executableFallbackCount = Number(this.fallbackProfile.executableCount) || 0;
      const mustUseLegacyCompat = !this.options.forceCompiled
        && typeof App.createLegacySimEngine === 'function'
        && (
          (kernelNodeCount <= 0 && fallbackNodeCount > 0)
          || (executableFallbackCount > 0 && !this.options.allowExecutableFallback)
        );
      this.runtimeMode = mustUseLegacyCompat
        ? 'legacy-compat'
        : (fallbackNodeCount > 0 ? 'compiled-hybrid' : 'compiled');
      this.legacyEngine = (this.runtimeMode === 'legacy-compat')
        ? App.createLegacySimEngine('event', graph)
        : null;
      this.stats = this._createStats();
    }

    _createStats(){
      return {
        engine: 'event-fast',
        simTimeMs: 0,
        updateCalls: 0,
        nodeExec: 0,
        kernelExec: 0,
        compatExec: 0,
        heapPush: 0,
        heapPop: 0,
        heapReschedule: 0,
        sameTimeBatches: 0,
        sameTimeNodes: 0,
        sameTimeOverflows: 0,
        dirtyEnqueue: 0,
        boundaryHits: 0,
        runtimeMode: this.runtimeMode || 'compiled',
        fallbackNodeCount: this.compiled.meta && Array.isArray(this.compiled.meta.fallbackNodeIds) ? this.compiled.meta.fallbackNodeIds.length : 0,
        executableFallbackCount: this.fallbackProfile ? (Number(this.fallbackProfile.executableCount) || 0) : 0,
        executableFallbackTypes: this.fallbackProfile && Array.isArray(this.fallbackProfile.executableTypes)
          ? this.fallbackProfile.executableTypes.slice()
          : [],
        lastCompileMs: 0,
        lastUpdateWallMs: 0,
        maxQueueA: 0,
        maxQueueB: 0,
        maxHeapSize: 0
      };
    }

    reset(){
      this.heap.clear();
      this.untilMs.fill(Infinity);
      this.stateFlags.fill(0);
      this.inDirtyQueue.fill(0);
      this.queueLenA = 0;
      this.queueLenB = 0;
      this.stats = this._createStats();
      this.stats.runtimeMode = this.runtimeMode || 'compiled';
      if(this.legacyEngine && typeof this.legacyEngine.reset === 'function'){
        this.legacyEngine.reset();
      }
      if(this.runtimeMode === 'legacy-compat') return;
      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.reset === 'function'){
        this.stopGroupRuntime.reset(nowSimMs());
      }
      this._seedAllDirty();
    }

    stop(){
      if(this.legacyEngine && typeof this.legacyEngine.stop === 'function'){
        this.legacyEngine.stop();
      }
      if(this.runtimeMode === 'legacy-compat') return;
      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.stop === 'function'){
        this.stopGroupRuntime.stop();
      }
    }

    getDebugStats(){
      const stats = Object.assign({}, this.stats);
      stats.simTimeMs = nowSimMs();
      stats.heapSize = this.heap.size;
      return stats;
    }

    getNode(nodeIndex){
      return this.compat && typeof this.compat.getNode === 'function'
        ? this.compat.getNode(nodeIndex)
        : null;
    }

    update(simDeltaMs){
      const graph = this.graph;
      if(!graph) return;
      let budgetMs = Number(simDeltaMs);
      if(!Number.isFinite(budgetMs) || budgetMs <= 0) return;

      const started = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      this.stats.updateCalls += 1;

      if(this.runtimeMode === 'legacy-compat' && this.legacyEngine && typeof this.legacyEngine.update === 'function'){
        this.legacyEngine.update(budgetMs);
        const finishedLegacy = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
        this.stats.lastUpdateWallMs = Math.max(0, finishedLegacy - started);
        this.stats.simTimeMs = nowSimMs();
        return;
      }

      let loops = 0;
      let nowMs = nowSimMs();
      let timelineCaptured = false;

      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
        this.stopGroupRuntime.update(nowMs);
      }

      this._pullGraphDirtyIds();
      this._runDirtyBatches(nowMs);
      captureTimeline();
      timelineCaptured = true;

      while(budgetMs > 0 && loops++ < UPDATE_LOOP_LIMIT){
        const next = this._peekNextValid(nowMs);
        const boundaryMs = (this.stopGroupRuntime && typeof this.stopGroupRuntime.getNextTransitionMs === 'function')
          ? this.stopGroupRuntime.getNextTransitionMs(nowMs)
          : Infinity;
        const targetMs = Math.min(next ? next.time : Infinity, Number.isFinite(boundaryMs) ? boundaryMs : Infinity);

        if(!Number.isFinite(targetMs)){
          this._advanceTime(nowMs, budgetMs);
          nowMs += budgetMs;
          budgetMs = 0;
          captureTimeline();
          timelineCaptured = true;
          break;
        }

        const jumpMs = Math.max(0, targetMs - nowMs);
        if(jumpMs > EPSILON_MS){
          const stepMs = Math.min(jumpMs, budgetMs);
          this._advanceTime(nowMs, stepMs);
          nowMs += stepMs;
          budgetMs -= stepMs;
          captureTimeline();
          timelineCaptured = true;
          continue;
        }

        if(Number.isFinite(boundaryMs) && Math.abs(boundaryMs - nowMs) <= EPSILON_MS){
          this.stats.boundaryHits += 1;
          if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
            this.stopGroupRuntime.update(nowMs);
          }
        }

        const due = this._drainDue(nowMs);
        if(due === 0){
          if(budgetMs <= EPSILON_MS) break;
          this._advanceTime(nowMs, EPSILON_MS);
          nowMs += EPSILON_MS;
          budgetMs -= EPSILON_MS;
          captureTimeline();
          timelineCaptured = true;
          continue;
        }

        this._runDirtyBatches(nowMs);
        captureTimeline();
        timelineCaptured = true;
      }

      this._pullGraphDirtyIds();
      this._runDirtyBatches(nowMs);
      captureTimeline();
      timelineCaptured = true;

      const finished = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
      this.stats.lastUpdateWallMs = Math.max(0, finished - started);
      this.stats.simTimeMs = nowSimMs();

      if(timelineCaptured) drawTimeline();
    }

    _seedAllDirty(){
      for(let i = 0; i < this.compiled.nodeCount; i += 1){
        this._enqueueDirty(i, false);
      }
    }

    _pullGraphDirtyIds(){
      const graph = this.graph;
      if(!graph || !graph.__dirtyNodeIds || !graph.__dirtyNodeIds.size) return;
      const indexByNodeId = this.compiled.meta && this.compiled.meta.indexByNodeId;
      for(const rawId of graph.__dirtyNodeIds){
        const index = indexByNodeId ? indexByNodeId[String(rawId)] : undefined;
        if(typeof index === 'undefined') continue;
        this._enqueueDirty(index, false);
      }
      graph.__dirtyNodeIds.clear();
    }

    _enqueueDirty(nodeIndex, intoQueueB){
      if(nodeIndex < 0 || nodeIndex >= this.compiled.nodeCount) return false;
      if(this.inDirtyQueue[nodeIndex]) return false;
      this.inDirtyQueue[nodeIndex] = 1;
      if(intoQueueB){
        this.queueB[this.queueLenB++] = nodeIndex;
        if(this.queueLenB > this.stats.maxQueueB) this.stats.maxQueueB = this.queueLenB;
      }else{
        this.queueA[this.queueLenA++] = nodeIndex;
        if(this.queueLenA > this.stats.maxQueueA) this.stats.maxQueueA = this.queueLenA;
      }
      this.stats.dirtyEnqueue += 1;
      return true;
    }

    _enqueueOutgoing(nodeIndex, intoQueueB){
      const start = this.compiled.firstOutEdge[nodeIndex];
      const end = start + this.compiled.outEdgeCount[nodeIndex];
      for(let i = start; i < end; i += 1){
        this._enqueueDirty(this.compiled.outTargets[i], intoQueueB);
      }
    }

    _enqueueIncoming(nodeIndex, intoQueueB){
      const start = this.compiled.firstInEdge[nodeIndex];
      const end = start + this.compiled.inEdgeCount[nodeIndex];
      for(let i = start; i < end; i += 1){
        this._enqueueDirty(this.compiled.inSources[i], intoQueueB);
      }
    }

    _upsertHeap(nodeIndex, until){
      if(!Number.isFinite(until)) return;
      const existing = this.heap.posByNode[nodeIndex];
      this.heap.upsert(nodeIndex, until);
      if(existing < 0) this.stats.heapPush += 1;
      else this.stats.heapReschedule += 1;
      if(this.heap.size > this.stats.maxHeapSize) this.stats.maxHeapSize = this.heap.size;
      this.untilMs[nodeIndex] = until;
    }

    _removeHeap(nodeIndex){
      const removed = this.heap.remove(nodeIndex);
      if(removed) this.stats.heapPop += 1;
      this.untilMs[nodeIndex] = Infinity;
      return removed;
    }

    _getNodeResult(nodeIndex, nowMs){
      const kindId = this.compiled.kindIds[nodeIndex];
      const kernel = this.compiled.fallbackMask[nodeIndex]
        ? null
        : (this.kernels && typeof this.kernels.getKernel === 'function' ? this.kernels.getKernel(kindId) : null);

      if(kernel && typeof kernel.execute === 'function'){
        this.stats.kernelExec += 1;
        return kernel.execute(nodeIndex, nowMs, this);
      }

      this.stats.compatExec += 1;
      return this.compat.execute(nodeIndex, nowMs, this);
    }

    _getEventUntil(nodeIndex, nowMs){
      const kindId = this.compiled.kindIds[nodeIndex];
      const kernel = this.compiled.fallbackMask[nodeIndex]
        ? null
        : (this.kernels && typeof this.kernels.getKernel === 'function' ? this.kernels.getKernel(kindId) : null);

      if(kernel && typeof kernel.getEventUntil === 'function'){
        return Number(kernel.getEventUntil(nodeIndex, nowMs, this));
      }
      return Number(this.compat.getEventUntil(nodeIndex, nowMs, this));
    }

    _peekNextValid(nowMs){
      while(this.heap.size > 0){
        const top = this.heap.peek();
        if(!top) return null;
        const actual = this._getEventUntil(top.nodeIndex, nowMs);
        if(!Number.isFinite(actual)){
          this._removeHeap(top.nodeIndex);
          continue;
        }
        if(Math.abs(actual - top.time) > EPSILON_MS){
          this._upsertHeap(top.nodeIndex, actual);
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
        if(!top || top.time > nowMs + EPSILON_MS) break;
        this.heap.pop();
        this.stats.heapPop += 1;
        this.untilMs[top.nodeIndex] = Infinity;
        this._enqueueDirty(top.nodeIndex, false);
        count += 1;
      }
      return count;
    }

    _runDirtyBatches(nowMs){
      if(this.queueLenA <= 0) return;
      let cycles = 0;

      while(this.queueLenA > 0 && cycles < SAME_TIME_BATCH_LIMIT){
        this.stats.sameTimeBatches += 1;
        const currentQueue = this.queueA;
        const currentLen = this.queueLenA;
        this.queueA = this.queueB;
        this.queueB = currentQueue;
        this.queueLenA = 0;
        this.queueLenB = 0;

        for(let i = 0; i < currentLen; i += 1){
          const nodeIndex = currentQueue[i];
          this.inDirtyQueue[nodeIndex] = 0;
          this.stats.nodeExec += 1;
          this.stats.sameTimeNodes += 1;

          const result = this._getNodeResult(nodeIndex, nowMs) || {};
          if(result.error) throw result.error;

          this._pullGraphDirtyIds();

          if(result.stateChanged || result.outputsChanged){
            this._enqueueOutgoing(nodeIndex, false);
          }
          if(result.stateChanged){
            this._enqueueIncoming(nodeIndex, false);
          }

          const nextUntil = Number(result.nextUntil);
          if(Number.isFinite(nextUntil)){
            this._upsertHeap(nodeIndex, nextUntil <= nowMs + EPSILON_MS ? nowMs : nextUntil);
          }else{
            this._removeHeap(nodeIndex);
          }
        }
        cycles += 1;
      }

      if(this.queueLenA > 0){
        this.stats.sameTimeOverflows += 1;
        for(let i = 0; i < this.queueLenA; i += 1){
          const nodeIndex = this.queueA[i];
          this.inDirtyQueue[nodeIndex] = 0;
          this._upsertHeap(nodeIndex, nowMs + EPSILON_MS);
        }
        this.queueLenA = 0;
      }
    }

    _advanceTime(nowMs, deltaMs){
      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.beforeAdvance === 'function'){
        this.stopGroupRuntime.beforeAdvance(nowMs, deltaMs);
      }
      if(typeof window.advanceSimTime === 'function'){
        window.advanceSimTime(deltaMs);
      }
      if(this.stopGroupRuntime && typeof this.stopGroupRuntime.update === 'function'){
        this.stopGroupRuntime.update(nowMs + deltaMs);
      }
    }
  }

  App.EventFastEngine = EventFastEngine;
})();
