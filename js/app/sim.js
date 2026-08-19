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
      App.engine.update(simDeltaMs);
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
