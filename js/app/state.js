// Shared app state and small UI helpers

let graph, canvas;
let timelineChart = null;

let toastTimer = null;
function showToast(msg){
  const toast = document.getElementById('toast');
  if(!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toast.classList.remove('show'), 1000);
}

const history = {
  undo: [],
  redo: [],
  lock: false,
  last: null,
  max: 50
};

function resetListenerController(key){
  try{
    const prev = window[key];
    if(prev && typeof prev.abort === 'function') prev.abort();
  }catch(_e){}
  if(typeof AbortController !== 'function'){
    const dummy = { signal: null, abort: ()=>{} };
    window[key] = dummy;
    return dummy;
  }
  const controller = new AbortController();
  window[key] = controller;
  return controller;
}

function listenerOptions(capture, controller){
  if(controller && controller.signal) return { capture: !!capture, signal: controller.signal };
  return !!capture;
}

window.resetListenerController = resetListenerController;
window.listenerOptions = listenerOptions;
