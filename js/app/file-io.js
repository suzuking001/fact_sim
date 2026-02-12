// Save / Load handlers

const btnSave = document.getElementById('btnSave');
if(btnSave){
  btnSave.onclick = ()=>{
    const blob = new Blob([JSON.stringify(graph.serialize(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'graph.json'; a.click();
    URL.revokeObjectURL(url);
  };
}

const btnLoad = document.getElementById('btnLoad');
if(btnLoad){
  btnLoad.onclick = ()=> document.getElementById('fileInput').click();
}

const fileInput = document.getElementById('fileInput');
if(fileInput){
  fileInput.addEventListener('change', e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => {
      try{
        history.lock = true;
        graph.clear();
        graph.configure(JSON.parse(r.result));
        history.lock = false;
        configureGraphClock(graph);
        resetHistory();
        attachTimeline();
      }catch(err){
        history.lock = false;
        alert('JSON読込失敗');
        console.error(err);
      }
    };
    r.readAsText(f);
  });
}
