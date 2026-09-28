(function(root){
  'use strict';
  const App=root.App,model=App.FlowModel,NS='http://www.w3.org/2000/svg';
  const FLOW_NODE_ICONS=Object.freeze({
    DePalletizing:'flow_unpack',Palletizing:'flow_pack',entityRouter:'flow_router',entitySink:'flow_sink',fork:'flow_fork',
    inPort:'flow_in',join:'flow_join',outPort:'flow_out',process:'flow_process',recovery:'flow_recovery',sensor:'flow_sensor',
    sourceSequence:'flow_sequence',syncroJudgment:'flow_sync'
  });
  const FLOW_NODE_DESCRIPTIONS=Object.freeze({
    DePalletizing:'Unload contents from a parent',Palletizing:'Load children into a parent',entityRouter:'Route by type or round robin',
    entitySink:'Complete and record entities',fork:'Send copies to every output',inPort:'Enter this equipment',join:'Wait for every input',
    outPort:'Leave this equipment',process:'Run the work operation',recovery:'Wait for return / reset',sensor:'Measure count, CT and TPH',
    sourceSequence:'Generate entities in sequence',syncroJudgment:'Wait for the whole sync group'
  });
  function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
  function button(text,action){const b=element('button','',text);b.type='button';b.onclick=action;return b;}
  function options(rows,value){const select=element('select');for(const [id,text] of rows){const option=element('option','',text);option.value=id;select.append(option);}select.value=value || '';select.onfocus=model.pause;return select;}
  function flowNodePicker(rows,value){
    const sorted=rows.slice().sort((a,b)=>a[1].localeCompare(b[1],'en',{sensitivity:'base',numeric:true}));
    const host=element('div','flowNodePicker'),select=options(sorted,value),trigger=button('',()=>setOpen(!host.classList.contains('is-open'))),list=element('div','flowNodePickerList');
    const icon=element('span','flowNodePickerIcon'),label=element('span','flowNodePickerValue'),chevron=element('span','flowNodePickerChevron','⌄');
    select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.setAttribute('aria-label','Flow node type');
    trigger.className='flowNodePickerTrigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','Flow node type');
    icon.setAttribute('aria-hidden','true');chevron.setAttribute('aria-hidden','true');trigger.append(icon,label,chevron);
    list.setAttribute('role','listbox');list.setAttribute('aria-label','Flow node type');list.hidden=true;
    const pickerOptions=()=>Array.from(list.children);
    const itemFor=kind=>sorted.find(row=>row[0]===kind) || sorted[0];
    function update(){
      const item=itemFor(select.value);if(!item)return;
      label.textContent=item[1];icon.dataset.kind=item[0];icon.innerHTML=typeof App.nodeIconSvg==='function' ? App.nodeIconSvg(FLOW_NODE_ICONS[item[0]] || 'basic',{className:'factNodeTypeIcon'}) : '';
      for(const option of pickerOptions()){const selected=option.dataset.kind===item[0];option.classList.toggle('is-selected',selected);option.setAttribute('aria-selected',String(selected));}
    }
    function setOpen(open,focusIndex){
      const next=!!open;host.classList.toggle('is-open',next);trigger.setAttribute('aria-expanded',String(next));list.hidden=!next;
      if(!next)return;
      const items=pickerOptions(),selected=Math.max(0,items.findIndex(item=>item.dataset.kind===select.value)),index=Number.isInteger(focusIndex) ? Math.max(0,Math.min(items.length-1,focusIndex)) : selected;
      items[index]?.focus({preventScroll:true});items[index]?.scrollIntoView?.({block:'nearest'});
    }
    function choose(kind){select.value=kind;update();setOpen(false);trigger.focus();}
    function move(event,delta){
      const items=pickerOptions();if(!items.length)return;const current=Math.max(0,items.indexOf(document.activeElement));
      const index=delta===-Infinity ? 0 : delta===Infinity ? items.length-1 : (current+delta+items.length)%items.length;
      event.preventDefault();items[index].focus({preventScroll:true});items[index].scrollIntoView?.({block:'nearest'});
    }
    for(const [kind,text] of sorted){
      const option=button('',()=>choose(kind)),optionIcon=element('span','flowNodePickerOptionIcon'),optionText=element('span','flowNodePickerOptionText'),optionLabel=element('span','flowNodePickerOptionLabel',text),description=element('span','flowNodePickerOptionDescription',FLOW_NODE_DESCRIPTIONS[kind] || 'Flow node');
      option.className='flowNodePickerOption';option.dataset.kind=kind;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
      optionIcon.dataset.kind=kind;optionIcon.setAttribute('aria-hidden','true');optionIcon.innerHTML=typeof App.nodeIconSvg==='function' ? App.nodeIconSvg(FLOW_NODE_ICONS[kind] || 'basic',{className:'factNodeTypeIcon'}) : '';
      optionText.append(optionLabel,description);option.append(optionIcon,optionText);option.addEventListener('keydown',event=>{
        event.stopPropagation?.();
        if(event.key==='ArrowDown')move(event,1);else if(event.key==='ArrowUp')move(event,-1);else if(event.key==='Home')move(event,-Infinity);else if(event.key==='End')move(event,Infinity);
        else if(event.key==='Enter' || event.key===' '){event.preventDefault();choose(kind);}else if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.focus();}else if(event.key==='Tab')setOpen(false);
      });list.append(option);
    }
    trigger.addEventListener('keydown',event=>{
      event.stopPropagation?.();
      if(event.key==='ArrowDown' || event.key==='ArrowUp'){event.preventDefault();const items=pickerOptions(),selected=Math.max(0,items.findIndex(item=>item.dataset.kind===select.value));setOpen(true,event.key==='ArrowDown' ? selected : Math.max(0,selected-1));}
      else if(event.key==='Enter' || event.key===' '){event.preventDefault();setOpen(!host.classList.contains('is-open'));}else if(event.key==='Escape')setOpen(false);
    });
    host.addEventListener('focusout',event=>{if(!host.contains(event.relatedTarget))setOpen(false);});
    const outside=event=>{if(host.classList.contains('is-open') && !host.contains(event.target))setOpen(false);};document.addEventListener?.('pointerdown',outside);
    host.append(select,trigger,list);update();
    return {host,select,close:()=>setOpen(false),destroy:()=>document.removeEventListener?.('pointerdown',outside)};
  }
  App.createFlowView=function(node,viewOptions={}){
    const editorOptions=viewOptions && typeof viewOptions==='object' ? viewOptions : {};
    const host=element('section','flowEditor'),toolbar=element('div','flowToolbar'),viewport=element('div','flowViewport'),scene=element('div','flowScene'),notice=element('div','flowNotice');
    notice.setAttribute('role','status');host.tabIndex=-1;host.append(toolbar,viewport,notice);viewport.append(scene);
    const wiringHint='Drag between the round ports to connect. Drag an existing wire or its input end to reconnect. Esc cancels.';
    const hint=node.properties.role==='sink' ? 'Connect the Flow to Entity Sink to record completed Entities.' : node.properties.role==='source' ? 'Configure and connect Source Sequence like any other Flow node.' : wiringHint;
    function setNotice(message,isError=false){
      notice.textContent=message;notice.classList.toggle('is-error',isError);
      const parent=isError ? viewport : host;
      if(notice.parentElement!==parent){notice.remove();parent.append(notice);}
    }
    function showChecks(message='',editError=false){
      const errors=model.graphErrors(node.graph);
      setNotice([message,errors.length ? `Start check: ${errors.length} error(s)\n${errors.join('\n')}` : `Start check: no errors. ${hint}`].filter(Boolean).join('\n'),editError || !!errors.length);
    }
    toolbar.append(button('Check Start',()=>showChecks()));
    let flow=model.clone(node.properties.flow),zoom=1,pan=[16,16],pending=null,menu=null,drag=null,autoFit=true,connectionDrag=null,pointer=null,selectedLink=null;
    const elements=new Map(),ports=new Map(),progress=new Map(),liveViews=new Map();let svg,snapTarget=null,boundaryEdits=[];
    const picker=flowNodePicker(Object.entries(model.definitions).map(([id,d])=>[id,d.label]),'process'),selection=picker.select;
    const fit=()=>{autoFit=true;if(!flow.nodes.length || viewport.clientWidth<=24 || viewport.clientHeight<=24)return;const minX=Math.min(...flow.nodes.map(n=>n.pos[0])),minY=Math.min(...flow.nodes.map(n=>n.pos[1]));const w=Math.max(...flow.nodes.map(n=>n.pos[0]+(elements.get(n.id)?.offsetWidth || 230)))-minX,h=Math.max(...flow.nodes.map(n=>n.pos[1]+(elements.get(n.id)?.offsetHeight || 160)))-minY;zoom=Math.max(.05,Math.min(1.2,(viewport.clientWidth-24)/w,(viewport.clientHeight-24)/h));pan=[(viewport.clientWidth-w*zoom)/2-minX*zoom,(viewport.clientHeight-h*zoom)/2-minY*zoom];transform();};
    const zoomReadout=element('span','flowZoomReadout','100%');zoomReadout.setAttribute('aria-label','Flow zoom');
    const zoomTo=next=>{autoFit=false;const x=viewport.clientWidth/2,y=viewport.clientHeight/2;next=Math.max(.05,Math.min(2.5,next));pan=[x-(x-pan[0])*next/zoom,y-(y-pan[1])*next/zoom];zoom=next;transform();};
    const expand=button('Expand Flow',()=>{const expanded=host.classList.toggle('is-expanded');expand.textContent=expanded ? 'Close expanded view' : 'Expand Flow';expand.setAttribute('aria-pressed',String(expanded));});expand.setAttribute('aria-pressed','false');
    const addNode=button('Add',()=>edit(()=>{const item=model.add(flow,selection.value,{},[(40-pan[0])/zoom,(40-pan[1])/zoom]);boundary(item);}));
    toolbar.append(button('Fit All',fit),button('−',()=>zoomTo(zoom/1.25)),zoomReadout,button('+',()=>zoomTo(zoom*1.25)),button('100%',()=>zoomTo(1)),expand,picker.host,addNode);
    function transform(){scene.style.transform=`translate(${pan[0]}px,${pan[1]}px) scale(${zoom})`;zoomReadout.textContent=`${Math.round(zoom*100)}%`;}
    function boundary(item){if(!['inPort','outPort'].includes(item.kind))return;item.config.portId=item.id;boundaryEdits.push(()=>{const input=item.kind==='inPort',method=input ? 'addInput' : 'addOutput',list=input ? node.inputs : node.outputs;node[method](item.id,'entity');const port=list[list.length-1];port.portId=item.id;port.channel='entity';});}
    function edit(action,render=true){
      model.pause();const previous=model.clone(flow);boundaryEdits=[];
      try{
        action();
        if(editorOptions.draft && flow.nodes.some(item=>item.kind==='sourceSequence'))node.properties.source ||= {entries:[],intervalSec:0,repeat:true};
        const topology=f=>JSON.stringify(f,(key,value)=>['seconds','pos','flipIO','counters','portCounters'].includes(key) ? undefined : value);
        const changed=topology(previous)!==topology(flow);
        const reset=!editorOptions.draft && changed && App.resetSimulationForFlowEdit(node.graph);
        for(const apply of boundaryEdits)apply();
        if(editorOptions.draft){
          node.properties.flow=model.clone(flow);App.syncBasicNodePortsFromFlow?.(node,node.properties.flow);model.invalidateFlowCaches(node.properties.flow);node.setDirtyCanvas?.(true,true);editorOptions.onChange?.(node.properties.flow);
        }else model.commit(node,flow);
        const message=reset ? 'Flow changed. Simulation reset to 0 s; Start runs the edited Flow.' : '';
        showChecks(message);
        if(reset)App.showToast?.(message);
        if(render)draw();
      }
      catch(error){flow=previous;showChecks(error.message,true);if(render)draw();}
    }
    function portKey(id,direction,port){return `${id}/${direction}/${port}`;}
    function endpoint(dot){return {nodeId:dot.dataset.nodeId,direction:dot.dataset.direction,portId:dot.dataset.portId};}
    function cancelConnection(){pending=null;pointer=null;connectionDrag=null;snapTarget=null;showChecks();drawLinks();}
    function choosePort(end){
      model.pause();
      selectedLink=null;
      if(pending && pending.direction!==end.direction){
        const start=pending;pending=null;pointer=null;
        const output=start.direction==='outputs' ? start : end,input=start.direction==='inputs' ? start : end;
        if(flow.links.some(l=>l.from===output.nodeId && l.output===output.portId && l.to===input.nodeId && l.input===input.portId)){drawLinks();return;}
        edit(()=>model.rewire(flow,start,end));
      }
      else{pending=end;pointer=null;setNotice(`Select or drag to an ${end.direction==='outputs' ? 'input' : 'output'} port. Esc cancels.`);drawLinks();}
    }
    function targetAt(x,y,start){
      const direct=host.ownerDocument.elementFromPoint(x,y)?.closest('.flowPort');
      const valid=dot=>dot && host.contains(dot) && dot.dataset.direction!==start.direction && dot.dataset.nodeId!==start.nodeId;
      if(valid(direct))return direct;
      let best=null,distance=28;
      for(const dot of ports.values())if(valid(dot)){const r=dot.querySelector('.flowPortDot').getBoundingClientRect(),d=Math.hypot(x-r.left-r.width/2,y-r.top-r.height/2);if(d<distance){best=dot;distance=d;}}
      return best;
    }
    function beginConnection(e,dot,wire){
      if(e.button!==0)return;e.preventDefault();e.stopPropagation();host.focus({preventScroll:true});model.pause();
      const end=endpoint(dot),existing=end.direction==='inputs' && flow.links.find(l=>l.to===end.nodeId && l.input===end.portId);
      const start=existing && !e.shiftKey ? {nodeId:existing.from,direction:'outputs',portId:existing.output} : end;
      connectionDrag={end,start,startPoint:[e.clientX,e.clientY],moved:false,wire};viewport.setPointerCapture(e.pointerId);
    }
    function moveConnection(e){
      if(!connectionDrag)return;
      if(Math.hypot(e.clientX-connectionDrag.startPoint[0],e.clientY-connectionDrag.startPoint[1])<4 && !connectionDrag.moved)return;
      connectionDrag.moved=true;pending=connectionDrag.start;selectedLink=null;pointer=[e.clientX,e.clientY];snapTarget=targetAt(e.clientX,e.clientY,pending);drawLinks();
    }
    function endConnection(e){
      if(!connectionDrag)return;e.preventDefault();e.stopPropagation();const gesture=connectionDrag;connectionDrag=null;
      if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
      if(!gesture.moved){if(gesture.wire)selectWire(gesture.wire);else choosePort(gesture.end);return;}
      const target=targetAt(e.clientX,e.clientY,gesture.start);snapTarget=null;
      if(target){pending=gesture.start;choosePort(endpoint(target));}else cancelConnection();
    }
    function selectWire(link){pending=null;pointer=null;selectedLink=link;host.focus({preventScroll:true});setNotice('Drag this wire to a new input, or Delete / Backspace to disconnect.');drawLinks();}
    function portEvents(dot){
      dot.onclick=e=>{if(e.detail===0)choosePort(endpoint(dot));};
      dot.onpointerdown=e=>beginConnection(e,dot);
      dot.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();disconnect(l=>dot.dataset.direction==='outputs' ? l.from===dot.dataset.nodeId && l.output===dot.dataset.portId : l.to===dot.dataset.nodeId && l.input===dot.dataset.portId);};
    }
    function disconnect(matches){pending=null;selectedLink=null;pointer=null;edit(()=>{flow.links=flow.links.filter(l=>!matches(l));model.invalidateFlowCaches(flow);});}
    function anchor(dot){
      const r=dot.querySelector('.flowPortDot').getBoundingClientRect(),s=scene.getBoundingClientRect();
      const left=dot.dataset.direction==='inputs' ? !flow.nodes.find(n=>n.id===dot.dataset.nodeId).flipIO : !!flow.nodes.find(n=>n.id===dot.dataset.nodeId).flipIO;
      return {x:(r.left+r.width/2-s.left)/zoom,y:(r.top+r.height/2-s.top)/zoom,left};
    }
    function curve(a,b){const bend=Math.max(50,Math.abs(b.x-a.x)/2);return `M${a.x},${a.y} C${a.x+(a.left ? -bend : bend)},${a.y} ${b.x+(b.left ? -bend : bend)},${b.y} ${b.x},${b.y}`;}
    function drawLinks(){
      svg.replaceChildren();const signals=model.signalLinks(flow);
      for(const dot of ports.values()){const e=endpoint(dot);dot.classList.toggle('is-connecting',!!pending && e.nodeId===pending.nodeId && e.direction===pending.direction && e.portId===pending.portId);dot.classList.toggle('is-connect-target',!!pending && e.direction!==pending.direction && e.nodeId!==pending.nodeId);dot.classList.toggle('is-drop-target',dot===snapTarget);}
      for(const link of flow.links){const a=ports.get(portKey(link.from,'outputs',link.output)),b=ports.get(portKey(link.to,'inputs',link.input));if(!a || !b)continue;
        const d=curve(anchor(a),anchor(b));
        const path=document.createElementNS(NS,'path');
        path.setAttribute('d',d);path.setAttribute('class','flowWire'+(signals.has(link) ? ' is-completion' : '')+(selectedLink===link ? ' is-selected' : ''));
        const hit=document.createElementNS(NS,'path');hit.setAttribute('d',d);hit.setAttribute('class','flowWireHit');hit.setAttribute('tabindex','0');hit.setAttribute('role','button');hit.setAttribute('aria-label',`Disconnect ${link.from} ${model.portLabel(link.output)} → ${link.to} ${model.portLabel(link.input)}`);Object.assign(hit.dataset,{nodeId:link.from,direction:'outputs',portId:link.output});hit.onpointerdown=e=>beginConnection(e,hit,link);hit.onclick=e=>{if(e.detail===0)selectWire(link);};hit.onkeydown=e=>{if(['Delete','Backspace','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();disconnect(l=>l===link);}};hit.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();disconnect(l=>l===link);};svg.append(hit,path);
      }
      if(pending){const dot=ports.get(portKey(pending.nodeId,pending.direction,pending.portId));if(dot){const a=anchor(dot),r=scene.getBoundingClientRect(),b=snapTarget ? anchor(snapTarget) : pointer ? {x:(pointer[0]-r.left)/zoom,y:(pointer[1]-r.top)/zoom,left:!a.left} : {...a,x:a.x+(a.left ? -70 : 70),left:!a.left};const preview=document.createElementNS(NS,'path');preview.setAttribute('d',curve(a,b));preview.setAttribute('class','flowWire is-preview');svg.append(preview);}}
    }
    host.addEventListener('keydown',e=>{
      if(e.target.matches('input,select,textarea'))return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();selectedLink=null;cancelConnection();}
      else if(selectedLink && ['Delete','Backspace'].includes(e.key)){e.preventDefault();e.stopPropagation();const link=selectedLink;disconnect(l=>l===link);}
    });
    function context(event,item){
      event.preventDefault();menu?.remove();menu=element('div','flowContext');const dynamic=item.kind==='entityRouter';
      const row=(label,action,enabled=true)=>{const b=button(label,()=>{menu.remove();edit(action);});b.disabled=!enabled;menu.append(b);};
      row('Flip IO',()=>{item.flipIO=!item.flipIO;});
      for(const [direction,prefix] of [['inputs','inPort'],['outputs','outPort']]){
        const definition=model.definitions[item.kind],expandable=dynamic || definition.expand===direction;
        const connectorLabel=direction==='inputs' ? 'IN' : 'OUT';
        const rememberCounter=()=>{
          item.portCounters ||= {};
          item.portCounters[direction]=Math.max(item.portCounters[direction] || 0,item[direction].length,...item[direction].map(p=>p.id.startsWith(prefix) ? Number(p.id.slice(prefix.length)) || 0 : 0));
        };
        row('Add '+connectorLabel,()=>{
          rememberCounter();const n=++item.portCounters[direction];
          item[direction].push({id:prefix+n,...(dynamic && direction==='outputs' ? {typeId:''} : {})});
        },expandable);
        row('Remove '+connectorLabel,()=>{
          if(!expandable || item[direction].length<=definition[direction].length)return;
          rememberCounter();const removed=item[direction].pop();
          flow.links=flow.links.filter(l=>direction==='inputs' ? !(l.to===item.id && l.input===removed.id) : !(l.from===item.id && l.output===removed.id));model.invalidateFlowCaches(flow);
          pending=null;pointer=null;connectionDrag=null;snapTarget=null;selectedLink=null;
        },expandable && item[direction].length>definition[direction].length);
        menu.children[menu.children.length-1].title='Remove the last '+connectorLabel+' and its connections';
      }
      row('Delete',()=>{flow.nodes=flow.nodes.filter(n=>n!==item);flow.links=flow.links.filter(l=>l.from!==item.id && l.to!==item.id);model.invalidateFlowCaches(flow);if(['inPort','outPort'].includes(item.kind)){const input=item.kind==='inPort';boundaryEdits.push(()=>{const slot=(input ? node.inputs : node.outputs).findIndex(p=>p.portId===item.config.portId);if(slot>=0)node[input ? 'removeInput' : 'removeOutput'](slot);});}});
      row('Duplicate',()=>{const copy=model.add(flow,item.kind,model.clone(item.config),[item.pos[0]+30,item.pos[1]+150]);copy.inputs=model.clone(item.inputs);copy.outputs=model.clone(item.outputs);copy.flipIO=item.flipIO;boundary(copy);});
      menu.style.maxHeight=host.clientHeight+'px';menu.style.boxSizing='border-box';menu.style.overflowY='auto';
      host.append(menu);const box=host.getBoundingClientRect();menu.style.left=Math.max(0,Math.min(event.clientX-box.left,host.clientWidth-menu.offsetWidth))+'px';menu.style.top=Math.max(0,Math.min(event.clientY-box.top,host.clientHeight-menu.offsetHeight))+'px';
    }
    function draw(){
      scene.replaceChildren();elements.clear();ports.clear();progress.clear();liveViews.clear();svg=document.createElementNS(NS,'svg');svg.classList.add('flowWires');scene.append(svg);
      for(const item of flow.nodes){
        const card=element('article','flowNode');card.dataset.flowId=item.id;card.dataset.kind=item.kind;card.classList.toggle('is-flipped',!!item.flipIO);card.style.left=item.pos[0]+'px';card.style.top=item.pos[1]+'px';
        const header=element('header','flowNodeHeader'),title=element('span','flowNodeTitle',item.id),badge=element('span','flowNodeBadge','IDLE');header.append(title,badge);card.append(header);card.oncontextmenu=e=>context(e,item);elements.set(item.id,card);
        header.onpointerdown=e=>{if(e.button!==0)return;model.pause();drag={item,start:[e.clientX,e.clientY],pos:item.pos.slice()};header.setPointerCapture(e.pointerId);e.stopPropagation();};
        header.onpointermove=e=>{if(!drag?.item)return;autoFit=false;item.pos=[drag.pos[0]+(e.clientX-drag.start[0])/zoom,drag.pos[1]+(e.clientY-drag.start[1])/zoom];card.style.left=item.pos[0]+'px';card.style.top=item.pos[1]+'px';drawLinks();};header.onpointerup=()=>{if(drag?.item){drag=null;edit(()=>{},false);}};
        const content=element('div','flowNodeContent');
        if(item.kind==='sourceSequence'){
          const editor=App.createSourceSequenceEditor?.(node,{...editorOptions,compact:true,onLayout:()=>requestAnimationFrame(()=>{if(svg?.isConnected){if(autoFit)fit();drawLinks();}})});
          if(editor)content.append(editor);else content.append(element('small','','Source sequence settings are unavailable.'));
        }else if(model.definitions[item.kind].timed){
          const label=element('label','flowTime'),input=element('input');input.type='number';input.min='0';input.step='any';input.value=item.config.seconds;input.setAttribute('aria-label',`${item.id} seconds`);input.onfocus=model.pause;
          input.onchange=()=>{const value=Number(input.value);if(input.value.trim()==='' || !Number.isFinite(value) || value<0){input.setCustomValidity('Enter zero or more seconds.');input.reportValidity();return;}input.setCustomValidity('');edit(()=>{item.config.seconds=value;},false);};input.onkeydown=e=>{if(e.key==='Enter')input.blur();};
          label.append(element('span','flowTimeLabel','Duration'),input,element('span','','s'));const bar=element('progress');bar.max=1;bar.value=0;bar.setAttribute('aria-label',`${item.id} progress`);progress.set(item.id,bar);content.append(label,bar);
        }else if(item.kind==='join' || item.kind==='fork'){
          content.append(element('small','',item.kind==='join' ? 'Wait for all inputs. Same Type / ID work copies merge into input 1.' : 'Work outputs receive separate copies; all outputs fire together'));
        }else if(item.kind==='sensor'){
          content.append(element('small','','Counts passing Entities without delay or buffering.'));
        }else if(item.kind==='entityRouter'){
          const select=options([['type','By Entity Type'],['round-robin','Round robin']],item.config.dispatch || 'type');
          select.setAttribute('aria-label',`${item.id} dispatch`);select.onchange=()=>edit(()=>{item.config.dispatch=select.value;});content.append(select);
        }else if(item.kind==='syncroJudgment'){
          const select=options([['','Select SyncroGroup'],...(node.graph.extra?.syncroGroups || []).map(g=>[g.id,g.name])],item.config.groupId);select.setAttribute('aria-label','SyncroGroup');select.onchange=()=>edit(()=>{item.config.groupId=select.value;},false);content.append(select);
        }else if(['inPort','outPort'].includes(item.kind))content.append(element('small','',item.config.portId));
        const io=element('div','flowNodeIO');
        for(const direction of ['inputs','outputs']){const column=element('div','flowPorts '+direction);for(const port of item[direction]){const row=element('div','flowPortRow'),dot=button('',()=>{}),label=model.portLabel(port.id);dot.append(element('span','flowPortDot'),element('span','flowPortLabel',label));dot.className='flowPort';Object.assign(dot.dataset,{nodeId:item.id,direction,portId:port.id});portEvents(dot);dot.setAttribute('aria-label',`${item.id} ${label}`);ports.set(portKey(item.id,direction,port.id),dot);row.append(dot);
          if(item.kind==='entityRouter' && direction==='outputs' && item.config.dispatch!=='round-robin'){const select=options([['','Select Type'],['anyType','anyType'],...App.entityModelForGraph(node.graph).list().map(t=>[t.typeId,t.name])],port.typeId);select.onchange=()=>edit(()=>{if(item.outputs.some(p=>p!==port && p.typeId===select.value))throw new Error('Each Entity Type can be assigned to only one output.');port.typeId=select.value;});select.setAttribute('aria-label',`${item.id} ${label} Entity Type`);row.append(select);}column.append(row);}io.append(column);}const live=element('div','flowLive');if(item.kind==='sourceSequence')card.append(content,io,live,element('div','flowNodeReason'));else card.append(io,content,live,element('div','flowNodeReason'));liveViews.set(item.id,{card,badge,live,signature:''});scene.append(card);
      }
      transform();requestAnimationFrame(drawLinks);
    }
    viewport.onpointerdown=e=>{menu?.remove();picker.close();if(e.target!==viewport && e.target!==scene && e.target!==svg)return;selectedLink=null;cancelConnection();drag={start:[e.clientX,e.clientY],pan:pan.slice()};viewport.setPointerCapture(e.pointerId);};viewport.onpointermove=e=>{if(connectionDrag){moveConnection(e);return;}if(pending){pointer=[e.clientX,e.clientY];snapTarget=targetAt(e.clientX,e.clientY,pending);drawLinks();}if(!drag || drag.item)return;autoFit=false;pan=[drag.pan[0]+e.clientX-drag.start[0],drag.pan[1]+e.clientY-drag.start[1]];transform();};viewport.onpointerup=e=>{if(connectionDrag)endConnection(e);if(drag && !drag.item)drag=null;};viewport.onpointercancel=()=>cancelConnection();viewport.onlostpointercapture=()=>{if(connectionDrag)cancelConnection();};
    viewport.addEventListener('wheel',e=>{e.preventDefault();autoFit=false;const rect=viewport.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,next=Math.max(.2,Math.min(2.5,zoom*Math.exp(-e.deltaY*.001)));pan=[x-(x-pan[0])*next/zoom,y-(y-pan[1])*next/zoom];zoom=next;transform();},{passive:false});
    // Dock resizing and Pop Out / Return to Dock can change dimensions after mount.
    const resizeObserver=new ResizeObserver(()=>{if(host.isConnected && viewport.clientWidth && viewport.clientHeight){if(autoFit)fit();drawLinks();}});resizeObserver.observe(viewport);
    function update(){
      if(!host.isConnected){resizeObserver.disconnect();picker.destroy();return;}
      const time=Number(root.simNow?.()) || 0;let resized=false;
      for(const item of flow.nodes){
        const view=liveViews.get(item.id),status=App.flowNodeStatus(node,item,time),signature=JSON.stringify(status);if(!view || view.signature===signature)continue;
        view.signature=signature;const height=view.card.offsetHeight;view.card.dataset.state=status.state;view.badge.textContent=status.state;
        view.live.replaceChildren();for(const row of status.rows){const line=element('div','flowLiveRow');line.append(element('span','flowLiveLabel',row.label),element('span','flowLiveValue',row.value));if(row.ready!==undefined)line.dataset.ready=String(row.ready);view.live.append(line);}
        const bar=progress.get(item.id);if(bar)bar.value=status.progress;
        for(const direction of ['inputs','outputs'])for(const p of item[direction]){const dot=ports.get(portKey(item.id,direction,p.id));if(dot)dot.dataset.ready=String(status[direction][p.id] ?? false);}
        resized ||= height!==view.card.offsetHeight;
      }
      if(resized){if(autoFit)fit();drawLinks();}requestAnimationFrame(update);
    }
    draw();showChecks();requestAnimationFrame(()=>{fit();drawLinks();update();});return host;
  };
})(window);
