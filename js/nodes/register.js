// Register node types to LiteGraph

function afterRegister(){
  LiteGraph.registerNodeType('factory/basic', BasicNode);
}

afterRegister();

