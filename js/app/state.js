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
