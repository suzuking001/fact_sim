// Fit-to-screen helpers

var App = window.App || (window.App = {});

function fitToScreen(){
  const silent = !!(arguments[0] && arguments[0].silent);
  if(!App.canvas || !App.graph) return;
  if(!App.graph._nodes || App.graph._nodes.length === 0){
    try{
      if(App.canvas.ds && App.canvas.ds.reset) App.canvas.ds.reset();
      App.canvas.setDirty(true,true);
    }catch(_e){}
    return;
  }
  const b = new Float32Array(4);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const n of App.graph._nodes){
    if(!n) continue;
    if(typeof n.getBounding === 'function'){
      n.getBounding(b);
      minX = Math.min(minX, b[0]);
      minY = Math.min(minY, b[1]);
      maxX = Math.max(maxX, b[0] + b[2]);
      maxY = Math.max(maxY, b[1] + b[3]);
    }else{
      const x = n.pos ? n.pos[0] : 0;
      const y = n.pos ? n.pos[1] : 0;
      const w = n.size ? n.size[0] : 0;
      const h = n.size ? n.size[1] : 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  }
  if(!isFinite(minX) || !isFinite(minY)) return;
  const rect = App.canvas.canvas.getBoundingClientRect();
  const cw = rect.width || App.canvas.canvas.clientWidth || App.canvas.canvas.width || 800;
  const ch = rect.height || App.canvas.canvas.clientHeight || App.canvas.canvas.height || 600;
  const margin = 32;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  let scale = Math.min((cw - margin * 2) / w, (ch - margin * 2) / h);
  if(App.canvas.ds){
    if(App.canvas.ds.max_scale) scale = Math.min(scale, App.canvas.ds.max_scale);
    if(App.canvas.ds.min_scale && scale < App.canvas.ds.min_scale){
      // allow fit to go beyond min_scale when needed
      App.canvas.ds.min_scale = scale;
    }
  }
  if(!isFinite(scale) || scale <= 0) scale = 1;
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  if(App.canvas.ds){
    App.canvas.ds.scale = scale;
    App.canvas.ds.offset[0] = (cw / 2) / scale - cx;
    App.canvas.ds.offset[1] = (ch / 2) / scale - cy;
  }
  App.canvas.setDirty(true,true);
  if(!silent) App.showToast('Fit to screen');
}

function _isPositionedNode(node){
  return !!(node && node.pos && typeof node.pos[0] !== 'undefined' && typeof node.pos[1] !== 'undefined');
}

function _nodeSize(node){
  const w = Math.max(80, Number(node?.size?.[0]) || 160);
  const h = Math.max(40, Number(node?.size?.[1]) || 80);
  return [w, h];
}

function _nodeCenter(node){
  const [w, h] = _nodeSize(node);
  return [
    (Number(node?.pos?.[0]) || 0) + w * 0.5,
    (Number(node?.pos?.[1]) || 0) + h * 0.5
  ];
}

function _nodeBounds(node){
  const b = new Float32Array(4);
  if(node && typeof node.getBounding === 'function'){
    node.getBounding(b);
    const x = Number(b[0]) || 0;
    const y = Number(b[1]) || 0;
    const w = Math.max(1, Number(b[2]) || 1);
    const h = Math.max(1, Number(b[3]) || 1);
    return [x, y, w, h];
  }
  const x = Number(node?.pos?.[0]) || 0;
  const y = Number(node?.pos?.[1]) || 0;
  const [w, h] = _nodeSize(node);
  return [x, y, w, h];
}

function _collectLayoutNodes(){
  if(!App.graph || !Array.isArray(App.graph._nodes)) return [];
  return App.graph._nodes.filter(_isPositionedNode);
}

function _collectSelectedLayoutNodes(){
  if(!App.canvas || !App.canvas.selected_nodes) return [];
  const map = App.canvas.selected_nodes;
  const ids = Object.keys(map);
  const out = [];
  for(const id of ids){
    const node = map[id];
    if(_isPositionedNode(node)) out.push(node);
  }
  return out;
}

function _captureNodePositions(nodes){
  const out = new Map();
  for(const node of nodes){
    if(!_isPositionedNode(node)) continue;
    out.set(node.id, [Number(node.pos[0]) || 0, Number(node.pos[1]) || 0]);
  }
  return out;
}

