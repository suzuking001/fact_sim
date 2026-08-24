// Fast engine kernel registry and specialized handlers.

var App = window.App || (window.App = {});

(function(){
  const EPSILON_MS = 0.001;

  const KINDS = Object.freeze({
    Unknown: 0,
    Source: 1,
    Equipment: 2,
    Sink: 3,
    Branch: 4,
    Merge: 5,
    Split: 6,
    Buffer: 7,
    Queue: 8,
    AGVRoute: 9,
    ShuttleStage: 10,
    Conveyor: 11,
    Note: 12,
    StopGroupProxy: 13,
    FallbackOnly: 65535
  });

  const KIND_NAMES = [];
  Object.keys(KINDS).forEach((name)=>{
    KIND_NAMES[KINDS[name]] = name;
  });

  const kernelByKind = Object.create(null);

  function normalizeText(value){
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function inferKindId(node){
    const type = normalizeText(node && node.type);
    const title = normalizeText(node && node.title);
    const preset = normalizeText(node && node.properties && node.properties.presetId);
    const src = `${type} ${title} ${preset}`;
    if(src.indexOf('source') >= 0) return KINDS.Source;
    if(src.indexOf('branch') >= 0) return KINDS.Branch;
    if(src.indexOf('merge') >= 0 || src.indexOf('join') >= 0) return KINDS.Merge;
    if(src.indexOf('split') >= 0) return KINDS.Split;
    if(src.indexOf('sink') >= 0) return KINDS.Sink;
    if(
      src.indexOf('equipment') >= 0
      || src.indexOf('/equip') >= 0
      || src.indexOf(' equip') >= 0
      || src.indexOf('machine') >= 0
      || src.indexOf('process') >= 0
    ) return KINDS.Equipment;
    if(src.indexOf('buffer') >= 0 || src.indexOf('queue') >= 0 || src.indexOf('stocker') >= 0) return KINDS.Buffer;
    if(src.indexOf('agv_route') >= 0 || src.indexOf('agv route') >= 0 || src.indexOf('carrier_route') >= 0 || src.indexOf('carrier route') >= 0) return KINDS.AGVRoute;
    if(src.indexOf('shuttle') >= 0) return KINDS.ShuttleStage;
    if(src.indexOf('conveyor') >= 0) return KINDS.Conveyor;
    if(src.indexOf('note') >= 0 || src.indexOf('memo') >= 0) return KINDS.Note;
    return KINDS.Unknown;
  }

  function getKernel(kindId){
    return kernelByKind[kindId] || null;
  }

  function getNode(ctx, nodeIndex){
    if(ctx && typeof ctx.getNode === 'function') return ctx.getNode(nodeIndex);
    if(ctx && ctx.compat && typeof ctx.compat.getNode === 'function') return ctx.compat.getNode(nodeIndex);
    return null;
  }

  function captureOutputRefs(node){
    const outputs = Array.isArray(node && node.outputs) ? node.outputs : [];
    const refs = new Array(outputs.length);
    for(let i = 0; i < outputs.length; i += 1){
      refs[i] = outputs[i] ? outputs[i]._data : undefined;
    }
    return refs;
  }

  function sameNumber(a, b){
    if(Number.isNaN(a) && Number.isNaN(b)) return true;
    return a === b;
  }

  function sameOutputRefs(a, b){
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    const len = Math.max(left.length, right.length);
    for(let i = 0; i < len; i += 1){
      if(left[i] !== right[i]) return false;
    }
    return true;
  }

  function captureState(node, extra){
    const snapshot = {
      state: node && node._state ? String(node._state) : '',
      stateName: node && node._stateName ? String(node._stateName) : '',
      until: node ? Number(node._until) : NaN,
      payload: node ? node._payload : null,
      currentWork: node ? node._currentWork : null,
      lastInRef: node ? node._lastInRef : null,
      outputRefs: captureOutputRefs(node)
    };
    if(extra && typeof extra === 'object'){
      Object.keys(extra).forEach((key)=>{
        snapshot[key] = extra[key];
      });
    }
    return snapshot;
  }

  function captureMergeState(node){
    return captureState(node, {
      cycleActive: !!(node && node._cycleActive),
      nextSlotCursor: node ? Number(node._nextSlotCursor) || 0 : 0,
      activeSlotsKey: Array.isArray(node && node._activeSlots) ? node._activeSlots.join(',') : '',
      worksBySlotCount: node && node._worksBySlot ? Object.keys(node._worksBySlot).length : 0
    });
  }

  function didStateChange(before, after, extraKeys){
    if(!before || !after) return true;
    if(before.state !== after.state) return true;
    if(before.stateName !== after.stateName) return true;
    if(!sameNumber(before.until, after.until)) return true;
    if(before.payload !== after.payload) return true;
    if(before.currentWork !== after.currentWork) return true;
    if(before.lastInRef !== after.lastInRef) return true;
    const keys = Array.isArray(extraKeys) ? extraKeys : [];
    for(const key of keys){
      if(before[key] !== after[key]) return true;
    }
    return false;
  }

  function buildResult(before, after, nextUntil, extraKeys){
    return {
      nextUntil: Number.isFinite(nextUntil) ? Number(nextUntil) : NaN,
      stateChanged: didStateChange(before, after, extraKeys),
      outputsChanged: !sameOutputRefs(before && before.outputRefs, after && after.outputRefs)
    };
  }

  function getTimedUntil(node, nowMs){
    if(!node) return NaN;
    const state = String(node._state || '').toUpperCase();
    if(state !== 'PROCESS' && state !== 'DOWN') return NaN;
    const until = Number(node._until);
    if(!Number.isFinite(until)) return NaN;
    if(until <= nowMs + EPSILON_MS) return nowMs;
    return until;
  }

  function collectSignalInputs(node){
    const pairs = [];
    const inputs = Array.isArray(node && node.inputs) ? node.inputs : [];
    for(let i = 0; i < inputs.length; i += 1){
      const name = String(inputs[i] && inputs[i].name || '');
      const match = /^sigIn(\d+)$/.exec(name);
      if(!match) continue;
      pairs.push({ order: Number(match[1]), slot: i });
    }
    pairs.sort((a, b)=> a.order - b.order);
    const values = new Array(pairs.length);
    for(let i = 0; i < pairs.length; i += 1){
      values[i] = (node && typeof node.getInputData === 'function')
        ? node.getInputData(pairs[i].slot)
        : null;
    }
    return values;
  }

  function emitSignals(node, state){
    const count = Math.max(0, Number(node && node.properties && node.properties.sigExtra) || 0);
    if(typeof node._emit !== 'function') return;
    for(let i = 0; i < count; i += 1){
      node._emit(i, state);
    }
  }

  function applyStateTheme(node){
    if(!node) return;
    switch(String(node._state || '').toUpperCase()){
      case 'PROCESS':
        node.color = '#2ecc71';
        node.bgcolor = '#e8f8f2';
        break;
      case 'WAIT':
        node.color = '#f39c12';
        node.bgcolor = '#fff6e6';
        break;
      case 'DOWN':
        node.color = '#3498db';
        node.bgcolor = '#e8f1fb';
        break;
      case 'ERROR':
        node.color = '#e74c3c';
        node.bgcolor = '#fdecea';
        break;
      default:
        node.color = '#f1c40f';
        node.bgcolor = '#fff9db';
        break;
    }
    if(typeof window.applyNodeStateTheme === 'function'){
      window.applyNodeStateTheme(node, node._state);
    }
    if((node._state && node._state !== 'IDLE') || node._payload){
      if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true, true);
    }
  }

  function getOutgoingStatus(ctx, nodeIndex, originSlot, payload){
    const compiled = ctx && ctx.compiled;
    if(!compiled) return { ready: false, status: 'DISCONNECTED' };
    const first = compiled.firstOutEdge[nodeIndex];
    const end = first + compiled.outEdgeCount[nodeIndex];
    const originSlots = compiled.outOriginSlots;
    let hasValidLink = false;

    for(let i = first; i < end; i += 1){
      if(originSlots && originSlots[i] !== originSlot) continue;
      const targetIndex = compiled.outTargets[i];
      const targetSlot = compiled.outTargetSlots[i];
      const targetNode = getNode(ctx, targetIndex);
      if(!targetNode) continue;
      hasValidLink = true;

      if(typeof targetNode.canAcceptWorkInput === 'function'){
        let accepted = false;
        try{
          accepted = !!targetNode.canAcceptWorkInput(targetSlot, payload);
        }catch(_e){
          accepted = false;
        }
        if(!accepted) return { ready: false, status: 'BUSY' };
        continue;
      }

      if(typeof targetNode._state !== 'undefined' && targetNode._state !== 'IDLE'){
        return { ready: false, status: 'BUSY' };
      }
    }

    if(!hasValidLink) return { ready: false, status: 'DISCONNECTED' };
    return { ready: true, status: 'READY' };
  }

  function downstreamReady(ctx, nodeIndex, originSlot, payload){
    return getOutgoingStatus(ctx, nodeIndex, originSlot, payload).ready;
  }

  function maybeSpawnInputAnimation(node, slotIndex, durationMs, work){
    if(!(durationMs > 0)) return;
    try{
      if(!window.WorkLinkAnimator || !node || !node.graph) return;
      const port = node.inputs && node.inputs[slotIndex];
      if(!port || port.link == null) return;
      const info = (work && typeof work === 'object') ? { id: work.id, t: work.type, entity: work } : null;
      window.WorkLinkAnimator.spawn(node.graph, port.link, 'work', durationMs, info);
    }catch(_e){}
  }

  function finalizeEquipmentNode(node){
    emitSignals(node, node && node._state);
    applyStateTheme(node);
  }

  function createSourceKernel(){
    return {
      execute(nodeIndex, nowMs, ctx){
        const node = getNode(ctx, nodeIndex);
        if(!node) return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        const before = captureState(node);
        const sigCount = Math.max(0, Number(node.properties && node.properties.sigExtra) || 0);

        if(typeof node._holdPendingWork === 'function' && node._holdPendingWork()){
          for(let i = 0; i < sigCount; i += 1){
            if(typeof node._emit === 'function') node._emit(i, 'SEND');
          }
          const held = captureState(node);
          return buildResult(before, held, NaN);
        }

        if((!node._seq || !node._seq.length) && typeof node._parseSeq === 'function') node._parseSeq();
        const nextId = (Number(node._counter) || 0) + 1;
        const entry = (Array.isArray(node._seq) && node._seq[node._cursor]) ? node._seq[node._cursor] : { type: 'A' };
        const WorkCtor = window.Work || function(id, type){ this.id = id; this.type = type; };
        const preview = new WorkCtor(nextId, entry.type);
        const flowSelection = typeof node._runtimeSelectOutputRule === 'function'
          ? node._runtimeSelectOutputRule(preview, { processComplete:true })
          : { slot:0 };
        const flowSlot = Number.isInteger(flowSelection && flowSelection.slot) ? flowSelection.slot : 0;
        const ready = !!flowSelection && downstreamReady(ctx, nodeIndex, flowSlot, preview);

        if(ready){
          const work = preview;
          if(typeof node.setOutputData === 'function') node.setOutputData(flowSlot, work);
          node._pendingWork = work;
          if(typeof node._animateWorkOutput === 'function') node._animateWorkOutput(work);
          node._counter = nextId;
          node._cursor = node._seq && node._seq.length ? ((node._cursor + 1) % node._seq.length) : 0;
          for(let i = 0; i < sigCount; i += 1){
            if(typeof node._emit === 'function') node._emit(i, 'SEND');
          }
        }else{
          if(typeof node.setOutputData === 'function') node.setOutputData(0, null);
          for(let i = 0; i < sigCount; i += 1){
            if(typeof node._emit === 'function') node._emit(i, 'IDLE');
          }
        }

        const after = captureState(node);
        return buildResult(before, after, NaN);
      },
      getEventUntil(){
        return NaN;
      }
    };
  }

  function createEquipmentKernel(){
    return {
      execute(nodeIndex, nowMs, ctx){
        const node = getNode(ctx, nodeIndex);
        if(!node) return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        const before = captureState(node);
        const now = Number.isFinite(nowMs) ? nowMs : 0;

        if(node._state === 'IDLE') node._currentWork = null;

        const sig = collectSignalInputs(node);
        let guard = 0;
        let again = true;

        while(again && guard++ < 6){
          again = false;
          switch(node._state){
            case 'PROCESS':
              if(now >= Number(node._until)){
                node._state = 'WAIT';
                node._handoffOffered = false;
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(true);
                again = true;
              }
              break;
            case 'WAIT': {
              const flowSelection = typeof node._runtimeSelectOutputRule === 'function'
                ? node._runtimeSelectOutputRule(node._payload, { processComplete:true })
                : { slot:0 };
              const flowSlot = Number.isInteger(flowSelection && flowSelection.slot) ? flowSelection.slot : 0;
              if(flowSelection && downstreamReady(ctx, nodeIndex, flowSlot, node._payload)){
                const payload = node._payload;
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(false);
                node._state = 'DOWN';
                const downMs = Math.max(0, (Number(node.properties && node.properties.downTime) || 0) * 1000);
                node._until = now + downMs;
                node._flowOutputSlot = flowSlot;
                if(typeof node.setOutputData === 'function') node.setOutputData(flowSlot, payload);
                if(typeof node._spawnSinkTransfer === 'function') node._spawnSinkTransfer(downMs, payload, flowSlot);
                node._payload = null;
              }else{
                const slot = Number.isInteger(node._flowOutputSlot) ? node._flowOutputSlot : flowSlot;
                if(typeof node.setOutputData === 'function' && slot >= 0) node.setOutputData(slot, null);
              }
              break;
            }
            case 'DOWN':
              if(now >= Number(node._until)){
                const flowSlot = Number.isInteger(node._flowOutputSlot) ? node._flowOutputSlot : 0;
                if(typeof node.setOutputData === 'function') node.setOutputData(flowSlot, null);
                node._flowOutputSlot = null;
                node._state = 'IDLE';
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(false);
                again = true;
              }
              break;
            case 'IDLE': {
              const input0 = (node.inputs && node.inputs[0]) ? node.inputs[0] : null;
              const hasLink = !!(input0 && input0.link != null);
              if(!hasLink) break;
              const work = (typeof node.getInputData === 'function') ? node.getInputData(0) : null;
              if(!work){
                node._lastInRef = null;
                break;
              }
              if(typeof work !== 'object') break;
              if(node._lastInRef === work) break;
              if(typeof node._runtimeSelectInputRule === 'function' && !node._runtimeSelectInputRule(work, 0)) break;
              if(typeof node._evalScript === 'function' && !node._evalScript(work, sig)){
                if(typeof node.setOutputData === 'function') node.setOutputData(0, work);
                break;
              }

              node._currentWork = work;
              node._payload = work;
              node._state = 'PROCESS';
              const durationMs = Math.max(0, (Number(node.properties && node.properties.processTime) || 0) * 1000);
              node._until = now + durationMs;
              node._lastInRef = work;
              maybeSpawnInputAnimation(node, 0, durationMs, work);
              if(durationMs === 0) again = true;
              break;
            }
          }

          if(node._state === 'DOWN') break;
        }

        finalizeEquipmentNode(node);
        const after = captureState(node);
        return buildResult(before, after, getTimedUntil(node, now));
      },
      getEventUntil(nodeIndex, nowMs, ctx){
        return getTimedUntil(getNode(ctx, nodeIndex), Number.isFinite(nowMs) ? nowMs : 0);
      }
    };
  }

  function createSinkKernel(){
    return {
      execute(nodeIndex, nowMs, ctx){
        const node = getNode(ctx, nodeIndex);
        if(!node) return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        const now = Number.isFinite(nowMs) ? nowMs : 0;
        const work = (typeof node.getInputData === 'function') ? node.getInputData(0) : null;
        if(typeof node._calcThroughputPerHour === 'function') node._calcThroughputPerHour(now);

        if(!work){
          node._lastInRef = null;
          return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        }
        if(node._lastInRef === work){
          return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        }
        if(typeof node._runtimeSelectInputRule === 'function' && !node._runtimeSelectInputRule(work, 0)){
          return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        }

        node._lastInRef = work;
        if(!Array.isArray(node._recv)) node._recv = [];
        if(!Array.isArray(node._recentRecvTimes)) node._recentRecvTimes = [];
        node._recv.push(work);
        node._recentRecvTimes.push(now);
        if(typeof node._pruneRecentRecvTimes === 'function') node._pruneRecentRecvTimes(now);
        node._lastWork = work;
        node._lastAt = now;
        if(typeof node._recordSample === 'function') node._recordSample(now);
        const tph = (typeof node._calcThroughputPerHour === 'function')
          ? node._calcThroughputPerHour(now)
          : 0;
        if(typeof node._formatThroughputPerHour === 'function'){
          node.tooltip = `Got:${node._recv.length} | TPH(1h): ${node._formatThroughputPerHour(tph)}`;
        }
        return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
      },
      getEventUntil(){
        return NaN;
      }
    };
  }

  function createBranchKernel(){
    return {
      execute(nodeIndex, nowMs, ctx){
        const node = getNode(ctx, nodeIndex);
        if(!node) return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        const before = captureState(node);
        const now = Number.isFinite(nowMs) ? nowMs : 0;
        if(typeof node._ensureMinWorkOutputs === 'function') node._ensureMinWorkOutputs(2);
        if(node._state === 'IDLE') node._currentWork = null;

        const sig = collectSignalInputs(node);
        let guard = 0;
        let again = true;

        while(again && guard++ < 6){
          again = false;
          switch(node._state){
            case 'PROCESS':
              if(now >= Number(node._until)){
                node._state = 'WAIT';
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(true);
                again = true;
              }
              break;
            case 'WAIT': {
              const payload = node._payload;
              const slotIndex = (typeof node._routeSlotForPayload === 'function')
                ? node._routeSlotForPayload(payload, true)
                : -1;
              if(slotIndex >= 0 && downstreamReady(ctx, nodeIndex, slotIndex, payload)){
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(false);
                node._state = 'DOWN';
                const downMs = Math.max(0, (Number(node.properties && node.properties.downTime) || 0) * 1000);
                node._until = now + downMs;
                if(typeof node._clearWorkOutputs === 'function') node._clearWorkOutputs();
                if(typeof node.setOutputData === 'function') node.setOutputData(slotIndex, payload);
                if(typeof node._spawnBranchTransfer === 'function') node._spawnBranchTransfer(downMs, payload, slotIndex);
                node._payload = null;
              }else if(typeof node._clearWorkOutputs === 'function'){
                node._clearWorkOutputs();
              }
              break;
            }
            case 'DOWN':
              if(now >= Number(node._until)){
                if(typeof node._clearWorkOutputs === 'function') node._clearWorkOutputs();
                node._state = 'IDLE';
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(false);
                again = true;
              }
              break;
            case 'IDLE': {
              const input0 = (node.inputs && node.inputs[0]) ? node.inputs[0] : null;
              const hasLink = !!(input0 && input0.link != null);
              if(!hasLink) break;
              const work = (typeof node.getInputData === 'function') ? node.getInputData(0) : null;
              if(!work){
                node._lastInRef = null;
                break;
              }
              if(typeof work !== 'object') break;
              if(node._lastInRef === work) break;
              if(typeof node._evalScript === 'function' && !node._evalScript(work, sig)){
                node._currentWork = work;
                node._payload = work;
                node._state = 'WAIT';
                node._lastInRef = work;
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(true);
                again = true;
                break;
              }
              node._currentWork = work;
              node._payload = work;
              node._state = 'PROCESS';
              const durationMs = Math.max(0, (Number(node.properties && node.properties.processTime) || 0) * 1000);
              node._until = now + durationMs;
              node._lastInRef = work;
              maybeSpawnInputAnimation(node, 0, durationMs, work);
              if(durationMs === 0) again = true;
              break;
            }
          }
          if(node._state === 'DOWN') break;
        }

        finalizeEquipmentNode(node);
        const after = captureState(node);
        return buildResult(before, after, getTimedUntil(node, now));
      },
      getEventUntil(nodeIndex, nowMs, ctx){
        return getTimedUntil(getNode(ctx, nodeIndex), Number.isFinite(nowMs) ? nowMs : 0);
      }
    };
  }

  function createSplitKernel(){
    function downReadyForAll(ctx, nodeIndex, node, payload){
      const rows = (typeof node._workOutputs === 'function') ? node._workOutputs() : [];
      if(rows.length < 2) return false;
      let connectedCount = 0;
      for(const row of rows){
        const status = getOutgoingStatus(ctx, nodeIndex, row.slotIndex, payload);
        if(status.status === 'BUSY') return false;
        if(status.status === 'READY') connectedCount += 1;
      }
      return connectedCount > 0;
    }

    return {
      execute(nodeIndex, nowMs, ctx){
        const node = getNode(ctx, nodeIndex);
        if(!node) return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        const before = captureState(node);
        const now = Number.isFinite(nowMs) ? nowMs : 0;
        if(typeof node._ensureMinWorkOutputs === 'function') node._ensureMinWorkOutputs(2);
        if(node._state === 'IDLE') node._currentWork = null;

        const sig = collectSignalInputs(node);
        let guard = 0;
        let again = true;

        while(again && guard++ < 6){
          again = false;
          switch(node._state){
            case 'PROCESS':
              if(now >= Number(node._until)){
                node._state = 'WAIT';
                node._handoffOffered = false;
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(true);
                again = true;
              }
              break;
            case 'WAIT': {
              const workOuts = (typeof node._workOutputs === 'function') ? node._workOutputs() : [];
              if(downReadyForAll(ctx, nodeIndex, node, node._payload)){
                const payload = node._payload;
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(false);
                node._state = 'DOWN';
                const downMs = Math.max(0, (Number(node.properties && node.properties.downTime) || 0) * 1000);
                node._until = now + downMs;
                for(let i = 0; i < workOuts.length; i += 1){
                  const slotIndex = workOuts[i].slotIndex;
                  const outWork = (i === 0 || typeof node._cloneWork !== 'function') ? payload : node._cloneWork(payload);
                  if(typeof node.setOutputData === 'function') node.setOutputData(slotIndex, outWork);
                  if(typeof node._spawnSplitTransfer === 'function') node._spawnSplitTransfer(downMs, outWork, slotIndex);
                }
                node._payload = null;
              }else{
                for(const row of workOuts){
                  if(typeof node.setOutputData === 'function') node.setOutputData(row.slotIndex, null);
                }
              }
              break;
            }
            case 'DOWN':
              if(now >= Number(node._until)){
                const workOuts = (typeof node._workOutputs === 'function') ? node._workOutputs() : [];
                for(const row of workOuts){
                  if(typeof node.setOutputData === 'function') node.setOutputData(row.slotIndex, null);
                }
                node._state = 'IDLE';
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(false);
                again = true;
              }
              break;
            case 'IDLE': {
              const input0 = (node.inputs && node.inputs[0]) ? node.inputs[0] : null;
              const hasLink = !!(input0 && input0.link != null);
              if(!hasLink) break;
              const work = (typeof node.getInputData === 'function') ? node.getInputData(0) : null;
              if(!work){
                node._lastInRef = null;
                break;
              }
              if(typeof work !== 'object') break;
              if(node._lastInRef === work) break;
              if(typeof node._evalScript === 'function' && !node._evalScript(work, sig)){
                node._currentWork = work;
                node._payload = work;
                node._state = 'WAIT';
                node._handoffOffered = false;
                node._lastInRef = work;
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(true);
                again = true;
                break;
              }
              node._currentWork = work;
              node._payload = work;
              node._state = 'PROCESS';
              const durationMs = Math.max(0, (Number(node.properties && node.properties.processTime) || 0) * 1000);
              node._until = now + durationMs;
              node._lastInRef = work;
              maybeSpawnInputAnimation(node, 0, durationMs, work);
              if(durationMs === 0) again = true;
              break;
            }
          }
          if(node._state === 'DOWN') break;
        }

        finalizeEquipmentNode(node);
        const after = captureState(node);
        return buildResult(before, after, getTimedUntil(node, now));
      },
      getEventUntil(nodeIndex, nowMs, ctx){
        return getTimedUntil(getNode(ctx, nodeIndex), Number.isFinite(nowMs) ? nowMs : 0);
      }
    };
  }

  function createMergeKernel(){
    return {
      execute(nodeIndex, nowMs, ctx){
        const node = getNode(ctx, nodeIndex);
        if(!node) return { nextUntil: NaN, stateChanged: false, outputsChanged: false };
        if(typeof node._ensureMinWorkInputs === 'function') node._ensureMinWorkInputs(2);
        const before = captureMergeState(node);
        const now = Number.isFinite(nowMs) ? nowMs : 0;

        if(node._state === 'ERROR'){
          applyStateTheme(node);
          return buildResult(before, before, NaN, ['cycleActive', 'nextSlotCursor', 'activeSlotsKey', 'worksBySlotCount']);
        }

        let guard = 0;
        let again = true;

        while(again && guard++ < 8){
          again = false;
          switch(node._state){
            case 'PROCESS':
              if(now >= Number(node._until)){
                node._nextSlotCursor += 1;
                if(node._nextSlotCursor < (Array.isArray(node._activeSlots) ? node._activeSlots.length : 0)){
                  node._state = 'IDLE';
                  node._currentWork = null;
                  again = true;
                }else{
                  const firstSlot = Array.isArray(node._activeSlots) ? node._activeSlots[0] : -1;
                  node._payload = (firstSlot >= 0 && node._worksBySlot) ? (node._worksBySlot[firstSlot] || null) : null;
                  node._handoffOffered = false;
                  node._state = 'WAIT';
                  if(typeof node._setWaitIcon === 'function') node._setWaitIcon(true);
                  again = true;
                }
              }
              break;
            case 'WAIT':
              if(downstreamReady(ctx, nodeIndex, 0, node._payload)){
                const payload = node._payload;
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(false);
                node._state = 'DOWN';
                const downMs = Math.max(0, (Number(node.properties && node.properties.downTime) || 0) * 1000);
                node._until = now + downMs;
                if(typeof node.setOutputData === 'function') node.setOutputData(0, payload);
                if(typeof node._spawnSinkTransfer === 'function') node._spawnSinkTransfer(downMs, payload);
                node._payload = null;
              }else{
                if(typeof node.setOutputData === 'function') node.setOutputData(0, null);
              }
              break;
            case 'DOWN':
              if(now >= Number(node._until)){
                if(typeof node.setOutputData === 'function') node.setOutputData(0, null);
                if(typeof node._setWaitIcon === 'function') node._setWaitIcon(false);
                node._state = 'IDLE';
                if(typeof node._resetCycleData === 'function') node._resetCycleData(true);
                again = true;
              }
              break;
            case 'IDLE': {
              const ready = (typeof node._prepareCycleIfNeeded === 'function') ? node._prepareCycleIfNeeded() : false;
              if(!ready) break;
              const immediate = (typeof node._acceptFromExpectedSlot === 'function')
                ? !!node._acceptFromExpectedSlot(now)
                : false;
              if(immediate) again = true;
              break;
            }
          }

          if(node._state === 'DOWN') break;
        }

        applyStateTheme(node);
        const after = captureMergeState(node);
        return buildResult(before, after, getTimedUntil(node, now), ['cycleActive', 'nextSlotCursor', 'activeSlotsKey', 'worksBySlotCount']);
      },
      getEventUntil(nodeIndex, nowMs, ctx){
        return getTimedUntil(getNode(ctx, nodeIndex), Number.isFinite(nowMs) ? nowMs : 0);
      }
    };
  }

  const api = App.fastKernels || (App.fastKernels = {});
  api.KINDS = KINDS;
  api.KIND_NAMES = KIND_NAMES;
  api.inferKindId = inferKindId;
  api.getKindName = function(kindId){
    return KIND_NAMES[kindId] || 'Unknown';
  };
  api.registerKernel = function(kindId, kernel){
    if(!Number.isFinite(Number(kindId)) || !kernel || typeof kernel !== 'object') return false;
    kernelByKind[Number(kindId)] = kernel;
    return true;
  };
  api.getKernel = getKernel;
  api.canHandleKind = function(kindId){
    const kernel = getKernel(kindId);
    return !!(kernel && typeof kernel.execute === 'function' && typeof kernel.getEventUntil === 'function');
  };

  api.registerKernel(KINDS.Source, createSourceKernel());
  api.registerKernel(KINDS.Equipment, createEquipmentKernel());
  api.registerKernel(KINDS.Sink, createSinkKernel());
  api.registerKernel(KINDS.Branch, createBranchKernel());
  api.registerKernel(KINDS.Merge, createMergeKernel());
  api.registerKernel(KINDS.Split, createSplitKernel());
})();
