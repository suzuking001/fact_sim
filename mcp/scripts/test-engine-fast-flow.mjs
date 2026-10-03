import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FactSimRuntime } from '../dist/fact-sim-runtime.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = new FactSimRuntime({ repoRoot, preferredPort: 0 });
const hotPaths = process.argv.includes('--hot-paths');
const topology = process.argv.includes('--topology');
const scheduling = process.argv.includes('--scheduling');
const report = { date: new Date().toISOString() };
const dir = path.join(repoRoot, scheduling ? 'artifacts/engine-fast-flow-scheduling' : topology ? 'artifacts/engine-fast-flow-topology' : hotPaths ? 'artifacts/engine-fast-flow-lookup' : 'artifacts/engine-fast-flow');
try {
  // Reuse the existing transfer/recovery/synchronization scenarios with the
  // compiled membership path, including blocked destinations and rings.
  const scenarios = spawnSync(process.execPath, ['-e', `
    const { App: scenarioApp } = require('./flow-v2-test-harness.cjs');
    const execute = scenarioApp.FlowRuntime.execute;
    const plans = new WeakMap();
    const fastContext = { allocations:true, visuals:new WeakMap(), admission:${topology || scheduling}, topology:${topology || scheduling ? 'new WeakMap()' : 'null'}, sourceSelection:${scheduling} };
    scenarioApp.FlowRuntime.execute = (node, memberships) => {
      ${topology || scheduling ? 'scenarioApp.prepareFastFlowTopology(node.graph,fastContext);' : ''}
      if (!memberships && node.graph.extra?.syncroGroups?.length) {
        let plan = plans.get(node.graph);
        if (!scenarioApp.isFastFlowSyncCurrent(node.graph, plan)) {
          plan = scenarioApp.compileFastFlowSync(node.graph); plans.set(node.graph, plan);
        }
        memberships = plan.memberships;
      }
      return ${hotPaths || topology || scheduling ? 'scenarioApp.FlowRuntime.withFastContext(fastContext,()=>execute(node,memberships))' : 'execute(node,memberships)'};
    };
    require('./test-flow-v2-runtime.cjs');
  `], { cwd: path.join(repoRoot,'mcp/scripts'), encoding: 'utf8', maxBuffer: 2*1024*1024 });
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'compiled-flow-scenarios.log'), scenarios.stdout + scenarios.stderr);
  const scenarioResults = JSON.parse(await fs.readFile(path.join(repoRoot,'artifacts/flow-v2/runtime-tests.json'),'utf8'));
  report.flowScenarios = { count: scenarioResults.length, failures: scenarioResults.filter(row=>!row.ok) };
  assert.equal(scenarios.status,0,scenarios.stderr || scenarios.stdout);
  assert.equal(report.flowScenarios.failures.length,0);
  if(hotPaths || topology || scheduling){
    const hotChecks=spawnSync(process.execPath,['test-engine-fast-hot-paths.cjs'],{
      cwd:path.join(repoRoot,'mcp/scripts'),encoding:'utf8',maxBuffer:2*1024*1024});
    await fs.writeFile(path.join(dir,'hot-path-tests.log'),hotChecks.stdout+hotChecks.stderr);
    assert.equal(hotChecks.status,0,hotChecks.stderr || hotChecks.stdout);
    report.hotPaths=JSON.parse(hotChecks.stdout);
  }
  if(topology || scheduling){
    const checks=spawnSync(process.execPath,['test-engine-fast-topology.cjs'],{
      cwd:path.join(repoRoot,'mcp/scripts'),encoding:'utf8',maxBuffer:2*1024*1024});
    await fs.writeFile(path.join(dir,'topology-tests.log'),checks.stdout+checks.stderr);
    assert.equal(checks.status,0,checks.stderr || checks.stdout);
    report.fastTopology=JSON.parse(checks.stdout);
  }
  if(scheduling){
    const checks=spawnSync(process.execPath,['test-engine-fast-scheduling.cjs'],{
      cwd:path.join(repoRoot,'mcp/scripts'),encoding:'utf8',maxBuffer:2*1024*1024});
    await fs.writeFile(path.join(dir,'scheduling-tests.log'),checks.stdout+checks.stderr);
    assert.equal(checks.status,0,checks.stderr || checks.stdout);
    report.scheduling=JSON.parse(checks.stdout);
  }
  const page = await runtime.reloadPage();
  await runtime.loadExample('sample_line2');
  report.topology = await page.evaluate(() => {
    const graph = App.graph, results = [];
    const check = (name, ok) => { results.push({ name, ok }); if (!ok) throw new Error(name); };
    const actual = plan => plan.memberships.map(row => row.members.map(m => [m.node.id,m.item.id]));
    const expected = () => (graph.extra.syncroGroups || []).map(group => graph._nodes.flatMap(node =>
      (node.properties?.flow?.nodes || []).filter(item => item.kind === 'syncroJudgment' && item.config.groupId === group.id)
        .map(item => [node.id,item.id])));
    for (const node of graph._nodes) if (node.properties?.flow) App.FlowModel.signalLinks(node.properties.flow);
    const compile = () => {
      const plan = App.compileFastFlowSync(graph);
      check('compiled membership matches original order', JSON.stringify(actual(plan)) === JSON.stringify(expected()));
      check('fresh plan is valid', App.isFastFlowSyncCurrent(graph,plan));
      return plan;
    };
    let plan = compile();
    check('sample exercises synchronization', plan.memberships.some(row=>row.members.length > 1));
    const node = plan.memberships.find(row=>row.members.length).members[0].node;
    node.properties.flow = App.FlowModel.clone(node.properties.flow);
    check('Flow replacement invalidates', !App.isFastFlowSyncCurrent(graph,plan)); plan = compile();
    App.FlowModel.signalLinks(node.properties.flow); plan = compile();
    App.FlowModel.invalidateFlowCaches(node.properties.flow);
    check('Flow topology edits invalidate', !App.isFastFlowSyncCurrent(graph,plan)); plan = compile();
    const item = node.properties.flow.nodes.find(item=>item.kind === 'syncroJudgment');
    item.config.groupId = 'inactive-test-group';
    check('group assignment edits invalidate without a graph revision', !App.isFastFlowSyncCurrent(graph,plan));
    App.FlowModel.signalLinks(node.properties.flow); plan = compile();
    item.config.groupId = graph.extra.syncroGroups[0].id;
    App.FlowModel.invalidateFlowCaches(node.properties.flow);
    check('membership edits invalidate', !App.isFastFlowSyncCurrent(graph,plan)); plan = compile();
    graph._nodes.reverse();
    check('graph order changes invalidate', !App.isFastFlowSyncCurrent(graph,plan)); plan = compile();
    graph.extra.syncroGroups = graph.extra.syncroGroups.map(group=>({...group}));
    check('group replacement invalidates', !App.isFastFlowSyncCurrent(graph,plan)); plan = compile();
    graph.extra.syncroGroups.push({...graph.extra.syncroGroups[0]});
    check('group additions invalidate', !App.isFastFlowSyncCurrent(graph,plan)); plan = compile();
    graph._version++;
    check('graph edits invalidate', !App.isFastFlowSyncCurrent(graph,plan));
    return results;
  });
  await runtime.loadExample('sample_line2');
  report.lifecycle = await page.evaluate(() => {
    const previous = App._suspendTimeline; App._suspendTimeline = true;
    resetSimClock();
    const engine = new App.EventFastEngine(App.graph);
    try {
      engine.reset(); App.graph.status = LGraph.STATUS_RUNNING; App.graph.sendEventToAllNodes('onStart');
      engine.update(100); engine.update(100);
      const plan = engine.flowSyncPlan; engine.update(100);
      const reused = engine.flowSyncPlan === plan;
      engine.reset(); const cleared = engine.flowSyncPlan === null; engine.update(100);
      return { reused, cleared, rebuilt: engine.flowSyncPlan !== null && engine.flowSyncPlan !== plan };
    } finally { engine.stop(); App._suspendTimeline = previous; }
  });
  assert.deepEqual(report.lifecycle, { reused: true, cleared: true, rebuilt: true });
  const parity = await runtime.runEngineTests({ suite: 'quick', strictFinalParity: true,
    includeCurrentGraph: false, seeds: [1,12345], saveArtifacts: true, artifactLabel: scheduling ? 'fast-flow-scheduling' : topology ? 'fast-flow-topology' : hotPaths ? 'fast-flow-hot-paths' : 'fast-flow-sync' });
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'engine-test.json'),JSON.stringify(parity,null,2));
  report.parity = { status: parity.status, summary: parity.summary, failures: parity.failures, warnings: parity.warnings };
  assert.equal(parity.status,'PASS');
  report.ok = true;
  console.log(JSON.stringify({ ok: true, flowScenarios: report.flowScenarios, hotPaths:report.hotPaths, fastTopology:report.fastTopology, topologyChecks: report.topology.length,
    lifecycle: report.lifecycle, scheduling:report.scheduling, parity: report.parity }));
} catch(error) { report.ok = false; report.error = error.stack; throw error; }
finally {
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'regression.json'),JSON.stringify(report,null,2));
  await runtime.close();
}
