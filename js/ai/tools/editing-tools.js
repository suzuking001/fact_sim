(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  const copy=value=>JSON.parse(JSON.stringify(value));
  const api=()=>AI.FactSimTools;
  const id={type:'string',minLength:1,maxLength:200};
  function stopped(){if(!App.graph || !App.history || typeof root.applySnapshot!=='function')throw new Error('Editable graph/history is unavailable.');if(root.isSimRunning?.() || App.graph.status===root.LGraph?.STATUS_RUNNING)throw new Error('Stop simulation before editing.');}
  async function atomic(action,{reset=true}={}){
    stopped();root.pushHistory?.();root.flushHistory?.();
    const graph=App.graph,snapshot=copy(graph.serialize());App.injectEntityModel?.(snapshot,graph);App.stopGroups?.injectSerializedData?.(snapshot,graph);
    const locked=App.history.lock;App.history.lock=true;
    try{if(reset)App.resetSimulationForFlowEdit?.(graph);graph.beforeChange?.();const result=await action(graph);graph.change?.();return {success:true,...result,nodeCount:graph._nodes.length,edgeCount:Object.keys(graph.links).length,simulationReset:reset};}
    catch(error){root.applySnapshot(JSON.stringify(snapshot));App.history.lock=true;throw new Error(`Edit failed; original graph restored. ${error.message}`);}
    finally{try{graph.afterChange?.();}finally{App.history.lock=locked;root.pushHistory?.();root.flushHistory?.();App.canvas?.setDirty?.(true,true);}}
  }
  function parameterPlan(input){
    stopped();const seen=new Set();
    return input.changes.map(change=>{
      AI.validateToolInput({type:'object',properties:{nodeId:id,parameter:id,value:{}},required:['nodeId','parameter','value'],additionalProperties:false},change);
      const target=api().validateParameterInput(change),node=api().findNode(change.nodeId),signature=`${node.id}:${target.key}`;
      if(seen.has(signature))throw new Error('Duplicate parameter target in one batch.');seen.add(signature);
      return {...change,nodeId:String(node.id)};
    });
  }
  function matchingLink(input){
    stopped();const from=api().findNode(input.fromNodeId),to=api().findNode(input.toNodeId);
    for(const port of [input.fromPort,input.toPort])if(port!=null && !Number.isInteger(port))throw new Error('Port indices must be integers.');
    const links=Object.values(App.graph.links).filter(link=>link.origin_id===from.id && link.target_id===to.id && (input.fromPort==null || link.origin_slot===input.fromPort) && (input.toPort==null || link.target_slot===input.toPort));
    if(links.length!==1)throw new Error(links.length ? 'Multiple links match; specify both port indices.' : 'No matching connection exists.');return links[0];
  }
  function removal(input){
    stopped();const node=api().findNode(input.nodeId),links=Object.values(App.graph.links),incoming=links.filter(link=>link.target_id===node.id),outgoing=links.filter(link=>link.origin_id===node.id);
    if(input.reconnect){
      // Basic-node buffers have role=equipment, not a persistent buffer kind.
      // Explicit deletion + reconnect, and mandatory confirmation, are required.
      if(node.properties?.role!=='equipment' || incoming.length!==1 || outgoing.length!==1)throw new Error('Bypass removal requires an intermediate node with exactly one incoming and one outgoing link (not Source/Sink).');
      const a=incoming[0],b=outgoing[0],from=App.graph.getNodeById(a.origin_id),to=App.graph.getNodeById(b.target_id);
      if(from===to || !root.LiteGraph.isValidConnection(from.outputs[a.origin_slot].type,to.inputs[b.target_slot].type))throw new Error('Bypass ports are incompatible or would form a self-link.');
      if((from.outputs[a.origin_slot].links || []).some(linkId=>linkId!==a.id))throw new Error('Bypass output has other connections.');
    }else if((incoming.length || outgoing.length) && !input.disconnectAttached)throw new Error('Connected node deletion requires reconnect=true or explicit disconnectAttached=true.');
    return {node,incoming,outgoing};
  }
  function duplicatePlan(input){
    stopped();const node=api().findNode(input.nodeId),name=input.name.trim();
    if(!name || App.graph._nodes.some(item=>String(item.title).trim().toLowerCase()===name.toLowerCase()))throw new Error('Use a nonempty unique copy name.');
    const data=copy(node.serialize());delete data.id;data.title=name;data.pos=[input.x ?? node.pos[0]+(node.size?.[0] || 230)+80,input.y ?? node.pos[1]];
    for(const port of data.inputs || []){port.link=null;delete port._data;}
    for(const port of data.outputs || []){port.links=null;delete port._data;}
    if(data.properties?.flow){delete data.properties.flow.__signalCache;delete data.properties.flow.__feedbackCache;}
    return {node,data};
  }
  function movement(input){
    stopped();const nodes=input.nodeIds.map(reference=>api().findNode(reference));if(new Set(nodes.map(node=>node.id)).size!==nodes.length)throw new Error('Duplicate node IDs.');
    const positions=nodes.map(node=>({node,x:node.pos[0]+input.dx,y:node.pos[1]+input.dy}));
    if(positions.some(p=>!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x)>100000 || Math.abs(p.y)>100000))throw new Error('Resulting coordinates must be within ±100000.');return positions;
  }
  AI.registerEditingTools=function(registry){
    registry.register({name:'batch_set_node_parameters',mode:AI.ToolModes.WRITE,risk:'medium',description:'Atomically applies explicit parameter values to up to 100 targets. Inspect nodes first, calculate relative values yourself. All targets validated before confirmation; failure rolls back whole batch. One undo restores the batch.',inputSchema:{type:'object',properties:{changes:{type:'array',minItems:1,maxItems:100,items:{type:'object',properties:{nodeId:id,parameter:id,value:{}},required:['nodeId','parameter','value'],additionalProperties:false}}},required:['changes'],additionalProperties:false},preflight:parameterPlan,execute:input=>{const changes=parameterPlan(input);return atomic(async()=>{const results=[];for(const change of changes)results.push(await api().setNodeParameter(change));return {changes:results};},{reset:changes.some(change=>!['title','description'].includes(change.parameter))});}});
    registry.register({name:'disconnect_nodes',mode:AI.ToolModes.DESTRUCTIVE,risk:'medium',description:'Removes exactly one existing directed edge, not nodes. Always asks confirmation. Inspect connections first; ports disambiguate multiple edges.',inputSchema:{type:'object',properties:{fromNodeId:id,toNodeId:id,fromPort:{type:'number',minimum:0,maximum:511},toPort:{type:'number',minimum:0,maximum:511}},required:['fromNodeId','toNodeId'],additionalProperties:false},preflight:matchingLink,execute:input=>{const link=matchingLink(input);return atomic(graph=>{graph.removeLink(link.id);if(graph.links[link.id])throw new Error('Link removal failed.');return {removedLink:copy(link)};});}});
    registry.register({name:'remove_node',mode:AI.ToolModes.DESTRUCTIVE,risk:'high',description:'Deletes one node, always confirms. Default refuses connected nodes. reconnect=true bypasses a single-in/single-out buffer atomically. disconnectAttached=true explicitly deletes attached edges. Never use for a vague tidy request.',inputSchema:{type:'object',properties:{nodeId:id,reconnect:{type:'boolean'},disconnectAttached:{type:'boolean'}},required:['nodeId'],additionalProperties:false},preflight:removal,execute:input=>{const {node,incoming,outgoing}=removal(input);return atomic(graph=>{graph.remove(node);let link;if(input.reconnect){const a=incoming[0],b=outgoing[0];link=graph.getNodeById(a.origin_id).connect(a.origin_slot,graph.getNodeById(b.target_id),b.target_slot);if(!link)throw new Error('Bypass reconnection failed.');}return {removedNodeId:node.id,removedLinkIds:[...incoming,...outgoing].map(item=>item.id),newLinkId:link?.id};});}});
    registry.register({name:'duplicate_node',mode:AI.ToolModes.WRITE,risk:'medium',description:'Copies one inspected node including custom settings/Flow/ports, with a unique name and optional graph position. Does NOT copy connections or runtime results; does not create parallel routing automatically.',inputSchema:{type:'object',properties:{nodeId:id,name:id,x:{type:'number',minimum:-100000,maximum:100000},y:{type:'number',minimum:-100000,maximum:100000}},required:['nodeId','name'],additionalProperties:false},preflight:duplicatePlan,execute:input=>{const {node,data}=duplicatePlan(input);return atomic(graph=>{const created=root.LiteGraph.createNode(node.type);if(!created)throw new Error('Node type cannot be copied.');created.configure(data);graph.add(created);return {nodeId:created.id,copiedFromNodeId:node.id,node:api().nodeView(created)};});}});
    registry.register({name:'move_nodes',mode:AI.ToolModes.WRITE,risk:'medium',description:'Translates explicitly listed nodes by graph dx/dy together, preserving relative layout, links, parameters and viewport. Not auto-layout; can still overlap other nodes. Inspect geometry first and recheck.',inputSchema:{type:'object',properties:{nodeIds:{type:'array',items:id,minItems:1,maxItems:100},dx:{type:'number',minimum:-100000,maximum:100000},dy:{type:'number',minimum:-100000,maximum:100000}},required:['nodeIds','dx','dy'],additionalProperties:false},preflight:movement,execute:input=>{const positions=movement(input);return atomic(()=>({positions:positions.map(({node,x,y})=>{const previousPosition={x:node.pos[0],y:node.pos[1]};node.pos[0]=x;node.pos[1]=y;return {nodeId:node.id,previousPosition,position:{x,y}};})}),{reset:false});}});
  };
})(typeof window==='undefined' ? globalThis : window);
