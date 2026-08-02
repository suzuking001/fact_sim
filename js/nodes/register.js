// Register node types to LiteGraph

function afterRegister(){
  LiteGraph.registerNodeType('factory/source', SourceNode);
  LiteGraph.registerNodeType('factory/entitysource', EntitySourceNode);
  LiteGraph.registerNodeType('factory/note',   NoteNode);
  LiteGraph.registerNodeType('factory/equip',  EquipmentNode);
  LiteGraph.registerNodeType('factory/signal', SignalNode);
  LiteGraph.registerNodeType('factory/shuttle_stage', ShuttleStageNode);
  LiteGraph.registerNodeType('factory/split',  SplitNode);
  LiteGraph.registerNodeType('factory/branch', BranchNode);
  LiteGraph.registerNodeType('factory/agvroute', AGVRouteNode);
  LiteGraph.registerNodeType('factory/carrierconfig', CarrierConfigNode);
  LiteGraph.registerNodeType('factory/carrierhome', CarrierConfigNode);
  LiteGraph.registerNodeType('factory/palletcarrierconfig', PalletCarrierConfigNode);
  LiteGraph.registerNodeType('factory/palletcarrier', PalletCarrierConfigNode);
  LiteGraph.registerNodeType('factory/carrierroute', CarrierRouteNode);
  LiteGraph.registerNodeType('factory/station', StationNode);
  LiteGraph.registerNodeType('factory/transferstation', TransferStationNode);
  LiteGraph.registerNodeType('factory/sink',   SinkNode);
  LiteGraph.registerNodeType('factory/merge',  MergeNode);
  LiteGraph.registerNodeType('factory/merge2', MergeNode);
  LiteGraph.registerNodeType('factory/join',   JoinNode);
}

afterRegister();

