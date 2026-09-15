// Entity positions are a projection of active Flow operations, never a second clock.
(function(root){
  'use strict';
  const colors={blue:'#0a84ff',orange:'#d97706',green:'#16833c',purple:'#8e35bd',red:'#d92d20',cyan:'#087ea4',yellow:'#a16207',gray:'#63666a'};
  function sample(graph,time=Number(root.simNow?.()) || 0){
    const byEntity=new Map();
    for(const node of graph?._nodes || [])for(const visual of node._flowRuntime?.visuals || []){
      const r=node._flowRuntime,cell=r.cells.find(c=>c.id===visual.cellId && c.entity.instanceId===visual.entityId),active=cell?.visualId===visual.id && cell.startedAt!==undefined ? cell : null;
      if(!cell)continue;
      const history=visual.history || [],phases=visual.phaseNodes || [],finished=new Set(history.map(p=>p.nodeId));
      const completed=history.reduce((sum,p)=>sum+Math.max(0,p.until-p.startedAt),0),remaining=phases.filter(id=>!finished.has(id)).reduce((sum,id)=>sum+(node.properties.flow.nodes.find(n=>n.id===id)?.config.seconds || 0)*1000,0),elapsed=active ? Math.max(0,Math.min(active.until-active.startedAt,time-active.startedAt)) : 0,total=completed+remaining;
      const start=history[0]?.startedAt ?? active?.startedAt ?? time,until=active?.until ?? history.at(-1)?.until ?? time;
      const row={...visual,graph,nodeId:node.id,start,until,progress:total>0 ? Math.max(0,Math.min(1,(completed+elapsed)/total)) : 1,waiting:!active || time>=until};
      const previous=byEntity.get(visual.entityId);if(!previous || start>=previous.start)byEntity.set(visual.entityId,row);
    }
    const store=root.App.runtimeInstancesForGraph(graph);
    for(const entity of store.instances.values()){
      if(entity.parentId!==null || entity.locationNodeId==null || byEntity.has(entity.instanceId))continue;
      const node=graph.getNodeById(entity.locationNodeId);if(!node)continue;
      byEntity.set(entity.instanceId,{graph,nodeId:node.id,entity,entityId:entity.instanceId,progress:1,waiting:true,stationary:true});
    }
    return [...byEntity.values()];
  }
  function shape(ctx,x,y,r,kind){ctx.beginPath();if(kind==='square' || kind==='rounded-square'){ctx.roundRect(x-r,y-r,r*2,r*2,kind==='rounded-square' ? r*.35 : 0);return;}const count={triangle:3,diamond:4,hexagon:6}[kind];if(!count){ctx.arc(x,y,r,0,Math.PI*2);return;}for(let i=0;i<count;i++){const a=-Math.PI/2+i*Math.PI*2/count;i ? ctx.lineTo(x+r*Math.cos(a),y+r*Math.sin(a)) : ctx.moveTo(x+r*Math.cos(a),y+r*Math.sin(a));}ctx.closePath();}
  function position(canvas,row){const graph=canvas.graph;
    if(row.stationary){const node=graph.getNodeById(row.nodeId);if(!node)return null;const offer=node._flowRuntime?.offers.find(o=>o.entity.instanceId===row.entityId);return node.outputs?.length ? node.getConnectionPos(false,offer?.slot || 0) : [node.pos[0]+node.size[0]/2,node.pos[1]];}
    const link=graph.links[row.linkId];if(!link)return null;const from=graph.getNodeById(link.origin_id),to=graph.getNodeById(link.target_id);if(!from || !to)return null;const a=from.getConnectionPos(false,link.origin_slot),b=to.getConnectionPos(true,link.target_slot),outDir=from.outputs[link.origin_slot]?.dir || (from.properties.flipIO ? LiteGraph.LEFT : LiteGraph.RIGHT),inDir=to.inputs[link.target_slot]?.dir || (to.properties.flipIO ? LiteGraph.RIGHT : LiteGraph.LEFT);
    return canvas.computeConnectionPoint ? canvas.computeConnectionPoint(a,b,row.progress,outDir,inDir) : [a[0]+(b[0]-a[0])*row.progress,a[1]+(b[1]-a[1])*row.progress];
  }
  function draw(canvas,ctx){
    const rows=sample(canvas.graph),registry=root.App.entityModelForGraph(canvas.graph),store=root.App.runtimeInstancesForGraph(canvas.graph);animator.animations=rows;
    ctx.save();for(const row of rows){
      const point=position(canvas,row);if(!point)continue;
      const [x,y]=point,type=registry.get(row.entity.typeId),appearance=type?.appearance || {},color=colors[appearance.colorTheme] || '#63666a',radius=root.NODES_CONFIG?.animations?.radius || 22.5;
      shape(ctx,x,y,radius,appearance.shape);ctx.fillStyle='#ffffff';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle=color;ctx.stroke();
      const children=store.childrenOf(row.entity);
      for(let i=0;i<Math.min(children.length,4);i++){
        const childType=registry.get(children[i].typeId),cx=x+(i%2-.5)*15,cy=y+(Math.floor(i/2)-.5)*15;
        shape(ctx,cx,cy,5,childType?.appearance?.shape);ctx.fillStyle=colors[childType?.appearance?.colorTheme] || color;ctx.fill();
      }
      if(children.length>4){ctx.fillStyle=color;ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('+'+(children.length-4),x,y+5);}
      ctx.font='600 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      const label=String(row.entity.id || type?.name || 'Entity'),width=Math.min(180,ctx.measureText(label).width)+18,top=y+radius+5;
      ctx.beginPath();ctx.roundRect(x-width/2,top,width,19,9);ctx.fillStyle='rgba(15,23,42,.88)';ctx.fill();ctx.fillStyle='#f8fafc';ctx.fillText(label,x,top+9.5,180);
    }ctx.restore();
  }
  const animator={animations:[],sample,position,draw,clear(){this.animations=[];}};root.WorkLinkAnimator=animator;
  root.installWorkLinkAnimationLayer=canvas=>{if(canvas.__flowAnimationInstalled)return;canvas.__flowAnimationInstalled=true;const previous=canvas.onDrawForeground;canvas.onDrawForeground=function(ctx,area){previous?.call(this,ctx,area);draw(this,ctx);if(root.isSimRunning?.())this.dirty_canvas=true;};};
})(window);
