const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');let time=0;
global.window=global;global.self=global;global.document={};global.simNow=()=>time;global.setSimTime=t=>{time=t;};global.advanceSimTime=t=>{time+=t;};global.getSimDtSec=()=>.1;global.isSimRunning=()=>false;
for(const file of ['js/vendor/litegraph.min.js','js/nodes/entity_model.js','js/app/flow-model.js','js/app/flow-runtime.js','js/nodes/basic_node.js','js/app/graph-links.js','js/app/engine.js','js/app/engine-fast-kernels.js','js/app/engine-fast-compiler.js','js/app/engine-fast-compat.js','js/app/engine-fast-runtime.js','js/app/engine-fast-mode.js'])vm.runInThisContext(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
LiteGraph.registerNodeType('factory/basic',BasicNode);
function graph(){setSimTime(0);const graph=new LGraph();graph.extra={syncroGroups:[]};App.graph=graph;App.restoreEntityModel(graph,{__factSimEntityModel:{schemaVersion:3,types:[{typeId:'a',name:'A',capacity:0,allowedContentTypeIds:[]},{typeId:'b',name:'B',capacity:0,allowedContentTypeIds:[]},{typeId:'parent',name:'Parent',capacity:2,allowedContentTypeIds:['a','b','box']},{typeId:'box',name:'Box',capacity:1,allowedContentTypeIds:['a']}] }},true);return graph;}
function node(g,kind='basic'){const n=LiteGraph.createNode('factory/basic');n.applyTemplate(kind);g.add(n);return n;}
function source(g,typeId='a',count=2){const n=node(g,'source');n.properties.source={entries:[{typeId,count}],repeat:false,intervalSec:0};return n;}
function times(n,p,r){n.properties.flow.nodes.find(n=>n.kind==='process').config.seconds=p;n.properties.flow.nodes.find(n=>n.kind==='recovery').config.seconds=r;}
function settle(g){for(let i=0;i<100;i++){g.__outputDirty=false;for(const n of g._nodes)n.onExecute();if(!g.__outputDirty)break;}}
function at(g,t){setSimTime(t);settle(g);}
function run(g,to,step=10){for(let t=simNow();t<=to;t+=step)at(g,t);}
function flow(n,kinds){const f=App.FlowModel.empty(),items=kinds.map(k=>App.FlowModel.add(f,k));n.properties.flow=f;return {f,items,link:(a,b,o=0,i=0)=>App.FlowModel.connect(f,a,b,o,i)};}
module.exports={root,graph,node,source,times,settle,at,run,flow,App:global.App};
