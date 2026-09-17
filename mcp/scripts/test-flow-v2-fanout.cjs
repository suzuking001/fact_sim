const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,graph,node,source,at,App}=require('./flow-v2-test-harness.cjs');
const results=[];function test(name,fn){try{fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.stack});}}
function setup({count=6,container=false,receivers=false}={}){
 const g=graph(),s=source(g,container?'parent':'a',1),m=node(g),destinations=[];
 if(container)s.properties.source.entries[0].children=[{typeId:'box',children:[{typeId:'a'}]},{typeId:'b'}];
 for(let i=1;i<count;i++)m.addOutput('outPort'+(i+1),'entity');App.ensureBasicNodePortIds(m);
 const f=App.FlowModel.empty(),add=(kind,config)=>App.FlowModel.add(f,kind,config),link=(a,b,o=0,i=0)=>App.FlowModel.connect(f,a,b,o,i);
 const input=add('inPort',{portId:m.inputs[0].portId}),join=add('join'),process=add('process',{seconds:5}),fork1=add('fork'),fork2=add('fork'),recovery=add('recovery',{seconds:3});
 while(fork2.outputs.length<count)fork2.outputs.push({id:'outPort'+(fork2.outputs.length+1)});
 link(input,join);link(join,process);link(process,fork1);link(fork1,fork2);link(fork1,recovery,1);link(recovery,join,0,1);
 for(let i=0;i<count;i++){const out=add('outPort',{portId:m.outputs[i].portId}),destination=node(g,receivers?'machine':'sink');destinations.push(destination);link(fork2,out,i);m.connect(i,destination,0);}
 s.connect(0,m,0);m.properties.flow=f;return {g,s,m,f,fork1,fork2,recovery,destinations};
}
test('The user screenshot validates, with six work branches and a Recovery signal',()=>{
 const e=setup();assert.deepEqual(App.FlowModel.validate(e.f,e.m),[]);const signals=App.FlowModel.signalLinks(e.f);assert.equal(e.f.links.filter(l=>l.from===e.fork2.id&&signals.has(l)).length,0);assert.equal(e.f.links.filter(l=>l.from===e.fork1.id&&signals.has(l)).length,1);
});
test('One root becomes six distinct instances at one timestamp; Recovery starts then',()=>{
 const e=setup();at(e.g,0);at(e.g,5000);const deliveries=e.destinations.flatMap(n=>n._recv);assert.equal(deliveries.length,6);assert.equal(new Set(deliveries.map(d=>d.instanceId)).size,6);assert(deliveries.every(d=>d.t===5000));assert.equal(e.m._flowRuntime.duplicated,5);const r=e.m._flowRuntime.signals.find(c=>c.nodeId===e.recovery.id);assert.equal(r.startedAt,5000);assert.equal(r.until,8000);assert.equal(App.runtimeInstancesForGraph(e.g).instances.size,0);at(e.g,8000);assert.equal(e.m._state,'IDLE');
});
test('One blocked destination prevents every output, every copy and Recovery',()=>{
 const e=setup();let open=false;e.destinations[5].canAcceptEntityInput=()=>open;at(e.g,0);at(e.g,5000);at(e.g,9000);assert(e.destinations.every(n=>n._recv.length===0));assert.equal(App.runtimeInstancesForGraph(e.g).instances.size,1);assert.equal([...App.runtimeInstancesForGraph(e.g).typeSequences.values()].reduce((a,b)=>a+b,0),1);assert(!e.m._flowRuntime.signals.some(c=>c.nodeId===e.recovery.id));assert.equal(e.m._flowRuntime.forkStatus[e.fork2.id].ready,5);
 open=true;at(e.g,10000);assert(e.destinations.every(n=>n._recv[0].t===10000));assert.equal(e.m._flowRuntime.signals.find(c=>c.nodeId===e.recovery.id).startedAt,10000);
});
test('All downstream Process timers start together with upstream Recovery',()=>{
 const e=setup({receivers:true});at(e.g,0);at(e.g,5000);assert(e.destinations.every(n=>n._state==='PROCESS'));assert(e.destinations.every(n=>n._flowRuntime.cells[0].startedAt===5000));assert.equal(App.runtimeInstancesForGraph(e.g).instances.size,6);assert.equal(e.m._state,'RECOVERY');
});
test('Nested contents are deep copies with independent IDs, parents and attributes',()=>{
 const e=setup({container:true,receivers:true});at(e.g,0);const store=App.runtimeInstancesForGraph(e.g),original=store.rootsAt(e.m.id)[0];original.attributes.batch={name:'A'};store.childrenOf(original)[0].attributes.quality={ok:true};at(e.g,5000);
 const roots=e.destinations.map(n=>store.rootsAt(n.id)[0]),trees=roots.map(r=>[r,...store.descendantsOf(r)]);assert(trees.every(t=>t.length===4));assert.equal(new Set(trees.flat().map(x=>x.instanceId)).size,24);assert(roots.every(r=>r.childIds.length===2));assert(roots.every(r=>store.childrenOf(r).every(c=>c.parentId===r.instanceId)));
 roots[1].attributes.batch.name='B';store.childrenOf(roots[1])[0].attributes.quality.ok=false;assert.equal(roots[0].attributes.batch.name,'A');assert.equal(store.childrenOf(roots[0])[0].attributes.quality.ok,true);
});
test('A blocked fanout survives snapshot/restore without extra instances or lost readiness',()=>{
 const e=setup();e.destinations[5].canAcceptEntityInput=()=>false;at(e.g,0);at(e.g,7000);const data=App.FlowRuntime.capture(e.g,e.g.serialize()),copy=new LGraph();copy.configure(App.FlowModel.clone(data));App.restoreEntityModel(copy,data,true);App.FlowRuntime.restore(copy,data);at(copy,10000);assert(e.destinations.every(n=>copy.getNodeById(n.id)._recv[0].t===10000));assert.equal(copy.getNodeById(e.m.id)._flowRuntime.duplicated,5);
});
test('Recovery may use the first Fork port; output ordering does not define its channel',()=>{
 const e=setup();for(const l of e.f.links.filter(l=>l.from===e.fork1.id))l.output=l.output==='outPort1'?'outPort2':'outPort1';assert.deepEqual(App.FlowModel.validate(e.f,e.m),[]);at(e.g,0);at(e.g,5000);assert(e.destinations.every(n=>n._recv.length===1));assert.equal(e.m._flowRuntime.signals.find(c=>c.nodeId===e.recovery.id).startedAt,5000);
});
test('Repeated evaluation while blocked does not allocate copies or advance sequences',()=>{
 const e=setup();e.destinations[0].canAcceptEntityInput=()=>false;at(e.g,0);for(let t=5000;t<5100;t++)at(e.g,t);const store=App.runtimeInstancesForGraph(e.g);assert.equal(store.instances.size,1);assert.equal([...store.typeSequences.values()].reduce((a,b)=>a+b,0),1);assert.equal(e.m._flowRuntime.duplicated,undefined);
});
test('dt, event and event-fast produce six copies at the same transfer time',()=>{
 for(const mode of ['dt','event','event-fast']){const e=setup(),engine=App.createSimEngine(mode,e.g);engine.reset();for(let i=0;i<100;i++)engine.update(100);assert(e.destinations.every(n=>n._recv.length===1),mode);assert(e.destinations.every(n=>n._recv[0].t===5000),mode);assert.equal(e.m._flowRuntime.lastTransferAt,5000,mode);assert.equal(e.m._state,'IDLE',mode);}
});
const example=setup();App.FlowModel.layout(example.f);const exported=example.g.serialize();exported.__factSimFormat=2;exported.__factSimEntityModel=App.entityModelForGraph(example.g).serialize();fs.mkdirSync(path.join(root,'artifacts/flow-fork-fanout'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/flow-fork-fanout/example.json'),JSON.stringify(exported,null,2)+'\n');fs.writeFileSync(path.join(root,'artifacts/flow-fork-fanout/runtime-tests.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));if(results.some(r=>!r.ok))process.exitCode=1;
