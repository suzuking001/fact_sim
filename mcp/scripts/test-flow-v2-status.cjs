const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,graph,node,source,at,App}=require('./flow-v2-test-harness.cjs');
vm.runInThisContext(fs.readFileSync(path.join(root,'js/app/flow-status.js'),'utf8'));
const results=[];function test(name,fn){try{fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.stack});}}
function setup(){const g=graph(),s=source(g,'a',2),m=node(g),sink=node(g,'sink');s.connect(0,m,0);m.connect(0,sink,0);return {g,s,m,sink,status:kind=>App.flowNodeStatus(m,m.properties.flow.nodes.find(n=>n.kind===kind))};}
const value=(s,label)=>s.rows.find(r=>r.label===label)?.value;
test('Process elapsed/remaining and completion condition follow actual simulation time',()=>{
 const e=setup();at(e.g,0);at(e.g,750);const s=e.status('process');assert.equal(s.state,'PROCESS');assert.equal(value(s,'Elapsed'),'0.8 s');assert.equal(value(s,'Remaining'),'1.3 s');assert.equal(s.progress,.375);assert.equal(value(s,'Time condition'),'Timing');
 at(e.g,2000);const done=e.status('process');assert.equal(done.state,'DONE');assert.equal(value(done,'Elapsed'),'2.0 s');assert.equal(value(done,'Time condition'),'Met');assert.equal(value(done,'Last fired'),'2.0 s');
});
test('Recovery remains idle while Fork is blocked, then starts at actual transfer',()=>{
 const e=setup();let accepts=false;e.sink.canAcceptEntityInput=()=>accepts;at(e.g,0);at(e.g,9000);assert.equal(e.status('recovery').state,'IDLE');assert.equal(value(e.status('fork'),'Outputs'),'Downstream waiting');
 accepts=true;at(e.g,10000);at(e.g,11000);assert.equal(e.status('recovery').state,'RECOVERY');assert.equal(value(e.status('recovery'),'Elapsed'),'1.0 s');assert.equal(value(e.status('recovery'),'Remaining'),'2.0 s');assert.equal(value(e.status('fork'),'Last fired'),'10.0 s');
});
test('Join shows first-cycle readiness and each Recovery completion condition',()=>{
 const e=setup();const before=JSON.stringify(e.m._flowRuntime);assert.equal(value(e.status('join'),'All inputs'),'1 / 2');assert.equal(JSON.stringify(e.m._flowRuntime),before,'Inspection must not initialize or advance runtime');
 at(e.g,0);assert.equal(value(e.status('join'),'All inputs'),'0 / 2');assert.equal(value(e.status('join'),'Last fired'),'0.0 s');at(e.g,2000);at(e.g,5000);assert.equal(e.status('process').state,'PROCESS');assert.equal(value(e.status('join'),'Last fired'),'5.0 s');
});
test('Completed timing and firing history survive snapshot and clear on Reset',()=>{
 const e=setup();at(e.g,0);at(e.g,2500);const data=App.FlowRuntime.capture(e.g,e.g.serialize()),copy=new LGraph();copy.configure(App.FlowModel.clone(data));App.restoreEntityModel(copy,data,true);App.FlowRuntime.restore(copy,data);const m=copy.getNodeById(e.m.id),process=m.properties.flow.nodes.find(n=>n.kind==='process');assert.equal(value(App.flowNodeStatus(m,process),'Elapsed'),'2.0 s');assert.equal(value(App.flowNodeStatus(m,process),'Time condition'),'Met');m.onConfigure();assert.equal(App.flowNodeStatus(m,process).state,'IDLE');
});
test('Synchronization displays all group members, without changing simulation state',()=>{
 const g=graph(),a=node(g,'shuttle'),b=node(g,'shuttle');g.extra.syncroGroups=[{id:'sync1',name:'Shuttle'}];const sa=a.properties.flow.nodes.find(n=>n.kind==='syncroJudgment'),sb=b.properties.flow.nodes.find(n=>n.kind==='syncroJudgment');sa.config.groupId=sb.config.groupId='sync1';App.FlowRuntime.runtime(a).cells=[{nodeId:sa.id}];const before=JSON.stringify(a._flowRuntime);assert.equal(value(App.flowNodeStatus(a,sa),'Group ready'),'1 / 2');assert.equal(JSON.stringify(a._flowRuntime),before);App.FlowRuntime.runtime(b).cells=[{nodeId:sb.id}];assert.equal(value(App.flowNodeStatus(a,sa),'Condition'),'Met');
});
fs.mkdirSync(path.join(root,'artifacts/flow-v2'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/flow-v2/status-tests.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));if(results.some(r=>!r.ok))process.exitCode=1;
