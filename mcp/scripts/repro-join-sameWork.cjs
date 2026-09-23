const fs = require('node:fs');
const path = require('node:path');
const { root, graph, node, source, at, App } = require('./flow-v2-test-harness.cjs');
const reportPath = path.join(root, 'artifacts', 'repro-join-sameWork-report.txt');
const lines = [];
const log = (label, line) => { lines.push(`${label}: ${line}`); };
const sec = (v) => (typeof v === 'number' ? `${Math.round(v / 1000)}s` : String(v ?? '-'));
const cellDesc = (n) => {
  const r = n._flowRuntime;
  if (!r || !r.cells.length) return '[]';
  return '[' + r.cells.map(c => `${c.nodeId}/${c.input} ${c.entity?.id}[${c.entity?.instanceId}] start=${sec(c.startedAt)} until=${sec(c.until)}`).join(' ; ') + ']';
};

// ============================================================ PART 1: actual sample_line2.json
try {
  const samplePath = path.join(root, 'sample', 'sample_line2.json');
  const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  setSimTime(0);
  const g = new LGraph();
  g.configure(data);
  App.restoreEntityModel(g, data, true);
  App.graph = g;
  const engine = App.createSimEngine('event-fast', g);
  engine.reset();
  const m65 = g.getNodeById(65), m36 = g.getNodeById(36), m67 = g.getNodeById(67);
  const sinks = g._nodes.filter(n => n.properties.role === 'sink');
  const inLinks = g.links.filter(l => l.target_id === 65).map(l => `${l.origin_id}->in${l.target_slot}`);
  log('PART1', `sample_line2.json loaded. into #65: ${inLinks.join(', ')}`);
  log('PART1', `#36 flow: ${(m36.properties.flow.nodes || []).map(x => x.kind + (x.config?.seconds != null ? `(${x.config.seconds}s)` : '')).join('>')}`);
  log('PART1', `#65 flow: ${(m65.properties.flow.nodes || []).map(x => x.kind + (x.config?.seconds != null ? `(${x.config.seconds}s)` : '')).join('>')}`);
  let last = '';
  for (let i = 0; i < 600; i++) {
    engine.update(100);
    const t = Math.round(simNow() / 1000);
    const row = `t=${t}s #36=${m36._state} #65=${m65._state} #67=${m67._state} m65cells=${cellDesc(m65)}`;
    if (i % 5 === 0 || row !== last) log('PART1', row);
    last = row;
  }
  const store = App.runtimeInstancesForGraph(g);
  log('PART1', `t=${simNow() / 1000}s sink=${JSON.stringify(sinks.map(n => ({ id: n.id, count: n._recv.length, last: n._recv.at(-1)?.t })))} active=${store.instances.size} completed=${store.completed.length}`);
} catch (e) {
  log('PART1', 'ERROR ' + e.stack);
}

// ============================================================ PART 2: controlled, machine #65 exact flow (two same-work entities at t=0)
{
  const e = (() => {
    const g = graph();
    const m = node(g);
    m.addInput('inPort2', 'entity');
    App.ensureBasicNodePortIds(m);
    const f = App.FlowModel.empty();
    const add = (k, c) => App.FlowModel.add(f, k, c);
    const link = (a, b, o = 0, i = 0) => App.FlowModel.connect(f, a, b, o, i);
    const i1 = add('inPort', { portId: m.inputs[0].portId });
    const i2 = add('inPort', { portId: m.inputs[1].portId });
    const j1 = add('join'), p1 = add('process', { seconds: 2 }), j2 = add('join'), p2 = add('process', { seconds: 0 });
    const fork = add('fork'), out = add('outPort', { portId: m.outputs[0].portId }), rec = add('recovery', { seconds: 3 });
    link(i1, j1); link(j1, p1); link(p1, j2); link(i2, j2, 0, 1); link(j2, p2); link(p2, fork); link(fork, out); link(fork, rec, 1); link(rec, j1, 0, 1);
    m.properties.flow = f;
    const s1 = source(g, 'a', 1), s2 = source(g, 'a', 1), sink = node(g, 'sink');
    s1.connect(0, m, 0); s2.connect(0, m, 1); m.connect(0, sink, 0);
    return { g, m, s1, s2, sink, j1, j2 };
  })();
  log('PART2', 'controlled A: #65 exact flow (in1->join1->process2s->join2 ; in2->join2), both entities at t=0');
  for (const t of [0, 1000, 2000, 3000, 5000]) {
    at(e.g, t);
    let status = '';
    try { status = App.flowNodeStatus(e.m, e.j2).rows.map(r => `${r.label}=${r.ready ? 'ready' : 'WAIT'}`).join(' '); } catch (err) { status = '(n/a)'; }
    log('PART2', `t=${t / 1000}s m=${e.m._state} cells=${cellDesc(e.m)} sink=${JSON.stringify((e.sink._recv || []).map(d => d.t))} join2status=[${status}]`);
  }
}

// ============================================================ PART 3: controlled, symmetric processes (in1->process2s->join ; in2->process2s->join)
{
  const g = graph();
  const m = node(g);
  m.addInput('inPort2', 'entity');
  App.ensureBasicNodePortIds(m);
  const f = App.FlowModel.empty();
  const add = (k, c) => App.FlowModel.add(f, k, c);
  const link = (a, b, o = 0, i = 0) => App.FlowModel.connect(f, a, b, o, i);
  const i1 = add('inPort', { portId: m.inputs[0].portId });
  const i2 = add('inPort', { portId: m.inputs[1].portId });
  const p1 = add('process', { seconds: 2 });
  const p2 = add('process', { seconds: 2 });
  const j = add('join');
  const out = add('outPort', { portId: m.outputs[0].portId });
  link(i1, p1); link(i2, p2); link(p1, j, 0, 0); link(p2, j, 0, 1); link(j, out);
  m.properties.flow = f;
  const s1 = source(g, 'a', 1), s2 = source(g, 'a', 1), sink = node(g, 'sink');
  s1.connect(0, m, 0); s2.connect(0, m, 1); m.connect(0, sink, 0);
  log('PART3', 'controlled B: symmetric (in1->process2s->join ; in2->process2s->join), both entities at t=0');
  for (const t of [0, 1000, 2000, 3000, 5000]) {
    at(g, t);
    log('PART3', `t=${t / 1000}s m=${m._state} cells=${cellDesc(m)} sink=${JSON.stringify((sink._recv || []).map(d => d.t))}`);
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log('\nreport written to ' + reportPath);