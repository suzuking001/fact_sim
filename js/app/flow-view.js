(function(root){
  'use strict';
  const App=root.App,model=App.FlowModel,NS='http://www.w3.org/2000/svg';
  function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
  function button(text,action){const b=element('button','',text);b.type='button';b.onclick=action;return b;}
  function options(rows,value){const select=element('select');for(const [id,text] of rows){const option=element('option','',text);option.value=id;select.append(option);}select.value=value || '';select.onfocus=model.pause;return select;}
  App.createFlowView=function(node){
    const host=element('section','flowEditor'),toolbar=element('div','flowToolbar'),viewport=element('div','flowViewport'),scene=element('div','flowScene'),notice=element('div','flowNotice');
    notice.setAttribute('role','status');host.append(toolbar,viewport,notice);viewport.append(scene);
    if(node.properties.role==='sink'){notice.textContent='Entities delivered here are recorded as completed.';return host;}
    if(node.properties.role==='source'){notice.textContent='Set the Entity sequence in Contents. Source generates one Entity when the destination is ready.';return host;}
    let flow=model.clone(node.properties.flow),zoom=1,pan=[16,16],pending=null,menu=null,drag=null;
    const elements=new Map(),ports=new Map(),progress=new Map();let svg;
    const selection=options(Object.entries(model.definitions).map(([id,d])=>[id,d.label]),'process');selection.setAttribute('aria-label','Flow node type');
    const fit=()=>{if(!flow.nodes.length)return;const minX=Math.min(...flow.nodes.map(n=>n.pos[0])),minY=Math.min(...flow.nodes.map(n=>n.pos[1]));const w=Math.max(...flow.nodes.map(n=>n.pos[0]+230))-minX,h=Math.max(...flow.nodes.map(n=>n.pos[1]+160))-minY;zoom=Math.max(.2,Math.min(1.2,(viewport.clientWidth-24)/w,(viewport.clientHeight-24)/h));pan=[(viewport.clientWidth-w*zoom)/2-minX*zoom,(viewport.clientHeight-h*zoom)/2-minY*zoom];transform();};
    toolbar.append(button('Fit All',fit),selection,button('Add',()=>edit(()=>structure(()=>{const item=model.add(flow,selection.value,{},[(40-pan[0])/zoom,(40-pan[1])/zoom]);boundary(item);}))));
    function transform(){scene.style.transform=`translate(${pan[0]}px,${pan[1]}px) scale(${zoom})`;}
    function boundary(item){if(!['inPort','outPort'].includes(item.kind))return;const input=item.kind==='inPort',method=input ? 'addInput' : 'addOutput',list=input ? node.inputs : node.outputs;node[method](item.id,'entity');const port=list[list.length-1];port.portId=item.id;port.channel='entity';item.config.portId=port.portId;}
    function edit(action,render=true){
      model.pause();const previous=model.clone(flow);
      try{action();const errors=model.commit(node,flow);notice.textContent=errors.join(' ');notice.classList.toggle('is-error',!!errors.length);if(render)draw();}
      catch(error){flow=previous;notice.textContent=error.message;notice.classList.add('is-error');if(render)draw();}
    }
    function structure(action){if(node._flowRuntime?.cells.length || node._flowRuntime?.offers.length)throw new Error('Reset before changing ports or removing a Flow that contains an Entity.');action();}
    function portKey(id,direction,port){return `${id}/${direction}/${port}`;}
    function wire(item,direction,port){
      model.pause();if(direction==='outputs'){pending={from:item.id,output:port.id};notice.textContent='Select an input port to connect.';return;}
      if(pending){edit(()=>{flow.links=flow.links.filter(l=>!(l.from===pending.from && l.output===pending.output) && !(l.to===item.id && l.input===port.id));flow.links.push({...pending,to:item.id,input:port.id});pending=null;});}
      else if(flow.links.some(l=>l.to===item.id && l.input===port.id))edit(()=>{flow.links=flow.links.filter(l=>!(l.to===item.id && l.input===port.id));});
    }
    function drawLinks(){
      svg.replaceChildren();for(const link of flow.links){const a=ports.get(portKey(link.from,'outputs',link.output)),b=ports.get(portKey(link.to,'inputs',link.input));if(!a || !b)continue;
        const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),sr=scene.getBoundingClientRect();const x1=(ar.x+ar.width/2-sr.x)/zoom,y1=(ar.y+ar.height/2-sr.y)/zoom,x2=(br.x+br.width/2-sr.x)/zoom,y2=(br.y+br.height/2-sr.y)/zoom;
        const path=document.createElementNS(NS,'path'),bend=Math.max(50,Math.abs(x2-x1)/2);path.setAttribute('d',`M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2}`);path.setAttribute('class','flowWire');path.oncontextmenu=e=>{e.preventDefault();edit(()=>{flow.links=flow.links.filter(l=>l!==link);});};svg.append(path);
      }
    }
    function context(event,item){
      event.preventDefault();menu?.remove();menu=element('div','flowContext');const dynamic=item.kind==='entityRouter';
      const row=(label,action,enabled=true)=>{const b=button(label,()=>{menu.remove();edit(action);});b.disabled=!enabled;menu.append(b);};
      row('Flip IO',()=>{item.flipIO=!item.flipIO;});
      for(const [label,direction,prefix] of [['Add inPort','inputs','inPort'],['Add outPort','outputs','outPort']])row(label,()=>structure(()=>{item.portCounters ||= {};let n=item.portCounters[direction] || item[direction].length;while(item[direction].some(p=>p.id===prefix+(n+1)))n++;item.portCounters[direction]=++n;item[direction].push({id:prefix+n,...(direction==='outputs' ? {typeId:''} : {})});}),dynamic);
      row('Delete',()=>structure(()=>{flow.nodes=flow.nodes.filter(n=>n!==item);flow.links=flow.links.filter(l=>l.from!==item.id && l.to!==item.id);if(['inPort','outPort'].includes(item.kind)){const input=item.kind==='inPort',slot=(input ? node.inputs : node.outputs).findIndex(p=>p.portId===item.config.portId);if(slot>=0)node[input ? 'removeInput' : 'removeOutput'](slot);}}));
      row('Duplicate',()=>structure(()=>{const copy=model.add(flow,item.kind,model.clone(item.config),[item.pos[0]+30,item.pos[1]+150]);copy.inputs=model.clone(item.inputs);copy.outputs=model.clone(item.outputs);copy.flipIO=item.flipIO;boundary(copy);}));
      host.append(menu);const box=host.getBoundingClientRect();menu.style.left=Math.min(event.clientX-box.left,host.clientWidth-150)+'px';menu.style.top=Math.min(event.clientY-box.top,host.clientHeight-190)+'px';
    }
    function draw(){
      scene.replaceChildren();elements.clear();ports.clear();progress.clear();svg=document.createElementNS(NS,'svg');svg.classList.add('flowWires');scene.append(svg);
      for(const item of flow.nodes){
        const card=element('article','flowNode');card.dataset.flowId=item.id;card.dataset.kind=item.kind;card.classList.toggle('is-flipped',!!item.flipIO);card.style.left=item.pos[0]+'px';card.style.top=item.pos[1]+'px';
        const header=element('header','flowNodeHeader',item.id);card.append(header);card.oncontextmenu=e=>context(e,item);elements.set(item.id,card);
        header.onpointerdown=e=>{if(e.button!==0)return;model.pause();drag={item,start:[e.clientX,e.clientY],pos:item.pos.slice()};header.setPointerCapture(e.pointerId);e.stopPropagation();};
        header.onpointermove=e=>{if(!drag?.item)return;item.pos=[drag.pos[0]+(e.clientX-drag.start[0])/zoom,drag.pos[1]+(e.clientY-drag.start[1])/zoom];card.style.left=item.pos[0]+'px';card.style.top=item.pos[1]+'px';drawLinks();};header.onpointerup=()=>{if(drag?.item){drag=null;edit(()=>{},false);}};
        const content=element('div','flowNodeContent');card.append(content);
        if(model.definitions[item.kind].timed){
          const label=element('label','flowTime'),input=element('input');input.type='number';input.min='0';input.step='any';input.value=item.config.seconds;input.setAttribute('aria-label',`${item.id} seconds`);input.onfocus=model.pause;
          input.onchange=()=>{const value=Number(input.value);if(input.value.trim()==='' || !Number.isFinite(value) || value<0){input.setCustomValidity('Enter zero or more seconds.');input.reportValidity();return;}input.setCustomValidity('');edit(()=>{item.config.seconds=value;},false);};input.onkeydown=e=>{if(e.key==='Enter')input.blur();};
          label.append(input,element('span','','s'));const bar=element('progress');bar.max=1;bar.value=0;bar.setAttribute('aria-label',`${item.id} progress`);progress.set(item.id,bar);content.append(label,bar);
        }else if(item.kind==='entityRouter'){
          const select=options([['type','By Entity Type'],['round-robin','Round robin']],item.config.dispatch || 'type');
          select.setAttribute('aria-label',`${item.id} dispatch`);select.onchange=()=>edit(()=>structure(()=>{item.config.dispatch=select.value;}));content.append(select);
        }else if(item.kind==='syncroJudgment'){
          const select=options([['','Select SyncroGroup'],...(node.graph.extra?.syncroGroups || []).map(g=>[g.id,g.name])],item.config.groupId);select.setAttribute('aria-label','SyncroGroup');select.onchange=()=>edit(()=>{item.config.groupId=select.value;},false);content.append(select);
        }else if(['inPort','outPort'].includes(item.kind))content.append(element('small','',item.config.portId));
        const io=element('div','flowNodeIO');
        for(const direction of ['inputs','outputs']){const column=element('div','flowPorts '+direction);for(const port of item[direction]){const row=element('div','flowPortRow'),dot=button(port.id,()=>wire(item,direction,port));dot.className='flowPort';dot.setAttribute('aria-label',`${item.id} ${port.id}`);ports.set(portKey(item.id,direction,port.id),dot);row.append(dot);
          if(item.kind==='entityRouter' && direction==='outputs' && item.config.dispatch!=='round-robin'){const select=options([['','Select Type'],['anyType','anyType'],...App.entityModelForGraph(node.graph).list().map(t=>[t.typeId,t.name])],port.typeId);select.onchange=()=>edit(()=>{if(item.outputs.some(p=>p!==port && p.typeId===select.value))throw new Error('Each Entity Type can be assigned to only one output.');port.typeId=select.value;});select.setAttribute('aria-label',`${item.id} ${port.id} Entity Type`);row.append(select);}column.append(row);}io.append(column);}card.append(io,element('div','flowNodeReason'));scene.append(card);
      }
      transform();requestAnimationFrame(drawLinks);
    }
    viewport.onpointerdown=e=>{menu?.remove();if(e.target!==viewport && e.target!==scene && e.target!==svg)return;drag={start:[e.clientX,e.clientY],pan:pan.slice()};viewport.setPointerCapture(e.pointerId);};viewport.onpointermove=e=>{if(!drag || drag.item)return;pan=[drag.pan[0]+e.clientX-drag.start[0],drag.pan[1]+e.clientY-drag.start[1]];transform();};viewport.onpointerup=()=>{if(drag && !drag.item)drag=null;};
    viewport.addEventListener('wheel',e=>{e.preventDefault();const rect=viewport.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,next=Math.max(.2,Math.min(2.5,zoom*Math.exp(-e.deltaY*.001)));pan=[x-(x-pan[0])*next/zoom,y-(y-pan[1])*next/zoom];zoom=next;transform();},{passive:false});
    function update(){if(!host.isConnected)return;const r=node._flowRuntime,time=Number(root.simNow?.()) || 0;for(const [id,bar] of progress){const cell=r?.cells.find(c=>c.nodeId===id);bar.value=cell?.startedAt!==undefined ? cell.until>cell.startedAt ? Math.max(0,Math.min(1,(time-cell.startedAt)/(cell.until-cell.startedAt))) : 1 : 0;}for(const [id,card] of elements){card.classList.toggle('is-occupied',!!r?.cells.some(c=>c.nodeId===id));card.querySelector('.flowNodeReason').textContent=r?.cells.some(c=>c.nodeId===id) ? r.error || r.reason || '' : '';}requestAnimationFrame(update);}
    draw();notice.textContent=model.validate(flow,node).join(' ');requestAnimationFrame(()=>{fit();drawLinks();update();});return host;
  };
})(window);
