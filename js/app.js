// App bootstrap
(function(){
  initTimeline();
  initGraph();
  if(typeof initExamples === 'function') initExamples();
})();
