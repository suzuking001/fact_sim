// App bootstrap
var App = window.App || (window.App = {});

App.init = async function(){
  initTimeline();
  initGraph();

  let loadedFromShare = false;
  if(typeof App.loadSharedGraphFromUrl === 'function'){
    try{
      loadedFromShare = await App.loadSharedGraphFromUrl();
    }catch(err){
      console.error(err);
      const msg = (err && err.message) ? err.message : 'Failed to load shared link';
      alert(msg);
    }
  }

  if(!loadedFromShare && typeof initExamples === 'function') initExamples();
};

App.init();
