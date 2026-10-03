import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FactSimRuntime } from '../dist/fact-sim-runtime.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(repoRoot, 'artifacts/engine-removal');
const runtime = new FactSimRuntime({ repoRoot, preferredPort: 0 });
const modes = ['dt', 'event', 'event-fast'];
const retired = ['event-fast-worker', 'event-fast-par'];
const report = { date: new Date().toISOString(), modes, pageErrors: [], failedScripts: [] };
await fs.mkdir(dir, { recursive: true });
try {
  const page = await runtime.ensureReady();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.request().resourceType() === 'script') {
      report.failedScripts.push({ status: response.status(), url: response.url() });
    }
  });
  await runtime.reloadPage();
  report.registration = await page.evaluate(() => ({
    supported: App.getSupportedSimModes(), benchmark: App.getBenchmarkSimModes(),
    test: App.getEngineTestModes(), ui: [...document.querySelector('#simModeSelect').options].map(o => o.value),
    scripts: [...document.scripts].map(script => script.src).filter(Boolean),
    retiredApis: ['EventFastWorkerHost', 'LiveEventFastWorkerEngine', 'EventFastParHost',
      'LiveEventFastParEngine', 'createEventFastParPlan'].filter(name => typeof App[name] !== 'undefined')
  }));
  for (const key of ['supported', 'benchmark', 'test', 'ui']) assert.deepEqual(report.registration[key], modes);
  assert.deepEqual(report.registration.retiredApis, []);
  assert.equal(report.registration.scripts.some(src => /engine-fast-(worker|par)-/.test(src)), false);

  report.migrations = [];
  for (const oldMode of retired) {
    await page.evaluate(mode => localStorage.setItem('fact_sim_sim_mode', mode), oldMode);
    await runtime.reloadPage();
    const migration = await page.evaluate(mode => {
      const engine = App.createSimEngine(mode, App.graph);
      const result = { oldMode: mode, mode: App.getSimMode(), ui: document.querySelector('#simModeSelect').value,
        persisted: localStorage.getItem('fact_sim_sim_mode'), normalized: App.normalizeHeadlessSimMode(mode),
        fastEngine: engine instanceof App.EventFastEngine };
      engine.stop();
      return result;
    }, oldMode);
    assert.deepEqual(migration, { oldMode, mode: 'event-fast', ui: 'event-fast', persisted: 'event-fast',
      normalized: 'event-fast', fastEngine: true });
    report.migrations.push(migration);
    assert.equal(await runtime.pageHasHeadlessTools(page, [oldMode]), true);
  }

  await runtime.loadExample('sample_line1');
  report.factory = await page.evaluate(modes => {
    const data = App.serializeGraphData();
    const previous = App._suspendTimeline;
    App._suspendTimeline = true;
    try {
      return modes.flatMap(mode => ['data', 'json', 'graph'].map(inputKind => {
        resetSimClock();
        let input = inputKind === 'json' ? JSON.stringify(data) : data;
        if (inputKind === 'graph') {
          input = new LGraph(); input.configure(data);
          App.restoreEntityModel(input, data, true); App.repairGraphLinks(input);
          App.stopGroups.restoreSerializedData(input, data, false); configureGraphClock(input);
          App.FlowRuntime.restore(input, data);
        }
        const engine = App.createHeadlessSimRunner(mode, input);
        try {
          engine.reset(); engine.graph.status = LGraph.STATUS_RUNNING;
          engine.graph.sendEventToAllNodes('onStart');
          for (let i = 0; i < 1000; i++) engine.update(16);
          return { mode, inputKind, nodeCount: engine.graph._nodes.length, simTimeMs: simNow(),
            state: App.FlowRuntime.capture(engine.graph).__flowRuntime };
        } finally { engine.stop(); }
      }));
    } finally { App._suspendTimeline = previous; }
  }, modes);
  for (const row of report.factory) {
    assert.ok(row.nodeCount > 0);
    assert.equal(row.simTimeMs, 16000);
    assert.ok(row.state);
    assert.deepEqual(row.state, report.factory.find(other => other.mode === row.mode && other.inputKind === 'data').state);
  }
  // Preserve only the verification summary in the compact report.
  report.factory = report.factory.map(({ state, ...row }) => row);

  const benchmark = await runtime.runBenchmark(100);
  await fs.writeFile(path.join(dir, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
  assert.deepEqual([...new Set(benchmark.results.map(row => row.mode))], modes);
  assert.equal(benchmark.results.length, 6); // Each engine with rendering off/on.
  report.benchmark = { cases: benchmark.results.length, modes };

  // Old explicit MCP engine requests must collapse to a single fast engine.
  const migratedTest = await runtime.runEngineTests({ suite: 'quick', strictFinalParity: true,
    engines: ['dt', ...retired, 'event-fast'], examples: ['sample_line1'], includeCurrentGraph: false, seeds: [1] });
  assert.equal(migratedTest.status, 'PASS');
  assert.equal(migratedTest.summary.engineCount, 2);
  assert.equal(migratedTest.summary.caseCount, 2);
  report.migratedTest = { status: migratedTest.status, summary: migratedTest.summary };

  const parity = await runtime.runEngineTests({ suite: 'quick', strictFinalParity: true,
    includeCurrentGraph: false, seeds: [1, 12345], saveArtifacts: true, artifactLabel: 'three-engines' });
  await fs.writeFile(path.join(dir, 'engine-test.json'), JSON.stringify(parity, null, 2));
  report.parity = { status: parity.status, summary: parity.summary, failures: parity.failures, warnings: parity.warnings };
  assert.equal(parity.status, 'PASS');
  assert.equal(parity.summary.engineCount, 3);
  assert.equal(parity.summary.exampleCount, 8);
  assert.equal(parity.summary.caseCount, 48);

  report.export = await page.evaluate(async () => {
    const html = await App.buildEmbeddedExportHtml();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return { length: html.length, retiredScriptReferences: /<script\b[^>]*\bsrc=["'][^"']*engine-fast-(worker|par)-/i.test(html),
      hasSharedRegistration: !!doc.querySelector('script[src*="engine-fast-mode.js"]'),
      modes: [...doc.querySelector('#simModeSelect').options].map(option => option.value) };
  });
  assert.equal(report.export.retiredScriptReferences, false);
  assert.equal(report.export.hasSharedRegistration, true);
  assert.deepEqual(report.export.modes, modes);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.failedScripts, []);
  report.ok = true;
  console.log(JSON.stringify({ ok: true, modes, migrations: report.migrations.length,
    factoryCases: report.factory.length, benchmark: report.benchmark, parity: report.parity }));
} catch (error) {
  report.ok = false; report.error = error.stack; throw error;
} finally {
  await fs.writeFile(path.join(dir, 'regression.json'), JSON.stringify(report, null, 2));
  await runtime.close();
}