function _hasMovement(nodes, beforeMap){
  for(const node of nodes){
    if(!_isPositionedNode(node)) continue;
    const before = beforeMap.get(node.id);
    if(!before) continue;
    const dx = Math.abs((Number(node.pos[0]) || 0) - before[0]);
    const dy = Math.abs((Number(node.pos[1]) || 0) - before[1]);
    if(dx > 0.01 || dy > 0.01) return true;
  }
  return false;
}

function _captureNodeSizes(nodes){
  const out = new Map();
  for(const node of nodes){
    if(!node) continue;
    const [w, h] = _nodeSize(node);
    out.set(node.id, [w, h]);
  }
  return out;
}

function _hasSizeChange(nodes, beforeMap){
  for(const node of nodes){
    if(!node) continue;
    const before = beforeMap.get(node.id);
    if(!before) continue;
    const [w, h] = _nodeSize(node);
    const dw = Math.abs(w - before[0]);
    const dh = Math.abs(h - before[1]);
    if(dw > 0.01 || dh > 0.01) return true;
  }
  return false;
}

function _nodeMinimumSize(node){
  let w = 80;
  let h = 40;
  if(node && typeof window.getNodeOverlayMinimumSize === 'function'){
    try{
      const overlaySize = window.getNodeOverlayMinimumSize(node, []);
      if(Array.isArray(overlaySize)){
        const ow = Number(overlaySize[0]);
        const oh = Number(overlaySize[1]);
        if(isFinite(ow) && ow > 0) w = Math.max(w, ow);
        if(isFinite(oh) && oh > 0) h = Math.max(h, oh);
      }
    }catch(_e){}
  }
  if(node && typeof node.computeSize === 'function'){
    try{
      const s = node.computeSize();
      if(Array.isArray(s) || (s && typeof s[0] !== 'undefined' && typeof s[1] !== 'undefined')){
        const cw = Number(s[0]);
        const ch = Number(s[1]);
        if(isFinite(cw) && cw > 0) w = Math.max(w, cw);
        if(isFinite(ch) && ch > 0) h = Math.max(h, ch);
      }
    }catch(_e){}
  }
  return [w, h];
}

