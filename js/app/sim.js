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

function startSimulation(){
  if(!App.graph) return;
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()) return;
  App.graph.status = LGraph.STATUS_RUNNING;
  App.graph.starttime = LiteGraph.getTime();
  App.graph.last_update_time = App.graph.starttime;
  App.graph.sendEventToAllNodes('onStart');
  window.startSimLoop(()=>{
    // First pass advances simulation time
    App.graph.__outputDirty = false;
    App.graph.runStep(1, !App.graph.catch_errors);
    // Always run one settle pass (dt=0) so downstream can react within the same tick,
    // even if no output changed (state-only readiness changes).
    App.graph.__outputDirty = false;
    App.graph.runStep(0, !App.graph.catch_errors);
    // Additional settle passes only if outputs keep changing
    let settle = 0;
    while(App.graph.__outputDirty && settle++ < 5){
      App.graph.__outputDirty = false;
      App.graph.runStep(0, !App.graph.catch_errors);
    }
    if(App.timelineChart) App.timelineChart.onStep();
  });
}

function stopSimulation(){
  if(typeof window.isSimRunning === 'function' && window.isSimRunning()){
    window.stopSimLoop();
  }
  if(App.graph && App.graph.status !== LGraph.STATUS_STOPPED){
    App.graph.status = LGraph.STATUS_STOPPED;
    App.graph.sendEventToAllNodes('onStop');
  }
}

