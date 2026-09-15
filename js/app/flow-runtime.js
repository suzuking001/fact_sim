(function(root){
  'use strict';
  const App=root.App=root.App || {},now=()=>Number(root.simNow?.()) || 0;
  const store=node=>App.runtimeInstancesForGraph(node.graph);
  const flow=node=>node?.properties?.flow;
  const spec=(node,id)=>flow(node)?.nodes.find(n=>n.id===id);
  function runtime(node){return node._flowRuntime ||= {cells:[],offers:[],last:[],sequence:0,nextAt:0,created:0,cycle:0,visuals:[],error:'',lastTime:now()};}
  function mark(node){runtime(node).revision=(runtime(node).revision || 0)+1;if(!node.graph)return;node.graph.__outputDirty=true;node.graph.__dirtyNodeIds ||= new Set();node.graph.__dirtyNodeIds.add(node.id);for(const input of node.inputs || []){const link=node.graph.links[input.link];if(link)node.graph.__dirtyNodeIds.add(link.origin_id);}}
  function outgoing(node,item,port=0){return flow(node).links.find(l=>l.from===item.id && l.output===item.outputs[port]?.id);}
  function routerPort(node,item,cell){
    if(item.config.dispatch==='round-robin')return (runtime(node).routerCursors?.[item.id] || 0)%item.outputs.length;
    const port=item.outputs.findIndex(p=>p.typeId===cell.entity.typeId);
    return port<0 ? item.outputs.findIndex(p=>p.typeId==='anyType') : port;
  }
  function free(node,target,input,entity,ignore){
    if(!target)return false;
    const cells=runtime(node).cells.filter(c=>c!==ignore && c.nodeId===target.id);
    if(target.kind==='Palletizing'){
      const parent=cells.find(c=>c.input===target.inputs[0].id);
      if(input===target.inputs[0].id){const type=entity && store(node).typeOf(entity);if(entity && !type?.capacity){runtime(node).reason='Parent Entity Type needs a positive capacity.';return false;}return cells.length===0;}
      if(!parent || cells.some(c=>c.input===input))return false;
      return store(node).canAttach(entity,parent.entity).ok;
    }
    return cells.length===0;
  }
  function canMove(node,cell,port=0){const item=spec(node,cell.nodeId),link=item && outgoing(node,item,port);return !!link && free(node,spec(node,link.to),link.input,cell.entity,cell);}
  function move(node,cell,port=0){
    const item=spec(node,cell.nodeId),link=item && outgoing(node,item,port);if(!link || !free(node,spec(node,link.to),link.input,cell.entity,cell))return false;
    if(cell.startedAt!==undefined && cell.visualId){const visual=runtime(node).visuals.find(v=>v.id===cell.visualId);if(visual)visual.history.push({nodeId:cell.nodeId,startedAt:cell.startedAt,until:cell.until});}
    cell.nodeId=link.to;cell.input=link.input;delete cell.startedAt;delete cell.until;delete cell.ready;delete cell.visualId;mark(node);return true;
  }
  function batchInputAllowed(node,entry,entity){
    const r=runtime(node);
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
    if(!batchInputAllowed(node,entry,entity))return false;
    const first=outgoing(node,entry);return !!first && free(node,spec(node,first.to),first.input,entity);
  }
  function acknowledge(node,entity,targetId,slot){
    const r=runtime(node),offer=r.offers.find(o=>o.entity.instanceId===entity.instanceId && o.slot===slot);
    if(offer){offer.pending=offer.pending.filter(id=>id!==targetId);mark(node);}
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
  function release(node,cell,slot){
    const r=runtime(node);let offer=r.offers.find(o=>o.cellId===cell.id);
    if(!offer){
      const links=(node.outputs[slot]?.links || []).map(id=>node.graph.links[id]).filter(Boolean);
      if(links.length!==1){r.reason=links.length ? 'Use entityRouter instead of multiple output connections.' : 'Connect an output destination.';return false;}
      // Publish a held offer even when blocked. Its arrival time stays stable,
      // so a receiver with multiple inputs can honor FIFO and port-order ties.
      offer={cellId:cell.id,slot,entity:cell.entity,pending:links.map(l=>l.target_id),at:now()};r.offers.push(offer);node.setOutputData(slot,cell.entity);
    }
    if(offer.pending.length)return false;
    node.setOutputData(slot,null);r.offers=r.offers.filter(o=>o!==offer);return true;
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
      const plans=members.map(m=>{const edge=outgoing(m.node,m.item),target=spec(m.node,edge.to);if(target.kind!=='outPort')return {...m,internal:true};const slot=m.node.outputs.findIndex(p=>p.portId===target.config.portId),links=m.node.outputs[slot]?.links || [];if(links.length!==1)return null;const link=graph.links[links[0]],receiver=graph.getNodeById(link.target_id),entry=flow(receiver)?.nodes.find(n=>n.kind==='inPort' && n.config.portId===receiver.inputs[link.target_slot]?.portId);return {...m,receiver,entry,link};});
      if(plans.some(p=>!p))continue;
      const leaving=new Set(plans.filter(p=>!p.internal).map(p=>p.cell)),reserved=new Set(),originals=new Map();let ready=true;
      // Admission uses the same rules as ordinary transfers, with all departing
      // batches considered vacant. No Entity is moved during this preflight.
      try{
        for(const p of plans)if(!p.internal && !originals.has(p.receiver)){const rr=runtime(p.receiver);originals.set(p.receiver,rr.cells);rr.cells=rr.cells.filter(c=>!leaving.has(c));}
        for(const p of plans){if(p.internal)continue;const key=p.receiver.properties.role==='sink' ? p.receiver.id+':'+p.link.target_slot : p.receiver.id;
          if(reserved.has(key) || !p.receiver.canAcceptEntityInput?.(p.link.target_slot,p.cell.entity)){ready=false;break;}reserved.add(key);
        }
      }finally{for(const [receiver,cells] of originals)runtime(receiver).cells=cells;}
      if(!ready)continue;
      // Remove every outgoing batch before admitting any new batch, including rings.
      for(const p of plans)if(!p.internal)runtime(p.node).cells=runtime(p.node).cells.filter(c=>c!==p.cell);
      for(const p of plans){if(p.internal){move(p.node,p.cell);continue;}const rr=runtime(p.receiver),entity=p.cell.entity;
        if(p.receiver.properties.role==='sink'){p.receiver._recv ||= [];p.receiver._recv.push({instanceId:entity.instanceId,id:entity.id,type:entity.type,typeId:entity.typeId,t:now(),completedAt:now(),children:store(p.node).descendantsOf(entity).map(c=>c.instanceId)});store(p.node).destroy(entity,{completed:true,sinkNodeId:p.receiver.id,completedAt:now()});}
        else{store(p.node).moveRoot(entity,p.receiver.id);rr.cycle++;rr.cells.push({id:++rr.sequence,nodeId:p.entry.id,input:'',entity,incomingLink:p.link.id});}mark(p.node);mark(p.receiver);
      }
    }}finally{graph.__flowSyncCommitting=false;}
  }
  function updateState(node){
    const r=runtime(node),timed=r.cells.filter(c=>c.until!==undefined && c.until>now()),first=r.cells[0];
    node._state=r.error ? 'ERROR' : timed.some(c=>spec(node,c.nodeId)?.kind==='process') ? 'PROCESS' : timed.length ? 'RECOVERY' : first || r.offers.length ? 'WAIT' : 'IDLE';
    node._stateName=node._state.toLowerCase();const until=timed.length ? Math.min(...timed.map(c=>c.until)) : 0;if(node._until!==until)node._until=until;
    node._payload=first?.entity || null;node._currentWork=node._payload;root.applyNodeStateTheme?.(node,node._state);
  }
  function execute(node){
    const r=runtime(node);r.reason='';r.lastTime=now();
    if(node.properties.role==='source'){source(node);updateState(node);return;}
    if(node.properties.role==='sink'){receive(node);updateState(node);return;}
    if(!r.checked){r.error=App.FlowModel.validate(flow(node),node).join(' ');r.checked=true;}if(r.error){updateState(node);return;}
    if(!r.initialized){r.initialized=true;const entry=flow(node).nodes.find(n=>n.id===node.properties.initialFlowNodeId) || flow(node).nodes.find(n=>n.kind==='inPort');if(entry)for(const entity of store(node).rootsAt(node.id))r.cells.push({id:++r.sequence,nodeId:entry.id,input:entry.inputs[0]?.id || '',entity});}
    receive(node);
    let progress=true,budget=512;
    while(progress && budget-->0){progress=false;
      for(const cell of r.cells.slice()){
        if(!r.cells.includes(cell))continue;const item=spec(node,cell.nodeId);if(!item){r.error='Flow node is missing. Reset the simulation.';break;}
        if(item.kind==='inPort')progress=move(node,cell) || progress;
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
    for(const cell of r.cells){const item=spec(node,cell.nodeId);if(cell.startedAt===undefined || !item || !['process','recovery'].includes(item.kind))continue;cell.ready=false;cell.until=cell.startedAt+item.config.seconds*1000;}
    execute(node);mark(node);
  }
  function eventUntil(node){const r=runtime(node);if(r.error)return NaN;const times=r.cells.filter(c=>!c.ready && Number.isFinite(c.until)).map(c=>Math.max(now(),c.until));const config=node.properties.source,quantity=config?.entries.reduce((n,e)=>n+(e.count || 1),0) || 0;if(node.properties.role==='source' && !r.cells.length && quantity && (config.repeat!==false || r.created<quantity))times.push(Math.max(now(),r.nextAt));return times.length ? Math.min(...times) : NaN;}
  function capture(graph,data={}){const s=App.runtimeInstancesForGraph(graph);data.__factSimEntityModel=App.entityModelForGraph(graph).serialize();data.__flowRuntime={time:now(),instances:[...s.instances.values()],typeSequences:[...s.typeSequences],arrivalSequence:s.arrivalSequence,completed:s.completed,nodes:(graph._nodes || []).filter(n=>n.type==='factory/basic').map(n=>({id:n.id,state:n._state,stateName:n._stateName,until:n._until,runtime:n._flowRuntime,recv:n._recv,sent:n._sent,outputs:(n.outputs || []).map((p,slot)=>n._flowRuntime?.offers.find(o=>o.slot===slot && o.pending.length)?.entity || p._data)}))};return App.FlowModel.clone(data);}
  function restore(graph,data){const snapshot=data?.__flowRuntime;if(!snapshot)return;const s=App.runtimeInstancesForGraph(graph);s.clear();s.instances=new Map(snapshot.instances.map(e=>[e.instanceId,e]));s.typeSequences=new Map(snapshot.typeSequences);s.arrivalSequence=snapshot.arrivalSequence;s.completed=snapshot.completed;for(const e of s.instances.values())if(e.parentId===null && e.locationNodeId!=null)s._addRoot(e.locationNodeId,e.instanceId);
    for(const row of snapshot.nodes){const node=graph.getNodeById(row.id);if(!node)continue;node._flowRuntime=row.runtime;node._recv=row.recv;node._sent=row.sent;for(const c of node._flowRuntime?.cells || [])c.entity=s.get(c.entity);for(const o of node._flowRuntime?.offers || [])o.entity=s.get(o.entity);row.outputs.forEach((e,i)=>node.setOutputData(i,e ? s.get(e) : null));node._state=row.state;node._stateName=row.stateName;node._until=row.until;node._payload=node._flowRuntime?.cells[0]?.entity || null;node._currentWork=node._payload;root.applyNodeStateTheme?.(node,node._state);}s.revision++;
  }
  App.FlowRuntime={runtime,execute,canAccept,acknowledge,retime,eventUntil,updateState,capture,restore};
})(typeof window==='undefined' ? globalThis : window);
