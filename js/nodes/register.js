// Register node types to LiteGraph

function afterRegister(){
  LiteGraph.registerNodeType('factory/basic', BasicNode);
  if(typeof NoteNode === 'function') LiteGraph.registerNodeType('factory/note', NoteNode);
  if(typeof SignalNode === 'function') LiteGraph.registerNodeType('factory/signal', SignalNode);
}

afterRegister();

