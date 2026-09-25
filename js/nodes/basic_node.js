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
    onDrawForeground(ctx){
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
