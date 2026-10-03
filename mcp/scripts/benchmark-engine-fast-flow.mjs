// Paired, fixed-work benchmark of compiled Flow synchronization membership.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FactSimRuntime } from '../dist/fact-sim-runtime.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = new FactSimRuntime({ repoRoot, preferredPort: 0 });
const hotPaths = process.argv.includes('--hot-paths');
const topology = process.argv.includes('--topology');
const scheduling = process.argv.includes('--scheduling');
const configs = scheduling ? [
  {label:'previous',compiled:true,admission:true,topology:true,sourceSelection:false},
  {label:'weighted',compiled:true,admission:true,topology:true,sourceSelection:true}
] : topology ? [
  {label:'previous',compiled:true,admission:false,topology:false},
  {label:'admission',compiled:true,admission:true,topology:false},
  {label:'topology',compiled:true,admission:false,topology:true},
  {label:'combined',compiled:true,admission:true,topology:true}
] : hotPaths ? [
  {label:'previous',compiled:true,allocations:false,visualLookup:false},
  {label:'allocations',compiled:true,allocations:true,visualLookup:false},
  {label:'visuals',compiled:true,allocations:false,visualLookup:true},
  {label:'combined',compiled:true,allocations:true,visualLookup:true}
] : [{label:'original',compiled:false},{label:'compiled',compiled:true}];
const report = { date: new Date().toISOString(), targetMs: 3000000, stepMs: 10000, repeats: 5, examples: [] };
const errors = [];
const median = values => values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
try {
  const page = await runtime.reloadPage();
  page.on('pageerror', error => errors.push(error.message));
  for(const example of ['sample_line2', 'sample_line1', 'parallel_benchmark', 'carrier', ...(scheduling ? ['source_quantity_100000'] : [])]){
    let snapshot;
    const targetMs=example==='source_quantity_100000' ? 1000 : report.targetMs;
    const stepMs=example==='source_quantity_100000' ? 100 : report.stepMs;
    if(example==='source_quantity_100000')snapshot=await page.evaluate(()=>{
      const graph=new LGraph();graph.extra={syncroGroups:[]};
      App.restoreEntityModel(graph,{__factSimEntityModel:{schemaVersion:3,types:[{typeId:'a',name:'A',capacity:0,allowedContentTypeIds:[]}]}},true);
      const add=kind=>{const node=LiteGraph.createNode('factory/basic');node.applyTemplate(kind);graph.add(node);return node;};
      const source=add('source'),machine=add('basic'),sink=add('sink');source.connect(0,machine,0);machine.connect(0,sink,0);
      source.properties.source={entries:[{typeId:'a',count:100000}],repeat:false,intervalSec:0};
      machine.properties.flow.nodes.find(n=>n.kind==='process').config.seconds=.1;
      machine.properties.flow.nodes.find(n=>n.kind==='recovery').config.seconds=0;
      return App.FlowRuntime.capture(graph,graph.serialize());
    });
    else{await runtime.loadExample(example);snapshot=await page.evaluate(() => App.serializeGraphData());}
    const runs = [];
    for(let round = -1; round < report.repeats; round++){
      for(const config of round % 2 === 0 ? configs : configs.slice().reverse()){
        const result = await page.evaluate(({ snapshot, config, topology, scheduling, targetMs, stepMs })=>{
          const graph = new LGraph(); graph.configure(snapshot);
          App.restoreEntityModel(graph, snapshot, true); App.repairGraphLinks(graph);
          App.stopGroups.restoreSerializedData(graph, snapshot, false); configureGraphClock(graph);
          App.FlowRuntime.restore(graph, snapshot);
          const prevTimeline = App._suspendTimeline;
          App._suspendTimeline = true; resetSimClock();
          const engine = new App.EventFastEngine(graph, { compiledFlowSync: config.compiled,
            fastFlowAllocations: config.allocations, fastVisualLookup: config.visualLookup,
            fastFlowAdmission: topology || scheduling ? config.admission : false, fastFlowTopology: topology || scheduling ? config.topology : false,
            fastSourceSelection: scheduling ? config.sourceSelection : false });
          try {
            engine.reset(); graph.status = LGraph.STATUS_RUNNING; graph.sendEventToAllNodes('onStart');
            const start = performance.now();
            for(let t = 0; t < targetMs; t += stepMs) engine.update(Math.min(stepMs, targetMs-t));
            const elapsedMs = performance.now()-start;
            const state = App.FlowRuntime.capture(graph).__flowRuntime;
            return { ...config, elapsedMs, simTimeMs: simNow(), completed: state.completed.length,
              stats: engine.getDebugStats(), syncGroupCount: graph.extra?.syncroGroups?.length || 0,
              state: JSON.stringify(state) };
          } finally { engine.stop(); App._suspendTimeline = prevTimeline; }
        }, { snapshot, config, topology, scheduling, targetMs, stepMs });
        const digest = crypto.createHash('sha256').update(result.state).digest('hex');
        delete result.state;
        if(round >= 0) runs.push({ round, ...result, digest });
      }
    }
    const timings = Object.fromEntries(configs.map(config=>[config.label,median(runs.filter(r=>r.label===config.label).map(r=>r.elapsedMs))]));
    const originalMs = timings[hotPaths || topology || scheduling ? 'previous' : 'original'];
    const compiledMs = timings[scheduling ? 'weighted' : hotPaths || topology ? 'combined' : 'compiled'];
    const row = { example, targetMs, stepMs, originalMs, compiledMs, speedup: originalMs/compiledMs,
      timeReductionPercent: (1-compiledMs/originalMs)*100, timings, runs };
    report.examples.push(row);
    assert.equal(new Set(runs.map(r=>r.digest)).size, 1, `${example}: final state differs`);
    assert.ok(runs.every(r=>r.simTimeMs===targetMs), `${example}: incomplete simulation`);
    assert.ok(runs.every(r=>r.completed>0), `${example}: no completed work was exercised`);
    console.log(JSON.stringify({ example, originalMs, compiledMs, speedup: row.speedup,
      timeReductionPercent: row.timeReductionPercent, timings, parity: true }));
  }
  assert.deepEqual(errors, []);
  report.ok = true;
} catch(error) { report.ok = false; report.error = error.stack; throw error; }
finally {
  report.errors = errors;
  const dir = path.join(repoRoot, scheduling ? 'artifacts/engine-fast-flow-scheduling' : topology ? 'artifacts/engine-fast-flow-topology' : hotPaths ? 'artifacts/engine-fast-flow-lookup' : 'artifacts/engine-fast-flow'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'benchmark.json'), JSON.stringify(report,null,2));
  await runtime.close();
}
