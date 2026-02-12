// Simulation clock wiring for graph

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

function startSimulation(){
  if(!graph) return;
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()) return;
  graph.status = LGraph.STATUS_RUNNING;
  graph.starttime = LiteGraph.getTime();
  graph.last_update_time = graph.starttime;
  graph.sendEventToAllNodes('onStart');
  window.startSimLoop(()=>{
    // First pass advances simulation time
    graph.__outputDirty = false;
    graph.runStep(1, !graph.catch_errors);
    // Always run one settle pass (dt=0) so downstream can react within the same tick,
    // even if no output changed (state-only readiness changes).
    graph.__outputDirty = false;
    graph.runStep(0, !graph.catch_errors);
    // Additional settle passes only if outputs keep changing
    let settle = 0;
    while(graph.__outputDirty && settle++ < 5){
      graph.__outputDirty = false;
      graph.runStep(0, !graph.catch_errors);
    }
    if(timelineChart) timelineChart.onStep();
  });
}

function stopSimulation(){
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()){
    window.stopSimLoop();
  }
  if(graph && graph.status !== LGraph.STATUS_STOPPED){
    graph.status = LGraph.STATUS_STOPPED;
    graph.sendEventToAllNodes('onStop');
  }
}
