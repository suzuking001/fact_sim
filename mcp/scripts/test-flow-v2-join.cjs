const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,graph,node,source,at,App}=require('./flow-v2-test-harness.cjs');
vm.runInThisContext(fs.readFileSync(path.join(root,'js/app/flow-status.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root,'js/link-anim.js'),'utf8'));
const model=App.FlowModel,results=[];
function test(name,fn){try{fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.stack});}}
function equipment(g){
 const m=node(g);m.addInput('inPort2','entity');App.ensureBasicNodePortIds(m);
 const f=model.empty(),add=(k,c)=>model.add(f,k,c),link=model.connect;
 const i1=add('inPort',{portId:m.inputs[0].portId}),i2=add('inPort',{portId:m.inputs[1].portId}),j1=add('join'),p1=add('process',{seconds:2}),j2=add('join'),p2=add('process',{seconds:0}),fork=add('fork'),out=add('outPort',{portId:m.outputs[0].portId}),recovery=add('recovery',{seconds:3});
 link(f,i1,j1);link(f,j1,p1);link(f,p1,j2);link(f,i2,j2,0,1);link(f,j2,p2);link(f,p2,fork);link(f,fork,out);link(f,fork,recovery,1);link(f,recovery,j1,0,1);m.properties.flow=f;
 return {g,m,f,i1,i2,j1,j2,p1,p2,fork,out,recovery};
}
function setup({count=1,secondType='a',delay=0}={}){
 const e=equipment(graph());e.s1=source(e.g,'a',count);e.s2=source(e.g,secondType,count);e.sink=node(e.g,'sink');
 e.s1.connect(0,e.m,0);e.s2.connect(0,e.m,1);e.m.connect(0,e.sink,0);App.FlowRuntime.runtime(e.s2).nextAt=delay;return e;
}
function fanoutSetup(){
 const e=equipment(graph()),s=source(e.g,'a',3),split=node(e.g);split.addOutput('outPort2','entity');App.ensureBasicNodePortIds(split);
 const f=model.empty(),input=model.add(f,'inPort',{portId:split.inputs[0].portId}),fork=model.add(f,'fork');model.connect(f,input,fork);
 for(let i=0;i<2;i++){const out=model.add(f,'outPort',{portId:split.outputs[i].portId});model.connect(f,fork,out,i);split.connect(i,e.m,i);}
 split.properties.flow=f;s.connect(0,split,0);e.sink=node(e.g,'sink');e.m.connect(0,e.sink,0);return {...e,s,split};
}
test('The screenshot accepts two work inputs and retains the Recovery feedback',()=>{
 const e=setup();assert.deepEqual(model.validate(e.f,e.m),[]);assert.equal(App.FlowRuntime.joinWorkInputs(e.m,e.j1).length,1);assert.equal(App.FlowRuntime.joinWorkInputs(e.m,e.j2).length,2);assert.equal(model.feedbackLinks(e.f).length,1);
});
test('Matching Type and ID merge to input 1, independent of input arrival order',()=>{
 for(const reverse of [false,true]){
  const e=setup({delay:reverse?0:5000});if(reverse)App.FlowRuntime.runtime(e.s1).nextAt=3000;
  at(e.g,0);at(e.g,2000);assert.equal(e.sink._recv.length,0);assert(!e.m._flowRuntime.signals.some(c=>c.nodeId===e.recovery.id));
  at(e.g,3000);at(e.g,5000);assert.equal(e.sink._recv.length,1);assert.equal(e.sink._recv[0].instanceId,`a:${e.s1.id}:1`);assert.equal(e.sink._recv[0].t,5000);
  assert.equal(e.m._flowRuntime.merged,1);assert.equal(App.runtimeInstancesForGraph(e.g).completed.length,1);assert.equal(App.runtimeInstancesForGraph(e.g).instances.size,0);
  assert.equal(e.m._flowRuntime.signals.find(c=>c.nodeId===e.recovery.id).startedAt,5000);
 }
});
test('Input 2 waits for Process 1, then Process 2 animates on the input 2 connection',()=>{
 const e=setup();e.p2.config.seconds=5;const firstLink=e.s1.outputs[0].links[0],secondLink=e.s2.outputs[0].links[0];
 at(e.g,0);assert.equal(e.s2._sent||0,0);assert.equal(e.m._flowRuntime.cells[0].nodeId,e.p1.id);assert.equal(WorkLinkAnimator.sample(e.g).find(row=>row.entityId===`a:${e.s1.id}:1`).linkId,firstLink);
 at(e.g,1999);assert.equal(e.s2._sent||0,0);assert.equal(e.m._flowRuntime.cells[0].nodeId,e.p1.id);assert(Math.abs(WorkLinkAnimator.sample(e.g).find(row=>row.entityId===`a:${e.s1.id}:1`).progress-1999/2000)<1e-9);
 at(e.g,2000);const active=e.m._flowRuntime.cells[0],moving=WorkLinkAnimator.sample(e.g).find(row=>row.entityId===`a:${e.s1.id}:1`);assert.equal(e.s2._sent,1);assert.equal(active.nodeId,e.p2.id);assert.equal(active.startedAt,2000);assert.equal(active.until,7000);assert.equal(moving.linkId,secondLink);assert.equal(moving.progress,0);
 at(e.g,4500);const halfway=WorkLinkAnimator.sample(e.g).find(row=>row.entityId===`a:${e.s1.id}:1`);assert.equal(halfway.linkId,secondLink);assert.equal(halfway.progress,.5);
});
test('Different IDs of the same Type wait without consuming either work',()=>{
 const e=setup(),s=App.runtimeInstancesForGraph(e.g);s.destroy(s.create('a',{creationNodeId:e.s2.id}));at(e.g,0);at(e.g,2000);at(e.g,9000);
 assert.equal(e.sink._recv.length,0);assert.equal(s.instances.size,2);assert.equal(e.m._flowRuntime.merged||0,0);assert.equal(e.s2._sent,0);
 const status=App.flowNodeStatus(e.m,e.j2);assert.equal(status.state,'WAIT');assert.equal(status.rows.find(r=>r.label==='Type / ID match').ready,false);
});
test('Equal display IDs from different Types do not merge',()=>{
 const e=setup({secondType:'b'});at(e.g,0);const s=App.runtimeInstancesForGraph(e.g),b=[...s.instances.values()].find(x=>x.typeId==='b');b.id='A #001';at(e.g,2000);at(e.g,9000);
 assert.equal(e.sink._recv.length,0);assert.equal(s.instances.size,2);assert.equal(e.m._flowRuntime.merged||0,0);
});
test('Downstream blocking does not start Recovery or consume the same copy twice',()=>{
 const e=setup();e.sink.canAcceptEntityInput=()=>false;at(e.g,0);at(e.g,2000);for(let t=2000;t<2010;t++)at(e.g,t);
 assert.equal(e.m._flowRuntime.merged,1);assert.equal(App.runtimeInstancesForGraph(e.g).instances.size,1);assert(!e.m._flowRuntime.signals.some(c=>c.nodeId===e.recovery.id));
 e.sink.canAcceptEntityInput=()=>true;at(e.g,9000);assert.equal(e.sink._recv[0].t,9000);assert.equal(e.m._flowRuntime.signals.find(c=>c.nodeId===e.recovery.id).startedAt,9000);
});
test('Three work inputs wait for the third matching copy',()=>{
 const e=setup();e.m.addInput('inPort3','entity');App.ensureBasicNodePortIds(e.m);const i3=model.add(e.f,'inPort',{portId:e.m.inputs[2].portId});e.j2.inputs.push({id:'inPort3'});model.connect(e.f,i3,e.j2,0,2);const s3=source(e.g,'a',1);s3.connect(0,e.m,2);App.FlowRuntime.runtime(s3).nextAt=4000;
 at(e.g,0);at(e.g,2000);assert.equal(e.sink._recv.length,0);at(e.g,4000);assert.equal(e.sink._recv.length,1);assert.equal(e.m._flowRuntime.merged,2);
});
test('Fork copies preserve display ID and unique instance IDs, including repeated direct Join deliveries',()=>{
 const e=fanoutSetup();at(e.g,0);const copies=App.runtimeInstancesForGraph(e.g).rootsAt(e.m.id);assert.equal(copies.length,2);assert.equal(new Set(copies.map(c=>c.instanceId)).size,2);assert.equal(new Set(copies.map(c=>c.id)).size,1);
 for(let t=100;t<=13000;t+=100)at(e.g,t);
 assert.deepEqual(e.sink._recv.map(r=>r.id),['A #001','A #002','A #003']);assert.equal(e.m._flowRuntime.merged,3);assert.equal(e.split._flowRuntime.duplicated,3);assert.equal(App.runtimeInstancesForGraph(e.g).instances.size,0);
});
test('Fork branches joining inside one Flow are work paths, not completion signals',()=>{
 const g=graph(),m=node(g),s=source(g,'a',1),sink=node(g,'sink'),f=model.empty();
 const input=model.add(f,'inPort',{portId:m.inputs[0].portId}),fork=model.add(f,'fork'),join=model.add(f,'join'),out=model.add(f,'outPort',{portId:m.outputs[0].portId});
 model.connect(f,input,fork);model.connect(f,fork,join);model.connect(f,fork,join,1,1);model.connect(f,join,out);m.properties.flow=f;s.connect(0,m,0);m.connect(0,sink,0);
 assert.deepEqual(model.validate(f,m),[]);assert.equal(model.signalLinks(f).size,0);at(g,0);assert.equal(sink._recv.length,1);assert.equal(m._flowRuntime.merged,1);assert.equal(App.runtimeInstancesForGraph(g).instances.size,0);
});
test('Reuniting copied contents keeps input 1 contents and consumes the duplicate subtree',()=>{
 const e=fanoutSetup();e.s.properties.source.entries=[{typeId:'parent',count:1,children:[{typeId:'box',children:[{typeId:'a'}]},{typeId:'b'}]}];
 at(e.g,0);const store=App.runtimeInstancesForGraph(e.g),first=store.rootsAt(e.m.id).find(x=>x.instanceId.startsWith(`parent:${e.s.id}:`)),children=store.descendantsOf(first).map(x=>x.instanceId);
 assert.equal(store.instances.size,8);at(e.g,2000);assert.equal(e.sink._recv[0].instanceId,first.instanceId);assert.deepEqual(e.sink._recv[0].children,children);assert.equal(store.completed.length,1);assert.equal(store.instances.size,0);
});
test('Join displays both work identities and a mismatch without advancing simulation',()=>{
 const e=setup(),s=App.runtimeInstancesForGraph(e.g),a=s.create('a',{locationNodeId:e.m.id}),b=s.create('b',{locationNodeId:e.m.id,legacyId:a.id}),r=App.FlowRuntime.runtime(e.m);
 r.cells=[{nodeId:e.j2.id,input:'inPort1',entity:a},{nodeId:e.j2.id,input:'inPort2',entity:b}];const before=JSON.stringify(r),status=App.flowNodeStatus(e.m,e.j2);
 assert.equal(status.state,'WAIT');assert.equal(status.rows.find(x=>x.label==='Type / ID match').value,'Mismatch');assert.equal(JSON.stringify(r),before);assert.equal(status.rows.filter(x=>x.label.endsWith(' work')).length,2);
});
test('A waiting Join survives snapshot/restore and still merges into the first input',()=>{
 const e=setup({delay:5000});at(e.g,0);at(e.g,2000);const data=App.FlowRuntime.capture(e.g,e.g.serialize()),copy=new LGraph();copy.configure(model.clone(data));App.restoreEntityModel(copy,data,true);App.FlowRuntime.restore(copy,data);at(copy,5000);
 assert.equal(copy.getNodeById(e.sink.id)._recv[0].instanceId,`a:${e.s1.id}:1`);assert.equal(copy.getNodeById(e.m.id)._flowRuntime.merged,1);
});
test('dt, event and event-fast match on Fork-to-Join output IDs, timing and counts',()=>{
 let expected;
 for(const mode of ['dt','event','event-fast']){const e=fanoutSetup(),engine=App.createSimEngine(mode,e.g);engine.reset();for(let i=0;i<130;i++)engine.update(100);const actual=e.sink._recv.map(r=>({id:r.id,t:r.t}));assert.equal(actual.length,3,mode);if(expected)assert.deepEqual(actual,expected,mode);else expected=actual;assert.equal(e.m._flowRuntime.merged,3);}
});
const e=setup({count:3});model.layout(e.f);e.recovery.pos[1]+=180;e.s1.pos=[80,80];e.s2.pos=[80,380];e.m.pos=[440,200];e.sink.pos=[800,200];const data=e.g.serialize();data.__factSimFormat=2;data.__factSimEntityModel=App.entityModelForGraph(e.g).serialize();
const dir=path.join(root,'artifacts/flow-join-assembly');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'example.json'),JSON.stringify(data,null,2)+'\n');fs.writeFileSync(path.join(dir,'runtime-tests.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,total:results.length,failures:results.filter(r=>!r.ok)}));if(results.some(r=>!r.ok))process.exitCode=1;
