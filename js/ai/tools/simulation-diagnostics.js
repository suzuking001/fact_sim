(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  const now=()=>Number(root.simNow?.()) || 0,wall=()=>performance.now();
  function allNodes(){if(!App.graph)throw new Error('No FactSim model is loaded.');return App.graph._nodes.filter(Boolean);}
  function runtimeRows(selected=allNodes()){
    return selected.map(node=>{
      const r=node._flowRuntime || {},cells=r.cells || [],signals=r.signals || [],offers=r.offers || [];
      const timed=[...cells,...signals].filter(cell=>!cell.ready && Number.isFinite(cell.until)).map(cell=>cell.until).filter(time=>time>now());
      const nextSource=Number(r.sourceSequence?.nextAt ?? r.nextAt);if(nextSource>now())timed.push(nextSource);
      return {id:node.id,name:String(node.title || ''),role:String(node.properties?.role || ''),state:String(node._state || node._stateName || 'unknown'),sent:Number(node._sent) || 0,completed:node._recv?.length || 0,cells:cells.length,signals:signals.length,offers:offers.length,pendingNodeIds:[...new Set(offers.flatMap(offer=>offer.pending || []))],reason:String(r.reason || ''),error:String(r.error || ''),nextTimedSeconds:timed.length ? Math.min(...timed)/1000 : null,lastTransferSeconds:Number.isFinite(r.lastTransferAt) ? r.lastTransferAt/1000 : null,flowCells:cells.slice(0,6).map(cell=>({flowNodeId:cell.nodeId,kind:node.properties?.flow?.nodes?.find(item=>item.id===cell.nodeId)?.kind || null,input:cell.input || null,untilSeconds:Number.isFinite(cell.until) ? cell.until/1000 : null,ready:!!cell.ready})),source:node.properties?.role==='source' ? {repeat:node.properties.source?.repeat!==false,quantity:(node.properties.source?.entries || []).reduce((count,entry)=>count+(Number(entry.count) || 1),0),created:Number(r.sourceSequence?.created ?? r.created) || 0} : null};
    });
  }
  function reachable(starts,adjacency){const seen=new Set(starts),queue=[...starts];for(let i=0;i<queue.length;i++)for(const next of adjacency.get(queue[i]) || [])if(!seen.has(next)){seen.add(next);queue.push(next);}return seen;}
  function waitCycles(rows){
    const adjacency=new Map(rows.map(row=>[row.id,row.pendingNodeIds])),found=new Map();
    // Only actual pending transfers are inspected, not every structural loop.
    for(const row of rows)for(const target of row.pendingNodeIds){
      const queue=[[target]],seen=new Set([target]);
      for(let i=0;i<queue.length;i++){
        const path=queue[i],last=path[path.length-1];
        if(last===row.id){const ids=[...new Set([row.id,...path])].sort((a,b)=>String(a).localeCompare(String(b)));found.set(JSON.stringify(ids),ids);break;}
        for(const next of adjacency.get(last) || [])if(!seen.has(next)){seen.add(next);queue.push([...path,next]);}
      }
      if(found.size>=10)return [...found.values()];
    }
    return [...found.values()];
  }
  function report(input={}){
    const started=wall(),rows=runtimeRows(),links=Object.values(App.graph.links || {}).filter(Boolean),ids=new Set(rows.map(row=>row.id));
    const out=new Map(rows.map(row=>[row.id,[]])),ins=new Map(rows.map(row=>[row.id,[]])),invalid=[];
    for(const link of links){if(!ids.has(link.origin_id) || !ids.has(link.target_id)){invalid.push(link.id);continue;}out.get(link.origin_id).push(link.target_id);ins.get(link.target_id).push(link.origin_id);}
    const sources=rows.filter(row=>row.role==='source'),sinks=rows.filter(row=>row.role==='sink'),fromSources=reachable(sources.map(row=>row.id),out),toSinks=reachable(sinks.map(row=>row.id),ins),stateCounts={};
    for(const row of rows)stateCounts[row.state]=(stateCounts[row.state] || 0)+1;
    const duplicates=new Map();for(const row of rows){const list=duplicates.get(row.name) || [];list.push(row.id);duplicates.set(row.name,list);}
    const suspects=rows.filter(row=>row.error || row.reason || row.pendingNodeIds.length || /wait/i.test(row.state)).sort((a,b)=>(!!b.error-!!a.error) || b.pendingNodeIds.length-a.pendingNodeIds.length || b.cells-a.cells);
    const detailLimit=Math.floor(input.detailLimit ?? 20),cycles=waitCycles(rows);
    const result={success:true,source:'Measured FactSim graph/runtime snapshot',simTimeSeconds:now()/1000,mode:App.getSimMode?.() || App.simMode || null,running:!!root.isSimRunning?.(),nodeCount:rows.length,edgeCount:links.length,stateCounts,kpis:AI.FactSimTools.getKpis(),runtimeTotals:{cells:rows.reduce((sum,row)=>sum+row.cells,0),offers:rows.reduce((sum,row)=>sum+row.offers,0),signals:rows.reduce((sum,row)=>sum+row.signals,0),pendingTransfers:rows.reduce((sum,row)=>sum+row.pendingNodeIds.length,0)},issues:{runtimeErrors:rows.filter(row=>row.error).map(row=>({nodeId:row.id,error:row.error})),invalidLinkIds:invalid,unreachableFromSources:rows.filter(row=>row.role && row.role!=='source' && !fromSources.has(row.id)).map(row=>row.id),cannotReachSink:rows.filter(row=>row.role && row.role!=='sink' && !toSinks.has(row.id)).map(row=>row.id),pendingTransferCycles:cycles,duplicateNames:[...duplicates].filter(([,list])=>list.length>1).map(([name,list])=>({name,nodeIds:list}))},suspectCount:suspects.length,suspects:suspects.slice(0,detailLimit),suspectsTruncated:suspects.length>detailLimit,limitations:['WAIT states, missing sink paths and pending transfer cycles are candidates, not proof of deadlock.','Snapshot does not measure real-time performance; use profile_simulation.','Event heap/queue size is not exposed by this diagnostic; do not invent event counts.']};
    if(input.includeGraph!==false)result.graph={nodes:rows.slice(0,500).map(({id,name,role,state,sent,completed})=>({id,name,role,state,sent,completed})),edgeColumns:['linkId','fromNodeId','toNodeId','fromPort','toPort'],edges:links.slice(0,2000).map(link=>[link.id,link.origin_id,link.target_id,link.origin_slot,link.target_slot]),truncated:rows.length>500 || links.length>2000};
    result.readWallMs=wall()-started;return result;
  }
  function activity(){
    const all=allNodes();
    return JSON.stringify(all.map(node=>{
      const r=node._flowRuntime || {};
      return [node.id,node._sent || 0,node._recv?.length || 0,r.created,r.cycle,r.sequence,r.lastTransferAt,r.sourceSequence?.created,(r.cells || []).map(cell=>[cell.id,cell.nodeId,cell.input,cell.until,cell.ready]),(r.signals || []).map(cell=>[cell.id,cell.nodeId,cell.input,cell.until,cell.ready]),(r.offers || []).map(offer=>[offer.cellId,offer.slot,offer.pending])];
    }));
  }
  async function profile(input={},context={}){
    allNodes();if(root.isSimRunning?.())throw new Error('Stop the current simulation before profiling. Use get_simulation_report to inspect a running model without stopping it.');
    if(input.resetBeforeRun)App.resetSimulationForFlowEdit?.(App.graph);
    const duration=Number(input.durationSeconds ?? 1200),budgetMs=(input.maxWallSeconds ?? 15)*1000,stallSeconds=input.stallWindowSeconds ?? 100;
    const started=wall(),startMs=now(),target=startMs+duration*1000,mode=App.getSimMode?.() || App.simMode || null;
    let steps=0,updateWallMs=0,maxUpdateWallMs=0,startupWallMs=0,stopAndRenderWallMs=0,reason='target_reached',failure=null,unchangedSince=startMs,noClockSteps=0,signature=activity(),lastSample=startMs,lastYield=started;
    const samples=[],initialCompleted=AI.FactSimTools.getKpis().totalCompleted;
    function sample(){const kpi=AI.FactSimTools.getKpis(),elapsed=wall()-started;const point={simTimeSeconds:now()/1000,wallSeconds:elapsed/1000,steps,completed:kpi.totalCompleted,simSecondsPerWallSecond:elapsed>0 ? ((now()-startMs)/1000)/(elapsed/1000) : null};samples.push(point);if(samples.length>32)samples.splice(1,1);context.onProgress?.({...point,targetSeconds:target/1000});}
    try{
      if(context.signal?.aborted)throw new DOMException('Profiling was stopped.','AbortError');
      const startup=wall();root.startSimulation();root.stopSimLoop();startupWallMs=wall()-startup;
      if(!App.engine?.update)throw new Error('Selected engine could not start.');
      sample();
      while(now()<target){
        if(context.signal?.aborted){reason='cancelled';break;}
        if(wall()-started>=budgetMs){reason='wall_time_budget';break;}
        const prior=now(),tick=wall();App.engine.update(Math.min(1000,target-prior));const cost=wall()-tick;updateWallMs+=cost;maxUpdateWallMs=Math.max(maxUpdateWallMs,cost);steps++;
        noClockSteps=now()<=prior ? noClockSteps+1 : 0;if(noClockSteps>=3){reason='simulation_clock_not_advancing';break;}
        if(now()-lastSample>=25000){
          const next=activity();if(next!==signature){signature=next;unchangedSince=now();}lastSample=now();sample();
          if((now()-unchangedSince)/1000>=stallSeconds){const rows=runtimeRows(),active=rows.some(row=>row.cells || row.signals || row.offers),future=rows.some(row=>row.nextTimedSeconds!=null && row.nextTimedSeconds>now()/1000);if(active && !future){reason='no_activity_progress';break;}}
        }
        if(wall()-lastYield>=12 || steps%20===0){await new Promise(resolve=>setTimeout(resolve,0));lastYield=wall();}
        if(steps>=100000){reason='step_budget';break;}
      }
    }catch(error){if(error.name==='AbortError')reason='cancelled';else{reason='engine_error';failure=String(error.message || error);}}
    finally{const stop=wall();try{root.stopSimulation();}catch(error){failure ||= String(error.message || error);}stopAndRenderWallMs=wall()-stop;}
    return finish();
    function finish(){
      sample();const measured=report({detailLimit:input.detailLimit ?? 20,includeGraph:false}),wallMs=wall()-started;
      return {success:!failure,partial:reason!=='target_reached',stopReason:reason,error:failure,source:'Measured selected-engine stepping (not LLM estimates)',requestedDurationSeconds:duration,startTimeSeconds:startMs/1000,endTimeSeconds:now()/1000,advancedSeconds:(now()-startMs)/1000,completedDelta:measured.kpis.totalCompleted-initialCompleted,mode,performance:{wallMs,startupWallMs,updateWallMs,maxUpdateWallMs,stopAndRenderWallMs,steps,simSecondsPerWallSecond:wallMs>0 ? (now()-startMs)/wallMs : null},noActivitySeconds:(now()-unchangedSince)/1000,samples,report:measured,limitations:['Time budgets and Stop are checked between engine.update calls; a single synchronous call that never returns cannot be preempted.','Intermediate normal UI rendering is not exercised. Stop/render time is measured separately; a fast stepping run does not rule out UI/render issues.','No-activity is a measured suspicion, not proof of deadlock or the exact root cause.']};
    }
  }
  function register(registry){
    registry.register({name:'get_simulation_report',description:'ONE bulk read of the whole graph: all node IDs/names and edges, current states, measured KPIs, pending-transfer dependencies/cycles, runtime errors, unreachable nodes and ranked suspect details. Use FIRST for freezes/stalls or large-model investigations instead of walking get_node one-by-one. Snapshot does not measure speed; profile_simulation does. Graph truncation is explicit.',mode:AI.ToolModes.READ,risk:'low',inputSchema:{type:'object',properties:{includeGraph:{type:'boolean'},detailLimit:{type:'number',minimum:1,maximum:100}},additionalProperties:false},execute:report});
    registry.register({name:'get_nodes',description:'Reads up to 100 suspect nodes in ONE call: ports, settings, runtime cells/deadlines, errors and pending transfers. Use after get_simulation_report.',mode:AI.ToolModes.READ,risk:'low',inputSchema:{type:'object',properties:{nodeIds:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:100}},required:['nodeIds'],additionalProperties:false},execute:input=>({success:true,nodes:input.nodeIds.map(id=>{try{const node=AI.FactSimTools.findNode(id);return {...AI.FactSimTools.nodeView(node),diagnostics:runtimeRows([node])[0]};}catch(error){return {id,success:false,error:error.message};}})})});
    registry.register({name:'profile_simulation',description:'Bounded reproduction/performance investigation in ONE call, using the selected real engine. Default advances up to 1200 simulation seconds within 15 WALL seconds. Reports actual startup/update/render times, speed, progress samples and final suspect report; stops on budget, non-advancing clock or suspicious inactivity. Does not edit model parameters. Continue via another bounded call only if needed; resetBeforeRun defaults false and clears old results when true. Cannot preempt an engine.update that never returns.',mode:AI.ToolModes.SIMULATION,risk:'low',inputSchema:{type:'object',properties:{durationSeconds:{type:'number',minimum:0.1,maximum:86400},maxWallSeconds:{type:'number',minimum:0.1,maximum:60},stallWindowSeconds:{type:'number',minimum:10,maximum:3600},detailLimit:{type:'number',minimum:1,maximum:100},resetBeforeRun:{type:'boolean'}},additionalProperties:false},execute:profile});
  }
  AI.SimulationDiagnostics={register,report,profile};
})(typeof window==='undefined' ? globalThis : window);
