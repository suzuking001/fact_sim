(function(root){
  'use strict';
  const App=root.App=root.App || {},now=()=>Number(root.simNow?.()) || 0;
  const store=node=>App.runtimeInstancesForGraph(node.graph);
  const flow=node=>node?.properties?.flow;
  const spec=(node,id)=>flow(node)?.nodes.find(n=>n.id===id);
  function runtime(node){return node._flowRuntime ||= {cells:[],offers:[],last:[],sequence:0,nextAt:0,created:0,cycle:0,visuals:[],error:'',lastTime:now()};}
  function activeCells(node){const r=runtime(node);return r.cells.concat(r.signals || []);}
  function isActive(node){const r=node?._flowRuntime;return !!(r && (r.cells.length || r.offers.length || r.signals?.some(c=>spec(node,c.nodeId)?.kind!=='join')));}
  function initializeControls(node){
    const r=runtime(node);r.signals ||= [];if(r.controlInitialized)return;r.controlInitialized=true;
    for(const link of App.FlowModel.feedbackLinks(flow(node)))r.signals.push({id:++r.sequence,nodeId:link.to,input:link.input,initial:true});
  }
  function sameWork(a,b){return !!a && !!b && a.typeId===b.typeId && a.id===b.id;}
  function joinWorkInputs(node,item){
    const signals=App.FlowModel.signalLinks(flow(node));
    return item.inputs.filter(p=>flow(node).links.some(l=>l.to===item.id && l.input===p.id && !signals.has(l)));
  }
  function joinSignalsReady(node,item){
    const work=new Set(joinWorkInputs(node,item).map(p=>p.id));
    return item.inputs.filter(p=>!work.has(p.id)).every(p=>runtime(node).signals?.some(c=>c.nodeId===item.id && c.input===p.id));
  }
  function joinReady(node,item){
    const r=runtime(node),inputs=joinWorkInputs(node,item),cells=inputs.map(p=>r.cells.find(c=>c.nodeId===item.id && c.input===p.id));
    return joinSignalsReady(node,item) && cells.every(c=>c && sameWork(c.entity,cells[0]?.entity));
  }
  function runJoin(node,cell,item){
    const inputs=joinWorkInputs(node,item);if(cell.input!==inputs[0]?.id || !joinReady(node,item))return false;
    const r=runtime(node),others=r.cells.filter(c=>c!==cell && c.nodeId===item.id);
    if(!move(node,cell))return false;
    // Input 1 represents the reunited work. Other copies are consumed once,
    // with their copied contents; this is not an additional sink completion.
    for(const other of others)store(node).destroy(other.entity);
    r.cells=r.cells.filter(c=>!others.includes(c));r.signals=r.signals.filter(c=>c.nodeId!==item.id);
    r.merged=(r.merged || 0)+others.length;mark(node);return true;
  }
  // Find the next work Join and the input reserved by a work on this path.
  function assemblyTargets(node,id,input,seen=new Set()){
    if(seen.has(id))return [];const item=spec(node,id);if(!item)return [];
    if(item.kind==='join' && joinWorkInputs(node,item).length>1)return [{id,input}];
    if(['outPort','Palletizing','DePalletizing','recovery'].includes(item.kind))return [];
    const next=new Set(seen);next.add(id);const signals=App.FlowModel.signalLinks(flow(node));
    return flow(node).links.filter(l=>l.from===id && !signals.has(l)).flatMap(l=>assemblyTargets(node,l.to,l.input,next));
  }
  function mark(node){runtime(node).revision=(runtime(node).revision || 0)+1;if(!node.graph)return;node.graph.__outputDirty=true;node.graph.__dirtyNodeIds ||= new Set();node.graph.__dirtyNodeIds.add(node.id);for(const input of node.inputs || []){const link=node.graph.links[input.link];if(link)node.graph.__dirtyNodeIds.add(link.origin_id);}}
  function outgoing(node,item,port=0){return flow(node).links.find(l=>l.from===item.id && l.output===item.outputs[port]?.id);}
  function routerPort(node,item,cell){
    if(item.config.dispatch==='round-robin')return (runtime(node).routerCursors?.[item.id] || 0)%item.outputs.length;
    const port=item.outputs.findIndex(p=>p.typeId===cell.entity.typeId);
    return port<0 ? item.outputs.findIndex(p=>p.typeId==='anyType') : port;
  }
  function free(node,target,input,entity,ignore){
    if(!target)return false;
    const cells=activeCells(node).filter(c=>c!==ignore && c.nodeId===target.id);
    if(target.kind==='join')return !cells.some(c=>c.input===input);
    if(target.kind==='Palletizing'){
      const parent=cells.find(c=>c.input===target.inputs[0].id);
      if(input===target.inputs[0].id){const type=entity && store(node).typeOf(entity);if(entity && !type?.capacity){runtime(node).reason='Parent Entity Type needs a positive capacity.';return false;}return cells.length===0;}
      if(!parent || cells.some(c=>c.input===input))return false;
      return store(node).canAttach(entity,parent.entity).ok;
    }
    return cells.length===0;
  }
  function canMove(node,cell,port=0){const item=spec(node,cell.nodeId),link=item && outgoing(node,item,port);return !!link && free(node,spec(node,link.to),link.input,cell.entity,cell);}
  function recordActivity(node,item,cell){
    const r=runtime(node);r.flowActivity ||= {};r.flowActivity[item.id]={firedAt:now(),...(cell?.startedAt!==undefined ? {durationSec:Math.max(0,(cell.until-cell.startedAt)/1000)} : {})};
  }
  function move(node,cell,port=0){
    const item=spec(node,cell.nodeId),link=item && outgoing(node,item,port);if(!link || !free(node,spec(node,link.to),link.input,cell.entity,cell))return false;
    if(cell.startedAt!==undefined && cell.visualId){const visual=runtime(node).visuals.find(v=>v.id===cell.visualId);if(visual)visual.history.push({nodeId:cell.nodeId,startedAt:cell.startedAt,until:cell.until});}
    recordActivity(node,item,cell);cell.nodeId=link.to;cell.input=link.input;delete cell.startedAt;delete cell.until;delete cell.ready;delete cell.visualId;mark(node);return true;
  }
  function batchInputAllowed(node,entry,entity){
    const r=runtime(node);
    const targets=assemblyTargets(node,entry.id);
    if(targets.length && r.cells.length && !r.offers.length){
      const shared=targets.find(target=>r.cells.every(c=>sameWork(c.entity,entity) && assemblyTargets(node,c.nodeId,c.input).some(other=>other.id===target.id && other.input!==target.input)));
      if(shared)return true;
    }
    // The parent opens a batch. Further admissions must lead to its child input.
    let childPath=false;const visited=new Set();function reaches(id){if(visited.has(id))return false;visited.add(id);const item=spec(node,id);if(!item)return false;
      return flow(node).links.filter(l=>l.from===id).some(l=>{const target=spec(node,l.to);if(target?.kind==='Palletizing'){if(l.input!==target.inputs[1].id)return false;childPath=true;return r.cells.some(c=>c.nodeId===target.id && c.input===target.inputs[0].id && store(node).canAttach(entity,c.entity).ok && store(node).childrenOf(c.entity).length+r.cells.filter(other=>other!==c).length<store(node).typeOf(c.entity).capacity);}return target && !['outPort','DePalletizing'].includes(target.kind) && reaches(target.id);});}
    const availableChild=reaches(entry.id);return !r.cells.length && !r.offers.length ? !childPath : availableChild;
  }
  function canAccept(node,slot,entity){
    if(node.properties.role==='sink')return true;
    if(node.properties.role==='source')return false;
    const entry=flow(node)?.nodes.find(n=>n.kind==='inPort' && n.config.portId===node.inputs?.[slot]?.portId);
    if(!entry || runtime(node).error || runtime(node).cells.some(c=>c.nodeId===entry.id))return false;
    if(entity && runtime(node).last[slot]===entity.instanceId)return false;
    initializeControls(node);
    // Readiness reaches upstream without moving the work into this equipment.
    // In particular, recovery cannot be hidden by buffering a new work at Join.
    const visited=new Set();function readyPath(item){
      if(!item || visited.has(item.id))return true;visited.add(item.id);
      if(item.kind==='join')return joinSignalsReady(node,item);
      if(['process','recovery','outPort','fork'].includes(item.kind))return true;
      const links=item.kind==='entityRouter' && entity ? [outgoing(node,item,routerPort(node,item,{entity}))].filter(Boolean) : flow(node).links.filter(l=>l.from===item.id);
      return links.every(l=>readyPath(spec(node,l.to)));
    }
    if(!readyPath(entry))return false;
    if(!batchInputAllowed(node,entry,entity))return false;
    const first=outgoing(node,entry);return !!first && free(node,spec(node,first.to),first.input,entity);
  }
  function acknowledge(node,entity,targetId,slot){
    const r=runtime(node),offer=r.offers.find(o=>o.entity.instanceId===entity.instanceId && o.slot===slot);
    if(offer){offer.pending=offer.pending.filter(id=>id!==targetId);if(!offer.pending.length && offer.forkId && !offer.fired){offer.fired=true;fireForkSignals(node,spec(node,offer.forkId),entity,offer.linkId);for(const choice of offer.routeChoices || []){r.routerCursors ||= {};r.routerCursors[choice.id]=choice.next;}r.lastTransferAt=now();}mark(node);}
  }
  function receive(node){
    const r=runtime(node),candidates=[];
    for(let slot=0;slot<(node.inputs || []).length;slot++){
      const entity=node.getInputData(slot);if(!entity){r.last[slot]=null;continue;}if(r.last[slot]===entity.instanceId)continue;
      const link=node.graph.links[node.inputs[slot].link],sender=node.graph.getNodeById(link?.origin_id),offer=sender?._flowRuntime?.offers.find(o=>o.entity.instanceId===entity.instanceId);candidates.push({slot,entity,at:offer?.at ?? now()});
    }
    candidates.sort((a,b)=>a.at-b.at || a.slot-b.slot);
    for(const {slot,entity} of candidates){
      if(!node.canAcceptEntityInput(slot,entity))continue;
      const input=node.inputs[slot],link=node.graph.links[input.link];r.last[slot]=entity.instanceId;
      if(node.properties.role==='sink'){
        node._recv ||= [];node._recv.push({id:entity.id,type:entity.type,typeId:entity.typeId,instanceId:entity.instanceId,t:now(),completedAt:now(),children:store(node).descendantsOf(entity).map(e=>e.instanceId)});
        store(node).destroy(entity,{completed:true,sinkNodeId:node.id,completedAt:now()});
      }else{
        const entry=flow(node).nodes.find(n=>n.kind==='inPort' && n.config.portId===input.portId);
        if(!r.cells.length && !r.offers.length)r.cycle++;
        store(node).moveRoot(entity,node.id);r.cells.push({id:++r.sequence,nodeId:entry.id,input:'',entity,incomingLink:input.link,arrival:entity.arrivalSequence});
      }
      node.graph.getNodeById(link?.origin_id)?.acknowledgeEntityOutput?.(entity,node.id,link.origin_slot);mark(node);
    }
  }
  function release(node,cell,slot,plan){
    const r=runtime(node);let offer=r.offers.find(o=>o.cellId===cell.id);
    if(!offer){
      const links=(node.outputs[slot]?.links || []).map(id=>node.graph.links[id]).filter(Boolean);
      if(links.length!==1){r.reason=links.length ? 'Use entityRouter instead of multiple output connections.' : 'Connect an output destination.';return false;}
      // Publish a held offer even when blocked. Its arrival time stays stable,
      // so a receiver with multiple inputs can honor FIFO and port-order ties.
      offer={cellId:cell.id,slot,entity:cell.entity,pending:links.map(l=>l.target_id),at:now(),...(plan || {}),linkId:links[0].id};r.offers.push(offer);node.setOutputData(slot,cell.entity);
    }
    if(offer.pending.length)return false;
    node.setOutputData(slot,null);r.offers=r.offers.filter(o=>o!==offer);return true;
  }
  function signalBranches(node,item){const signals=App.FlowModel.signalLinks(flow(node));return item.outputs.map((_,i)=>outgoing(node,item,i)).filter(l=>l && signals.has(l));}
  function workBranches(node,item){const signals=App.FlowModel.signalLinks(flow(node));return item.outputs.map((_,i)=>outgoing(node,item,i)).filter(l=>l && !signals.has(l));}
  function branchesFree(node,item){return signalBranches(node,item).every(l=>l && free(node,spec(node,l.to),l.input,null));}
  function fireForkSignals(node,item,entity,linkId){
    const r=runtime(node);r.signals ||= [];
    for(const link of signalBranches(node,item))if(link)r.signals.push({id:++r.sequence,nodeId:link.to,input:link.input,visualEntity:entity,visualLink:linkId});
    recordActivity(node,item);r.lastForkAt=now();drainSignals(node);mark(node);
  }
  function outputPlan(node,cell,first){
    let item=first;const seen=new Set(),routeChoices=[];
    while(item && !seen.has(item.id)){
      seen.add(item.id);
      if(item.kind==='outPort')return {slot:node.outputs.findIndex(p=>p.portId===item.config.portId),flowOutId:item.id,routeChoices};
      if(item.kind!=='entityRouter')return null;
      const port=routerPort(node,item,cell);if(port<0)return null;
      if(item.config.dispatch==='round-robin')routeChoices.push({id:item.id,next:(port+1)%item.outputs.length});
      const edge=outgoing(node,item,port);item=edge && spec(node,edge.to);
    }
    return null;
  }
  function cloneEntityTree(node,entity){
    const s=store(node),copy=s.create(entity.typeId,{locationNodeId:node.id,creationNodeId:node.id,createdAt:now(),legacyId:entity.id,legacyType:entity.type,attributes:App.FlowModel.clone(entity.attributes || {})});
    for(const child of s.childrenOf(entity)){const cloned=cloneEntityTree(node,child),attached=s.attach(cloned,copy);if(!attached.ok)throw new Error(attached.reason);}
    return copy;
  }
  function forkTransferPlan(node,cell,item){
    const leaves=[],forks=[],choices=[];
    function visit(current,path){
      if(!current || path.has(current.id))return false;const next=new Set(path);next.add(current.id);
      if(current.kind==='outPort'){leaves.push({slot:node.outputs.findIndex(p=>p.portId===current.config.portId),flowOutId:current.id});return true;}
      if(current.kind==='entityRouter'){
        const port=routerPort(node,current,cell),edge=port>=0 && outgoing(node,current,port);if(!edge)return false;
        if(current.config.dispatch==='round-robin')choices.push({id:current.id,next:(port+1)%current.outputs.length});return visit(spec(node,edge.to),next);
      }
      if(current.kind!=='fork')return false;
      forks.push(current);const branches=workBranches(node,current);return branches.length>0 && branches.every(l=>visit(spec(node,l.to),next));
    }
    return visit(item,new Set()) ? {leaves,forks:[...new Set(forks)],choices} : null;
  }
  function transferForkGroup(node,cell,plan){
    const r=runtime(node),reserved=new Map(),targets=[];let ready=0;
    try{for(const leaf of plan.leaves){
      const links=node.outputs[leaf.slot]?.links || [],link=links.length===1 && node.graph.links[links[0]],receiver=link && node.graph.getNodeById(link.target_id);
      const available=!!receiver && receiver.canAcceptEntityInput?.(link.target_slot,cell.entity);
      if(available){
        ready++;
        if(receiver.properties.role!=='sink'){
          const rr=runtime(receiver),entry=flow(receiver).nodes.find(n=>n.kind==='inPort' && n.config.portId===receiver.inputs[link.target_slot]?.portId);
          if(!reserved.has(receiver))reserved.set(receiver,rr.cells);
          rr.cells=[...rr.cells,{nodeId:entry.id,input:'',entity:cell.entity}];
        }
      }
      targets.push({...leaf,link,receiver});
    }}finally{for(const [receiver,cells] of reserved)runtime(receiver).cells=cells;}
    const controlsReady=plan.forks.every(f=>branchesFree(node,f));
    r.forkStatus ||= {};for(const f of plan.forks)r.forkStatus[f.id]={waiting:true,ready,total:targets.length};
    if(ready!==targets.length || !controlsReady){r.reason=`Waiting for all Fork outputs (${ready}/${targets.length} ready).`;return false;}
    // Do not create any copies or move any work until every destination is ready.
    const entities=[cell.entity,...targets.slice(1).map(()=>cloneEntityTree(node,cell.entity))];
    r.cells=r.cells.filter(c=>c!==cell);r.duplicated=(r.duplicated || 0)+entities.length-1;
    for(const [index,target] of targets.entries()){
      const entity=entities[index],receiver=target.receiver,rr=runtime(receiver);rr.last[target.link.target_slot]=entity.instanceId;
      if(receiver.properties.role==='sink'){
        receiver._recv ||= [];receiver._recv.push({instanceId:entity.instanceId,id:entity.id,type:entity.type,typeId:entity.typeId,t:now(),completedAt:now(),children:store(node).descendantsOf(entity).map(c=>c.instanceId)});
        store(node).destroy(entity,{completed:true,sinkNodeId:receiver.id,completedAt:now()});
      }else{
        const entry=flow(receiver).nodes.find(n=>n.kind==='inPort' && n.config.portId===receiver.inputs[target.link.target_slot]?.portId);
        if(!rr.cells.length && !rr.offers.length)rr.cycle++;store(node).moveRoot(entity,receiver.id);rr.cells.push({id:++rr.sequence,nodeId:entry.id,input:'',entity,incomingLink:target.link.id,arrival:entity.arrivalSequence});
      }
      recordActivity(node,spec(node,target.flowOutId));mark(receiver);
    }
    for(const f of plan.forks){r.forkStatus[f.id]={waiting:false,ready,total:targets.length};fireForkSignals(node,f,entities[0],targets[0]?.link.id);}
    for(const choice of plan.choices){r.routerCursors ||= {};r.routerCursors[choice.id]=choice.next;}
    r.lastTransferAt=now();r.reason='';mark(node);return true;
  }
  function runFork(node,cell,item){
    const branches=workBranches(node,item),group=forkTransferPlan(node,cell,item);
    if(group && (group.leaves.length>1 || group.forks.length>1))return transferForkGroup(node,cell,group);
    if(!branchesFree(node,item) && !runtime(node).offers.some(o=>o.cellId===cell.id))return false;
    const edge=branches[0],plan=edge && outputPlan(node,cell,spec(node,edge.to));
    if(plan){
      if(!release(node,cell,plan.slot,{...plan,forkId:item.id}))return false;
      runtime(node).cells=runtime(node).cells.filter(c=>c!==cell);mark(node);return true;
    }
    // Internal work branches also receive distinct instances, all at the same time.
    if(!branches.length || !branches.every(l=>free(node,spec(node,l.to),l.input,cell.entity)))return false;
    const entities=[cell.entity,...branches.slice(1).map(()=>cloneEntityTree(node,cell.entity))],r=runtime(node);
    r.cells=r.cells.filter(c=>c!==cell);branches.forEach((l,i)=>r.cells.push({id:++r.sequence,nodeId:l.to,input:l.input,entity:entities[i],incomingLink:cell.incomingLink}));
    r.duplicated=(r.duplicated || 0)+entities.length-1;fireForkSignals(node,item,entities[0],null);mark(node);return true;
  }
  function drainSignals(node){
    const r=runtime(node);r.signals ||= [];let changed=true,budget=512;
    function advance(cell,item,port=0){
      const link=outgoing(node,item,port);if(!link || !free(node,spec(node,link.to),link.input,null,cell))return false;
      recordActivity(node,item,cell);cell.nodeId=link.to;cell.input=link.input;delete cell.startedAt;delete cell.until;delete cell.ready;delete cell.visualId;mark(node);return true;
    }
    while(changed && budget-->0){changed=false;
      for(const cell of r.signals.slice()){
        if(!r.signals.includes(cell))continue;const item=spec(node,cell.nodeId);if(!item)continue;
        if(item.kind==='process' || item.kind==='recovery'){
          if(cell.startedAt===undefined){cell.startedAt=now();cell.until=now()+item.config.seconds*1000;startSignalVisual(node,cell,item);mark(node);}
          if(now()>=cell.until){cell.ready=true;changed=advance(cell,item) || changed;}
        }else if(item.kind==='fork'){
          const links=item.outputs.map((_,i)=>outgoing(node,item,i));
          if(links.every(l=>l && free(node,spec(node,l.to),l.input,null,cell))){recordActivity(node,item);r.signals=r.signals.filter(c=>c!==cell);for(const l of links)r.signals.push({id:++r.sequence,nodeId:l.to,input:l.input});mark(node);changed=true;}
        }else if(item.kind==='join' && cell.input===item.inputs[0].id && joinReady(node,item)){
          if(advance(cell,item)){r.signals=r.signals.filter(c=>c===cell || c.nodeId!==item.id);changed=true;}
        }
      }
    }
    if(budget<=0)r.error='Completion signals exceeded the same-time transition limit.';
  }
  function startSignalVisual(node,cell,item){
    const link=node.graph.links[cell.visualLink];
    if(!cell.visualEntity || !link || node.graph.getNodeById(link.target_id)?.properties.role!=='sink')return;
    const r=runtime(node),visual={id:`${node.id}:signal:${cell.id}`,entityId:cell.visualEntity.instanceId,entity:cell.visualEntity,cellId:cell.id,linkId:link.id,kind:item.kind,phaseNodes:[item.id],history:[],signal:true};
    r.visuals.push(visual);cell.visualId=visual.id;if(r.visuals.length>128)r.visuals.splice(0,r.visuals.length-128);
  }
  function startVisual(node,cell,item){
    const r=runtime(node),path=[];let cursor=item,linkId=cell.incomingLink;
    while(cursor && !path.includes(cursor)){path.push(cursor);const port=cursor.kind==='entityRouter' ? routerPort(node,cursor,cell) : 0;const link=outgoing(node,cursor,port);cursor=link && spec(node,link.to);}
    if(item.kind==='recovery'){linkId=null;const end=path.find(n=>n.kind==='outPort');if(end){const slot=node.outputs.findIndex(p=>p.portId===end.config.portId),id=node.outputs[slot]?.links?.[0],link=node.graph.links[id];if(link && node.graph.getNodeById(link.target_id)?.properties.role==='sink')linkId=id;}}
    if(linkId==null)return;
    let visual=r.visuals.findLast(v=>v.entityId===cell.entity.instanceId && v.linkId===linkId && v.cellId===cell.id);
    if(!visual){visual={id:`${node.id}:${r.cycle}:${cell.id}:${item.kind}`,entityId:cell.entity.instanceId,entity:cell.entity,cellId:cell.id,linkId,kind:item.kind,phaseNodes:path.filter(n=>n.kind===item.kind).map(n=>n.id),history:[]};r.visuals.push(visual);if(r.visuals.length>128)r.visuals.splice(0,r.visuals.length-128);}
    cell.visualId=visual.id;
  }
  function source(node){
    const r=runtime(node),config=node.properties.source || {},entries=config.entries || [],list=entries.flatMap(e=>Array(Math.max(1,e.count || 1)).fill(e));
    const occupied=r.cells[0];
    if(occupied){if(release(node,occupied,0)){r.cells=[];r.nextAt=now()+Math.max(0,(config.intervalSec || 0)*1000);node._sent=(node._sent || 0)+1;mark(node);}return;}
    if(!list.length || now()<r.nextAt || config.repeat===false && r.created>=list.length)return;
    const entry=list[r.created%list.length],type=App.entityModelForGraph(node.graph).get(entry.typeId);if(!type){r.error='Select a valid source Entity Type.';return;}
    const entity=store(node).create(type.typeId,{locationNodeId:node.id,createdAt:now()});
    function children(parent,rows){for(const row of rows || [])for(let i=0;i<(row.count || row.quantity || 1);i++){const child=store(node).create(row.typeId,{createdAt:now(),creationNodeId:node.id});const result=store(node).attach(child,parent);if(!result.ok)throw new Error(result.reason);children(child,row.children);}}
    children(entity,entry.children);r.created++;r.cells.push({id:++r.sequence,nodeId:'source',entity});mark(node);
  }
  function syncGroups(graph){
    if(graph.__flowSyncCommitting)return;graph.__flowSyncCommitting=true;
    try{for(const group of graph.extra?.syncroGroups || []){
      const members=[];for(const node of graph._nodes || [])for(const item of flow(node)?.nodes || [])if(item.kind==='syncroJudgment' && item.config.groupId===group.id)members.push({node,item,cell:runtime(node).cells.find(c=>c.nodeId===item.id)});
      if(!members.length || members.some(m=>!m.cell || runtime(m.node).error || !canMove(m.node,m.cell)))continue;
      const plans=members.map(m=>{
        const edge=outgoing(m.node,m.item),target=spec(m.node,edge.to),fork=target.kind==='fork' ? target : null;
        if(fork && !branchesFree(m.node,fork))return null;
        const first=fork ? spec(m.node,outgoing(m.node,fork)?.to) : target,output=outputPlan(m.node,m.cell,first);
        if(!output)return {...m,internal:true};
        const links=m.node.outputs[output.slot]?.links || [];if(links.length!==1)return null;
        const link=graph.links[links[0]],receiver=graph.getNodeById(link.target_id),entry=flow(receiver)?.nodes.find(n=>n.kind==='inPort' && n.config.portId===receiver.inputs[link.target_slot]?.portId);
        return {...m,receiver,entry,link,fork,output};
      });
      if(plans.some(p=>!p))continue;
      const leaving=new Set(plans.filter(p=>!p.internal).map(p=>p.cell)),reserved=new Set(),originals=new Map(),signalOriginals=new Map();let ready=true;
      // Admission uses the same rules as ordinary transfers, with all departing
      // batches considered vacant. No Entity is moved during this preflight.
      try{
        for(const p of plans)if(!p.internal && !originals.has(p.receiver)){
          const rr=runtime(p.receiver);originals.set(p.receiver,rr.cells);rr.cells=rr.cells.filter(c=>!leaving.has(c));signalOriginals.set(p.receiver,rr.signals);rr.signals=(rr.signals || []).slice();
          const departing=plans.find(q=>q.node===p.receiver && q.fork);
          if(departing)for(const edge of signalBranches(p.receiver,departing.fork)){const timer=spec(p.receiver,edge?.to),back=timer && outgoing(p.receiver,timer);if(timer?.kind==='recovery' && timer.config.seconds===0 && spec(p.receiver,back?.to)?.kind==='join')rr.signals.push({nodeId:back.to,input:back.input});}
        }
        for(const p of plans){if(p.internal)continue;const key=p.receiver.properties.role==='sink' ? p.receiver.id+':'+p.link.target_slot : p.receiver.id;
          if(reserved.has(key) || !p.receiver.canAcceptEntityInput?.(p.link.target_slot,p.cell.entity)){ready=false;break;}reserved.add(key);
        }
      }finally{for(const [receiver,cells] of originals){runtime(receiver).cells=cells;runtime(receiver).signals=signalOriginals.get(receiver);}}
      if(!ready)continue;
      // Remove every outgoing batch before admitting any new batch, including rings.
      for(const p of plans)if(!p.internal){recordActivity(p.node,p.item,p.cell);runtime(p.node).cells=runtime(p.node).cells.filter(c=>c!==p.cell);}
      for(const p of plans)if(!p.internal && p.fork){fireForkSignals(p.node,p.fork,p.cell.entity,p.link.id);for(const choice of p.output.routeChoices){runtime(p.node).routerCursors ||= {};runtime(p.node).routerCursors[choice.id]=choice.next;}}
      for(const p of plans){if(p.internal){move(p.node,p.cell);continue;}const rr=runtime(p.receiver),entity=p.cell.entity;
        if(p.receiver.properties.role==='sink'){p.receiver._recv ||= [];p.receiver._recv.push({instanceId:entity.instanceId,id:entity.id,type:entity.type,typeId:entity.typeId,t:now(),completedAt:now(),children:store(p.node).descendantsOf(entity).map(c=>c.instanceId)});store(p.node).destroy(entity,{completed:true,sinkNodeId:p.receiver.id,completedAt:now()});}
        else{store(p.node).moveRoot(entity,p.receiver.id);rr.cycle++;rr.cells.push({id:++rr.sequence,nodeId:p.entry.id,input:'',entity,incomingLink:p.link.id});}mark(p.node);mark(p.receiver);
      }
    }}finally{graph.__flowSyncCommitting=false;}
  }
  function updateState(node){
    const r=runtime(node),timed=activeCells(node).filter(c=>c.until!==undefined && c.until>now()),first=r.cells[0];
    node._state=r.error ? 'ERROR' : timed.some(c=>spec(node,c.nodeId)?.kind==='process') ? 'PROCESS' : timed.length ? 'RECOVERY' : first || r.offers.length ? 'WAIT' : 'IDLE';
    node._stateName=node._state.toLowerCase();const until=timed.length ? Math.min(...timed.map(c=>c.until)) : 0;if(node._until!==until)node._until=until;
    node._payload=first?.entity?.locationNodeId===node.id ? first.entity : null;node._currentWork=node._payload;root.applyNodeStateTheme?.(node,node._state);
  }
  function execute(node){
    const r=runtime(node);r.reason='';r.lastTime=now();
    if(node.properties.role==='source'){source(node);updateState(node);return;}
    if(node.properties.role==='sink'){receive(node);updateState(node);return;}
    if(!r.checked){r.error=App.FlowModel.validate(flow(node),node).join(' ');r.checked=true;}if(r.error){updateState(node);return;}
    initializeControls(node);drainSignals(node);
    if(!r.initialized){r.initialized=true;const entry=flow(node).nodes.find(n=>n.id===node.properties.initialFlowNodeId) || flow(node).nodes.find(n=>n.kind==='inPort');if(entry)for(const entity of store(node).rootsAt(node.id))r.cells.push({id:++r.sequence,nodeId:entry.id,input:entry.inputs[0]?.id || '',entity});}
    receive(node);
    let progress=true,budget=512;
    while(progress && budget-->0){progress=false;
      for(const cell of r.cells.slice()){
        if(!r.cells.includes(cell))continue;const item=spec(node,cell.nodeId);if(!item){r.error='Flow node is missing. Reset the simulation.';break;}
        if(item.kind==='inPort')progress=move(node,cell) || progress;
        else if(item.kind==='join'){
          progress=runJoin(node,cell,item) || progress;
        }else if(item.kind==='fork')progress=runFork(node,cell,item) || progress;
        else if(item.kind==='process' || item.kind==='recovery'){
          if(cell.startedAt===undefined){cell.startedAt=now();cell.until=now()+item.config.seconds*1000;startVisual(node,cell,item);}
          if(now()>=cell.until){cell.ready=true;progress=move(node,cell) || progress;}
        }else if(item.kind==='entityRouter'){
          const port=routerPort(node,item,cell);
          if(port<0)r.reason=`No output for ${cell.entity.type || cell.entity.typeId}.`;
          else if(move(node,cell,port)){
            if(item.config.dispatch==='round-robin'){r.routerCursors ||= {};r.routerCursors[item.id]=(port+1)%item.outputs.length;}
            progress=true;
          }
        }else if(item.kind==='outPort'){
          const slot=node.outputs.findIndex(p=>p.portId===item.config.portId);if(release(node,cell,slot)){r.cells=r.cells.filter(c=>c!==cell);mark(node);progress=true;}
        }else if(item.kind==='Palletizing'){
          if(cell.input!==item.inputs[0].id)continue;
          const type=store(node).typeOf(cell.entity),child=r.cells.find(c=>c.nodeId===item.id && c.input===item.inputs[1].id);
          if(!type?.capacity){r.reason='Parent Entity Type needs a positive capacity.';continue;}
          if(child){const result=store(node).attach(child.entity,cell.entity);if(result.ok){r.cells=r.cells.filter(c=>c!==child);mark(node);progress=true;}else r.reason=result.reason;}
          if(store(node).childrenOf(cell.entity).length>=type.capacity)progress=move(node,cell) || progress;
        }else if(item.kind==='DePalletizing'){
          const child=store(node).childrenOf(cell.entity)[0];
          if(child){const link=outgoing(node,item,1),target=link && spec(node,link.to);if(target && free(node,target,link.input,child)){
            store(node).detach(child);r.cells.push({id:++r.sequence,nodeId:target.id,input:link.input,entity:child,incomingLink:cell.incomingLink});progress=true;
          }}else if(!r.cells.some(c=>c!==cell) && !r.offers.length)progress=move(node,cell,0) || progress;
        }
      }
    }
    if(budget<=0)r.error='Flow exceeded the same-time transition limit.';
    syncGroups(node.graph);updateState(node);
  }
  function retime(node){
    const r=runtime(node);r.checked=false;
    for(const cell of activeCells(node)){const item=spec(node,cell.nodeId);if(cell.startedAt===undefined || !item || !['process','recovery'].includes(item.kind))continue;cell.ready=false;cell.until=cell.startedAt+item.config.seconds*1000;}
    execute(node);mark(node);
  }
  function eventUntil(node){const r=runtime(node);if(r.error)return NaN;const times=activeCells(node).filter(c=>!c.ready && Number.isFinite(c.until)).map(c=>Math.max(now(),c.until));const config=node.properties.source,quantity=config?.entries.reduce((n,e)=>n+(e.count || 1),0) || 0;if(node.properties.role==='source' && !r.cells.length && quantity && (config.repeat!==false || r.created<quantity))times.push(Math.max(now(),r.nextAt));return times.length ? Math.min(...times) : NaN;}
  function capture(graph,data={}){const s=App.runtimeInstancesForGraph(graph);data.__factSimEntityModel=App.entityModelForGraph(graph).serialize();data.__flowRuntime={time:now(),instances:[...s.instances.values()],typeSequences:[...s.typeSequences],arrivalSequence:s.arrivalSequence,completed:s.completed,nodes:(graph._nodes || []).filter(n=>n.type==='factory/basic').map(n=>({id:n.id,state:n._state,stateName:n._stateName,until:n._until,runtime:n._flowRuntime,recv:n._recv,sent:n._sent,outputs:(n.outputs || []).map((p,slot)=>n._flowRuntime?.offers.find(o=>o.slot===slot && o.pending.length)?.entity || p._data)}))};return App.FlowModel.clone(data);}
  function restore(graph,data){const snapshot=data?.__flowRuntime;if(!snapshot)return;const s=App.runtimeInstancesForGraph(graph);s.clear();s.instances=new Map(snapshot.instances.map(e=>[e.instanceId,e]));s.typeSequences=new Map(snapshot.typeSequences);s.arrivalSequence=snapshot.arrivalSequence;s.completed=snapshot.completed;for(const e of s.instances.values())if(e.parentId===null && e.locationNodeId!=null)s._addRoot(e.locationNodeId,e.instanceId);
    for(const row of snapshot.nodes){const node=graph.getNodeById(row.id);if(!node)continue;node._flowRuntime=row.runtime;node._recv=row.recv;node._sent=row.sent;for(const c of node._flowRuntime?.cells || [])c.entity=s.get(c.entity);for(const o of node._flowRuntime?.offers || [])o.entity=s.get(o.entity);row.outputs.forEach((e,i)=>node.setOutputData(i,e ? s.get(e) : null));node._state=row.state;node._stateName=row.stateName;node._until=row.until;node._payload=node._flowRuntime?.cells[0]?.entity || null;node._currentWork=node._payload;root.applyNodeStateTheme?.(node,node._state);}s.revision++;
  }
  App.FlowRuntime={runtime,execute,canAccept,acknowledge,retime,eventUntil,updateState,capture,restore,activeCells,isActive,joinWorkInputs,sameWork};
})(typeof window==='undefined' ? globalThis : window);
