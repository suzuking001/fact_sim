// Register node types to LiteGraph

function afterRegister(){
  LiteGraph.registerNodeType('factory/source', SourceNode);
  LiteGraph.registerNodeType('factory/equip',  EquipmentNode);
  LiteGraph.registerNodeType('factory/signal', SignalNode);
  LiteGraph.registerNodeType('factory/shuttle_stage', ShuttleStageNode);
  LiteGraph.registerNodeType('factory/split',  SplitNode);
  LiteGraph.registerNodeType('factory/branch', BranchNode);
  LiteGraph.registerNodeType('factory/agvroute', AGVRouteNode);
  LiteGraph.registerNodeType('factory/sink',   SinkNode);
  LiteGraph.registerNodeType('factory/merge',  MergeNode);
  LiteGraph.registerNodeType('factory/merge2', MergeNode);
  LiteGraph.registerNodeType('factory/join',   JoinNode);
}

afterRegister();

