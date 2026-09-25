const {root,App}=require('./flow-v2-test-harness.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const results=[];
for(const name of ['simple','branch','shuttle_line5','carrier','pallet_station_demo','sample_line1','sample_line2','parallel_benchmark']){
 try{
  setSimTime(0);const data=JSON.parse(fs.readFileSync(path.join(root,'sample',name+'.json'),'utf8')),g=new LGraph();g.configure(data);App.restoreEntityModel(g,data,true);App.repairGraphLinks(g);App.graph=g;
  for(const node of g._nodes.filter(n=>n.type==='factory/basic')){
   assert.equal(node.inputs.length,node.properties.flow.nodes.filter(item=>item.kind==='inPort').length,`${node.id}: main IN count must match Flow inPort count`);
   assert.equal(node.outputs.length,node.properties.flow.nodes.filter(item=>item.kind==='outPort').length,`${node.id}: main OUT count must match Flow outPort count`);
  }
  assert.deepEqual(App.FlowModel.graphErrors(g),[]);const store=App.runtimeInstancesForGraph(g);assert.deepEqual(store.initializationErrors,[]);
  if(name==='sample_line2'){
   assert.deepEqual(App.entityModelForGraph(g).list().map(t=>t.name),['workA','workB','carryer1','carryer2']);
   const embedded=fs.readFileSync(path.join(root,'sample',name+'.js'),'utf8');
   const context={window:{},atob:value=>Buffer.from(value,'base64').toString('binary'),TextDecoder,Uint8Array};require('node:vm').runInNewContext(embedded,context);assert.deepEqual(JSON.parse(JSON.stringify(context.window.EXAMPLES[name])),JSON.parse(fs.readFileSync(path.join(root,'sample',name+'.json'),'utf8')),'JSON and embedded example must match');
  }
  const engine=App.createSimEngine('event-fast',g);engine.reset();let packChecks=0;const deliveredLinks=new Set(),previousLocations=new Map();
  for(let i=0;i<12000;i++){
   engine.update(100);
   for(const e of store.instances.values()){
    if(e.parentId){const parent=store.get(e.parentId);assert(parent?.childIds.includes(e.instanceId));assert.equal(e.locationNodeId,null);}
    else {assert(store.rootsAt(e.locationNodeId).includes(e));const previous=previousLocations.get(e.instanceId);if(previous!=null && previous!==e.locationNodeId)for(const l of Object.values(g.links))if(l.origin_id===previous && l.target_id===e.locationNodeId)deliveredLinks.add(l.id);previousLocations.set(e.instanceId,e.locationNodeId);}
   }
   for(const n of g._nodes){assert(!n._flowRuntime?.error,n._flowRuntime?.error);for(const c of n._flowRuntime?.cells || []){
    const item=n.properties.flow.nodes.find(item=>item.id===c.nodeId);
    if(item?.kind==='Palletizing' && c.input===item.inputs[0].id){assert(store.childrenOf(c.entity).length<=store.typeOf(c.entity).capacity);packChecks++;}
   }}
  }
  const sinks=g._nodes.filter(n=>n.properties.role==='sink'),created=[...store.typeSequences.values()].reduce((a,b)=>a+b,0),completed=store.completed.reduce((a,r)=>a+Object.values(r.summary).reduce((x,y)=>x+y,0),0);
  assert.equal(created,store.instances.size+completed,'Entity conservation');
  for(const sink of sinks){assert(sink._recv.length>0,'Sink must receive Entities');assert(sink._recv.at(-1).t>900000,'Line must still deliver in the last five minutes');assert.equal(new Set(sink._recv.map(e=>e.instanceId)).size,sink._recv.length);}
  const unused=g._nodes.filter(n=>n.properties.role==='equipment' && !n._flowRuntime?.cycle && !n.properties.initialContents?.length).map(n=>n.id);
  if(name==='sample_line1'){assert.deepEqual(unused,[],'All sample line1 equipment must receive work');assert(packChecks>0);assert(sinks.some(n=>n._recv.some(e=>e.children.length>0)));}
  if(name==='sample_line2'){assert.deepEqual(unused,[],'All sample line2 equipment must receive work with four shared types');assert.equal(App.entityModelForGraph(g).list().length,4,'Simulation must not create route-specific types');}
  results.push({name,ok:true,simulatedSeconds:simNow()/1000,sinks:sinks.map(n=>({id:n.id,count:n._recv.length,lastAt:n._recv.at(-1).t})),created,completed,active:store.instances.size,unusedEquipment:unused,palletizingChecks:packChecks,observedTransferLinks:deliveredLinks.size});
 }catch(error){results.push({name,ok:false,error:error.stack});}
}
fs.writeFileSync(path.join(root,'artifacts/flow-v2/sample-tests.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));if(results.some(r=>!r.ok))process.exitCode=1;
