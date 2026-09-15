// Every equipment engine executes the same Flow transition service.
var App=window.App || (window.App={});
(function(){
  const KINDS=Object.freeze({Unknown:0,Source:1,Equipment:2,Sink:3,Branch:4,Merge:5,Split:6,Buffer:7,Queue:8,AGVRoute:9,ShuttleStage:10,Conveyor:11,Note:12,StopGroupProxy:13,FallbackOnly:65535});
  const names=[],kernels={};for(const [name,id] of Object.entries(KINDS))names[id]=name;
  const getNode=(ctx,index)=>ctx.getNode ? ctx.getNode(index) : ctx.compat.getNode(index);
  const common={
    execute(index,time,ctx){
      const node=getNode(ctx,index);if(!node)return {nextUntil:NaN,stateChanged:false,outputsChanged:false};
      const state=node._state,until=node._until,refs=(node.outputs || []).map(p=>p._data),revision=node._flowRuntime?.revision;
      App.FlowRuntime.execute(node);
      return {nextUntil:App.FlowRuntime.eventUntil(node),stateChanged:state!==node._state || until!==node._until || revision!==node._flowRuntime?.revision,outputsChanged:refs.some((ref,i)=>ref!==node.outputs[i]._data)};
    },
    getEventUntil(index,time,ctx){return App.FlowRuntime.eventUntil(getNode(ctx,index));}
  };
  for(const kind of [KINDS.Source,KINDS.Equipment,KINDS.Sink])kernels[kind]=common;
  App.fastKernels={KINDS,KIND_NAMES:names,inferKindId(node){if(node.type==='factory/note')return KINDS.Note;if(node.type!=='factory/basic' || node.properties.flow?.version!==2)return KINDS.FallbackOnly;return node.properties.role==='source' ? KINDS.Source : node.properties.role==='sink' ? KINDS.Sink : KINDS.Equipment;},getKindName:id=>names[id] || 'Unknown',getKernel:id=>kernels[id] || null,registerKernel(id,kernel){kernels[id]=kernel;return true;},canHandleKind:id=>!!kernels[id]};
})();
