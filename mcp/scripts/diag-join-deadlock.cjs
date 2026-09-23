'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { root, App } = require('./flow-v2-test-harness.cjs');

const samplePath = path.join(root, 'sample', 'sample_line2.json');
const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
setSimTime(0);
const g = new LGraph();
g.configure(data);
App.restoreEntityModel(g, data, true);
App.graph = g;

const out = [];
const log = (s) => { out.push(s); };

const flowNodes = (n) => (n.properties.flow && n.properties.flow.nodes) || [];
const flowLinks = (n) => (n.properties.flow && n.properties.flow.links) || [];
const signalLinkIdSet = (n) => { try { return new Set([...App.FlowModel.signalLinks(n.properties.flow)]); } catch (e) { return new Set(); } };
const feedbackLinkSet = (n) => { try { return new Set([...App.FlowModel.feedbackLinks(n.properties.flow)]); } catch (e) { return new Set(); } };

log('================ PART A: equipment flow topology ================');
for (const id of [2, 17, 36, 65]) {
  const n = g.getNodeById(id);
  if (!n) { log(`#${id}: NOT FOUND`); continue; }
  const nodes = flowNodes(n);
  log(`\n# ${id}  [${n.properties.role || '?'}]  ports: in=${(n.inputs||[]).length} out=${(n.outputs||[]).length}`);
  const sig = signalLinkIdSet(n);
  const fb = feedbackLinkSet(n);
  for (const item of nodes) {
    const inDesc = (item.inputs || []).map(p => {
      const isSig = flowLinks(n).some(l => l.to === item.id && l.input === p.id && sig.has(l));
      const feeds = flowLinks(n).filter(l => l.to === item.id && l.input === p.id).map(l => l.from);
      return `${p.id}(${isSig ? 'SIG' : 'WORK'})<-[${feeds.join(',')}]`;
    }).join(' ');
    const outDesc = (item.outputs || []).map((p, i) => {
      const targets = flowLinks(n).filter(l => l.from === item.id && l.output === i).map(l => {
        const t = nodes.find(x => x.id === l.to);
        return `${l.to}(${t?.kind || '?'})${sig.has(l) ? '+SIG' : ''}${fb.has(l) ? '+FB' : ''}`;
      });
      return `o${i}->${targets.join('|')}`;
    }).join(' ');
    const cfg = item.config?.seconds != null ? ` [${item.config.seconds}s]` : '';
    log(`   ${item.id} ${item.kind}${cfg}  IN: ${inDesc}  OUT: ${outDesc}`);
  }
}

log('\n================ PART B: all joins & AND requirements ================');
for (const n of g._nodes) {
  const joins = flowNodes(n).filter(it => it.kind === 'join');
  if (!joins.length) continue;
  const sig = signalLinkIdSet(n);
  for (const j of joins) {
    const workInputs = (j.inputs || []).filter(p => !flowLinks(n).some(l => l.to === j.id && l.input === p.id && sig.has(l)));
    const sigInputs = (j.inputs || []).filter(p => flowLinks(n).some(l => l.to === j.id && l.input === p.id && sig.has(l)));
    log(`  #${n.id} join[${j.id}] workInputs=${workInputs.map(p=>p.id).join(',')} sigInputs=${sigInputs.map(p=>p.id).join(',')} (AND needs ${workInputs.length} work + ${sigInputs.length} signals)`);
  }
}

log('\n================ PART C: run 300s steady-state ================');
const engine = App.createSimEngine('event-fast', g);
engine.reset();
for (let i = 0; i < 3000; i++) engine.update(100);
const tSec = Math.round(simNow() / 1000);

const sinks = g._nodes.filter(n => n.properties.role === 'sink');
log(`t=${tSec}s  sinks=${JSON.stringify(sinks.map(n => ({ id: n.id, count: (n._recv||[]).length, last: (n._recv||[]).at(-1)?.t })))}`);
let activeRows = [];
try {
  const store = App.runtimeInstancesForGraph(g);
  log(`activeInstances=${store.instances.size}  completed=${store.completed.length}`);
  for (const ent of store.instances.values()) activeRows.push({ inst: ent.instanceId, type: ent.type || ent.typeId, at: ent.locationNodeId });
} catch (e) { log('store: ' + e.message); }

log('\n--- where are the ACTIVE entities? ---');
const byNode = new Map();
for (const r of activeRows) { if (!byNode.has(r.at)) byNode.set(r.at, []); byNode.get(r.at).push(r); }
for (const [nid, list] of [...byNode].sort((a, b) => a[0] - b[0])) {
  log(`  node ${nid} [${g.getNodeById(nid)?.properties?.role || '?'}]: ${list.length}  (e.g. ${list.slice(0, 2).map(x => x.inst).join(',')})`);
}

log('\n================ PART D: runtime detail (cells/sigs/offers/reason) ================');
for (const n of g._nodes) {
  const r = n._flowRuntime;
  if (!r) continue;
  if (!r.cells.length && !(r.signals || []).length && !(r.offers || []).length && !r.reason) continue;
  const cells = r.cells.map(c => `${c.nodeId}/${c.input}`).join(',');
  const sigs = (r.signals || []).map(c => `${c.nodeId}/${c.input}${c.startedAt !== undefined ? `(until=${Math.round(c.until / 1000)}s)` : ''}`).join(',');
  const offers = (r.offers || []).map(o => `offer@${o.cellId}->pend[${(o.pending||[]).join('|')}]`).join(',');
  log(`  #${n.id} [${n.properties.role || '?'}] state=${n._state} cells=[${cells}] sig=[${sigs}] offers=[${offers}] reason=${JSON.stringify(r.reason || '')}`);
}

log('\n================ PART E: join readiness diagnosis ================');
for (const n of g._nodes) {
  const r = n._flowRuntime;
  if (!r) continue;
  const sig = signalLinkIdSet(n);
  for (const j of flowNodes(n).filter(it => it.kind === 'join')) {
    const workIn = (j.inputs || []).filter(p => !flowLinks(n).some(l => l.to === j.id && l.input === p.id && sig.has(l)));
    const sigIn = (j.inputs || []).filter(p => flowLinks(n).some(l => l.to === j.id && l.input === p.id && sig.has(l)));
    const workCells = workIn.map(p => r.cells.find(c => c.nodeId === j.id && c.input === p.id));
    const sigPresent = sigIn.map(p => (r.signals || []).some(c => c.nodeId === j.id && c.input === p.id));
    const workFull = workCells.every(c => c);
    const sigFull = sigPresent.every(x => x);
    if (workFull && sigFull) continue;
    log(`  #${n.id} join[${j.id}]: workFull=${workFull} sigFull=${sigFull}`);
    log(`     workInputs: ${workIn.map((p, i) => `${p.id}=${workCells[i] ? 'HAS' : 'MISSING'}`).join(', ')}`);
    log(`     sigInputs  : ${sigIn.map((p, i) => `${p.id}=${sigPresent[i] ? 'HAS' : 'MISSING'}`).join(', ')}`);
  }
}

fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
const reportPath = path.join(root, 'artifacts', 'diag-join-deadlock.txt');
fs.writeFileSync(reportPath, out.join('\n') + '\n');
console.log(out.join('\n'));
console.log('\nreport -> ' + reportPath);

