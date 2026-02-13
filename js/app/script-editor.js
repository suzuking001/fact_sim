// Script editor UI
const scriptEditorTextarea = document.getElementById('scriptEditorTextarea');
const scriptEditorSave = document.getElementById('scriptEditorSave');
const scriptEditorCancel = document.getElementById('scriptEditorCancel');

if(scriptEditorSave){
  scriptEditorSave.onclick = ()=>{
    const n = window.editingNode;
    if(n){
      n.properties.script = scriptEditorTextarea.value;
      n._compiled = null;
      n.setDirtyCanvas(true,true);
    }
    document.getElementById('scriptEditorModal').style.display = 'none';
    window.editingNode = null;
  };
}

if(scriptEditorCancel){
  scriptEditorCancel.onclick = ()=>{
    document.getElementById('scriptEditorModal').style.display = 'none';
    window.editingNode = null;
  };
}

