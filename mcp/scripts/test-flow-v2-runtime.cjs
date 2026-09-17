const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {root,graph,node,source,times,at,run,flow,App}=require('./flow-v2-test-harness.cjs');
const results=[];function test(name,fn){try{fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
test('Recovery starts at downstream acceptance, never during downstream waiting',()=>{
 const g=graph(),s=source(g,'a',2),m=node(g),sink=node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);times(m,2,3);
 let open=false;sink.canAcceptEntityInput=()=>open;
 at(g,0);assert.equal(m._state,'PROCESS');at(g,2000);assert.equal(m._state,'WAIT');
 const recovery=()=>m._flowRuntime.signals.find(c=>m.properties.flow.nodes.find(n=>n.id===c.nodeId)?.kind==='recovery');
 assert.equal(recovery(),undefined);at(g,9000);assert.equal(recovery(),undefined);assert.equal(s._sent,1);
 open=true;at(g,10000);assert.equal(sink._recv[0].t,10000);assert.equal(recovery().startedAt,10000);assert.equal(recovery().until,13000);assert.equal(m._state,'RECOVERY');
 assert.equal(App.runtimeInstancesForGraph(g).rootsAt(m.id).length,0,'Recovery carries readiness, not a second copy of the work');
 at(g,12999);assert.equal(s._sent,1);at(g,13000);assert.equal(s._sent,2);assert.equal(m._state,'PROCESS');assert.equal(m._flowRuntime.cells[0].startedAt,13000);
});
test('Upstream recovery and downstream process overlap from exactly the same transfer',()=>{
 const g=graph(),s=source(g,'a',2),a=node(g),b=node(g),sink=node(g,'sink');s.connect(0,a,0);a.connect(0,b,0);b.connect(0,sink,0);times(a,2,3);times(b,10,1);
 at(g,0);at(g,2000);assert.equal(a._state,'RECOVERY');assert.equal(b._state,'PROCESS');
 assert.equal(a._flowRuntime.signals.find(c=>c.startedAt!==undefined).startedAt,b._flowRuntime.cells[0].startedAt);
 at(g,5000);assert.equal(a._state,'PROCESS');at(g,7000);assert.equal(a._state,'WAIT');
 at(g,12000);assert.equal(b._state,'RECOVERY');assert.equal(a._state,'WAIT');at(g,13000);assert.equal(a._state,'RECOVERY');assert.equal(b._state,'PROCESS');
 assert.equal(a._flowRuntime.lastForkAt,13000);assert.equal(App.runtimeInstancesForGraph(g).instances.size,1);
});
test('Join waits for every completion input and Fork fires all branches at the transfer time',()=>{
 const g=graph(),s=source(g,'a',2),m=node(g),sink=node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);times(m,1,2);
 const f=m.properties.flow,j=f.nodes.find(n=>n.kind==='join'),fork=f.nodes.find(n=>n.kind==='fork'),second=App.FlowModel.add(f,'recovery',{seconds:5});
 j.inputs.push({id:'inPort3'});fork.outputs.push({id:'outPort3'});App.FlowModel.connect(f,fork,second,2);App.FlowModel.connect(f,second,j,0,2);
 assert.deepEqual(App.FlowModel.validate(f,m),[]);at(g,0);at(g,1000);assert.deepEqual(m._flowRuntime.signals.map(c=>c.startedAt),[1000,1000]);
 at(g,3000);assert.equal(m._state,'RECOVERY');assert.equal(s._sent,1);at(g,5999);assert.equal(s._sent,1);at(g,6000);assert.equal(s._sent,2);assert.equal(m._state,'PROCESS');
});
test('A competing upstream that loses downstream admission does not start recovery',()=>{
 const g=graph(),s1=source(g,'a',1),s2=source(g,'b',1),a=node(g),b=node(g),receiver=node(g),sink=node(g,'sink');
 receiver.addInput('inPort2','entity');App.ensureBasicNodePortIds(receiver);receiver.properties.flow=App.FlowModel.template(receiver);
 s1.connect(0,a,0);s2.connect(0,b,0);a.connect(0,receiver,0);b.connect(0,receiver,1);receiver.connect(0,sink,0);times(a,1,2);times(b,1,2);times(receiver,3,1);
 at(g,0);at(g,1000);assert.equal(a._state,'RECOVERY');assert.equal(b._state,'WAIT');assert.equal(b._flowRuntime.lastForkAt,undefined);
 at(g,4000);assert.equal(b._state,'WAIT');at(g,5000);assert.equal(b._flowRuntime.lastForkAt,5000);assert.equal(b._state,'RECOVERY');
});
test('Recovery survives snapshot, active retiming and a Reset starts ready',()=>{
 const g=graph(),s=source(g,'a',2),m=node(g),sink=node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);times(m,1,4);at(g,0);at(g,1000);
 assert.throws(()=>App.FlowModel.commit(m,{...m.properties.flow,links:[]}),/Reset/,'Recovery is active even with no Entity left');
 const data=App.FlowRuntime.capture(g,g.serialize()),copy=new LGraph();copy.configure(App.FlowModel.clone(data));App.restoreEntityModel(copy,data,true);App.FlowRuntime.restore(copy,data);
 const restored=copy.getNodeById(m.id);at(copy,2000);assert.equal(restored._state,'RECOVERY');assert.equal(copy.getNodeById(s.id)._sent,1);
 const edited=App.FlowModel.clone(restored.properties.flow);edited.nodes.find(n=>n.kind==='recovery').config.seconds=2;App.FlowModel.commit(restored,edited);
 at(copy,2999);assert.equal(copy.getNodeById(s.id)._sent,1);at(copy,3000);assert.equal(restored._state,'PROCESS');assert.equal(copy.getNodeById(s.id)._sent,2);
 const reset=new LGraph();reset.configure(JSON.parse(JSON.stringify(data)));App.restoreEntityModel(reset,data,true);at(reset,0);assert.equal(reset.getNodeById(m.id)._state,'PROCESS');
});
test('Recovery feedback validates and lays out finitely, but unrestricted cycles are rejected',()=>{
 const g=graph(),m=node(g),f=m.properties.flow;assert.deepEqual(App.FlowModel.validate(f,m),[]);App.FlowModel.layout(f);assert(f.nodes.every(n=>n.pos.every(v=>Number.isFinite(v) && v<2000)));
 const serial=App.FlowModel.clone(f),fork=serial.nodes.find(n=>n.kind==='fork'),rec=serial.nodes.find(n=>n.kind==='recovery');serial.links.find(l=>l.from===fork.id && l.output===fork.outputs[0].id).to=rec.id;assert(App.FlowModel.validate(serial,m).length>0);
 const loop=App.FlowModel.clone(f),process=loop.nodes.find(n=>n.kind==='process');loop.links.find(l=>l.from===process.id).to=process.id;assert(App.FlowModel.validate(loop,m).some(e=>e.includes('feedback')));
});
test('Round robin reuses one Entity Type and preserves its next destination under backpressure and restore',()=>{
 const g=graph(),s=source(g,'a',6),m=node(g,'router'),left=node(g,'sink'),right=node(g,'sink');
 s.connect(0,m,0);m.connect(0,left,0);m.connect(1,right,0);times(m,0,0);
 const router=m.properties.flow.nodes.find(n=>n.kind==='entityRouter');router.config.dispatch='round-robin';router.outputs.forEach(p=>{p.typeId='anyType';});
 assert.deepEqual(App.FlowModel.validate(m.properties.flow,m),[]);
 right.canAcceptEntityInput=()=>false;at(g,0);
 assert.equal(left._recv.length,1);assert.equal(right._recv.length,0);at(g,10);assert.equal(left._recv.length,1,'Blocked turn must not be bypassed');
 const snapshot=App.FlowRuntime.capture(g,g.serialize()),restored=new LGraph();restored.configure(snapshot);App.restoreEntityModel(restored,snapshot,true);App.FlowRuntime.restore(restored,snapshot);
 at(restored,20);const a=restored.getNodeById(left.id)._recv,b=restored.getNodeById(right.id)._recv;
 assert.equal(a.length,3);assert.equal(b.length,3);assert.equal(new Set([...a,...b].map(e=>e.instanceId)).size,6);
 assert.deepEqual(a.map(e=>e.id),['A #001','A #003','A #005']);assert.deepEqual(b.map(e=>e.id),['A #002','A #004','A #006']);
});
test('Process and Recovery hold one cycle, apply active edits at the same time',()=>{
 const g=graph(),s=source(g),m=node(g),end=node(g,'sink');s.connect(0,m,0);m.connect(0,end,0);times(m,2,3);at(g,0);assert.equal(m._state,'PROCESS');
 at(g,1000);const extended=App.FlowModel.clone(m.properties.flow);extended.nodes.find(n=>n.kind==='process').config.seconds=20;App.FlowModel.commit(m,extended);assert.equal(m._until,20000);assert.equal(m._flowRuntime.cells[0].startedAt,0);
 at(g,19000);assert.equal(m._state,'PROCESS');assert.equal(s._sent,1);at(g,20000);assert.equal(m._state,'RECOVERY');assert.equal(m._until,23000);
 at(g,21000);const shortened=App.FlowModel.clone(m.properties.flow);shortened.nodes.find(n=>n.kind==='recovery').config.seconds=.5;App.FlowModel.commit(m,shortened);at(g,21000);assert.equal(end._recv.length,1);assert.equal(end._recv[0].t,20000);
 assert.equal(m._state,'PROCESS');assert.equal(m._flowRuntime.cells[0].startedAt,21000);
});
test('Zero and decimal seconds complete at their exact deadlines',()=>{
 const g=graph(),s=source(g,'a',1),m=node(g),end=node(g,'sink');s.connect(0,m,0);m.connect(0,end,0);times(m,0,.125);at(g,0);assert.equal(m._state,'RECOVERY');at(g,124);assert.equal(end._recv.length,1);assert.equal(end._recv[0].t,0);at(g,125);assert.equal(end._recv.length,1);assert.equal(m._state,'IDLE');
});
test('Router type priority, blocked dedicated output, anyType and missing route',()=>{
 const g=graph(),s=source(g,'a',1),m=node(g,'router'),dedicated=node(g),fallback=node(g,'sink'),sink=node(g,'sink');s.connect(0,m,0);m.connect(0,dedicated,0);m.connect(1,fallback,0);dedicated.connect(0,sink,0);
 const {f,items,link}=flow(m,['inPort','entityRouter','outPort','outPort']),[input,router,o1,o2]=items;input.config.portId=m.inputs[0].portId;o1.config.portId=m.outputs[0].portId;o2.config.portId=m.outputs[1].portId;router.outputs=[{id:'a-out',typeId:'a'},{id:'any-out',typeId:'anyType'}];link(input,router);link(router,o1);link(router,o2,1);
 dedicated.canAcceptEntityInput=()=>false;at(g,0);assert.equal(m._flowRuntime.cells.length,1);assert.equal(fallback._recv.length,0);assert.equal(m._flowRuntime.cells[0].nodeId,o1.id);
 router.outputs[1].typeId='a';assert(App.FlowModel.validate(f,m).some(e=>e.includes('unique')));
});
test('Palletizing waits for parent, accepts two compatible children and preserves hierarchy',()=>{
 const g=graph(),parent=source(g,'parent',1),children=source(g,'a',2),pack=node(g,'pack'),sink=node(g,'sink');parent.connect(0,pack,0);children.connect(0,pack,1);pack.connect(0,sink,0);times(pack,0,0);
 const entity=App.runtimeInstancesForGraph(g).create('a');assert.equal(pack.canAcceptEntityInput(1,entity),false);App.runtimeInstancesForGraph(g).destroy(entity);at(g,0);assert.equal(sink._recv.length,1);assert.equal(sink._recv[0].children.length,2);assert.equal(App.runtimeInstancesForGraph(g).instances.size,0);
});
test('Partial and full parents fill only remaining capacity',()=>{
 for(const initial of [1,2]){const g=graph(),parent=source(g,'parent',1),children=source(g,'b',2-initial),pack=node(g,'pack'),sink=node(g,'sink');parent.properties.source.entries[0].children=[{typeId:'a',count:initial}];if(initial===2)children.properties.source.entries=[];parent.connect(0,pack,0);children.connect(0,pack,1);pack.connect(0,sink,0);times(pack,0,0);at(g,0);assert.equal(sink._recv.length,1);assert.equal(sink._recv[0].children.length,2);}
});
test('DePalletizing waits for child delivery and retains grandchildren',()=>{
 const g=graph(),s=source(g,'parent',1),unpack=node(g,'unpack'),parentSink=node(g,'sink'),childSink=node(g,'sink');s.properties.source.entries[0].children=[{typeId:'box',count:1,children:[{typeId:'a',count:1}]},{typeId:'b',count:1}];s.connect(0,unpack,0);unpack.connect(0,parentSink,0);unpack.connect(1,childSink,0);childSink.canAcceptEntityInput=()=>false;at(g,0);assert.equal(parentSink._recv.length,0);assert.equal(childSink._recv.length,0);childSink.canAcceptEntityInput=()=>true;at(g,1);assert.equal(childSink._recv.length,2);assert.equal(childSink._recv[0].typeId,'box');assert.equal(childSink._recv[0].children.length,1);assert.equal(parentSink._recv.length,1);assert.equal(parentSink._recv[0].children.length,0);assert.equal(App.runtimeInstancesForGraph(g).instances.size,0);
});
test('Invalid topology is visible and edits holding an Entity are rejected',()=>{
 const g=graph(),s=source(g,'a',1),m=node(g),sink=node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);times(m,2,1);at(g,0);const broken=App.FlowModel.clone(m.properties.flow);broken.nodes.pop();assert.throws(()=>App.FlowModel.commit(m,broken),/Reset/);assert.throws(()=>g.remove(m),/Reset/);assert.throws(()=>App.entityModelForGraph(g).upsert({typeId:'a',capacity:2}),/Reset/);
 const empty=node(g);const invalid=App.FlowModel.clone(empty.properties.flow);invalid.links=[];App.FlowModel.commit(empty,invalid);assert(App.FlowModel.graphErrors(g).length>0);assert.equal(empty.properties.flow.links.length,0);
});
test('Snapshot restore preserves Entity identity, links, hierarchy and deadlines',()=>{
 const g=graph(),s=source(g,'a',1),m=node(g),sink=node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);times(m,2,1);at(g,500);const data=App.FlowRuntime.capture(g,g.serialize()),snapshot=new LGraph();snapshot.configure(data);App.restoreEntityModel(snapshot,data,true);App.FlowRuntime.restore(snapshot,data);const restored=snapshot.getNodeById(m.id);assert.equal(restored._flowRuntime.cells[0].entity,App.runtimeInstancesForGraph(snapshot).get(restored._flowRuntime.cells[0].entity.instanceId));assert.equal(restored._until,2500);at(snapshot,2500);assert.equal(snapshot.getNodeById(sink.id)._recv.length,1);assert.equal(restored._state,'RECOVERY');at(snapshot,3500);assert.equal(restored._state,'IDLE');
});
function synchronized(g){
 const n=node(g),{items,link}=flow(n,['inPort','syncroJudgment','outPort']),[input,sync,output]=items;
 input.config.portId=n.inputs[0].portId;output.config.portId=n.outputs[0].portId;sync.config.groupId='team';link(input,sync);link(sync,output);return n;
}
test('SyncroGroup includes empty members and releases all members atomically',()=>{
 const g=graph();g.extra.syncroGroups=[{id:'team',name:'Team'}];const s1=source(g,'a',1),s2=source(g,'b',1),m1=synchronized(g),m2=synchronized(g),e1=node(g,'sink'),e2=node(g,'sink');s1.connect(0,m1,0);s2.connect(0,m2,0);m1.connect(0,e1,0);m2.connect(0,e2,0);
 App.FlowRuntime.runtime(s2).nextAt=100;at(g,0);assert.equal(e1._recv.length,0);assert.equal(m1._flowRuntime.cells.length,1);
 e2.canAcceptEntityInput=()=>false;at(g,100);assert.equal(e1._recv.length,0);assert.equal(e2._recv.length,0);assert.equal(m2._flowRuntime.cells.length,1);
 e2.canAcceptEntityInput=()=>true;at(g,200);assert.equal(e1._recv[0].t,200);assert.equal(e2._recv[0].t,200);assert.equal(App.runtimeInstancesForGraph(g).instances.size,0);
});
test('SyncroGroup permits atomic circular transfers into simultaneously vacated equipment',()=>{
 const g=graph();g.extra.syncroGroups=[{id:'team',name:'Team'}];const m1=synchronized(g),m2=synchronized(g);m1.connect(0,m2,0);m2.connect(0,m1,0);
 // Timed work after admission prevents an unbounded zero-duration ring.
 for(const m of [m1,m2]){const f=m.properties.flow,input=f.nodes[0],sync=f.nodes[1],timer=App.FlowModel.add(f,'process',{seconds:1});f.links=f.links.filter(l=>l.from!==input.id);App.FlowModel.connect(f,input,timer);App.FlowModel.connect(f,timer,sync);App.runtimeInstancesForGraph(g).create(m===m1 ? 'a' : 'b',{locationNodeId:m.id});}
 at(g,0);at(g,1000);assert.equal(m1._flowRuntime.cells[0].entity.typeId,'b');assert.equal(m2._flowRuntime.cells[0].entity.typeId,'a');assert.equal(App.runtimeInstancesForGraph(g).instances.size,2);
 at(g,2000);assert.equal(m1._flowRuntime.cells[0].entity.typeId,'a');assert.equal(m2._flowRuntime.cells[0].entity.typeId,'b');
});
test('Router falls back only for an unmatched type and reports missing routes',()=>{
 for(const route of ['anyType','b']){const g=graph(),s=source(g,'a',1),m=node(g),end=node(g,'sink');s.connect(0,m,0);m.connect(0,end,0);const {items,link}=flow(m,['inPort','entityRouter','outPort']),[input,router,output]=items;input.config.portId=m.inputs[0].portId;output.config.portId=m.outputs[0].portId;router.outputs[0].typeId=route;link(input,router);link(router,output);at(g,0);if(route==='anyType')assert.equal(end._recv.length,1);else{assert.equal(end._recv.length,0);assert.match(m._flowRuntime.reason,/No output/);assert.equal(m._flowRuntime.cells[0].entity.typeId,'a');}}
});
test('Multiple inputs choose FIFO, with input-port order for simultaneous offers',()=>{
 for(const delayed of [false,true]){const g=graph(),first=source(g,'a',1),second=source(g,'b',1),m=node(g),sink=node(g,'sink');m.addInput('inPort2','entity');App.ensureBasicNodePortIds(m);first.connect(0,m,1);second.connect(0,m,0);m.connect(0,sink,0);const {items,link}=flow(m,['inPort','inPort','entityRouter','outPort']),[i0,i1,r,o]=items;i0.config.portId=m.inputs[0].portId;i1.config.portId=m.inputs[1].portId;o.config.portId=m.outputs[0].portId;r.inputs.push({id:'inPort2'});link(i0,r);link(i1,r,0,1);link(r,o);
 const accept=m.canAcceptEntityInput;m.canAcceptEntityInput=()=>false;if(delayed)App.FlowRuntime.runtime(second).nextAt=50;at(g,0);at(g,50);m.canAcceptEntityInput=accept;at(g,100);assert.deepEqual(sink._recv.map(e=>e.typeId),delayed ? ['a','b'] : ['b','a']);}
});
test('Animation uses active Process and Recovery deadlines across edits and multiple stages',()=>{
 require('node:vm').runInThisContext(fs.readFileSync(path.join(root,'js/link-anim.js'),'utf8'));
 const g=graph(),s=source(g,'a',1),m=node(g),sink=node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);const {f,items,link}=flow(m,['inPort','process','process','recovery','outPort']),[input,p1,p2,recovery,output]=items;input.config.portId=m.inputs[0].portId;output.config.portId=m.outputs[0].portId;p1.config.seconds=2;p2.config.seconds=4;recovery.config.seconds=3;link(input,p1);link(p1,p2);link(p2,recovery);link(recovery,output);
 App.FlowModel.addRecoveryCycle(f);
 at(g,0);at(g,1000);assert.equal(WorkLinkAnimator.sample(g)[0].progress,1/6);const edited=App.FlowModel.clone(f);edited.nodes.find(n=>n.id===p1.id).config.seconds=20;App.FlowModel.commit(m,edited);assert.equal(WorkLinkAnimator.sample(g)[0].progress,1/24);
 at(g,20000);at(g,22000);assert.equal(WorkLinkAnimator.sample(g).length,1);assert.equal(WorkLinkAnimator.sample(g)[0].progress,22/24);at(g,24000);at(g,25000);const row=WorkLinkAnimator.sample(g)[0];assert.equal(row.linkId,m.outputs[0].links[0]);assert.equal(row.progress,1/3);
 const recoveryEdit=App.FlowModel.clone(m.properties.flow);recoveryEdit.nodes.find(n=>n.kind==='recovery').config.seconds=20;App.FlowModel.commit(m,recoveryEdit);assert.equal(WorkLinkAnimator.sample(g)[0].progress,1/20);assert.equal(m._until,44000);at(g,44000);assert.equal(WorkLinkAnimator.sample(g).length,0);assert.equal(sink._recv[0].t,24000);
});
test('IDs never reuse deleted numbers; old files are rejected',()=>{const f=App.FlowModel.empty();assert.equal(App.FlowModel.add(f,'process').id,'process1');f.nodes=[];assert.equal(App.FlowModel.add(f,'process').id,'process2');assert.throws(()=>App.assertFlowFileFormat({nodes:[]}),/Unsupported file format/);});
fs.mkdirSync(path.join(root,'artifacts/flow-v2'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/flow-v2/runtime-tests.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>r.ok ? {name:r.name,ok:true} : r)));if(results.some(r=>!r.ok))process.exitCode=1;
