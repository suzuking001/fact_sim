// Shared app state and small UI helpers

var App = window.App || (window.App = {});

App.graph = null;
App.canvas = null;
App.timelineChart = null;
App.toastTimer = null;
App._controllers = App._controllers || {};

App.showToast = function(msg){
  const toast = document.getElementById('toast');
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if(App.toastTimer) clearTimeout(App.toastTimer);
  App.toastTimer = setTimeout(()=> toast.classList.remove('show'), 1000);
};

App.history = {
  undo: [],
  redo: [],
  lock: false,
  last: null,
  max: 50,
  debounceMs: 150,
  _timer: null
};

App.resetListenerController = function(key){
  try{
    const prev = App._controllers[key];
    if(prev && typeof prev.abort === 'function') prev.abort();
  }catch(_e){}
  if(typeof AbortController !== 'function'){
    const dummy = { signal: null, abort: ()=>{} };
    App._controllers[key] = dummy;
    return dummy;
  }
  const controller = new AbortController();
  App._controllers[key] = controller;
  return controller;
};

App.listenerOptions = function(capture, controller){
  if(controller && controller.signal) return { capture: !!capture, signal: controller.signal };
  return !!capture;
};

