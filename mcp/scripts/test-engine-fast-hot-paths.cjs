const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const harness=require('./flow-v2-test-harness.cjs');
const scenarioApp=harness.App,context={allocations:true,visuals:new WeakMap()},results=[];
function test(name,fn){try{fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}

test('State and deadline scans match for empty, ready, past, future and non-finite timers',()=>{
  setSimTime(1000);
  for(const offers of [[],[{id:'held'}]]){
    const make=()=>({id:7,properties:{flow:{nodes:[]}},_flowRuntime:{cells:[],signals:[],offers,visuals:[]}});
    const collect=node=>{scenarioApp.FlowRuntime.updateState(node);return {state:node._state,until:node._until,payload:node._payload,deadline:scenarioApp.FlowRuntime.eventUntil(node)};};
    assert.deepEqual(scenarioApp.FlowRuntime.withFastContext(context,()=>collect(make())),collect(make()));
  }
  const times=[undefined,0,999,1000,1001,Infinity,NaN];
  for(const time of times)for(const ready of [false,true])for(const error of ['', 'invalid']){
    const make=()=>({id:7,properties:{flow:{nodes:[{id:'p',kind:'process'},{id:'r',kind:'recovery'}]},source:{entries:[]}},
      _flowRuntime:{cells:[{nodeId:'p',until:time,ready,entity:{locationNodeId:7}}],
        signals:[{nodeId:'r',until:1500,ready:false}],offers:[],visuals:[],error}});
    const collect=node=>{
      scenarioApp.FlowRuntime.updateState(node);
      return {state:node._state,until:node._until,payload:node._payload,deadline:scenarioApp.FlowRuntime.eventUntil(node)};
    };
    assert.deepEqual(scenarioApp.FlowRuntime.withFastContext(context,()=>collect(make())),collect(make()));
  }
});

test('Source deadlines match on repeat, completed quantity, active source and delayed admission',()=>{
  for(const repeat of [false,true])for(const active of [false,true])for(const created of [0,4])for(const nextAt of [0,2000,Infinity]){
    const node={properties:{flow:{nodes:[{kind:'sourceSequence'}]},source:{entries:[{count:4}],repeat}},
      _flowRuntime:{cells:[],signals:[],offers:[],visuals:[],sourceSequence:{active,created,nextAt}}};
    assert.deepEqual(scenarioApp.FlowRuntime.withFastContext(context,()=>scenarioApp.FlowRuntime.eventUntil(node)),scenarioApp.FlowRuntime.eventUntil(node));
  }
});

test('Nested contexts and exceptions restore the previous engine and the baseline path',()=>{
  const node={properties:{flow:{nodes:[]}},_flowRuntime:{cells:[],signals:[],offers:[],visuals:[]}};
  const concat=Array.prototype.concat;let calls=0;
  Array.prototype.concat=function(...args){calls++;return concat.apply(this,args);};
  try{
    scenarioApp.FlowRuntime.withFastContext(context,()=>{
      assert.throws(()=>scenarioApp.FlowRuntime.withFastContext(null,()=>{throw new Error('probe');}),/probe/);
      const before=calls;scenarioApp.FlowRuntime.eventUntil(node);assert.equal(calls,before);
    });
    const before=calls;scenarioApp.FlowRuntime.eventUntil(node);assert.equal(calls,before+1);
    assert.throws(()=>scenarioApp.FlowRuntime.withFastContext(context,()=>{throw new Error('probe');}),/probe/);
    const next=calls;scenarioApp.FlowRuntime.eventUntil(node);assert.equal(calls,next+1);
  }finally{Array.prototype.concat=concat;}
});

test('Duplicate visual IDs retain the first history; eviction and snapshot restore preserve every visual',()=>{
  function runFixture(fast){
    let g=harness.graph();const source=harness.source(g,'a',180),machine=harness.node(g),sink=harness.node(g,'sink');
    source.connect(0,machine,0);machine.connect(0,sink,0);harness.times(machine,.01,0);
    const scoped=fn=>fast ? scenarioApp.FlowRuntime.withFastContext(context,fn) : fn();
    scoped(()=>harness.at(g,0));
    const r=machine._flowRuntime,first=r.visuals[0];assert(first);
    const duplicate={...first,linkId:first.linkId+1,history:[]};r.visuals=[first,duplicate];
    scoped(()=>harness.at(g,10));
    assert(first.history.length>0);assert.equal(duplicate.history.length,0);
    for(let i=2;i<=200;i++){
      scoped(()=>harness.at(g,i*10));
      if(i===90){
        const data=scenarioApp.FlowRuntime.capture(g,g.serialize()),copy=new LGraph();copy.configure(data);
        scenarioApp.restoreEntityModel(copy,data,true);scenarioApp.FlowRuntime.restore(copy,data);g=copy;
      }
    }
    const state=scenarioApp.FlowRuntime.capture(g).__flowRuntime;
    assert.equal(state.completed.length,180);
    assert(state.nodes.every(row=>row.runtime.visuals.length<=128));
    return state;
  }
  assert.deepEqual(runFixture(true),runFixture(false));
});

const dir=path.join(harness.root,'artifacts/engine-fast-flow-lookup');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'hot-path-tests.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({count:results.length,failures:results.filter(row=>!row.ok)}));
if(results.some(row=>!row.ok))process.exitCode=1;
