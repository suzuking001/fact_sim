(function(root){
  'use strict';
  const App=root.App=root.App || {},model=App.FlowModel;
  function ensurePorts(node){
    for(const [direction,ports] of [['in',node.inputs],['out',node.outputs]])(ports || []).forEach((port,index)=>{
      port.portId ||= `${direction}-${index+1}`;port.type='entity';port.channel='entity';
    });
  }
  function syncPortsFromFlow(node,flow=node?.properties?.flow){
    if(!node || flow?.version!==2 || !Array.isArray(flow.nodes))return {inputs:0,outputs:0,removed:0,added:0};
    ensurePorts(node);let removed=0,added=0;
    for(const spec of [
      {kind:'inPort',key:'inputs',prefix:'in',add:'addInput',remove:'removeInput',name:'inPort'},
      {kind:'outPort',key:'outputs',prefix:'out',add:'addOutput',remove:'removeOutput',name:'outPort'}
    ]){
      const boundaries=flow.nodes.filter(item=>item?.kind===spec.kind),ports=node[spec.key] || (node[spec.key]=[]),claimed=new Set(),ids=new Set(),assignments=[];
      const nextId=base=>{base=String(base || spec.prefix).trim() || spec.prefix;let id=base,n=1;while(ids.has(id) || ports.some(port=>port.portId===id && !claimed.has(port)))id=`${base}-${++n}`;return id;};
      for(const [index,item] of boundaries.entries()){
        item.config ||= {};const requested=String(item.config.portId || '').trim();
        let port=requested && !ids.has(requested) ? ports.find(candidate=>!claimed.has(candidate) && candidate.portId===requested) : null;
        if(!port)port=(!claimed.has(ports[index]) && ports[index]) || ports.find(candidate=>!claimed.has(candidate)) || null;
        let portId;
        if(port){claimed.add(port);portId=String(port.portId || '').trim();if(!portId || ids.has(portId)){portId=nextId(item.id || `${spec.prefix}-${index+1}`);port.portId=portId;}}
        else portId=requested && !ids.has(requested) ? requested : nextId(item.id || `${spec.prefix}-${index+1}`);
        ids.add(portId);item.config.portId=portId;assignments.push({item,port,portId});
      }
      for(let index=ports.length-1;index>=0;index--)if(!claimed.has(ports[index])){node[spec.remove](index);removed++;}
      for(const assignment of assignments)if(!assignment.port){node[spec.add](assignment.item.id || `${spec.name}${node[spec.key].length+1}`,'entity');assignment.port=node[spec.key][node[spec.key].length-1];assignment.port.portId=assignment.portId;added++;}
      for(const [index,port] of node[spec.key].entries()){port.name=`${spec.name}${index+1}`;port.type='entity';port.channel='entity';port.flowManaged=true;}
    }
    node.setDirtyCanvas?.(true,true);
    return {inputs:node.inputs.length,outputs:node.outputs.length,removed,added};
  }
  function syncGraphPorts(graph){
    const result={nodes:0,removed:0,added:0};
    for(const node of graph?._nodes || [])if(node?.type==='factory/basic'){
      const change=syncPortsFromFlow(node);result.nodes++;result.removed+=change.removed;result.added+=change.added;
    }
    return result;
  }
  const templates={source:['Source',0,1],sink:['Sink',1,0],pack:['Palletizing',2,1],merge:['Palletizing',2,1],unpack:['DePalletizing',1,2],router:['Router',1,2],machine:['Machine',1,1],inspection:['Inspection',1,1],buffer:['Buffer',1,1],conveyor:['Conveyor',1,1],shuttle:['Shuttle',1,1],basic:['Equipment',1,1]};
  const sensorColors=['#e67e22','#2d8f6f','#4f7fc7','#b05cc5','#d1495b','#5f8f29','#2b9eb3','#8c6d31'];
  const sensorPalette={metricFill:'rgba(255,255,255,.82)',metricStroke:'rgba(72,91,116,.22)',metricLabel:'#526176',metricValue:'#24364a',chartFill:'rgba(37,57,83,.05)',chartStroke:'rgba(72,91,116,.2)',chartGrid:'rgba(72,91,116,.12)',chartAxis:'#66788d',chartEmpty:'#8b98a8'};
  function formatTph(value){const n=Number(value);if(!Number.isFinite(n) || n<=0)return '0.00';if(n>=1000)return n.toFixed(0);if(n>=100)return n.toFixed(1);return n.toFixed(2);}
  class BasicNode extends root.LiteGraph.LGraphNode{
    constructor(){
      super();this.size=[230,110];this.properties={basicNodeVersion:3,role:'equipment',initialContents:[],flow:model.empty()};this.applyTemplate('basic');this._state='IDLE';this._stateName='idle';this._until=0;root.enableFlipIO?.(this);
    }
    applyTemplate(kind){
      const preset=templates[kind] || templates.basic;
      if(App.FlowRuntime.isActive(this))throw new Error('Reset before replacing an active Flow.');
      while(this.inputs?.length)this.removeInput(this.inputs.length-1);while(this.outputs?.length)this.removeOutput(this.outputs.length-1);
      for(let i=0;i<preset[1];i++)this.addInput('inPort'+(i+1),'entity');for(let i=0;i<preset[2];i++)this.addOutput('outPort'+(i+1),'entity');ensurePorts(this);
      this.title=preset[0];this.properties.role=kind==='source' || kind==='sink' ? kind : 'equipment';this.properties.flow=model.template(this,kind);
      if(kind==='sink')this._recv=[];else delete this._recv;this._sent=0;
      if(kind==='source')this.properties.source={entries:[],intervalSec:0,repeat:true};else delete this.properties.source;
      delete this._flowRuntime;return this;
    }
    configure(data){this._isConfiguring=true;this.inputs=[];this.outputs=[];try{return super.configure({...data,pos:data.pos ? Array.from(Object.values(data.pos)) : [0,0],size:data.size ? Array.from(Object.values(data.size)) : [230,110]});}finally{this._isConfiguring=false;}}
    onConfigure(){ensurePorts(this);if(this.properties.role==='source' && !this.properties.flow?.nodes?.some(node=>node.kind==='sourceSequence'))this.properties.flow=model.template(this,'source');else if(this.properties.role==='sink' && !this.properties.flow?.nodes?.some(node=>node.kind==='entitySink'))this.properties.flow=model.template(this,'sink');else model.addRecoveryCycle(this.properties.flow);delete this._flowRuntime;this._state='IDLE';this._stateName='idle';this._until=0;if(this.properties.role==='sink')this._recv=[];else delete this._recv;this._sent=0;}
    onSerialize(data){data.properties=model.clone(this.properties);data.properties.basicNodeVersion=3;}
    onAdded(){if(this.properties.role==='source' && !this.properties.source.entries.length){const type=App.entityModelForGraph?.(this.graph)?.list()[0];if(type)this.properties.source.entries.push({typeId:type.typeId,count:1});}}
    removeInput(slot){if(App.FlowRuntime.isActive(this) && !this._isConfiguring)throw new Error('Reset before removing a port in an active Flow.');return super.removeInput(slot);}
    removeOutput(slot){if(App.FlowRuntime.isActive(this) && !this._isConfiguring)throw new Error('Reset before removing a port in an active Flow.');return super.removeOutput(slot);}
    hasEntityContents(){return true;}
    getCurrentContents(){const store=App.runtimeInstancesForGraph(this.graph);return {summary:store.summaryAt(this.id),instances:store.treesAt(this.id)};}
    canAcceptEntityInput(slot,entity){return App.FlowRuntime.canAccept(this,slot,entity);}
    acknowledgeEntityOutput(entity,targetId,slot){App.FlowRuntime.acknowledge(this,entity,targetId,slot);}
    setOutputData(slot,entity){const previous=this.outputs?.[slot]?._data;super.setOutputData(slot,entity);if(this.graph && previous!==entity){this.graph.__outputDirty=true;this.graph.__dirtyNodeIds ||= new Set();for(const id of this.outputs?.[slot]?.links || []){const link=this.graph.links[id];if(link)this.graph.__dirtyNodeIds.add(link.target_id);}}}
    onExecute(){App.FlowRuntime.execute(this);}
    getEventUntil(){return App.FlowRuntime.eventUntil(this);}
    getInspectorSchema(){return {fields:[]};}
    onPropertyChanged(){if(this._isConfiguring)return;model.pause();ensurePorts(this);if(this.graph)App.FlowRuntime.retime(this);}
    _sensorChartLayout(count){
      const width=Math.max(300,Number(this.size?.[0]) || 0),inner=width-20,columnWidth=150,columns=Math.max(1,Math.floor(inner/columnWidth)),rows=Math.max(1,Math.ceil(count/columns)),legendHeight=rows*34,chartHeight=70,top=28,chartTop=top+legendHeight+6,gap=8;
      return {width,columns,rows,legendHeight,chartHeight,top,chartTop,gap,minHeight:chartTop+chartHeight*2+gap+12};
    }
    _ensureSensorChartSize(count){
      const layout=this._sensorChartLayout(count),width=Math.max(layout.width,Number(this.size?.[0]) || 0),height=Math.max(layout.minHeight,Number(this.size?.[1]) || 0);
      if(width===this.size[0] && height===this.size[1])return false;this.size[0]=width;this.size[1]=height;this.setDirtyCanvas?.(true,true);return true;
    }
    _drawSensorLegend(ctx,series,layout){
      const gap=6,cellWidth=(layout.width-20-gap*(layout.columns-1))/layout.columns;
      ctx.save();
      try{
        series.forEach((entry,index)=>{
          const row=Math.floor(index/layout.columns),column=index%layout.columns,x=10+column*(cellWidth+gap),y=layout.top+row*34,color=sensorColors[index%sensorColors.length],summary=entry.summary;
          ctx.fillStyle=sensorPalette.metricFill;ctx.strokeStyle=sensorPalette.metricStroke;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,cellWidth,28,6);ctx.fill();ctx.stroke();
          ctx.fillStyle=color;ctx.fillRect(x+6,y+6,7,16);ctx.fillStyle=sensorPalette.metricValue;ctx.font='bold 10px sans-serif';ctx.fillText(entry.item.id,x+18,y+11);
          ctx.fillStyle=sensorPalette.metricLabel;ctx.font='9px sans-serif';ctx.fillText(`Count ${summary.count}  CT ${(summary.lastCycleMs/1000).toFixed(1)}s  TPH ${formatTph(summary.throughputPerHour)}`,x+18,y+23);
        });
      }finally{ctx.restore();}
    }
    _drawSensorSeriesChart(ctx,config){
      const {x,y,width,height,label,maxValue,minTime,timeSpan,series,value,format}=config,plotTop=18,plotBottom=6,plotHeight=Math.max(18,height-plotTop-plotBottom),divisions=3;
      ctx.save();ctx.translate(x,y);ctx.fillStyle=sensorPalette.chartFill;ctx.strokeStyle=sensorPalette.chartStroke;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(0,0,width,height,7);ctx.fill();ctx.stroke();ctx.fillStyle=sensorPalette.metricValue;ctx.font='bold 10px sans-serif';ctx.fillText(label,8,12);
      for(let i=0;i<=divisions;i++){const yy=plotTop+(i/divisions)*plotHeight;ctx.strokeStyle=sensorPalette.chartGrid;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(width,yy);ctx.stroke();ctx.fillStyle=sensorPalette.chartAxis;ctx.font='9px sans-serif';ctx.fillText(format(maxValue*(1-i/divisions)),width+5,Math.max(10,yy+3));}
      let points=0;series.forEach((entry,index)=>{const samples=entry.summary.history || [];if(!samples.length)return;ctx.strokeStyle=sensorColors[index%sensorColors.length];ctx.lineWidth=2;ctx.beginPath();samples.forEach((sample,sampleIndex)=>{const xx=((Number(sample.time) || 0)-minTime)/timeSpan*width,raw=Math.max(0,Number(value(sample)) || 0),yy=plotTop+plotHeight-(raw/maxValue)*Math.max(8,plotHeight-6)-3;if(sampleIndex===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);points++;});ctx.stroke();if(samples.length===1){const sample=samples[0],xx=((Number(sample.time) || 0)-minTime)/timeSpan*width,raw=Math.max(0,Number(value(sample)) || 0),yy=plotTop+plotHeight-(raw/maxValue)*Math.max(8,plotHeight-6)-3;ctx.fillStyle=sensorColors[index%sensorColors.length];ctx.beginPath();ctx.arc(xx,yy,2.5,0,Math.PI*2);ctx.fill();}});
      if(!points){ctx.fillStyle=sensorPalette.chartEmpty;ctx.font='10px sans-serif';ctx.fillText('No samples yet',8,plotTop+16);}ctx.restore();
    }
    _drawSensorCharts(ctx,series){
      const layout=this._sensorChartLayout(series.length);this._drawSensorLegend(ctx,series,layout);
      const samples=series.flatMap(entry=>entry.summary.history || []),times=samples.map(sample=>Number(sample.time) || 0),minTime=times.length ? Math.min(...times) : 0,maxTime=times.length ? Math.max(...times) : 1,timeSpan=Math.max(1,maxTime-minTime),axisWidth=38,chartWidth=Math.max(80,layout.width-20-axisWidth),cycles=samples.map(sample=>Number(sample.cycleMs) || 0),tph=samples.map(sample=>Number(sample.throughputPerHour) || 0);
      this._drawSensorSeriesChart(ctx,{x:10,y:layout.chartTop,width:chartWidth,height:layout.chartHeight,label:'Cycle Time',maxValue:Math.max(1,...cycles),minTime,timeSpan,series,value:sample=>sample.cycleMs,format:value=>`${(value/1000).toFixed(1)}s`});
      this._drawSensorSeriesChart(ctx,{x:10,y:layout.chartTop+layout.chartHeight+layout.gap,width:chartWidth,height:layout.chartHeight,label:'Throughput (1h)',maxValue:Math.max(1,...tph),minTime,timeSpan,series,value:sample=>sample.throughputPerHour,format:formatTph});
    }
    onDrawForeground(ctx){
      const sensorItems=(this.properties.flow?.nodes || []).filter(item=>item.kind==='sensor');this.__disableCompactOverlay=sensorItems.length>0;
      if(this.flags.collapsed)return;
      const r=this._flowRuntime,time=Number(root.simNow?.()) || 0;
      const cell=App.FlowRuntime.activeCells(this).find(c=>c.startedAt!==undefined && c.until>time),entity=this._payload;
      const seconds=kind=>this.properties.flow.nodes.filter(n=>n.kind===kind).reduce((sum,n)=>sum+(Number(n.config.seconds) || 0),0);
      const lines=[`State: ${this._state || 'IDLE'}`];
      if(this.properties.role==='sink')lines.push(`Completed: ${this._recv?.length || 0}`);
      else if(this.properties.role==='source'){
        const registry=App.entityModelForGraph(this.graph);
        lines.push(`Sent: ${this._sent || 0}`,`Sequence: ${(this.properties.source.entries || []).map(e=>registry.get(e.typeId)?.name || e.typeId).join(' → ')}`);
      }else lines.push(`Work: ${entity ? entity.id+' Type='+entity.type : '(none)'}`,`Remain(s): ${(Math.max(0,(cell?.until || 0)-time)/1000).toFixed(1)}`,`Process(s): ${seconds('process')} / Recovery(s): ${seconds('recovery')}`);
      if(sensorItems.length){const series=sensorItems.map(item=>({item,summary:App.FlowRuntime.getSensorSummary(this,item.id,time)}));if(this._ensureSensorChartSize(series.length))return;this._drawSensorCharts(ctx,series);for(const entry of series)lines.push(`${entry.item.id}: Count ${entry.summary.count} / CT ${(entry.summary.lastCycleMs/1000).toFixed(1)}s / TPH ${formatTph(entry.summary.throughputPerHour)}`);}
      if(r?.error || r?.reason)lines.push(r.error || r.reason);
      root.drawStateBelow?.(ctx,this,lines,8,6);
    }
  }
  function assertFormat(data){
    if(data?.__factSimFormat!==2 || !Array.isArray(data.nodes))throw new Error('Unsupported file format. Open a Flow v2 file. The current graph has not been changed.');
    for(const node of data.nodes)if(node.type==='factory/basic' && (node.properties?.basicNodeVersion!==3 || node.properties?.flow?.version!==2))throw new Error('Unsupported node format. All equipment must use Flow v2.');
    return data;
  }
  App.ensureBasicNodePortIds=ensurePorts;App.syncBasicNodePortsFromFlow=syncPortsFromFlow;App.syncBasicNodePortsForGraph=syncGraphPorts;App.applyBasicTemplate=(node,kind)=>node.applyTemplate(kind);App.basicNodeBehavior=node=>node?.properties?.role || 'equipment';
  App.assertFlowFileFormat=assertFormat;
  App.prepareSerializedGraphForSave=data=>({data:{...model.clone(data),__factSimFormat:2}});
  root.BasicNode=BasicNode;
  const remove=root.LGraph.prototype.remove;root.LGraph.prototype.remove=function(node){if(App.FlowRuntime.isActive(node))throw new Error('Reset before deleting equipment with an active Flow.');return remove.call(this,node);};
})(typeof window==='undefined' ? globalThis : window);
