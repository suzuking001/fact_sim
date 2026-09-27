(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const nodes=()=>Array.isArray(App.graph?._nodes) ? App.graph._nodes.filter(Boolean) : [];
  function graphRequired(){if(!App.graph)throw new Error('No FactSim model is loaded.');return App.graph;}
  function findNode(reference){
    const graph=graphRequired(),raw=String(reference ?? '').trim();if(!raw)throw new Error('nodeId is required.');
    let found=graph.getNodeById?.(reference) || graph.getNodeById?.(Number(raw));if(found)return found;
    const exact=nodes().filter(node=>String(node.title || '').trim().toLowerCase()===raw.toLowerCase());
    if(exact.length===1)return exact[0];if(exact.length>1)throw new Error(`Node title is ambiguous: ${raw}. Use a numeric node ID.`);
    throw new Error(`Node does not exist: ${raw}.`);
  }
  function connections(node){
    const inputs=[],outputs=[];
    for(const [slot,port] of (node.inputs || []).entries()){
      if(port.link==null)continue;const link=App.graph.links?.[port.link],other=link && App.graph.getNodeById?.(link.origin_id);if(other)inputs.push({linkId:link.id,nodeId:other.id,name:other.title || '',fromPortIndex:link.origin_slot,toPortIndex:link.target_slot,fromPort:other.outputs?.[link.origin_slot]?.name || '',toPort:port.name || `in${slot}`});
    }
    for(const [slot,port] of (node.outputs || []).entries())for(const linkId of port.links || []){
      const link=App.graph.links?.[linkId],other=link && App.graph.getNodeById?.(link.target_id);if(other)outputs.push({linkId:link.id,nodeId:other.id,name:other.title || '',fromPortIndex:link.origin_slot,toPortIndex:link.target_slot,fromPort:port.name || `out${slot}`,toPort:other.inputs?.[link.target_slot]?.name || ''});
    }
    return {inputs,outputs};
  }
  function editableParameters(node){
    const result={title:{type:'string',value:String(node.title || '')}};
    if(Object.prototype.hasOwnProperty.call(node.properties || {},'description'))result.description={type:'string',value:String(node.properties.description || '')};
    if(node.type==='factory/basic'){
      const flowNodes=node.properties?.flow?.nodes || [],processes=flowNodes.filter(item=>item.kind==='process');
      for(const item of flowNodes.filter(item=>item.kind==='process' || item.kind==='recovery'))result[`${item.id}.seconds`]={type:'number',minimum:item.kind==='process' ? 0.001 : 0,value:Number(item.config?.seconds) || 0,kind:item.kind};
      if(processes.length===1)result.cycleTime={type:'number',minimum:0.001,value:Number(processes[0].config?.seconds) || 0,aliasFor:`${processes[0].id}.seconds`};
      if(node.properties.role==='source')result['source.intervalSec']={type:'number',minimum:0,value:Number(node.properties.source?.intervalSec) || 0};
    }
    return result;
  }
  function nodeView(node){
    const runtime={state:node._state || node._stateName || null,sent:Number(node._sent) || 0};
    if(Array.isArray(node._recv))runtime.completed=node._recv.length;
    const ports={inputs:(node.inputs || []).map((port,index)=>({index,name:port.name,type:port.type,connected:port.link!=null})),outputs:(node.outputs || []).map((port,index)=>({index,name:port.name,type:port.type,connected:!!port.links?.length}))};
    return {id:node.id,type:String(node.type || ''),name:String(node.title || ''),role:String(node.properties?.role || ''),position:{x:Number(node.pos?.[0]) || 0,y:Number(node.pos?.[1]) || 0},size:{width:Number(node.size?.[0]) || 0,height:Number(node.size?.[1]) || 0},editableParameters:editableParameters(node),ports,connections:connections(node),runtime};
  }
  function selectedNodeId(){const selected=App.canvas?.selected_nodes || {};const ids=Object.keys(selected);return ids.length===1 ? selected[ids[0]]?.id ?? ids[0] : null;}
  function modelSummary(){
    const all=nodes(),roleCounts={},typeCounts={};for(const node of all){const role=String(node.properties?.role || 'other'),type=String(node.type || 'unknown');roleCounts[role]=(roleCounts[role] || 0)+1;typeCounts[type]=(typeCounts[type] || 0)+1;}
    return {application:'FactSim',nodeCount:all.length,edgeCount:Object.keys(App.graph?.links || {}).length,selectedNodeId:selectedNodeId(),hasSimulationResult:all.some(node=>Array.isArray(node._recv) && node._recv.length>0),simulation:{running:!!root.isSimRunning?.(),timeSeconds:(Number(root.simNow?.()) || 0)/1000,mode:App.getSimMode?.() || App.simMode || null},roleCounts,typeCounts,availableNodeKinds:(App.NODE_CREATION_CATALOG || []).map(item=>({kind:item.kind,label:item.label})),nodes:all.slice(0,100).map(node=>({id:node.id,name:String(node.title || ''),type:String(node.type || ''),role:String(node.properties?.role || '')})),truncated:all.length>100};
  }
  function prepareGraphEdit(){
    const graph=graphRequired();
    if(root.isSimRunning?.())throw new Error('Stop the simulation before editing graph topology.');
    App.resetSimulationForFlowEdit?.(graph);
    root.pushHistory?.();root.flushHistory?.();return graph;
  }
  function addNode(input){
    graphRequired();if(!App.getNodeCreationItem?.(input.kind))throw new Error(`Unknown node kind: ${input.kind}. Inspect get_model_summary for availableNodeKinds.`);
    const name=String(input.name || '').trim();if(!name || name.length>200)throw new Error('Node name must contain 1 to 200 characters.');
    if(nodes().some(node=>String(node.title || '').toLowerCase()===name.toLowerCase()))throw new Error(`A node named ${name} already exists. Use a unique name.`);
    if(root.isSimRunning?.())throw new Error('Stop the simulation before adding a node.');
    const node=App.createNodeFromCatalog(input.kind);if(!node)throw new Error('Could not create the requested node.');
    node.title=name;
    const right=nodes().reduce((max,item)=>Math.max(max,Number(item.pos?.[0] || 0)+Number(item.size?.[0] || 230)),30);
    node.pos=[input.x ?? right+80,input.y ?? 180];
    const graph=prepareGraphEdit();graph.beforeChange?.();
    try{graph.add(node);graph.change?.();}finally{graph.afterChange?.();root.flushHistory?.();App.canvas?.setDirty?.(true,true);}
    return {success:true,nodeId:node.id,node:nodeView(node),simulationReset:true};
  }
  function connectNodes(input){
    const from=findNode(input.fromNodeId),to=findNode(input.toNodeId);
    if(from===to)throw new Error('Cannot connect a node to itself.');
    const out=input.fromPort ?? 0,into=input.toPort ?? 0;
    if(!Number.isInteger(out) || !Number.isInteger(into))throw new Error('Port indices must be integers.');
    const output=from.outputs?.[out],target=to.inputs?.[into];if(!output || !target)throw new Error('The requested output or input port does not exist. Inspect get_node ports.');
    if(output.links?.some(id=>{const link=App.graph.links[id];return link?.target_id===to.id && link.target_slot===into;}))throw new Error('This connection already exists.');
    if(output.links?.length || target.link!=null)throw new Error('A selected port is occupied. Existing connections will not be replaced.');
    if(output.type!==target.type && !root.LiteGraph.isValidConnection?.(output.type,target.type))throw new Error('The selected port types are incompatible.');
    const graph=prepareGraphEdit();graph.beforeChange?.();let link;
    try{link=from.connect(out,to,into);if(!link)throw new Error('FactSim rejected the connection.');graph.change?.();}finally{graph.afterChange?.();root.flushHistory?.();App.canvas?.setDirty?.(true,true);}
    return {success:true,linkId:link.id,fromNodeId:from.id,fromPort:out,toNodeId:to.id,toPort:into,simulationReset:true};
  }
  function insertNodeOnLink(input){
    const from=findNode(input.fromNodeId),to=findNode(input.toNodeId),graph=graphRequired();
    if(root.isSimRunning?.())throw new Error('Stop the simulation before inserting a node.');
    for(const port of [input.fromPort,input.toPort])if(port!=null && !Number.isInteger(port))throw new Error('Port indices must be integers.');
    const matches=Object.values(graph.links || {}).filter(link=>link && link.origin_id===from.id && link.target_id===to.id && (input.fromPort==null || link.origin_slot===input.fromPort) && (input.toPort==null || link.target_slot===input.toPort));
    if(!matches.length)throw new Error('No existing connection between these nodes. Inspect get_node connections.');
    if(matches.length!==1)throw new Error('Multiple connections match. Specify fromPort and toPort using get_node port indices.');
    if(!App.getNodeCreationItem?.(input.kind))throw new Error(`Unknown node kind: ${input.kind}.`);
    const name=String(input.name || '').trim();if(!name || nodes().some(node=>String(node.title || '').trim().toLowerCase()===name.toLowerCase()))throw new Error('Use a nonempty, unique node name.');
    const node=App.createNodeFromCatalog(input.kind),link=matches[0];
    if(!node?.inputs?.[0] || !node?.outputs?.[0])throw new Error('Inserted node must have an input and output port.');
    const compatible=(a,b)=>a===b || !!root.LiteGraph.isValidConnection?.(a,b);
    if(!compatible(from.outputs[link.origin_slot].type,node.inputs[0].type) || !compatible(node.outputs[0].type,to.inputs[link.target_slot].type))throw new Error('Inserted node port types are incompatible with this connection.');
    if(typeof root.applySnapshot!=='function')throw new Error('Graph rollback support is unavailable.');
    node.title=name;node.pos=[input.x ?? (from.pos[0]+to.pos[0])/2,input.y ?? (from.pos[1]+to.pos[1])/2];
    prepareGraphEdit();const snapshot=clone(graph.serialize());
    App.injectEntityModel?.(snapshot,graph);App.stopGroups?.injectSerializedData?.(snapshot,graph);
    const locked=App.history.lock;App.history.lock=true;let first,second;
    try{
      graph.beforeChange?.();graph.add(node);graph.removeLink(link.id);
      first=from.connect(link.origin_slot,node,0);second=node.connect(0,to,link.target_slot);
      if(!first || !second || graph.links[link.id] || to.inputs[link.target_slot].link!==second.id)throw new Error('FactSim rejected the replacement connections.');
      graph.change?.();
    }catch(error){root.applySnapshot(JSON.stringify(snapshot));App.history.lock=true;throw new Error(`Insertion failed; original graph restored. ${error.message}`);}
    finally{try{graph.afterChange?.();}finally{App.history.lock=locked;root.pushHistory?.();root.flushHistory?.();App.canvas?.setDirty?.(true,true);}}
    return {success:true,nodeId:node.id,node:nodeView(node),removedLinkId:link.id,links:[{linkId:first.id,fromNodeId:from.id,toNodeId:node.id,fromPort:link.origin_slot,toPort:0},{linkId:second.id,fromNodeId:node.id,toNodeId:to.id,fromPort:0,toPort:link.target_slot}],simulationReset:true};
  }
  function requireLayoutEdit(){
    const graph=graphRequired();
    if(root.isSimRunning?.())throw new Error('Stop the simulation before editing node layout.');
    root.pushHistory?.();root.flushHistory?.();return graph;
  }
  function moveNode(input){
    const node=findNode(input.nodeId),previousPosition={x:node.pos[0],y:node.pos[1]};
    if(input.avoidOverlap){
      const proposed=nodeBounds(node),gap=input.minimumGap ?? 20;
      proposed.x+=input.x-node.pos[0];proposed.y+=input.y-node.pos[1];
      const blocked=nodes().filter(other=>other!==node && boxesOverlap(proposed,nodeBounds(other),gap));
      if(blocked.length)throw new Error(`Proposed position overlaps or is too close to nodes ${blocked.map(other=>other.id).join(', ')}. Inspect get_layout_snapshot and choose another position.`);
    }
    const graph=requireLayoutEdit();
    graph.beforeChange?.();
    try{node.pos[0]=input.x;node.pos[1]=input.y;graph.change?.();}
    finally{graph.afterChange?.();root.pushHistory?.();root.flushHistory?.();App.canvas?.setDirty?.(true,true);}
    if(input.fit===true)root.fitToScreen?.({silent:true});
    return {success:true,nodeId:node.id,previousPosition,position:{x:node.pos[0],y:node.pos[1]},simulationReset:false};
  }
  function nodeBounds(node){
    const box=new Float32Array(4);
    if(typeof node.getBounding==='function')node.getBounding(box);
    else box.set([node.pos[0],node.pos[1],node.size?.[0] || 230,node.size?.[1] || 110]);
    return {x:box[0],y:box[1],width:box[2],height:box[3]};
  }
  function boxesOverlap(a,b,gap=0){return a.x<b.x+b.width+gap && b.x<a.x+a.width+gap && a.y<b.y+b.height+gap && b.y<a.y+a.height+gap;}
  function layoutSnapshot(input,context={}){
    graphRequired();const canvas=App.canvas?.canvas,ds=App.canvas?.ds;
    if(!canvas || !ds || App.canvas.graph!==App.graph)throw new Error('Open the main FactSim node graph to inspect its screen.');
    const scale=Number(ds.scale) || 1,offset={x:Number(ds.offset?.[0]) || 0,y:Number(ds.offset?.[1]) || 0};
    const viewport={pixelWidth:canvas.width,pixelHeight:canvas.height,scale,offset,graphBounds:{x:-offset.x,y:-offset.y,width:canvas.width/scale,height:canvas.height/scale}};
    const observed=nodes().map(node=>{
      const bounds=nodeBounds(node),visible=boxesOverlap(bounds,viewport.graphBounds);
      return {id:node.id,name:String(node.title || ''),position:{x:node.pos[0],y:node.pos[1]},bounds,screenBounds:{x:(bounds.x+offset.x)*scale,y:(bounds.y+offset.y)*scale,width:bounds.width*scale,height:bounds.height*scale},visible,selected:!!App.canvas.selected_nodes?.[node.id],connections:connections(node)};
    }).filter(node=>input.scope==='all' || node.visible);
    const overlaps=[];let count=0;
    for(let i=0;i<observed.length;i++)for(let j=i+1;j<observed.length;j++)if(boxesOverlap(observed[i].bounds,observed[j].bounds)){
      count++;if(overlaps.length<200)overlaps.push({nodeIds:[observed[i].id,observed[j].id]});
    }
    const limit=Math.floor(input.maxNodes ?? 120),result={success:true,source:'Current FactSim canvas and bounding boxes (including titles)',scope:input.scope || 'visible',viewport,nodeCount:observed.length,nodes:observed.slice(0,limit),nodesTruncated:observed.length>limit,overlapPairCount:count,overlaps,overlapsTruncated:count>overlaps.length,imageStatus:{attached:false,reason:context.supportsVision ? 'Image not requested.' : 'Selected model has no image input; geometry only.'}};
    if(context.supportsVision && input.includeImage!==false){
      try{
        App.canvas.draw?.(true,true);
        const capture=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(canvas.width,canvas.height));
        capture.width=Math.max(1,Math.round(canvas.width*ratio));capture.height=Math.max(1,Math.round(canvas.height*ratio));
        const drawing=capture.getContext('2d');drawing.drawImage(canvas,0,0,capture.width,capture.height);
        drawing.font='bold 12px sans-serif';const labels=[];
        for(const node of observed.filter(node=>node.visible)){
          const label=`ID ${node.id}`,x=Math.max(0,node.screenBounds.x*ratio),baseY=Math.max(14,node.screenBounds.y*ratio),width=drawing.measureText(label).width+8;let y=baseY;
          for(let step=0;step<=labels.length;step++){
            const choices=[baseY-step*18,baseY+step*18];const free=choices.find(candidate=>candidate>=14 && candidate<capture.height && !labels.some(box=>boxesOverlap({x,y:candidate-14,width,height:16},box)));
            if(free!=null){y=free;break;}
          }
          labels.push({x,y:y-14,width,height:16});
          drawing.fillStyle='#fff3a6';drawing.fillRect(x,y-14,width,16);drawing.fillStyle='#151515';drawing.fillText(label,x+4,y-2);
        }
        const data=capture.toDataURL('image/png').split(',')[1];
        result.image={mimeType:'image/png',data};result.imageStatus={attached:true,width:capture.width,height:capture.height,source:'Current graph canvas with node ID labels (not the entire browser window)',graphToImageScale:scale*ratio};
      }catch(error){result.imageStatus={attached:false,reason:`Canvas image unavailable: ${error.message}. Use the reported geometry; do not claim to have seen an image.`};}
    }
    return result;
  }
  function overlapCount(all){
    const boxes=all.map(node=>{
      const box=new Float32Array(4);
      if(typeof node.getBounding==='function')node.getBounding(box);
      else box.set([node.pos[0],node.pos[1],node.size?.[0] || 230,node.size?.[1] || 110]);
      return box;
    });
    let count=0;
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];if(a[0]<b[0]+b[2] && b[0]<a[0]+a[2] && a[1]<b[1]+b[3] && b[1]<a[1]+a[3])count++;
    }
    return count;
  }
  function autoLayout(input){
    const all=nodes();if(!all.length)throw new Error('No nodes to arrange.');
    if(typeof root.autoLayoutGraph!=='function')throw new Error('FactSim auto layout is unavailable.');
    const positions=all.map(node=>[...node.pos]),groups=(App.graph._groups || []).map(group=>({group,bounding:[...group._bounding]}));
    const before=overlapCount(all),mode=input.mode || 'flow-group';requireLayoutEdit();const locked=App.history.lock;App.history.lock=true;
    try{if(!root.autoLayoutGraph({mode,spacing:input.spacing ?? 120,fit:input.fit!==false}))throw new Error('FactSim could not arrange the nodes.');}
    catch(error){all.forEach((node,index)=>{node.pos[0]=positions[index][0];node.pos[1]=positions[index][1];});for(const item of groups)item.group._bounding=item.bounding;throw error;}
    finally{App.history.lock=locked;root.pushHistory?.();root.flushHistory?.();App.canvas?.setDirty?.(true,true);}
    return {success:true,mode,nodeCount:all.length,movedCount:all.filter((node,index)=>node.pos[0]!==positions[index][0] || node.pos[1]!==positions[index][1]).length,overlapPairsBefore:before,overlapPairsAfter:overlapCount(all),simulationReset:false};
  }
  function normalizeParameter(node,parameter){
    const raw=String(parameter || '').trim(),key=raw.replace(/^flow\./,'');
    if(['cycleTime','cycle_time','processTime','process_time'].includes(key)){
      const processes=(node.properties?.flow?.nodes || []).filter(item=>item.kind==='process');
      if(processes.length!==1)throw new Error(`cycleTime is ambiguous for this node. Use one of: ${processes.map(item=>`${item.id}.seconds`).join(', ') || '(no process parameters)'}.`);
      return {kind:'flowSeconds',key:`${processes[0].id}.seconds`,itemId:processes[0].id,minimum:0.001};
    }
    if(key==='source.intervalSec')return {kind:'sourceInterval',key,minimum:0};
    const match=key.match(/^([A-Za-z][\w-]*)\.seconds$/);
    if(match){const item=(node.properties?.flow?.nodes || []).find(candidate=>candidate.id===match[1] && ['process','recovery'].includes(candidate.kind));if(!item)throw new Error(`Editable Flow parameter does not exist: ${key}.`);return {kind:'flowSeconds',key,itemId:item.id,minimum:item.kind==='process' ? 0.001 : 0};}
    if(key==='title' || key==='description')return {kind:key,key};
    throw new Error(`Parameter is not editable: ${raw}. Available parameters: ${Object.keys(editableParameters(node)).join(', ')}.`);
  }
  function ensureNumber(value,minimum){const number=Number(value);if(!Number.isFinite(number))throw new Error('Value must be a finite number.');if(number<minimum)throw new Error(`Value must be at least ${minimum}.`);return number;}
  async function setNodeParameter(input){
    const node=findNode(input.nodeId),target=normalizeParameter(node,input.parameter);let previousValue,newValue;
    if(target.kind==='title' || target.kind==='description'){
      newValue=String(input.value ?? '').trim();if(!newValue)throw new Error(`${target.key} cannot be empty.`);if(newValue.length>200)throw new Error(`${target.key} must be 200 characters or fewer.`);
      previousValue=target.kind==='title' ? String(node.title || '') : String(node.properties?.description || '');
      App.graph.beforeChange?.();try{if(target.kind==='title')node.title=newValue;else{node.properties ||= {};node.properties.description=newValue;}node.setDirtyCanvas?.(true,true);App.graph.change?.();}finally{App.graph.afterChange?.();root.flushHistory?.();}
    }else if(target.kind==='sourceInterval'){
      if(node.properties?.role!=='source')throw new Error('source.intervalSec is only editable on a source node.');newValue=ensureNumber(input.value,target.minimum);previousValue=Number(node.properties.source?.intervalSec) || 0;
      App.graph.beforeChange?.();try{node.properties.source ||= {entries:[],intervalSec:0,repeat:true};node.properties.source.intervalSec=newValue;node.onPropertyChanged?.('source',node.properties.source);node.setDirtyCanvas?.(true,true);App.graph.change?.();}finally{App.graph.afterChange?.();root.flushHistory?.();}
    }else{
      newValue=ensureNumber(input.value,target.minimum);const flow=clone(node.properties.flow),item=flow.nodes.find(candidate=>candidate.id===target.itemId);previousValue=Number(item.config.seconds) || 0;item.config.seconds=newValue;
      const validation=App.FlowModel?.validate?.(flow,node) || [];if(validation.length)throw new Error(validation.join(' '));
      const committed=App.FlowModel?.commit?.(node,flow);if(Array.isArray(committed) && committed.length)throw new Error(committed.join(' '));
    }
    App.canvas?.setDirty?.(true,true);
    return {success:true,nodeId:node.id,nodeName:String(node.title || ''),parameter:target.key,previousValue,newValue};
  }
  function kpis(){
    graphRequired();const timeMs=Number(root.simNow?.()) || 0,hours=timeMs/(3600*1000),sinks=[];
    for(const node of nodes())if(Array.isArray(node._recv)){
      const completed=node._recv.length,first=completed ? Number(node._recv[0]?.completedAt ?? node._recv[0]?.t) : NaN,last=completed ? Number(node._recv[completed-1]?.completedAt ?? node._recv[completed-1]?.t) : NaN;
      sinks.push({nodeId:node.id,name:String(node.title || ''),completedCount:completed,throughputPerHour:hours>0 ? completed/hours : 0,firstCompletionSeconds:Number.isFinite(first) ? first/1000 : null,lastCompletionSeconds:Number.isFinite(last) ? last/1000 : null});
    }
    const totalCompleted=sinks.reduce((sum,sink)=>sum+sink.completedCount,0);
    return {success:true,source:'FactSim runtime state',running:!!root.isSimRunning?.(),simTimeSeconds:timeMs/1000,totalCompleted,projectedThroughputPerHour:hours>0 ? totalCompleted/hours : null,sinkCount:sinks.length,sinks};
  }
  async function runSimulation(input,context){
    if(AI.SimulationDiagnostics){
      const result=await AI.SimulationDiagnostics.profile({...input,durationSeconds:input.durationSeconds ?? 60,stallWindowSeconds:3600,detailLimit:5},context);
      return {...result,durationSeconds:input.durationSeconds ?? 60,steps:result.performance.steps,kpis:result.report.kpis};
    }
    graphRequired();if(root.isSimRunning?.())throw new Error('Simulation is already running. Stop it before starting an AI-controlled run.');
    const durationSeconds=Number(input.durationSeconds ?? 60);if(!Number.isFinite(durationSeconds) || durationSeconds<=0 || durationSeconds>86400)throw new Error('durationSeconds must be greater than 0 and at most 86400.');
    if(input.resetBeforeRun && (Number(root.simNow?.()) || 0)>0)App.resetSimulationForFlowEdit?.(App.graph);
    const startMs=Number(root.simNow?.()) || 0,targetMs=startMs+durationSeconds*1000;let steps=0;
    try{
      root.startSimulation();root.stopSimLoop();
      if(!App.engine?.update)throw new Error('The selected simulation engine could not be started.');
      while((Number(root.simNow?.()) || 0)<targetMs){
        if(context.signal?.aborted)throw new DOMException('Simulation stopped by user.','AbortError');
        const remaining=targetMs-(Number(root.simNow?.()) || 0);App.engine.update(Math.min(1000,remaining));steps++;
        if(steps%20===0){context.onProgress?.({simTimeSeconds:(Number(root.simNow?.()) || 0)/1000,targetSeconds:targetMs/1000});await new Promise(resolve=>setTimeout(resolve,0));}
        if(steps>100000)throw new Error('Simulation step limit reached.');
      }
    }finally{try{root.stopSimulation();}catch(_e){}}
    return {success:true,startTimeSeconds:startMs/1000,endTimeSeconds:(Number(root.simNow?.()) || 0)/1000,durationSeconds,steps,kpis:kpis()};
  }
  function registerFactSimTools(registry){
    registry.register({name:'get_model_summary',description:'Returns a compact, factual summary of the currently loaded FactSim model.',mode:AI.ToolModes.READ,risk:'low',inputSchema:{type:'object',properties:{},additionalProperties:false},outputSchema:{type:'object'},execute:()=>({success:true,...modelSummary()})});
    registry.register({name:'get_node',description:'Returns an AI-safe view of one existing FactSim node, including its editable parameters and connections.',mode:AI.ToolModes.READ,risk:'low',inputSchema:{type:'object',properties:{nodeId:{type:'string',minLength:1,maxLength:200}},required:['nodeId'],additionalProperties:false},outputSchema:{type:'object'},execute:input=>({success:true,node:nodeView(findNode(input.nodeId))})});
    registry.register({name:'set_node_parameter',description:'Changes one explicitly editable parameter of an existing FactSim node. Inspect the node first with get_node.',mode:AI.ToolModes.WRITE,risk:'medium',inputSchema:{type:'object',properties:{nodeId:{type:'string',minLength:1,maxLength:200},parameter:{type:'string',minLength:1,maxLength:200},value:{}},required:['nodeId','parameter','value'],additionalProperties:false},outputSchema:{type:'object'},execute:setNodeParameter});
    registry.register({name:'run_simulation',description:'Runs the real selected engine for bounded simulation time within a wall-time budget (default 15 s), yielding for UI responsiveness. Returns measured KPIs and wall-time performance. For freeze/stall investigations prefer profile_simulation.',mode:AI.ToolModes.SIMULATION,risk:'low',inputSchema:{type:'object',properties:{durationSeconds:{type:'number',minimum:0.1,maximum:86400},maxWallSeconds:{type:'number',minimum:0.1,maximum:60},resetBeforeRun:{type:'boolean'}},additionalProperties:false},outputSchema:{type:'object'},execute:runSimulation});
    registry.register({name:'get_kpis',description:'Returns KPIs measured from the current FactSim runtime state. It never estimates results with the language model.',mode:AI.ToolModes.READ,risk:'low',inputSchema:{type:'object',properties:{},additionalProperties:false},outputSchema:{type:'object'},execute:kpis});
    registry.register({name:'add_node',description:'Adds a named node using an existing FactSim catalog kind. Get availableNodeKinds from get_model_summary first. Preserves existing nodes; resets simulation results.',mode:AI.ToolModes.WRITE,risk:'medium',inputSchema:{type:'object',properties:{kind:{type:'string',minLength:1,maxLength:64},name:{type:'string',minLength:1,maxLength:200},x:{type:'number',minimum:-100000,maximum:100000},y:{type:'number',minimum:-100000,maximum:100000}},required:['kind','name'],additionalProperties:false},outputSchema:{type:'object'},execute:addNode});
    registry.register({name:'connect_nodes',description:'Connects a free output to a free input on two existing nodes. Port indices default to 0. Inspect ports with get_node. Does not replace existing edges; resets simulation results.',mode:AI.ToolModes.WRITE,risk:'medium',inputSchema:{type:'object',properties:{fromNodeId:{type:'string',minLength:1,maxLength:200},toNodeId:{type:'string',minLength:1,maxLength:200},fromPort:{type:'number',minimum:0,maximum:511},toPort:{type:'number',minimum:0,maximum:511}},required:['fromNodeId','toNodeId'],additionalProperties:false},outputSchema:{type:'object'},execute:connectNodes});
    registry.register({name:'insert_node_on_link',description:'Inserts a new named catalog node (e.g. kind buffer) between two already connected nodes. Atomically replaces the existing edge with from -> new node -> to. Inspect get_node first. Optional port indices disambiguate multiple edges; preserve other links. One undo restores the original edge; failures roll back. Resets simulation results.',mode:AI.ToolModes.WRITE,risk:'medium',inputSchema:{type:'object',properties:{fromNodeId:{type:'string',minLength:1,maxLength:200},toNodeId:{type:'string',minLength:1,maxLength:200},fromPort:{type:'number',minimum:0,maximum:511},toPort:{type:'number',minimum:0,maximum:511},kind:{type:'string',minLength:1,maxLength:64},name:{type:'string',minLength:1,maxLength:200},x:{type:'number',minimum:-100000,maximum:100000},y:{type:'number',minimum:-100000,maximum:100000}},required:['fromNodeId','toNodeId','kind','name'],additionalProperties:false},outputSchema:{type:'object'},execute:insertNodeOnLink});
    registry.register({name:'move_node',description:'Moves only one existing node to absolute GRAPH x/y coordinates. Other node positions, links, settings and simulation results stay unchanged. Inspect get_layout_snapshot, choose a minimal individual move, then inspect again. avoidOverlap=true validates the target against all other nodes; minimumGap defaults to 20. One undo restores the position. fit=false preserves the viewport.',mode:AI.ToolModes.WRITE,risk:'low',inputSchema:{type:'object',properties:{nodeId:{type:'string',minLength:1,maxLength:200},x:{type:'number',minimum:-100000,maximum:100000},y:{type:'number',minimum:-100000,maximum:100000},fit:{type:'boolean'},avoidOverlap:{type:'boolean'},minimumGap:{type:'number',minimum:0,maximum:200}},required:['nodeId','x','y'],additionalProperties:false},outputSchema:{type:'object'},execute:moveNode});
    registry.register({name:'auto_layout',description:'Arranges all existing nodes for readability using FactSim auto layout, with spacing and fit-to-screen. Use when nodes overlap or the user asks to tidy the graph. Default flow-group follows connections and reframes groups. Only visual positions/group bounds change; links, names, parameters and simulation results remain unchanged. One undo restores the layout.',mode:AI.ToolModes.WRITE,risk:'low',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['flow-group','flow','simple']},spacing:{type:'number',minimum:80,maximum:1000},fit:{type:'boolean'}},additionalProperties:false},outputSchema:{type:'object'},execute:autoLayout});
    registry.register({name:'get_layout_snapshot',description:'Inspects current node graph appearance: node IDs, actual title-inclusive bounding boxes, graph positions, screen pixel bounds, visible/selected state, connections and overlap pairs. Vision models also receive a current canvas image with ID labels. Default scope visible; scope all includes off-screen geometry, never off-screen pixels. Does NOT move any nodes. Inspect before and after individual move_node calls. Use graph positions, not image pixels, when moving.',mode:AI.ToolModes.READ,risk:'low',inputSchema:{type:'object',properties:{scope:{type:'string',enum:['visible','all']},maxNodes:{type:'number',minimum:1,maximum:500},includeImage:{type:'boolean'}},additionalProperties:false},outputSchema:{type:'object'},execute:layoutSnapshot});
    AI.SimulationDiagnostics?.register(registry);
    return registry;
  }
  AI.FactSimTools={register:registerFactSimTools,modelSummary,nodeView,findNode,editableParameters,getKpis:kpis,setNodeParameter,runSimulation};
})(typeof window==='undefined' ? globalThis : window);
