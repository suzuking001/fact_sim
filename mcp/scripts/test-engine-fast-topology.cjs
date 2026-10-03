const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const harness=require('./flow-v2-test-harness.cjs'),scenarioApp=harness.App,results=[];
function test(name,fn){try{fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
function scope(g,context,fn){if(!context)return fn();scenarioApp.prepareFastFlowTopology(g,context);return scenarioApp.FlowRuntime.withFastContext(context,fn);}
const makeContext=()=>({allocations:true,visuals:new WeakMap(),admission:true,topology:new WeakMap()});

test('In-place rewiring, array replacement, added sensors and restore retain exact transfer/visual histories',()=>{
  function fixture(fast){
    let g=harness.graph(),s=harness.source(g,'a',12),m=harness.node(g),sink=harness.node(g,'sink');
    s.properties.source.intervalSec=.2;s.connect(0,m,0);m.connect(0,sink,0);
    const context=fast ? makeContext() : null;
    const {f,items,link}=harness.flow(m,['inPort','process','process','outPort']);
    const [input,p1,p2,output]=items;input.config.portId=m.inputs[0].portId;output.config.portId=m.outputs[0].portId;
    p1.config.seconds=.01;p2.config.seconds=.02;link(input,p1);link(p1,p2);link(p2,output);
    const trace=[];
    function at(t){scope(g,context,()=>harness.at(g,t));trace.push(scenarioApp.FlowRuntime.capture(g).__flowRuntime);}
    for(const t of [0,10,30,200,210,230])at(t);
    // Same node/link counts and objects; invalidation must still replace indexes.
    f.links[0].to=p2.id;f.links[0].input=p2.inputs[0].id;
    f.links[1].from=p2.id;f.links[1].output=p2.outputs[0].id;f.links[1].to=p1.id;f.links[1].input=p1.inputs[0].id;
    f.links[2].from=p1.id;f.links[2].output=p1.outputs[0].id;scenarioApp.FlowModel.invalidateFlowCaches(f);
    for(const t of [400,420,430])at(t);
    f.nodes=f.nodes.slice().reverse();f.links=f.links.map(edge=>({...edge}));scenarioApp.FlowModel.invalidateFlowCaches(f);
    for(const t of [600,620,630])at(t);
    const sensor=scenarioApp.FlowModel.add(f,'sensor'),edge=f.links.find(edge=>edge.from===p1.id);
    edge.to=sensor.id;edge.input=sensor.inputs[0].id;scenarioApp.FlowModel.connect(f,sensor,output);scenarioApp.FlowModel.invalidateFlowCaches(f);
    m._flowRuntime.checked=false;
    for(const t of [800,820,830])at(t);
    assert.equal(scenarioApp.FlowRuntime.getSensorSummary(m,sensor.id).count,1);
    scenarioApp.FlowModel.commit(m,scenarioApp.FlowModel.clone(f));
    for(const t of [1000,1020,1030])at(t);
    const snapshot=scenarioApp.FlowRuntime.capture(g,g.serialize()),copy=new LGraph();copy.configure(snapshot);
    scenarioApp.restoreEntityModel(copy,snapshot,true);scenarioApp.FlowRuntime.restore(copy,snapshot);g=copy;m=g.getNodeById(m.id);
    for(const t of [1200,1220,1230])at(t);
    assert.equal(trace.at(-1).completed.length,7);return trace;
  }
  assert.deepEqual(fixture(true),fixture(false));
});

test('Live router type/dispatch and timing edits are read after index compilation',()=>{
  function fixture(fast){
    const g=harness.graph(),s=harness.source(g,'a',4),m=harness.node(g,'router'),left=harness.node(g,'sink'),right=harness.node(g,'sink');
    s.properties.source.intervalSec=.1;s.connect(0,m,0);m.connect(0,left,0);m.connect(1,right,0);harness.times(m,.01,0);
    const context=fast ? makeContext() : null,router=m.properties.flow.nodes.find(n=>n.kind==='entityRouter'),trace=[];
    router.outputs[0].typeId='a';router.outputs[1].typeId='anyType';
    const at=t=>{scope(g,context,()=>harness.at(g,t));trace.push(scenarioApp.FlowRuntime.capture(g).__flowRuntime);};
    at(0);at(10);router.outputs[0].typeId='b';at(100);at(110);
    router.config.dispatch='round-robin';at(200);at(210);
    const edited=scenarioApp.FlowModel.clone(m.properties.flow);edited.nodes.find(n=>n.kind==='process').config.seconds=.03;
    scenarioApp.FlowModel.commit(m,edited);at(300);at(310);at(330);
    assert.equal(left._recv.length+right._recv.length,4);assert.equal(trace.at(-1).completed.at(-1).completedAt,330);return trace;
  }
  assert.deepEqual(fixture(true),fixture(false));
});

test('Occupancy is live when cells/signals are replaced and admission is preflighted',()=>{
  const g=harness.graph(),m=harness.node(g),context=makeContext(),r=scenarioApp.FlowRuntime.runtime(m);
  const entry=m.properties.flow.nodes.find(n=>n.kind==='inPort'),edge=m.properties.flow.links.find(l=>l.from===entry.id),target=m.properties.flow.nodes.find(n=>n.id===edge.to);
  const entity=scenarioApp.runtimeInstancesForGraph(g).create('a'),trace=[];
  for(const cells of [[],[{nodeId:target.id,input:edge.input}], [{nodeId:'unrelated',input:edge.input}]]){
    for(const signals of [[],[{nodeId:target.id,input:edge.input}]]){
      r.cells=cells;r.signals=[{nodeId:target.id,input:target.inputs[1].id},...signals];r.controlInitialized=true;
      const baseline=scenarioApp.FlowRuntime.canAccept(m,0,entity);
      const fast=scope(g,context,()=>scenarioApp.FlowRuntime.canAccept(m,0,entity));assert.equal(fast,baseline);trace.push(fast);
    }
  }
  assert(trace.includes(true));assert(trace.includes(false));
});

test('Engine reset discards indexes and a subsequent Flow commit uses the new plan',()=>{
  const g=harness.graph(),s=harness.source(g,'a',1),m=harness.node(g),sink=harness.node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);harness.times(m,.01,0);
  const engine=new scenarioApp.EventFastEngine(g);engine.reset();g.status=LGraph.STATUS_RUNNING;g.sendEventToAllNodes('onStart');engine.update(10);
  const flow=m.properties.flow,plan=engine.flowFastContext.topology.get(flow);assert(plan);engine.update(10);assert.equal(engine.flowFastContext.topology.get(flow),plan);
  engine.reset();assert.equal(engine.flowFastContext.topology.get(flow),undefined);engine.update(10);assert.notEqual(engine.flowFastContext.topology.get(flow),plan);
  const replacement=scenarioApp.FlowModel.clone(flow);scenarioApp.FlowModel.commit(m,replacement);engine.update(10);
  assert(engine.flowFastContext.topology.get(m.properties.flow));engine.stop();
});

const dir=path.join(harness.root,'artifacts/engine-fast-flow-topology');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'topology-tests.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({count:results.length,failures:results.filter(row=>!row.ok)}));
if(results.some(row=>!row.ok))process.exitCode=1;