function _runGraphMutation(fn){
  if(!App.graph || typeof fn !== 'function') return false;
  try{
    if(typeof App.graph.beforeChange === 'function') App.graph.beforeChange();
    try{
      fn();
    }finally{
      if(typeof App.graph.afterChange === 'function') App.graph.afterChange();
    }
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}

function _buildAdjacency(nodes){
  const nodeById = new Map(nodes.map((n)=> [n.id, n]));
  const outMap = new Map();
  const inMap = new Map();
  const undirected = new Map();
  for(const node of nodes){
    outMap.set(node.id, new Set());
    inMap.set(node.id, new Set());
    undirected.set(node.id, new Set());
  }
  const links = App.graph && App.graph.links ? Object.values(App.graph.links) : [];
  for(const link of links){
    if(!link) continue;
    const oid = link.origin_id;
    const tid = link.target_id;
    if(!nodeById.has(oid) || !nodeById.has(tid) || oid === tid) continue;
    outMap.get(oid).add(tid);
    inMap.get(tid).add(oid);
    undirected.get(oid).add(tid);
    undirected.get(tid).add(oid);
  }
  return { nodeById, outMap, inMap, undirected };
}

function _splitComponents(nodes, undirected){
  const nodeById = new Map(nodes.map((n)=> [n.id, n]));
  const seen = new Set();
  const comps = [];
  for(const node of nodes){
    const id = node.id;
    if(seen.has(id)) continue;
    seen.add(id);
    const queue = [id];
    const ids = [id];
    while(queue.length){
      const cur = queue.shift();
      const nexts = undirected.get(cur);
      if(!nexts) continue;
      for(const nid of nexts){
        if(seen.has(nid) || !nodeById.has(nid)) continue;
        seen.add(nid);
        queue.push(nid);
        ids.push(nid);
      }
    }
    comps.push(ids);
  }
  comps.sort((a, b)=>{
    const ax = Math.min(...a.map((id)=> Number(nodeById.get(id)?.pos?.[0]) || 0));
    const bx = Math.min(...b.map((id)=> Number(nodeById.get(id)?.pos?.[0]) || 0));
    return ax - bx;
  });
  return comps;
}

function _computeLayers(componentIds, outMap, inMap, nodeById){
  const compSet = new Set(componentIds);
  const indeg = new Map();
  const layer = new Map();
  for(const id of componentIds){
    let count = 0;
    const ins = inMap.get(id);
    if(ins){
      for(const pid of ins){
        if(compSet.has(pid)) count++;
      }
    }
    indeg.set(id, count);
    layer.set(id, 0);
  }
  const queue = componentIds
    .filter((id)=> (indeg.get(id) || 0) === 0)
    .sort((a, b)=> (Number(nodeById.get(a)?.pos?.[0]) || 0) - (Number(nodeById.get(b)?.pos?.[0]) || 0));

  if(!queue.length && componentIds.length){
    queue.push(componentIds[0]);
  }

  while(queue.length){
    const id = queue.shift();
    const base = layer.get(id) || 0;
    const outs = outMap.get(id);
    if(!outs) continue;
    for(const tid of outs){
      if(!compSet.has(tid)) continue;
      const cand = base + 1;
      if(cand > (layer.get(tid) || 0)) layer.set(tid, cand);
      indeg.set(tid, (indeg.get(tid) || 0) - 1);
      if((indeg.get(tid) || 0) === 0) queue.push(tid);
    }
  }

  const ordered = componentIds.slice().sort((a, b)=>{
    const ax = Number(nodeById.get(a)?.pos?.[0]) || 0;
    const bx = Number(nodeById.get(b)?.pos?.[0]) || 0;
    return ax - bx;
  });
  const maxPass = Math.max(4, componentIds.length * 2);
  for(let pass = 0; pass < maxPass; pass++){
    let changed = false;
    for(const oid of ordered){
      const outs = outMap.get(oid);
      if(!outs) continue;
      const base = layer.get(oid) || 0;
      for(const tid of outs){
        if(!compSet.has(tid)) continue;
        const cand = base + 1;
        if(cand > (layer.get(tid) || 0)){
          layer.set(tid, cand);
          changed = true;
        }
      }
    }
    if(!changed) break;
  }

  let minLayer = Infinity;
  for(const id of componentIds){
    minLayer = Math.min(minLayer, layer.get(id) || 0);
  }
  if(isFinite(minLayer) && minLayer !== 0){
    for(const id of componentIds){
      layer.set(id, (layer.get(id) || 0) - minLayer);
    }
  }
  return layer;
}

function _orderLayerNodes(layerMap, outMap, inMap, nodeById){
  const layers = new Map();
  for(const [id, lv] of layerMap.entries()){
    if(!layers.has(lv)) layers.set(lv, []);
    layers.get(lv).push(id);
  }
  const sortedLayerKeys = Array.from(layers.keys()).sort((a, b)=> a - b);
  const originalOrder = new Map();
  for(const key of sortedLayerKeys){
    const ids = layers.get(key);
    ids.sort((a, b)=>{
      const ay = Number(nodeById.get(a)?.pos?.[1]) || 0;
      const by = Number(nodeById.get(b)?.pos?.[1]) || 0;
      if(ay !== by) return ay - by;
      const ax = Number(nodeById.get(a)?.pos?.[0]) || 0;
      const bx = Number(nodeById.get(b)?.pos?.[0]) || 0;
      return ax - bx;
    });
    ids.forEach((id, idx)=> originalOrder.set(id, idx));
  }

  const indexMapFor = (ids)=>{
    const map = new Map();
    ids.forEach((id, idx)=> map.set(id, idx));
    return map;
  };

  const sortByBary = (ids, neighborGetter, neighborIndex)=>{
    ids.sort((a, b)=>{
      const na = neighborGetter(a);
      const nb = neighborGetter(b);
      const bary = (id, arr)=>{
        if(!arr.length) return originalOrder.get(id) || 0;
        let sum = 0;
        let cnt = 0;
        for(const nid of arr){
          if(neighborIndex.has(nid)){
            sum += neighborIndex.get(nid);
            cnt++;
          }
        }
        if(!cnt) return originalOrder.get(id) || 0;
        return sum / cnt;
      };
      const ba = bary(a, na);
      const bb = bary(b, nb);
      if(ba !== bb) return ba - bb;
      return (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0);
    });
  };

  for(let iter = 0; iter < 4; iter++){
    for(let i = 1; i < sortedLayerKeys.length; i++){
      const prev = layers.get(sortedLayerKeys[i - 1]) || [];
      const cur = layers.get(sortedLayerKeys[i]) || [];
      const idxPrev = indexMapFor(prev);
      sortByBary(cur, (id)=> Array.from(inMap.get(id) || []), idxPrev);
    }
    for(let i = sortedLayerKeys.length - 2; i >= 0; i--){
      const next = layers.get(sortedLayerKeys[i + 1]) || [];
      const cur = layers.get(sortedLayerKeys[i]) || [];
      const idxNext = indexMapFor(next);
      sortByBary(cur, (id)=> Array.from(outMap.get(id) || []), idxNext);
    }
  }

  return { layers, sortedLayerKeys };
}

function _captureGroupMembership(nodes){
  const groups = Array.isArray(App.graph?._groups) ? App.graph._groups : [];
  if(!groups.length) return [];
  const memberships = [];
  for(const group of groups){
    const b = group && group._bounding;
    if(!Array.isArray(b) || b.length < 4) continue;
    const gx = Number(b[0]) || 0;
    const gy = Number(b[1]) || 0;
    const gw = Math.max(1, Number(b[2]) || 1);
    const gh = Math.max(1, Number(b[3]) || 1);
    const memberIds = [];
    for(const node of nodes){
      const c = _nodeCenter(node);
      if(c[0] >= gx && c[0] <= gx + gw && c[1] >= gy && c[1] <= gy + gh){
        memberIds.push(node.id);
      }
    }
    memberships.push({ group, memberIds });
  }
  return memberships;
}

function _reframeGroups(memberships, nodeById){
  if(!Array.isArray(memberships) || !memberships.length) return;
  const padX = 24;
  const padBottom = 20;
  const titlePad = 28;
  for(const item of memberships){
    const group = item?.group;
    const ids = Array.isArray(item?.memberIds) ? item.memberIds : [];
    if(!group || !ids.length) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for(const id of ids){
      const node = nodeById.get(id);
      if(!node) continue;
      const [x, y, w, h] = _nodeBounds(node);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    if(!isFinite(minX) || !isFinite(minY)) continue;
    const newX = minX - padX;
    const newY = minY - titlePad;
    const newW = Math.max(180, (maxX - minX) + padX * 2);
    const newH = Math.max(120, (maxY - minY) + titlePad + padBottom);
    group._bounding = [newX, newY, newW, newH];
  }
}

function _applyFlowLayout(opts){
  const nodes = _collectLayoutNodes();
  if(!nodes.length) return;
  const spacingXRaw = Number(opts?.spacingX);
  const spacingYRaw = Number(opts?.spacingY);
  const spacingX = Number.isFinite(spacingXRaw) && spacingXRaw > 0 ? spacingXRaw : 140;
  const spacingY = Number.isFinite(spacingYRaw) && spacingYRaw > 0 ? spacingYRaw : 40;
  const componentGapRaw = Number(opts?.componentGap);
  const componentGap = Number.isFinite(componentGapRaw) && componentGapRaw > 0 ? componentGapRaw : Math.max(220, spacingX * 1.25);
  const groupAware = !!opts?.groupAware;

  const { nodeById, outMap, inMap, undirected } = _buildAdjacency(nodes);
  const comps = _splitComponents(nodes, undirected);
  if(!comps.length) return;

  let minX = Infinity;
  let minY = Infinity;
  for(const node of nodes){
    minX = Math.min(minX, Number(node.pos[0]) || 0);
    minY = Math.min(minY, Number(node.pos[1]) || 0);
  }
  if(!isFinite(minX)) minX = 40;
  if(!isFinite(minY)) minY = 80;

  const memberships = groupAware ? _captureGroupMembership(nodes) : [];
  let cursorX = minX;

  for(const compIds of comps){
    const compSet = new Set(compIds);
    const layerMap = _computeLayers(compIds, outMap, inMap, nodeById);
    const { layers, sortedLayerKeys } = _orderLayerNodes(layerMap, outMap, inMap, nodeById);

    const layerX = new Map();
    let innerX = cursorX;
    for(const key of sortedLayerKeys){
      const ids = layers.get(key) || [];
      let maxW = 120;
      for(const id of ids){
        const [w] = _nodeSize(nodeById.get(id));
        if(w > maxW) maxW = w;
      }
      layerX.set(key, innerX);
      innerX += maxW + spacingX;
    }

    let maxLayerHeight = 0;
    const layerHeight = new Map();
    const yMap = new Map();
    for(const key of sortedLayerKeys){
      const ids = layers.get(key) || [];
      let y = minY;
      for(const id of ids){
        const node = nodeById.get(id);
        const [, h] = _nodeSize(node);
        yMap.set(id, y);
        y += h + spacingY;
      }
      const hTotal = ids.length ? (y - minY - spacingY) : 0;
      layerHeight.set(key, hTotal);
      if(hTotal > maxLayerHeight) maxLayerHeight = hTotal;
    }

    for(const key of sortedLayerKeys){
      const ids = layers.get(key) || [];
      const baseX = layerX.get(key) || cursorX;
      const offsetY = (maxLayerHeight - (layerHeight.get(key) || 0)) * 0.5;
      for(const id of ids){
        const node = nodeById.get(id);
        if(!node) continue;
        node.pos[0] = baseX;
        node.pos[1] = (yMap.get(id) || minY) + offsetY;
      }
    }

    const layerCount = sortedLayerKeys.length || 1;
    const compWidth = Math.max(180, innerX - cursorX - spacingX + 140);
    cursorX += compWidth + componentGap;

    // keep isolated single-node components compact
    if(compSet.size === 1 && layerCount <= 1){
      cursorX -= Math.max(0, componentGap * 0.35);
    }
  }

  if(groupAware){
    _reframeGroups(memberships, nodeById);
  }
}

function autoLayoutGraph(opts){
  if(!App.graph) return false;
  const nodes = _collectLayoutNodes();
  if(!nodes.length) return false;

  const mode = String(opts?.mode || 'simple').toLowerCase();
  const spacingRaw = Number(opts && opts.spacing);
  const spacing = Number.isFinite(spacingRaw) && spacingRaw > 0 ? spacingRaw : 80;
  const doFit = !opts || opts.fit !== false;

  const beforeById = _captureNodePositions(nodes);

  const ok = _runGraphMutation(()=>{
    if(mode === 'flow' || mode === 'flow-group'){
      _applyFlowLayout({
        groupAware: mode === 'flow-group',
        spacingX: Math.max(100, spacing * 1.4),
        spacingY: Math.max(26, spacing * 0.45),
        componentGap: Math.max(180, spacing * 2.2)
      });
      return;
    }
    if(typeof App.graph.arrange === 'function'){
      App.graph.arrange(spacing);
    }
  });
  if(!ok) return false;

  const moved = _hasMovement(nodes, beforeById);

  if(doFit) fitToScreen({ silent:true });
  else if(App.canvas) App.canvas.setDirty(true, true);

  const modeLabel = mode === 'flow-group' ? 'Flow+Group' : (mode === 'flow' ? 'Flow' : 'Simple');
  App.showToast(moved ? `Auto layout applied (${modeLabel})` : `Auto layout: no changes (${modeLabel})`);
  return true;
}

function applySelectionLayout(action){
  const nodes = _collectSelectedLayoutNodes();
  const act = String(action || '').toLowerCase();
  if(!act) return false;
  if(nodes.length < 2){
    return false;
  }
  if((act === 'distribute-h' || act === 'distribute-v') && nodes.length < 3) return false;

  const beforeById = _captureNodePositions(nodes);
  const centerX = (node)=> _nodeCenter(node)[0];
  const centerY = (node)=> _nodeCenter(node)[1];

  const ok = _runGraphMutation(()=>{
    if(act === 'align-left'){
      const target = Math.min(...nodes.map((n)=> Number(n.pos[0]) || 0));
      nodes.forEach((n)=>{ n.pos[0] = target; });
      return;
    }
    if(act === 'align-right'){
      const target = Math.max(...nodes.map((n)=> (Number(n.pos[0]) || 0) + _nodeSize(n)[0]));
      nodes.forEach((n)=>{ n.pos[0] = target - _nodeSize(n)[0]; });
      return;
    }
    if(act === 'align-top'){
      const target = Math.min(...nodes.map((n)=> Number(n.pos[1]) || 0));
      nodes.forEach((n)=>{ n.pos[1] = target; });
      return;
    }
    if(act === 'align-bottom'){
      const target = Math.max(...nodes.map((n)=> (Number(n.pos[1]) || 0) + _nodeSize(n)[1]));
      nodes.forEach((n)=>{ n.pos[1] = target - _nodeSize(n)[1]; });
      return;
    }
    if(act === 'align-center-x'){
      const target = nodes.reduce((s, n)=> s + centerX(n), 0) / nodes.length;
      nodes.forEach((n)=>{ n.pos[0] = target - _nodeSize(n)[0] * 0.5; });
      return;
    }
    if(act === 'align-center-y'){
      const target = nodes.reduce((s, n)=> s + centerY(n), 0) / nodes.length;
      nodes.forEach((n)=>{ n.pos[1] = target - _nodeSize(n)[1] * 0.5; });
      return;
    }
    if(act === 'distribute-h'){
      const sorted = nodes.slice().sort((a, b)=> centerX(a) - centerX(b));
      const first = centerX(sorted[0]);
      const last = centerX(sorted[sorted.length - 1]);
      const step = (last - first) / (sorted.length - 1);
      sorted.forEach((n, i)=>{
        const targetCenter = first + step * i;
        n.pos[0] = targetCenter - _nodeSize(n)[0] * 0.5;
      });
      return;
    }
    if(act === 'distribute-v'){
      const sorted = nodes.slice().sort((a, b)=> centerY(a) - centerY(b));
      const first = centerY(sorted[0]);
      const last = centerY(sorted[sorted.length - 1]);
      const step = (last - first) / (sorted.length - 1);
      sorted.forEach((n, i)=>{
        const targetCenter = first + step * i;
        n.pos[1] = targetCenter - _nodeSize(n)[1] * 0.5;
      });
      return;
    }
  });
  if(!ok) return false;

  if(App.canvas) App.canvas.setDirty(true, true);
  const moved = _hasMovement(nodes, beforeById);
  if(!moved) return false;

  const labels = {
    'align-left': 'Align Left',
    'align-right': 'Align Right',
    'align-top': 'Align Top',
    'align-bottom': 'Align Bottom',
    'align-center-x': 'Align Center X',
    'align-center-y': 'Align Center Y',
    'distribute-h': 'Distribute Horizontal',
    'distribute-v': 'Distribute Vertical'
  };
  App.showToast(`Selection layout: ${labels[act] || act}`);
  return true;
}

function applySelectionResize(mode, opts){
  const nodes = _collectSelectedLayoutNodes();
  if(!nodes.length) return false;
  const m = String(mode || 'set-size').toLowerCase();
  let targetW = 0;
  let targetH = 0;
  if(m === 'set-size'){
    targetW = Math.max(80, Number(opts && opts.width) || 0);
    targetH = Math.max(40, Number(opts && opts.height) || 0);
    if(!isFinite(targetW) || !isFinite(targetH) || targetW <= 0 || targetH <= 0){
      return false;
    }
  }

  const beforeSizeById = _captureNodeSizes(nodes);
  const ok = _runGraphMutation(()=>{
    nodes.forEach((node)=>{
      let w = targetW;
      let h = targetH;
      if(m === 'min-size'){
        const s = _nodeMinimumSize(node);
        w = s[0];
        h = s[1];
      }
      node.size = [w, h];
      if(typeof node.onResize === 'function'){
        try{ node.onResize(node.size); }catch(_e){}
      }
    });
  });
  if(!ok) return false;
  if(App.canvas) App.canvas.setDirty(true, true);
  const changed = _hasSizeChange(nodes, beforeSizeById);
  if(!changed) return false;
  App.showToast(m === 'min-size' ? 'Resize: Minimum Size' : 'Resize: Set Size');
  return true;
}

function installFitHandlers(c){
  if(!c || c.__fitHooked) return;
  const el = c.canvas;
  if(!el) return;
  let lastMid = 0;
  const controller = App.resetListenerController('__fitController');
  const opts = App.listenerOptions(true, controller);
  const inputEvents = (typeof App.getCanvasInputEvents === 'function')
    ? App.getCanvasInputEvents()
    : { down:'mousedown' };
  el.addEventListener(inputEvents.down, (e)=>{
    if(e.button !== 1) return;
    const now = performance.now();
    if(now - lastMid < 350){
      fitToScreen();
      lastMid = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    lastMid = now;
    e.preventDefault();
  }, opts);
  c.__fitHooked = true;
}

