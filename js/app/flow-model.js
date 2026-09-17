(function(root){
  'use strict';
  const App=root.App=root.App || {},clone=value=>JSON.parse(JSON.stringify(value));
  const definitions={
    inPort:{label:'inPort',inputs:[],outputs:['outPort']},
    outPort:{label:'outPort',inputs:['inPort'],outputs:[]},
    process:{label:'Process',inputs:['inPort'],outputs:['outPort'],timed:true},
    recovery:{label:'Recovery',inputs:['inPort'],outputs:['outPort'],timed:true},
    join:{label:'Join',inputs:['inPort1','inPort2'],outputs:['outPort'],expand:'inputs'},
    fork:{label:'Fork',inputs:['inPort'],outputs:['outPort1','outPort2'],expand:'outputs'},
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
  function rewire(flow,a,b){
    if(!a || !b || a.direction===b.direction)throw new Error('Connect an output port to an input port.');
    const output=a.direction==='outputs' ? a : b,input=a.direction==='inputs' ? a : b;
    const from=flow.nodes.find(n=>n.id===output.nodeId),to=flow.nodes.find(n=>n.id===input.nodeId);
    if(!from?.outputs.some(p=>p.id===output.portId) || !to?.inputs.some(p=>p.id===input.portId))throw new Error('The selected port no longer exists.');
    if(from===to)throw new Error('Connect ports on different nodes.');
    const link={from:from.id,output:output.portId,to:to.id,input:input.portId};
    // Replace occupied endpoints only once both ends have been chosen.
    flow.links=flow.links.filter(l=>!(l.from===link.from && l.output===link.output) && !(l.to===link.to && l.input===link.input));
    flow.links.push(link);return link;
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
      if(!def.dynamic && (def.expand==='inputs' ? item.inputs.length<2 || item.outputs.length!==1 : def.expand==='outputs' ? item.inputs.length!==1 || item.outputs.length<2 : item.inputs.length!==def.inputs.length || item.outputs.length!==def.outputs.length))errors.push(`${item.id}: invalid port count.`);
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
    const signals=signalLinks(flow),feedback=new Set(feedbackLinks(flow));
    for(const link of flow.links){
      const target=nodes.get(link.to);
      if(target?.kind==='recovery' && !signals.has(link))errors.push(`${target.id}: connect Recovery to a Fork completion output, then return it to Join.`);
      if(signals.has(link) && ['inPort','outPort','entityRouter','Palletizing','DePalletizing','syncroJudgment'].includes(target?.kind))errors.push(`${link.to}: completion signals must connect to Join, Fork, Process or Recovery.`);
      if(target?.kind==='join' && target.inputs.findIndex(p=>p.id===link.input)>0 && !signals.has(link))errors.push(`${target.id}: additional inputs accept completion signals. Use Palletizing to combine Entities.`);
    }
    const reachable=new Set();function visit(id,path){if(path.has(id)){errors.push(`${id}: only Recovery feedback into a Join is supported.`);return;}if(reachable.has(id))return;reachable.add(id);const next=new Set(path);next.add(id);for(const l of flow.links.filter(l=>l.from===id && !feedback.has(l)))visit(l.to,next);}
    for(const item of flow.nodes.filter(n=>n.kind==='inPort'))visit(item.id,new Set());
    for(const item of flow.nodes)if(!reachable.has(item.id))errors.push(`${item.id}: connect an inPort path.`);
    if(!flow.nodes.length)errors.push('Add an inPort and an outPort to begin.');
    return [...new Set(errors)];
  }
  function signalLinks(flow){
    const signals=new Set(),nodes=new Map(flow.nodes.map(n=>[n.id,n]));
    function reachesWork(link,seen=new Set()){
      const n=nodes.get(link.to);if(!n || seen.has(n.id))return false;
      if(n.kind==='outPort')return true;
      if(n.kind==='recovery' || n.kind==='join' && link.input!==n.inputs[0]?.id)return false;
      const next=new Set(seen);next.add(n.id);
      return flow.links.filter(l=>l.from===n.id).some(l=>reachesWork(l,next));
    }
    // Branch meaning follows its destination, never its position on the Fork.
    for(const link of flow.links)if(nodes.get(link.from)?.kind==='fork' && !reachesWork(link))signals.add(link);
    for(let pass=0;pass<flow.nodes.length+1;pass++){
      const before=signals.size;
      for(const link of flow.links){const n=nodes.get(link.from);if(!n)continue;const incoming=flow.links.find(l=>l.to===n.id && l.input===n.inputs?.[0]?.id);if(incoming && signals.has(incoming))signals.add(link);}
      if(signals.size===before)break;
    }
    return signals;
  }
  function feedbackLinks(flow){
    const nodes=new Map(flow.nodes.map(n=>[n.id,n])),signals=signalLinks(flow);
    // A recovery return starts ready on Reset; every later token is produced
    // by a real transfer. The Entity input still gates every cycle, even at 0 s.
    return flow.links.filter(link=>{
      const from=nodes.get(link.from),to=nodes.get(link.to);
      if(from?.kind!=='recovery' || to?.kind!=='join' || !signals.has(link) || to.inputs.findIndex(p=>p.id===link.input)<1)return false;
      const dataInput=flow.links.find(l=>l.to===to.id && l.input===to.inputs[0].id);
      if(!dataInput || signals.has(dataInput))return false;
      const visited=new Set();function reaches(id){if(id===from.id)return true;if(visited.has(id))return false;visited.add(id);return flow.links.filter(l=>l.from===id && l!==link).some(l=>reaches(l.to));}
      return reaches(to.id);
    });
  }
  function addRecoveryCycle(flow){
    // Upgrade the former serial cycle without changing any equipment ports,
    // routing choices, process times, or recovery times.
    if(flow.nodes.some(n=>n.kind==='join' || n.kind==='fork'))return false;
    const recoveries=flow.nodes.filter(n=>n.kind==='recovery');if(!recoveries.length)return false;
    const process=flow.nodes.find(n=>n.kind==='process');if(!process)return false;
    const incoming=flow.links.filter(l=>l.to===process.id);if(incoming.length!==1)return false;
    const join=add(flow,'join');incoming[0].to=join.id;incoming[0].input=join.inputs[0].id;connect(flow,join,process);
    for(const [index,recovery] of recoveries.entries()){
      const before=flow.links.filter(l=>l.to===recovery.id),after=flow.links.filter(l=>l.from===recovery.id);
      if(before.length!==1 || after.length!==1)throw new Error('Recovery cycle requires one input and one output.');
      const fork=add(flow,'fork');before[0].to=fork.id;before[0].input=fork.inputs[0].id;
      // Synchronization gates must run before the fork starts recovery.
      const next=flow.nodes.find(n=>n.id===after[0].to);
      if(next?.kind==='syncroJudgment'){
        const syncOut=flow.links.find(l=>l.from===next.id);
        if(syncOut){before[0].to=next.id;before[0].input=next.inputs[0].id;after[0].from=fork.id;after[0].output=fork.outputs[0].id;after[0].to=syncOut.to;after[0].input=syncOut.input;syncOut.to=fork.id;syncOut.input=fork.inputs[0].id;}
      }else{after[0].from=fork.id;after[0].output=fork.outputs[0].id;}
      connect(flow,fork,recovery,1);
      if(index>0)join.inputs.push({id:'inPort'+(index+2)});
      connect(flow,recovery,join,0,index+1);
    }
    layout(flow);return true;
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
    addRecoveryCycle(flow);layout(flow);
    return flow;
  }
  function layout(flow){
    const feedback=new Set(feedbackLinks(flow)),signals=signalLinks(flow),rank=new Map(flow.nodes.map(n=>[n.id,0])),columns=new Map();
    for(let i=0;i<flow.nodes.length;i++)for(const l of flow.links)if(!feedback.has(l))rank.set(l.to,Math.max(rank.get(l.to),Math.min(flow.nodes.length,rank.get(l.from)+1)));
    for(const n of flow.nodes){const x=rank.get(n.id),y=columns.get(x) || 0;n.pos=[x*260+16,y*160+16];columns.set(x,y+1);}
    for(const link of feedback){const recovery=flow.nodes.find(n=>n.id===link.from),join=flow.nodes.find(n=>n.id===link.to),forkEdge=flow.links.find(l=>l.to===recovery.id && signals.has(l)),fork=flow.nodes.find(n=>n.id===forkEdge?.from);recovery.pos=[fork ? (join.pos[0]+fork.pos[0])/2 : join.pos[0]+260,Math.max(...flow.nodes.filter(n=>n!==recovery).map(n=>n.pos[1]))+180];recovery.flipIO=true;}
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
    const changed=topology(old)!==topology(flow);
    if(App.FlowRuntime?.isActive(node) && changed)throw new Error('Reset before changing an active Flow.');
    node.graph?.beforeChange?.();node.properties.flow=clone(flow);
    if(changed && node._flowRuntime){node._flowRuntime.signals=[];node._flowRuntime.flowActivity={};node._flowRuntime.forkStatus={};delete node._flowRuntime.controlInitialized;}
    if(App.FlowRuntime?.isActive(node))App.FlowRuntime.retime(node);
    else if(node._flowRuntime){node._flowRuntime.checked=false;node._flowRuntime.error='';}
    node.graph?.change?.();node.graph?.afterChange?.();root.flushHistory?.();node.setDirtyCanvas?.(true,true);
    return validate(flow,node);
  }
  App.FlowModel={definitions,clone,empty,add,connect,rewire,validate,template,layout,graphErrors,pause,commit,addSyncroGroup,signalLinks,feedbackLinks,addRecoveryCycle};
})(typeof window==='undefined' ? globalThis : window);
