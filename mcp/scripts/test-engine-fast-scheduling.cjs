const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const harness=require('./flow-v2-test-harness.cjs'),scenarioApp=harness.App,results=[];
function test(name,fn){try{fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
function context(mode){return {allocations:true,visuals:new WeakMap(),admission:true,topology:new WeakMap(),sourceSelection:mode!=='previous'};}
function at(g,t,ctx){scenarioApp.prepareFastFlowTopology(g,ctx);return scenarioApp.FlowRuntime.withFastContext(ctx,()=>harness.at(g,t));}
const capture=g=>scenarioApp.FlowRuntime.capture(g).__flowRuntime;

test('Weighted sequence order, non-repeat completion, repeat wrap and hierarchy retain all intermediate histories',()=>{
  function fixture(mode,repeat){
    const g=harness.graph(),s=harness.source(g),m=harness.node(g),sink=harness.node(g,'sink'),ctx=context(mode),trace=[];
    s.connect(0,m,0);m.connect(0,sink,0);harness.times(m,.01,.01);
    s.properties.source={entries:[{typeId:'a',count:2},{typeId:'b',count:3},{typeId:'parent',count:1,children:[{typeId:'a',count:1}]}],intervalSec:.01,repeat};
    for(let time=0;time<=350;time+=5){at(g,time,ctx);trace.push(capture(g));}
    const sequence=sink._recv.map(e=>e.typeId);
    assert.deepEqual(sequence.slice(0,6),['a','a','b','b','b','parent']);
    assert.equal(sink._recv[5].children.length,1);
    if(!repeat){assert.equal(sequence.length,6);assert(Number.isNaN(scenarioApp.FlowRuntime.eventUntil(s)));}
    else{assert(sequence.length>6);assert.equal(sequence[6],'a');}
    return trace;
  }
  for(const repeat of [false,true]){
    const baseline=fixture('previous',repeat);assert.deepEqual(fixture('weighted',repeat),baseline);
  }
});

test('Live counts, entry identity/order, array replacement and type/child edits refresh the selected work',()=>{
  function fixture(mode){
    const g=harness.graph(),s=harness.source(g),sink=harness.node(g,'sink'),ctx=context(mode),trace=[];
    s.connect(0,sink,0);s.properties.source={entries:[{typeId:'a',count:2},{typeId:'b',count:2}],intervalSec:.1,repeat:true};
    const step=t=>{at(g,t,ctx);trace.push(capture(g));};
    step(0);step(100);
    s.properties.source.entries[0].count=3;step(200);
    s.properties.source.entries[1]={typeId:'b',count:2};step(300);
    s.properties.source.entries.reverse();step(400);
    s.properties.source.entries=s.properties.source.entries.map(row=>({...row}));step(500);
    s.properties.source.entries[0].typeId='parent';s.properties.source.entries[0].children=[{typeId:'a',count:1}];step(600);
    assert.equal(sink._recv.at(-1).typeId,'parent');assert.equal(sink._recv.at(-1).children.length,1);
    return trace;
  }
  const baseline=fixture('previous');assert.deepEqual(fixture('weighted'),baseline);
});

test('Backpressure and snapshot restore preserve active Source and its position in a counted entry',()=>{
  function fixture(mode){
    let g=harness.graph(),s=harness.source(g,'a',7),sink=harness.node(g,'sink'),ctx=context(mode),trace=[];
    s.connect(0,sink,0);s.properties.source.intervalSec=.1;let open=false;sink.canAcceptEntityInput=()=>open;
    const step=t=>{at(g,t,ctx);trace.push(capture(g));};step(0);step(99);assert.equal(s._flowRuntime.sourceSequence.created,1);
    open=true;step(100);step(200);step(300);
    const snapshot=scenarioApp.FlowRuntime.capture(g,g.serialize()),copy=new LGraph();copy.configure(snapshot);
    scenarioApp.restoreEntityModel(copy,snapshot,true);scenarioApp.FlowRuntime.restore(copy,snapshot);g=copy;s=g.getNodeById(s.id);
    for(let t=400;t<=800;t+=100)step(t);
    assert.equal(capture(g).completed.length,7);return trace;
  }
  const baseline=fixture('previous');assert.deepEqual(fixture('weighted'),baseline);
});

test('Large quantity avoids expanded arrays and produces exactly the same small executed prefix',()=>{
  function fixture(mode){
    const g=harness.graph(),s=harness.source(g,'a',100000),m=harness.node(g),sink=harness.node(g,'sink'),ctx=context(mode);
    s.connect(0,m,0);m.connect(0,sink,0);harness.times(m,.01,0);
    for(let t=0;t<=100;t+=10)at(g,t,ctx);
    assert.equal(sink._recv.length,10);return capture(g);
  }
  const baseline=fixture('previous');assert.deepEqual(fixture('weighted'),baseline);
});

test('Invalid Source counts still report validation errors, and checked legacy data retains RangeError behavior',()=>{
  for(const count of [-1,.5,Infinity,NaN]){
    function fixture(mode){const g=harness.graph(),s=harness.source(g,'a',count),ctx=context(mode);at(g,0,ctx);assert.equal(s._state,'ERROR');return capture(g);}
    const baseline=fixture('previous');assert.deepEqual(fixture('weighted'),baseline);
  }
  for(const mode of ['previous','weighted']){
    const g=harness.graph(),s=harness.source(g,'a',1.5),ctx=context(mode),r=scenarioApp.FlowRuntime.runtime(s);
    r.checked=true;r.initialized=true;
    assert.throws(()=>at(g,0,ctx),RangeError);assert.equal(r.sourceSequence,undefined);
  }
});

test('Engine update detects direct count edits and reset clears pending events',()=>{
  function fixture(fast){
    const g=harness.graph(),s=harness.source(g,'a',2),m=harness.node(g),sink=harness.node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);harness.times(m,.01,0);
    s.properties.source.intervalSec=.1;
    const engine=new scenarioApp.EventFastEngine(g,{fastSourceSelection:fast}),trace=[];
    engine.reset();g.status=LGraph.STATUS_RUNNING;g.sendEventToAllNodes('onStart');
    engine.update(100);trace.push(capture(g));
    s.properties.source.entries[0].count=5;
    engine.update(200);trace.push(capture(g));engine.update(200);trace.push(capture(g));
    assert.equal(sink._recv.length,5);
    engine.reset();assert.equal(engine.heap.size,0);
    engine.stop();return trace;
  }
  assert.deepEqual(fixture(true),fixture(false));
});

const dir=path.join(harness.root,'artifacts/engine-fast-flow-scheduling');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'scheduling-tests.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({count:results.length,failures:results.filter(row=>!row.ok)}));
if(results.some(row=>!row.ok))process.exitCode=1;
