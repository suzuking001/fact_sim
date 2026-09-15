(function(root){
  'use strict';
  const App=root.App=root.App || {},clone=value=>JSON.parse(JSON.stringify(value));
  const definitions={
    inPort:{label:'inPort',inputs:[],outputs:['outPort']},
    outPort:{label:'outPort',inputs:['inPort'],outputs:[]},
    process:{label:'Process',inputs:['inPort'],outputs:['outPort'],timed:true},
    recovery:{label:'Recovery',inputs:['inPort'],outputs:['outPort'],timed:true},
    entityRouter:{label:'entityRouter',inputs:['inPort1'],outputs:['outPort1'],dynamic:true},
    syncroJudgment:{label:'syncroJudgment',inputs:['inPort'],outputs:['outPort']},
    Palletizing:{label:'Palletizing',inputs:['parentInPort','childInPort'],outputs:['outPort']},
    DePalletizing:{label:'DePalletizing',inputs:['inPort'],outputs:['parentOutPort','childOutPort']}
  };
  function empty(){return {version:2,nodes:[],links:[],counters:{}};}
  function add(flow,kind,config={},pos){
    const def=definitions[kind];if(!def)throw new Error('Unknown Flow node type.');
    const prefix=kind[0].toLowerCase()+kind.slice(1);flow.counters ||= {};
    let number=Number(flow.counters[prefix]) || 0,id;
    do{id=prefix+(++number);}while(flow.nodes.some(n=>n.id===id));flow.counters[prefix]=number;
    const item={id,kind,config:{...(def.timed ? {seconds:0} : {}),...config},inputs:def.inputs.map(id=>({id})),outputs:def.outputs.map(id=>({id,...(def.dynamic ? {typeId:'anyType'} : {})})),pos:pos || [30+flow.nodes.length*260,60]};
    flow.nodes.push(item);return item;
  }
  function connect(flow,from,to,output=0,input=0){
    const a=typeof from==='string' ? flow.nodes.find(n=>n.id===from) : from,b=typeof to==='string' ? flow.nodes.find(n=>n.id===to) : to;
    if(!a?.outputs[output] || !b?.inputs[input])throw new Error('The selected port does not exist.');
    flow.links.push({from:a.id,output:a.outputs[output].id,to:b.id,input:b.inputs[input].id});
  }
  function validate(flow,node){
    if(flow?.version!==2 || !Array.isArray(flow.nodes) || !Array.isArray(flow.links))return ['Unsupported Flow format. Open a Flow v2 file.'];
    if(node?.properties.role==='source')return App.validateSource?.(node) || [];
    if(node?.properties.role==='sink')return [];
    const errors=[],ids=new Set(),nodes=new Map(),registry=node?.graph && App.entityModelForGraph?.(node.graph);
    if(flow.nodes.length>512 || flow.links.length>2048)return ['Flow exceeds the supported graph size.'];
    for(const item of flow.nodes){
      if(!item || typeof item!=='object'){errors.push('Flow nodes must be objects.');continue;}const def=definitions[item.kind];
      if(!item.id || ids.has(item.id))errors.push('Flow node IDs must be unique.');ids.add(item.id);nodes.set(item.id,item);
      if(!def){errors.push(`${item.id}: unknown node type.`);continue;}
      if(!Array.isArray(item.inputs) || !Array.isArray(item.outputs)){errors.push(`${item.id}: missing ports.`);continue;}
      if(!def.dynamic && (item.inputs.length!==def.inputs.length || item.outputs.length!==def.outputs.length))errors.push(`${item.id}: fixed port count cannot be changed.`);
      for(const ports of [item.inputs,item.outputs])if(new Set(ports.map(p=>p.id)).size!==ports.length)errors.push(`${item.id}: port IDs must be unique.`);
      if(def.timed && (!Number.isFinite(item.config?.seconds) || item.config.seconds<0))errors.push(`${item.id}: enter a time of zero or more seconds.`);
      if(item.kind==='inPort' || item.kind==='outPort'){
        const ports=node?.[item.kind==='inPort' ? 'inputs' : 'outputs'];
        if(ports && !ports.some(p=>p.portId===item.config?.portId))errors.push(`${item.id}: select an existing equipment port.`);
      }
      if(def.dynamic){
        const roundRobin=item.config?.dispatch==='round-robin';
        if(item.config?.dispatch && !['type','round-robin'].includes(item.config.dispatch))errors.push(`${item.id}: unknown dispatch mode.`);
        const assigned=new Set();if(!item.inputs.length || !item.outputs.length)errors.push(`${item.id}: at least one input and output are required.`);
        for(const port of item.outputs){if(roundRobin)continue;if(!port.typeId || assigned.has(port.typeId))errors.push(`${item.id}: each output needs a unique Entity Type.`);assigned.add(port.typeId);if(registry && port.typeId!=='anyType' && !registry.get(port.typeId))errors.push(`${item.id}: unknown Entity Type.`);}
      }
      if(item.kind==='syncroJudgment' && node?.graph && !(node.graph.extra?.syncroGroups || []).some(g=>g.id===item.config?.groupId))errors.push(`${item.id}: select a SyncroGroup.`);
    }
    const occupied=new Set(),outgoing=new Set();
    for(const link of flow.links){
      if(!nodes.get(link.from)?.outputs?.some(p=>p.id===link.output) || !nodes.get(link.to)?.inputs?.some(p=>p.id===link.input)){errors.push('A connection refers to a missing port.');continue;}
      const a=`${link.from}/${link.output}`,b=`${link.to}/${link.input}`;
      if(occupied.has(b) || outgoing.has(a))errors.push('Each port accepts one connection. Use entityRouter for multiple paths.');occupied.add(b);outgoing.add(a);
    }
    for(const item of flow.nodes){
      for(const port of item.inputs || [])if(!occupied.has(`${item.id}/${port.id}`))errors.push(`${item.id}: connect ${port.id}.`);
      for(const port of item.outputs || [])if(!outgoing.has(`${item.id}/${port.id}`))errors.push(`${item.id}: connect ${port.id}.`);
    }
    const reachable=new Set();function visit(id,path){if(path.has(id)){errors.push(`${id}: cyclic Flow connections are not supported.`);return;}if(reachable.has(id))return;reachable.add(id);const next=new Set(path);next.add(id);for(const l of flow.links.filter(l=>l.from===id))visit(l.to,next);}
    for(const item of flow.nodes.filter(n=>n.kind==='inPort'))visit(item.id,new Set());
    for(const item of flow.nodes)if(!reachable.has(item.id))errors.push(`${item.id}: connect an inPort path.`);
    if(!flow.nodes.length)errors.push('Add an inPort and an outPort to begin.');
    return [...new Set(errors)];
  }
  function template(node,kind='machine'){
    const flow=empty(),inputs=(node.inputs || []).filter(p=>p.channel!=='signal'),outputs=(node.outputs || []).filter(p=>p.channel!=='signal');
    const entry=inputs.map(p=>add(flow,'inPort',{portId:p.portId})),exit=outputs.map(p=>add(flow,'outPort',{portId:p.portId}));
    if(!entry.length || !exit.length)return flow;
    let first=entry[0];
    if(kind==='pack' || kind==='merge'){
      const pack=add(flow,'Palletizing');connect(flow,first,pack);if(entry[1])connect(flow,entry[1],pack,0,1);first=pack;
    }else if(entry.length>1){
      const router=add(flow,'entityRouter');while(router.inputs.length<entry.length)router.inputs.push({id:'inPort'+(router.inputs.length+1)});entry.forEach((n,i)=>connect(flow,n,router,0,i));first=router;
    }
    if(kind==='unpack'){
      const unpack=add(flow,'DePalletizing');connect(flow,first,unpack);connect(flow,unpack,exit[0]);if(exit[1])connect(flow,unpack,exit[1],1);layout(flow);return flow;
    }
    const process=add(flow,'process',{seconds:kind==='buffer' ? 0 : 2}),recovery=add(flow,'recovery',{seconds:kind==='buffer' ? 0 : 3});connect(flow,first,process);connect(flow,process,recovery);let last=recovery;
    if(kind==='shuttle'){last=add(flow,'syncroJudgment',{groupId:''});connect(flow,recovery,last);}
    if(exit.length===1)connect(flow,last,exit[0]);
    else{const router=add(flow,'entityRouter');router.outputs=exit.map((n,i)=>({id:'outPort'+(i+1),typeId:i===0 ? 'anyType' : ''}));connect(flow,last,router);exit.forEach((n,i)=>connect(flow,router,n,i));}
    layout(flow);
    return flow;
  }
  function layout(flow){
    const rank=new Map(flow.nodes.map(n=>[n.id,0])),columns=new Map();
    for(let i=0;i<flow.nodes.length;i++)for(const l of flow.links)rank.set(l.to,Math.max(rank.get(l.to),rank.get(l.from)+1));
    for(const n of flow.nodes){const x=rank.get(n.id),y=columns.get(x) || 0;n.pos=[x*260+16,y*160+16];columns.set(x,y+1);}
  }
  function addSyncroGroup(graph,name){
    pause();name=String(name || '').trim();if(!name)throw new Error('Enter a SyncroGroup name.');
    graph.extra ||= {};const groups=graph.extra.syncroGroups ||= [];if(groups.some(g=>g.name===name))throw new Error('SyncroGroup names must be unique.');
    graph.beforeChange?.();let sequence=graph.extra.syncroGroupSequence || 0;do{sequence++;}while(groups.some(g=>g.id==='syncroGroup'+sequence));
    const group={id:'syncroGroup'+sequence,name};graph.extra.syncroGroupSequence=sequence;groups.push(group);graph.afterChange?.();return group;
  }
  function graphErrors(graph){
    const errors=[],store=App.runtimeInstancesForGraph?.(graph);
    for(const node of (graph?._nodes || []).filter(n=>n.type==='factory/basic')){
      errors.push(...validate(node.properties.flow,node).map(e=>`${node.title || node.id}: ${e}`));
      errors.push(...(store?.validateInitialContents(node).errors || []).map(e=>`${node.title || node.id}: ${e.path}: ${e.code.replaceAll('_',' ').toLowerCase()}.`));
      for(const port of node.outputs || [])if(port.links?.length>1)errors.push(`${node.title || node.id}: use entityRouter for multiple output destinations.`);
    }
    return errors;
  }
  function pause(){if(root.isSimRunning?.())root.stopSimulation?.();}
  function commit(node,flow){
    pause();const old=node.properties.flow;
    const topology=f=>JSON.stringify(f,(key,value)=>['seconds','pos','flipIO','counters'].includes(key) ? undefined : value);
    if(flow?.version!==2 || !Array.isArray(flow.nodes) || !Array.isArray(flow.links) || flow.nodes.some(n=>!n || !n.config || !Array.isArray(n.inputs) || !Array.isArray(n.outputs)))throw new Error('A Flow v2 definition with nodes, configurations, ports and links is required.');
    if((node._flowRuntime?.cells?.length || node._flowRuntime?.offers?.length) && topology(old)!==topology(flow))throw new Error('Reset before changing a Flow that contains an Entity.');
    node.graph?.beforeChange?.();node.properties.flow=clone(flow);
    App.FlowRuntime?.retime(node);node.graph?.change?.();node.graph?.afterChange?.();root.flushHistory?.();node.setDirtyCanvas?.(true,true);
    return validate(flow,node);
  }
  App.FlowModel={definitions,clone,empty,add,connect,validate,template,layout,graphErrors,pause,commit,addSyncroGroup};
})(typeof window==='undefined' ? globalThis : window);
