(function(root){
  'use strict';
  const App=root.App;
  // Read-only projection: inspecting a Flow must never admit work or advance it.
  App.flowNodeStatus=function(node,item,time=Number(root.simNow?.()) || 0){
    const r=node._flowRuntime || {},cells=[...(r.cells || []),...(r.signals || [])],here=cells.filter(c=>c.nodeId===item.id),cell=here[0],last=r.flowActivity?.[item.id];
    const result={state:cell ? 'WAIT' : 'IDLE',rows:[],inputs:{},outputs:{},progress:0};
    const row=(label,value,ready)=>result.rows.push({label,value,ready});
    if(r.error){result.state='ERROR';row('Error',r.error);return result;}
    if(item.kind==='sourceSequence'){
      const sourceCell=(r.cells || []).find(entry=>entry.sourceNodeId===item.id || entry.nodeId===item.id),config=node.properties.source || {},entries=config.entries || [],sequence=entries.flatMap(entry=>Array(Math.max(1,Number(entry.count) || 1)).fill(entry)),registry=App.entityModelForGraph(node.graph),created=r.sourceSequence?.created || r.created || 0,next=sequence.length ? sequence[created%sequence.length] : null;
      result.state=r.error ? 'ERROR' : sourceCell ? 'READY' : 'IDLE';
      row('Generated',String(created));row('Next Entity',next ? registry.get(next.typeId)?.name || next.typeId : 'Not configured',!!next);row('Interval',`${Math.max(0,Number(config.intervalSec) || 0)} s`);row('Repeat',config.repeat===false ? 'Off' : 'On');
      result.outputs[item.outputs?.[0]?.id]=!!sourceCell;
    }else if(item.kind==='entitySink'){
      result.state=cell ? 'READY' : last ? 'DONE' : 'IDLE';row('Input',cell ? 'Ready' : 'Waiting',!!cell);row('Completed',String(node._recv?.length || 0));
    }else if(item.kind==='sensor'){
      const sensor=App.FlowRuntime.getSensorSummary(node,item.id,time);result.state=last ? 'DONE' : 'IDLE';
      row('Count',String(sensor.count));row('Last CT',`${(sensor.lastCycleMs/1000).toFixed(1)} s`);row('TPH(1h)',sensor.throughputPerHour.toFixed(sensor.throughputPerHour>=1000 ? 0 : sensor.throughputPerHour>=100 ? 1 : 2));
    }else if(item.kind==='process' || item.kind==='recovery'){
      const started=cell?.startedAt,active=Number.isFinite(started),duration=Math.max(0,Number(item.config.seconds) || 0);
      const elapsed=active ? Math.max(0,(time-started)/1000) : last?.durationSec || 0,remaining=active ? Math.max(0,(cell.until-time)/1000) : 0;
      const done=active ? time>=cell.until : !!last;
      result.state=active ? done ? 'WAIT' : item.kind.toUpperCase() : done ? 'DONE' : 'IDLE';
      result.progress=active ? duration ? Math.min(1,elapsed/duration) : 1 : done ? 1 : 0;
      row('Elapsed',`${Math.min(elapsed,active ? duration : last?.durationSec || 0).toFixed(1)} s`);
      row('Remaining',`${remaining.toFixed(1)} s`);
      row('Time condition',done ? 'Met' : active ? 'Timing' : 'Waiting',done);
      if(active && done)row('Next step','Waiting for output');
    }else if(item.kind==='join'){
      const initial=!r.controlInitialized ? App.FlowModel.feedbackLinks(node.properties.flow) : [];
      let count=0;
      for(const p of item.inputs){const ready=here.some(c=>c.input===p.id) || initial.some(l=>l.to===item.id && l.input===p.id);result.inputs[p.id]=ready;if(ready)count++;row(App.FlowModel.portLabel(p.id),ready ? 'Ready' : 'Waiting',ready);}
      const workInputs=App.FlowRuntime.joinWorkInputs(node,item),works=workInputs.map(p=>here.find(c=>c.input===p.id)?.entity);
      const matching=workInputs.length<2 || works.every(e=>App.FlowRuntime.sameWork(e,works[0]));
      result.state=count===item.inputs.length && matching ? 'READY' : 'WAIT';row('All inputs',`${count} / ${item.inputs.length}`,count===item.inputs.length);
      if(workInputs.length>1){
        workInputs.forEach((p,i)=>row(App.FlowModel.portLabel(p.id)+' work',works[i] ? `${works[i].type} / ${works[i].id}` : 'Waiting'));
        row('Type / ID match',matching ? 'Matched' : works.every(Boolean) ? 'Mismatch' : 'Waiting for matching work',matching);
      }
    }else if(item.kind==='fork'){
      const offer=(r.offers || []).find(o=>o.forkId===item.id),fired=last?.firedAt!==undefined,group=r.forkStatus?.[item.id],waiting=!!cell || !!group?.waiting;
      result.state=waiting ? 'WAIT' : fired ? 'DONE' : 'IDLE';
      row('Input',waiting ? 'Ready' : 'Waiting',waiting);
      row('Outputs',offer?.pending.length || group?.waiting ? 'Downstream waiting' : cell ? 'Waiting for all outputs' : fired ? 'Fired together' : 'Waiting');
      if(group)row('Outputs ready',`${group.ready} / ${group.total}`,group.ready===group.total);
      const signals=App.FlowModel.signalLinks(node.properties.flow),copies=node.properties.flow.links.filter(l=>l.from===item.id && !signals.has(l)).length;
      row('Work outputs',String(copies));
      for(const p of item.outputs)result.outputs[p.id]=!waiting && fired;
    }else if(item.kind==='syncroJudgment'){
      const members=[];for(const n of node.graph?._nodes || [])for(const f of n.properties?.flow?.nodes || [])if(f.kind==='syncroJudgment' && f.config.groupId===item.config.groupId)members.push({n,f});
      const count=members.filter(({n,f})=>n._flowRuntime?.cells.some(c=>c.nodeId===f.id)).length;
      const ready=members.length>0 && count===members.length;result.state=ready ? 'READY' : cell ? 'WAIT' : 'IDLE';row('Group ready',`${count} / ${members.length}`,ready);row('Condition',ready ? 'Met' : 'Waiting for members',ready);
    }else if(item.kind==='Palletizing'){
      const parent=here.find(c=>c.input===item.inputs[0].id)?.entity,store=App.runtimeInstancesForGraph(node.graph),count=parent ? store.childrenOf(parent).length : 0,capacity=parent ? store.typeOf(parent)?.capacity || 0 : 0;
      row('Parent',parent ? 'Ready' : 'Waiting',!!parent);row('Contents',`${count} / ${capacity || '—'}`,!!parent && count>=capacity);
    }else if(item.kind==='DePalletizing'){
      row('Remaining contents',cell?.entity ? String(App.runtimeInstancesForGraph(node.graph).childrenOf(cell.entity).length) : '—');
    }else if(item.kind==='entityRouter'){
      const port=item.config.dispatch==='round-robin' ? item.outputs[(r.routerCursors?.[item.id] || 0)%item.outputs.length] : cell?.entity && (item.outputs.find(p=>p.typeId===cell.entity.typeId) || item.outputs.find(p=>p.typeId==='anyType'));
      row('Route',port ? App.FlowModel.portLabel(port.id) : 'Waiting for input');
    }else row('Input',cell ? 'Received' : 'Waiting',!!cell);
    if(cell?.entity)row('Work',cell.entity.id || cell.entity.type || cell.entity.typeId);
    if(last?.firedAt!==undefined)row('Last fired',`${(last.firedAt/1000).toFixed(1)} s`);
    return result;
  };
})(typeof window==='undefined' ? globalThis : window);
