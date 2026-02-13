// App bootstrap
var App = window.App || (window.App = {});
App.init = function(){
  initTimeline();
  initGraph();
  if(typeof initExamples === 'function') initExamples();
};
App.init();
