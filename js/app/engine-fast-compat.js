// Compatibility adapter for event-fast fallback nodes.

var App = window.App || (window.App = {});

(function(){
  const EPSILON_MS = 0.001;

  function hasTimedState(node){
    if(!node) return false;
    const state = String(node._state || '').toUpperCase();
    if(state === 'PROCESS' || state === 'DOWN') return true;
    const stateName = String(node._stateName || '').toLowerCase();
    return stateName.indexOf('process') >= 0 || stateName.indexOf('down') >= 0;
  }

  function getTimedUntil(node, nowMs){
    if(!hasTimedState(node)) return NaN;
    const until = Number(node && node._until);
    if(!Number.isFinite(until)) return NaN;
    if(until <= nowMs) return nowMs;
    return until;
  }

  function getNodeEventUntil(node, nowMs){
    const timed = getTimedUntil(node, nowMs);
    if(Number.isFinite(timed)) return timed;
    if(!node || typeof node.getEventUntil !== 'function') return NaN;
    let until = NaN;
    try{
      until = Number(node.getEventUntil(nowMs));
    }catch(err){
      console.error(err);
      return NaN;
    }
    if(!Number.isFinite(until)) return NaN;
    if(until <= nowMs + EPSILON_MS) return nowMs;
    return until;
  }

  function safeExecuteNode(graph, node){
    if(!node || typeof node.onExecute !== 'function') return null;
    if(graph && graph.catch_errors === false){
      node.onExecute();
      return null;
    }
    try{
      node.onExecute();
      return null;
    }catch(err){
      return err;
    }
  }

  App.createFastCompatAdapter = function(graph, compiled){
    const nodeRefs = new Array(compiled && compiled.nodeCount || 0);
    if(graph && typeof graph.getNodeById === 'function' && compiled && compiled.nodeIds){
      for(let i = 0; i < compiled.nodeCount; i += 1){
        nodeRefs[i] = graph.getNodeById(compiled.nodeIds[i]) || null;
      }
    }

    return {
      getNode(nodeIndex){
        return nodeRefs[nodeIndex] || null;
      },
      captureInitial(nodeIndex){
        const node = nodeRefs[nodeIndex] || null;
        const outputs = Array.isArray(node && node.outputs) ? node.outputs : [];
        const outputRefs = new Array(outputs.length);
        for(let i = 0; i < outputs.length; i += 1){
          outputRefs[i] = outputs[i] ? outputs[i]._data : undefined;
        }
        return {
          state: node && node._state ? String(node._state) : '',
          stateName: node && node._stateName ? String(node._stateName) : '',
          until: node ? Number(node._until) : NaN,
          outputRefs
        };
      },
      execute(nodeIndex, nowMs){
        const node = nodeRefs[nodeIndex] || null;
        if(!node){
          return {
            nextUntil: NaN,
            stateChanged: false,
            outputsChanged: false,
            error: null
          };
        }

        const before = this.captureInitial(nodeIndex);
        const error = safeExecuteNode(graph, node);
        const after = this.captureInitial(nodeIndex);
        let outputsChanged = false;
        const beforeRefs = Array.isArray(before.outputRefs) ? before.outputRefs : [];
        const afterRefs = Array.isArray(after.outputRefs) ? after.outputRefs : [];
        const outputLen = Math.max(beforeRefs.length, afterRefs.length);
        for(let i = 0; i < outputLen; i += 1){
          if(beforeRefs[i] !== afterRefs[i]){
            outputsChanged = true;
            break;
          }
        }

        return {
          nextUntil: getNodeEventUntil(node, nowMs),
          stateChanged: before.state !== after.state || before.stateName !== after.stateName || before.until !== after.until,
          outputsChanged,
          error
        };
      },
      getEventUntil(nodeIndex, nowMs){
        const node = nodeRefs[nodeIndex] || null;
        return getNodeEventUntil(node, nowMs);
      }
    };
  };
})();
