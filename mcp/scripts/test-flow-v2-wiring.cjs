// Event-handler unit tests. The small DOM double is not a browser/visual test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,graph,node,source,at,App}=require('./flow-v2-test-harness.cjs');
class Element {
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.attributes={};this.events={};this.isConnected=true;this.className='';this.clientWidth=1400;this.clientHeight=500;this.offsetWidth=230;this.offsetHeight=140;this.classList={add:(x)=>this.classList.toggle(x,true),remove:(x)=>this.classList.toggle(x,false),contains:x=>this.className.split(' ').includes(x),toggle:(x,on)=>{const s=new Set(this.className.split(' ').filter(Boolean));if(on??!s.has(x))s.add(x);else s.delete(x);this.className=[...s].join(' ');}};}
 append(...els){for(const e of els){e.parentElement=this;this.children.push(e);}}
 replaceChildren(...els){this.children=[];this.append(...els);}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=String(v);}
 addEventListener(k,fn){this.events[k]=fn;}
 setCustomValidity(message){this.validationMessage=message;}
 focus(){this.ownerDocument.activeElement=this;}
 setPointerCapture(id){this.capture=id;}
 hasPointerCapture(id){return this.capture===id;}
 releasePointerCapture(){this.capture=null;}
 matches(s){return s.split(',').some(x=>x[0]==='.' ? this.classList.contains(x.slice(1)) : this.tagName.toLowerCase()===x);}
 closest(s){return this.matches(s) ? this : this.parentElement?.closest(s);}
 contains(e){return e===this || this.children.some(c=>c.contains(e));}
 querySelector(s){return this.children.find(c=>c.matches(s)) || this.children.map(c=>c.querySelector(s)).find(Boolean);}
 getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:100,bottom:24,width:100,height:24};}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
}
const frames=[];
global.document={getElementById(){return null;},createElement(tag){return new Element(tag,this);},createElementNS(ns,tag){return new Element(tag,this);},elementFromPoint(){return this.dropTarget;}};
global.ResizeObserver=class{observe(){}disconnect(){}};
global.requestAnimationFrame=fn=>frames.push(fn);
vm.runInThisContext(fs.readFileSync(path.join(root,'js/app/flow-status.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root,'js/app/flow-view.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root,'js/app/sim.js'),'utf8'));
const walk=e=>[e,...e.children.flatMap(walk)];
const event=(target,extra={})=>({target,button:0,detail:1,pointerId:1,clientX:0,clientY:0,preventDefault(){},stopPropagation(){},...extra});
function editor(kind='basic',setup=()=>{}){const g=graph(),n=node(g,kind);setup(n);const host=App.createFlowView(n);return {g,n,host,port:(id,direction,p)=>walk(host).find(e=>e.classList.contains('flowPort')&&e.dataset.nodeId===id&&e.dataset.direction===direction&&(!p||e.dataset.portId===p)),notice:()=>walk(host).find(e=>e.classList.contains('flowNotice')).textContent};}
function menuAction(e,id,label){const card=walk(e.host).find(x=>x.dataset.flowId===id);card.oncontextmenu(event(card));return walk(e.host).find(x=>x.tagName==='BUTTON'&&x.textContent===label);}
function tap(port){const viewport=port.closest('.flowViewport');port.onpointerdown(event(port));viewport.onpointerup(event(port));}
function dragPort(port,target,shiftKey=false){const viewport=port.closest('.flowViewport');port.onpointerdown(event(port,{shiftKey}));document.dropTarget=target;viewport.onpointermove(event(port,{clientX:80,clientY:40}));viewport.onpointerup(event(port,{clientX:80,clientY:40}));}
const results=[];
function test(name,fn){try{frames.length=0;fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.stack});}}
test('Connector labels use IN and OUT while serialized port IDs stay compatible',()=>{
 const e=editor();
 assert.equal(e.port('process1','inputs').querySelector('.flowPortLabel').textContent,'IN');
 assert.equal(e.port('join1','inputs','inPort2').querySelector('.flowPortLabel').textContent,'IN2');
 assert.equal(e.port('fork1','outputs','outPort2').querySelector('.flowPortLabel').textContent,'OUT2');
 assert.equal(App.FlowModel.portLabel('parentInPort'),'Parent IN');
 assert.equal(App.FlowModel.portLabel('childOutPort'),'Child OUT');
 assert.equal(e.n.properties.flow.nodes.find(n=>n.id==='process1').inputs[0].id,'inPort');
});
test('Dragging replaces an occupied output and input in one commit',()=>{
 const e=editor();dragPort(e.port('inPort1','outputs'),e.port('process1','inputs'));
 const links=e.n.properties.flow.links;assert.equal(links.filter(l=>l.from==='inPort1').length,1);assert.equal(links.filter(l=>l.to==='process1').length,1);assert(links.some(l=>l.from==='inPort1'&&l.to==='process1'));assert(!links.some(l=>l.from==='join1'&&l.to==='process1'));
});
test('Shift input-to-output drag supports changing the source',()=>{
 const e=editor();dragPort(e.port('process1','inputs'),e.port('inPort1','outputs'),true);assert(e.n.properties.flow.links.some(l=>l.from==='inPort1'&&l.to==='process1'));
});
test('Two-click wiring and keyboard port activation both work',()=>{
 for(const keyboard of [false,true]){const e=editor();for(const p of [e.port('inPort1','outputs'),e.port('process1','inputs')])if(keyboard)p.onclick(event(p,{detail:0}));else tap(p);assert(e.n.properties.flow.links.some(l=>l.from==='inPort1'&&l.to==='process1'));}
});
test('A preview appears while dragging; a blank drop preserves all existing wires',()=>{
 const e=editor(),before=JSON.stringify(e.n.properties.flow.links),p=e.port('inPort1','outputs');p.onpointerdown(event(p));p.closest('.flowViewport').onpointermove(event(p,{clientX:150,clientY:150}));assert(walk(e.host).some(x=>x.classList.contains('is-preview')));document.dropTarget=e.host;p.closest('.flowViewport').onpointerup(event(p,{clientX:150,clientY:150}));assert.equal(JSON.stringify(e.n.properties.flow.links),before);assert(!walk(e.host).some(x=>x.classList.contains('is-preview')));
});
test('Esc, pointer cancellation and invalid direction never remove original connections',()=>{
 for(const action of ['Escape','pointercancel','same-direction','same-node']){const e=editor(),before=JSON.stringify(e.n.properties.flow.links),p=e.port('process1','outputs');if(action==='same-direction'||action==='same-node')dragPort(p,e.port(action==='same-node'?'process1':'inPort1',action==='same-node'?'inputs':'outputs'));else{p.onpointerdown(event(p));p.closest('.flowViewport').onpointermove(event(p,{clientX:150,clientY:150}));if(action==='Escape')e.host.events.keydown(event(e.host,{key:'Escape'}));else p.closest('.flowViewport').onpointercancel();}assert.equal(JSON.stringify(e.n.properties.flow.links),before);}
});
test('Selected wire Delete and a port context click disconnect the intended wire',()=>{
 for(const method of ['selected','port']){const e=editor(),count=e.n.properties.flow.links.length;if(method==='selected'){tap(e.port('inPort1','outputs'));e.host.events.keydown(event(e.host,{key:'Escape'}));const hit=walk(e.host).find(x=>x.classList.contains('flowWireHit'));tap(hit);e.host.events.keydown(event(e.host,{key:'Delete'}));}else e.port('process1','inputs').oncontextmenu(event(e.host));assert.equal(e.n.properties.flow.links.length,count-1);}
});
test('Wiring after Process, Recovery or completion resets the run and can be repaired and restarted',()=>{
 for(const time of [0,2000,10000]){
  const e=editor(),s=source(e.g,'a',1),sink=node(e.g,'sink');s.connect(0,e.n,0);e.n.connect(0,sink,0);at(e.g,0);if(time>0)at(e.g,2000);if(time>2000)at(e.g,time);
  const inputId=e.n.inputs[0].portId,outputId=e.n.outputs[0].portId;
  dragPort(e.port('inPort1','outputs'),e.port('process1','inputs'));
  assert(e.n.properties.flow.links.some(l=>l.from==='inPort1'&&l.to==='process1'));assert.match(e.notice(),/reset to 0 s/);
  assert.equal(simNow(),0);assert.equal(s._sent,0);assert.equal(sink._recv.length,0);assert.equal(App.FlowRuntime.isActive(e.n),false);
  assert.equal(e.g.getNodeById(e.n.id),e.n);assert.equal(e.n.inputs[0].portId,inputId);assert.equal(e.n.outputs[0].portId,outputId);
  assert.equal(App.runtimeInstancesForGraph(e.g).instances.size,0);
  dragPort(e.port('inPort1','outputs'),e.port('join1','inputs','inPort1'));dragPort(e.port('join1','outputs'),e.port('process1','inputs'));
  assert.deepEqual(App.FlowModel.validate(e.n.properties.flow,e.n),[]);at(e.g,0);at(e.g,2000);assert.equal(sink._recv.length,1);assert.equal(sink._recv[0].t,2000);
 }
});
test('Editing an idle Flow with initial work does not start processing or lock further edits',()=>{
 const e=editor();App.runtimeInstancesForGraph(e.g).create('a',{locationNodeId:e.n.id});const modified=App.FlowModel.clone(e.n.properties.flow);modified.nodes.find(n=>n.kind==='process').config.seconds=4;App.FlowModel.commit(e.n,modified);assert.equal(App.FlowRuntime.isActive(e.n),false);const next=App.FlowModel.clone(modified);next.links=[];App.FlowModel.commit(e.n,next);assert.equal(App.FlowRuntime.isActive(e.n),false);assert.equal(App.runtimeInstancesForGraph(e.g).rootsAt(e.n.id).length,1);
});
test('A temporarily incomplete edit can be repaired and the Join/Fork cycle runs normally',()=>{
 const e=editor();dragPort(e.port('inPort1','outputs'),e.port('process1','inputs'));assert(App.FlowModel.validate(e.n.properties.flow,e.n).length>0);
 dragPort(e.port('inPort1','outputs'),e.port('join1','inputs','inPort1'));dragPort(e.port('join1','outputs'),e.port('process1','inputs'));assert.deepEqual(App.FlowModel.validate(e.n.properties.flow,e.n),[]);
 const s=source(e.g,'a',1),sink=node(e.g,'sink');s.connect(0,e.n,0);e.n.connect(0,sink,0);at(e.g,0);assert.equal(e.n._state,'PROCESS');at(e.g,2000);assert.equal(e.n._state,'RECOVERY');assert.equal(sink._recv.length,1);
});
test('Dragging an occupied input reconnects its existing wire to a new input',()=>{
 const e=editor();dragPort(e.port('process1','inputs'),e.port('recovery1','inputs'));assert(e.n.properties.flow.links.some(l=>l.from==='join1'&&l.to==='recovery1'));assert(!e.n.properties.flow.links.some(l=>l.to==='process1'));
});
test('Dragging a wire itself reconnects its destination',()=>{
 const e=editor();tap(e.port('inPort1','outputs'));e.host.events.keydown(event(e.host,{key:'Escape'}));const hit=walk(e.host).find(x=>x.classList.contains('flowWireHit')&&x.dataset.nodeId==='inPort1');dragPort(hit,e.port('process1','inputs'));assert(e.n.properties.flow.links.some(l=>l.from==='inPort1'&&l.to==='process1'));
});
test('Dropping near a compatible port snaps to it without requiring a direct hit',()=>{
 const e=editor(),p=e.port('inPort1','outputs'),target=e.port('process1','inputs'),viewport=p.closest('.flowViewport');
 for(const dot of walk(e.host).filter(x=>x.classList.contains('flowPortDot')))dot.getBoundingClientRect=()=>({left:900,top:900,width:14,height:14});
 target.querySelector('.flowPortDot').getBoundingClientRect=()=>({left:100,top:100,width:14,height:14});document.dropTarget=e.host;
 p.onpointerdown(event(p));viewport.onpointermove(event(p,{clientX:120,clientY:107}));assert(target.classList.contains('is-drop-target'));viewport.onpointerup(event(p,{clientX:120,clientY:107}));assert(e.n.properties.flow.links.some(l=>l.from==='inPort1'&&l.to==='process1'));
});
test('Removing added Join/Fork ports deletes only their wires and re-add uses a fresh ID',()=>{
 for(const [id,direction,prefix] of [['join1','inputs','inPort'],['fork1','outputs','outPort']]){
  const connectorLabel=direction==='inputs'?'IN':'OUT',e=editor();menuAction(e,id,'Add '+connectorLabel).onclick();
  const extra=e.port(id,direction,prefix+'3');
  dragPort(extra,direction==='inputs' ? e.port('inPort1','outputs') : e.port('outPort1','inputs'),true);
  const affected=l=>direction==='inputs' ? l.to===id&&l.input===prefix+'3' : l.from===id&&l.output===prefix+'3';
  assert(e.n.properties.flow.links.some(affected));const kept=e.n.properties.flow.links.filter(l=>!affected(l));
  menuAction(e,id,'Remove '+connectorLabel).onclick();assert.deepEqual(e.n.properties.flow.links,kept);
  assert.equal(e.port(id,direction,prefix+'3'),undefined);assert(menuAction(e,id,'Remove '+connectorLabel).disabled);
  menuAction(e,id,'Add '+connectorLabel).onclick();assert(e.port(id,direction,prefix+'4'));
 }
});
test('Router ports can shrink to one per side, clearing connections and preserving other port IDs',()=>{
 const e=editor('router'),id=e.n.properties.flow.nodes.find(n=>n.kind==='entityRouter').id;
 const original=e.n.properties.flow.nodes.find(n=>n.id===id).outputs[0].id;
 menuAction(e,id,'Remove OUT').onclick();
 assert.deepEqual(e.n.properties.flow.nodes.find(n=>n.id===id).outputs.map(p=>p.id),[original]);
 assert(!e.n.properties.flow.links.some(l=>l.from===id&&l.output==='outPort2'));
 assert(menuAction(e,id,'Remove OUT').disabled);assert(menuAction(e,id,'Remove IN').disabled);
 menuAction(e,id,'Add IN').onclick();menuAction(e,id,'Remove IN').onclick();assert(menuAction(e,id,'Remove IN').disabled);
 menuAction(e,id,'Add OUT').onclick();assert(e.port(id,'outputs','outPort3'),'Imported ports without a counter must not reuse the removed ID');
});
test('Fixed ports and minimum Join/Fork ports cannot be removed',()=>{
 const e=editor();for(const id of ['inPort1','outPort1','process1','recovery1','join1','fork1'])for(const label of ['Remove IN','Remove OUT'])assert(menuAction(e,id,label).disabled,`${id}: ${label}`);
});
test('Port removal during Process or Recovery resets the run and removes the port',()=>{
 for(const time of [0,2000]){
 const e=editor('basic',n=>{
  const f=n.properties.flow,j=f.nodes.find(n=>n.kind==='join'),fork=f.nodes.find(n=>n.kind==='fork'),r=App.FlowModel.add(f,'recovery',{seconds:5});
  j.inputs.push({id:'inPort3'});fork.outputs.push({id:'outPort3'});App.FlowModel.connect(f,fork,r,2);App.FlowModel.connect(f,r,j,0,2);
 });
 const s=source(e.g,'a',1),sink=node(e.g,'sink');s.connect(0,e.n,0);e.n.connect(0,sink,0);
 at(e.g,0);at(e.g,time);menuAction(e,'fork1','Remove OUT').onclick();assert.equal(e.n.properties.flow.nodes.find(n=>n.id==='fork1').outputs.length,2);assert.match(e.notice(),/reset to 0 s/);assert.equal(simNow(),0);assert.equal(App.FlowRuntime.isActive(e.n),false);
 }
});
test('Cancelled, invalid and unchanged wiring preserve runtime; moving and timing edits do too',()=>{
 for(const action of ['cancel','same-node','same-connection','move','time']){
  const e=editor(),s=source(e.g,'a',1),sink=node(e.g,'sink');s.connect(0,e.n,0);e.n.connect(0,sink,0);at(e.g,0);at(e.g,500);
  const runtime=e.n._flowRuntime,instances=App.runtimeInstancesForGraph(e.g),before=JSON.stringify(e.n.properties.flow.links);
  if(action==='cancel'){const p=e.port('process1','outputs');p.onpointerdown(event(p));p.closest('.flowViewport').onpointermove(event(p,{clientX:100,clientY:200}));e.host.events.keydown(event(e.host,{key:'Escape'}));}
  else if(action==='same-node')dragPort(e.port('process1','outputs'),e.port('process1','inputs'));
  else if(action==='same-connection')dragPort(e.port('process1','outputs'),e.port('fork1','inputs'));
  else if(action==='move'){const header=walk(e.host).find(x=>x.classList.contains('flowNodeHeader'));header.onpointerdown(event(header));header.onpointermove(event(header,{clientX:50,clientY:30}));header.onpointerup();}
  else{const input=walk(e.host).find(x=>x.attributes['aria-label']==='process1 seconds');input.value='5';input.onchange();assert.equal(runtime.cells[0].until,5000);}
  assert.equal(e.n._flowRuntime,runtime,action);assert.equal(App.runtimeInstancesForGraph(e.g),instances);assert.equal(simNow(),500);assert.equal(JSON.stringify(e.n.properties.flow.links),before);
 }
});
test('Wiring while running stops the engine, restores Initial Contents and clears output data',()=>{
 const e=editor(),s=source(e.g,'a',1),sink=node(e.g,'sink');s.connect(0,e.n,0);e.n.connect(0,sink,0);
 e.n.properties.initialContents=[{typeId:'a',quantity:1,load:'empty',children:[]}];App.initializeEntityRuntime(e.g);at(e.g,0);at(e.g,500);
 let running=true,stopped=0;const originalRunning=global.isSimRunning,originalStop=global.stopSimLoop;
 global.isSimRunning=()=>running;global.stopSimLoop=()=>{running=false;};App.engine={stop(){stopped++;}};
 try{dragPort(e.port('inPort1','outputs'),e.port('process1','inputs'));assert.equal(running,false);assert.equal(stopped,1);assert.equal(App.engine,null);assert.equal(App.runtimeInstancesForGraph(e.g).rootsAt(e.n.id).length,1);assert(e.g._nodes.every(n=>(n.outputs||[]).every(p=>p._data==null)));assert(Object.values(e.g.links).every(l=>l.data==null));}
 finally{global.isSimRunning=originalRunning;global.stopSimLoop=originalStop;}
});
test('Boundary port deletion after Start updates the same equipment and disconnects external links',()=>{
 const e=editor(),s=source(e.g,'a',1);s.connect(0,e.n,0);at(e.g,0);
 menuAction(e,'inPort1','Delete').onclick();assert.equal(e.n.inputs.length,0);assert.equal(s.outputs[0].links?.length||0,0);assert(!e.n.properties.flow.nodes.some(n=>n.id==='inPort1'));assert.equal(e.g.getNodeById(e.n.id),e.n);assert.equal(simNow(),0);
});
test('Adding, duplicating and deleting Flow boundary nodes keeps equipment port counts synchronized',()=>{
 const e=editor(),select=walk(e.host).find(x=>x.attributes['aria-label']==='Flow node type'),add=walk(e.host).find(x=>x.tagName==='BUTTON'&&x.textContent==='Add');
 select.value='inPort';add.onclick();assert.equal(e.n.inputs.length,2);assert.equal(e.n.properties.flow.nodes.filter(n=>n.kind==='inPort').length,2);
 const added=e.n.properties.flow.nodes.filter(n=>n.kind==='inPort').at(-1);menuAction(e,added.id,'Duplicate').onclick();assert.equal(e.n.inputs.length,3);assert.equal(e.n.properties.flow.nodes.filter(n=>n.kind==='inPort').length,3);
 menuAction(e,added.id,'Delete').onclick();assert.equal(e.n.inputs.length,2);assert.equal(e.n.properties.flow.nodes.filter(n=>n.kind==='inPort').length,2);
});
test('Sensor is available from Add and uses stable, never-reused sequential IDs',()=>{
 const e=editor(),select=walk(e.host).find(x=>x.attributes['aria-label']==='Flow node type'),add=walk(e.host).find(x=>x.tagName==='BUTTON'&&x.textContent==='Add');select.value='sensor';add.onclick();assert(e.n.properties.flow.nodes.some(n=>n.id==='sensor1'&&n.kind==='sensor'));
 menuAction(e,'sensor1','Duplicate').onclick();assert(e.n.properties.flow.nodes.some(n=>n.id==='sensor2'));menuAction(e,'sensor1','Delete').onclick();add.onclick();assert(e.n.properties.flow.nodes.some(n=>n.id==='sensor3'));assert(!e.n.properties.flow.nodes.some(n=>n.id==='sensor1'));
});
test('Loading removes a stale middle port without losing a later port connection',()=>{
 const g=graph(),n=node(g),s=source(g);n.addInput('stale','entity');n.addInput('kept','entity');App.ensureBasicNodePortIds(n);
 const keptId=n.inputs[2].portId;App.FlowModel.add(n.properties.flow,'inPort',{portId:keptId});s.connect(0,n,2);
 const linkId=n.inputs[2].link;App.repairGraphLinks(g);
 assert.equal(n.inputs.length,2);assert.equal(n.inputs[1].portId,keptId);assert.equal(n.inputs[1].link,linkId);assert.equal(g.links[linkId].target_slot,1);
});
test('Context menu stays inside the editor when opened at its bottom right corner',()=>{
 const e=editor(),card=walk(e.host).find(x=>x.dataset.flowId==='fork1');card.oncontextmenu(event(card,{clientX:1399,clientY:499}));
 const menu=walk(e.host).find(x=>x.classList.contains('flowContext'));assert.equal(menu.style.left,'1170px');assert.equal(menu.style.top,'360px');assert.equal(menu.style.maxHeight,'500px');assert.equal(menu.style.overflowY,'auto');
});
test('Flow editor shows the same Start checks on open, refresh and edit',()=>{
 const e=editor('basic',n=>{n.properties.initialContents=[{typeId:'missing',quantity:1,load:'empty',children:[]}];});
 const first=App.FlowModel.graphErrors(e.g)[0];assert(first);assert(e.notice().includes(first));
 e.n.properties.initialContents=[];
 const check=walk(e.host).find(x=>x.tagName==='BUTTON'&&x.textContent==='Check Start');check.onclick();
 assert.match(e.notice(),/Start check: no errors/);
 e.n.properties.initialContents=[{typeId:'missing',quantity:1,load:'empty',children:[]}];
 const input=walk(e.host).find(x=>x.attributes['aria-label']==='process1 seconds');input.value='4';input.onchange();
 assert(e.notice().includes(first));
});
fs.mkdirSync(path.join(root,'artifacts/flow-v2'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/flow-v2/wiring-tests.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));if(results.some(r=>!r.ok))process.exitCode=1;
