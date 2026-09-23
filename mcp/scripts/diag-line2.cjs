'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./flow-v2-test-harness.cjs');

const samplePath = path.join(root, 'sample', 'sample_line2.json');
const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
setSimTime(0);
const g = new LGraph();
g.configure(data);
App.restoreEntityModel(g, data, true);
App.graph = g;

// Inspect the LIVE link objects
const role = (n) => n?.properties?.role || (n ? n.constructor.name : '?');
console.log('=== g.links sample (object form, first non-null) ===');
let shown = 0;
for (let i = 0; i < g.links.length && shown < 5; i++) {
  const l = g.links[i];
  if (!l) continue;
  console.log(`[${i}] ${l.origin_id}(${g.getNodeById(l.origin_id)?.properties.role}) -> ${l.target_id}(${g.getNodeById(l.target_id)?.properties.role}) type=${l.type}`);
  shown++;
}
console.log('g.links.length=', g.links.length);

// Build authoritative topology from node-declared links (skip null holes).
const adj = new Map();       // origin_id -> [target_id]
const radj = new Map();      // target_id -> [origin_id]
for (const n of g._nodes) {
  for (const inp of n.inputs || []) {
    if (inp.link == null) continue;
    const l = g.links[inp.link];
    if (!l) continue;
    if (!radj.has(n.id)) radj.set(n.id, []);
    radj.get(n.id).push({ from: l.origin_id, via: inp.name });
  }
  for (const outp of n.outputs || []) {
    for (const li of (outp.links || [])) {
      const l = g.links[li];
      if (!l) continue;
      if (!adj.has(n.id)) adj.set(n.id, []);
      adj.get(n.id).push(l.target_id);
    }
  }
}

const dumpIO = (id) => {
  const n = g.getNodeById(id);
  console.log(`\n# ${id} [${role(n)}] in=[${(radj.get(id) || []).map(x => x.from + '(' + role(g.getNodeById(x.from)) + ')').join(', ')}] out=[${(adj.get(id) || []).map(t => t + '(' + role(g.getNodeById(t)) + ')').join(', ')}]`);
};
const key = [65, 45, 50, 56, 60, 116, 194, 3, 30, 37, 181];
for (const id of key) dumpIO(id);

// Trace a full path from a start node to a goal by repeatedly walking single-successor branches.
function tracePath(start, goal, maxHop = 60) {
  const path = [start];
  let cur = start;
  for (let i = 0; i < maxHop; i++) {
    if (cur === goal) return { path, done: true };
    const outs = (adj.get(cur) || []);
    if (outs.length === 0) return { path, done: false, reason: 'terminal at ' + cur };
    // prefer out that can reach goal (BFS check), else first
    const next = outs.find(t => reach(null, t, goal)) || outs[0];
    path.push(next);
    cur = next;
  }
  return { path, done: false, reason: 'maxHop' };
}
function reach(from, mid, goal) {
  const seen = new Set([mid]); const q = [mid];
  while (q.length) { const c = q.shift(); if (c === goal) return true; for (const nx of (adj.get(c) || [])) if (!seen.has(nx)) { seen.add(nx); q.push(nx); } }
  return false;
}

// Forward paths to sink (3)
console.log('\n=== PATHS TO SINK(3) from each source ===');
const sources = g._nodes.filter(n => n.properties.role === 'source').map(n => n.id);
for (const s of sources) {
  const r = tracePath(s, 3);
  console.log(`  ${s}: ${r.path.join(' -> ')}  ${r.done ? '' : '[' + r.reason + ']'}`);
}

// Backward from sink
const back = new Map();
for (const [t, list] of radj) for (const e of list) { if (!back.has(t)) back.set(t, []); back.get(t).push(e.from); }
console.log('\n=== BACKWARD from SINK(3) ===');
(function bfsBack(start) {
  const order = [start]; let cur = start; const seen = new Set([start]);
  while (true) {
    const ins = (radj.get(cur) || []).map(e => e.from);
    console.log(`  ${cur}: fed by [${ins.join(', ')}]`);
    const nxt = ins.find(x => !seen.has(x));
    if (!nxt) break;
    seen.add(nxt); cur = nxt;
  }
})(3);



