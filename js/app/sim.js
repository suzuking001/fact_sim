// Simulation clock wiring for graph

var App = window.App || (window.App = {});

function configureGraphClock(g){
  if(!g) return;
  const dt = (typeof window.getSimDtSec === 'function') ? window.getSimDtSec() : 0.1;
  g.fixedtime_lapse = dt;
  g.fixedtime = 0;
  g.globaltime = 0;
  g.elapsed_time = 0;
  g.iteration = 0;
  g.status = LGraph.STATUS_STOPPED;
}

function setStateLegendVisible(visible){
  const next = !!visible;
  if(document.body) document.body.classList.toggle('simulation-running', next);
  const legend = document.getElementById('stateLegend');
  if(legend) legend.setAttribute('aria-hidden', next ? 'false' : 'true');
}
App.setStateLegendVisible = setStateLegendVisible;

function startSimulation(){
  if(!App.graph) return;
  const flowErrors=App.FlowModel.graphErrors(App.graph);
  if(flowErrors.length){App.showToast?.(flowErrors[0]);throw new Error(flowErrors.join('\n'));}
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()) return;
  if(typeof App.runtimeInstancesForGraph === 'function' && !App.graph.__factSimRuntimeInstances){
    App.initializeEntityRuntime(App.graph);
  }
  if(typeof App.resetRenderBudget === 'function') App.resetRenderBudget();

  const mode = (App.getSimMode ? App.getSimMode() : (App.simMode || 'dt'));
  App.engine = (typeof App.createSimEngine === 'function')
    ? App.createSimEngine(mode, App.graph)
    : null;
  if(App.engine && typeof App.engine.reset === 'function') App.engine.reset();

  App.graph.status = LGraph.STATUS_RUNNING;
  App.graph.starttime = LiteGraph.getTime();
  App.graph.last_update_time = App.graph.starttime;
  App.graph.sendEventToAllNodes('onStart');

  window.startSimLoop((simDeltaMs)=>{
    if(App.engine && typeof App.engine.update === 'function'){
      const beforeMs = (typeof window.simNow === 'function') ? window.simNow() : NaN;
      App.engine.update(simDeltaMs);
      const afterMs = (typeof window.simNow === 'function') ? window.simNow() : NaN;
      if(afterMs !== beforeMs && App.canvas && !App.isRenderSuppressed?.()){
        // LiteGraph can leave the canvas clean while entity positions advance.
        // Render the new state now; otherwise it may only appear on Stop's
        // forced draw or on an unrelated node change several seconds later.
        App.canvas.setDirty(true, true);
        App.canvas.draw();
      }
    }
  });
  setStateLegendVisible(true);
}

function stopSimulation(){
  setStateLegendVisible(false);
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()){
    window.stopSimLoop();
  }

  if(App.engine && typeof App.engine.stop === 'function'){
    try{ App.engine.stop(); }catch(_e){}
  }
  App.engine = null;

  if(App.graph && App.graph.status !== LGraph.STATUS_STOPPED){
    App.graph.status = LGraph.STATUS_STOPPED;
    App.graph.sendEventToAllNodes('onStop');
  }

  try{
    if(App.timelineChart && typeof App.timelineChart.draw === 'function') App.timelineChart.draw();
  }catch(_e){}
  try{
    if(App.canvas && typeof App.canvas.draw === 'function') App.canvas.draw(true, true);
  }catch(_e){}
}

// Keep graph/node identities and the open Flow editor while clearing a run.
// Reconfiguring the graph here would leave the editor pointing at old nodes.
App.resetSimulationForFlowEdit = function(graph){
  if(!graph || graph!==App.graph) throw new Error('The Flow belongs to a different graph. Reopen its editor.');
  const nodes=graph._nodes || [];
  const hasRun=(Number(window.simNow?.()) || 0)>0 || nodes.some(n=>n._flowRuntime?.checked || App.FlowRuntime?.isActive(n) || n._sent || n._recv?.length);
  if(!hasRun) return false;
  stopSimulation();
  if(typeof window.resetSimClock==='function') window.resetSimClock();
  else window.setSimTime?.(0);
  configureGraphClock(graph);
  App.stopGroups?.clearRuntimeState?.();
  for(const node of nodes){
    if(node.type!=='factory/basic') continue;
    delete node._flowRuntime;
    node._state='IDLE';node._stateName='idle';node._until=0;
    node._payload=null;node._currentWork=null;node._sent=0;
    if(node.properties.role==='sink') node._recv=[];
    for(const output of node.outputs || []) output._data=null;
    window.applyNodeStateTheme?.(node,'IDLE');
  }
  for(const link of Object.values(graph.links || {})){link.data=null;link._last_time=0;}
  App.initializeEntityRuntime(graph);
  App.clearRuntimeVisualState?.(graph);
  graph.__outputDirty=false;graph.__dirtyNodeIds=null;
  App.timelineChart?.reset?.();
  App.timelineChart?.capture?.();
  return true;
};
