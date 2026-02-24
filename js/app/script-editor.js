// Script/Text editor modal
const scriptEditorTextarea = document.getElementById('scriptEditorTextarea');
const scriptEditorSave = document.getElementById('scriptEditorSave');
const scriptEditorCancel = document.getElementById('scriptEditorCancel');
const scriptEditorModal = document.getElementById('scriptEditorModal');

window.openPropertyEditor = function(node, propKey){
  if(!node || !scriptEditorTextarea || !scriptEditorModal) return false;
  const key = String(propKey || 'script');
  const value = (node.properties && Object.prototype.hasOwnProperty.call(node.properties, key))
    ? node.properties[key]
    : '';
  window.editingNode = node;
  window.editingPropertyKey = key;
  scriptEditorTextarea.value = (value === null || typeof value === 'undefined') ? '' : String(value);
  scriptEditorModal.style.display = 'block';
  return true;
};

if(scriptEditorSave){
  scriptEditorSave.onclick = ()=>{
    const n = window.editingNode;
    if(n){
      const key = String(window.editingPropertyKey || 'script');
      const graph = (window.App && window.App.graph) ? window.App.graph : (n.graph || null);
      try{
        if(graph && typeof graph.beforeChange === 'function'){
          try{ graph.beforeChange(); }catch(_e){}
        }
        n.properties = n.properties || {};
        n.properties[key] = scriptEditorTextarea.value;
        if(key === 'script') n._compiled = null;
        if(typeof n.onPropertyChanged === 'function') n.onPropertyChanged(key);
        n.setDirtyCanvas(true,true);
      }finally{
        if(graph && typeof graph.afterChange === 'function'){
          try{ graph.afterChange(); }catch(_e){}
        }
      }
    }
    if(scriptEditorModal) scriptEditorModal.style.display = 'none';
    window.editingNode = null;
    window.editingPropertyKey = null;
  };
}

if(scriptEditorCancel){
  scriptEditorCancel.onclick = ()=>{
    if(scriptEditorModal) scriptEditorModal.style.display = 'none';
    window.editingNode = null;
    window.editingPropertyKey = null;
  };
}
