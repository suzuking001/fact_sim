(function(){
  if(typeof LiteGraph === 'undefined') return;

  const getNow = ()=> typeof simNow === 'function' ? simNow() : Date.now();
  const cfg = window.NODES_CONFIG?.animations || {};
  const defaultDuration = (cfg.linkMs || 800);
  const iconRadius = cfg.radius || 22.5;
  const configuredArrivalHoldMs = Number(cfg.arrivalHoldMs);
  const arrivalHoldMs = Math.max(0, Number.isFinite(configuredArrivalHoldMs) ? configuredArrivalHoldMs : 120);
  const getFrameNow = ()=> typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  const LINK_ANIM_PALETTE = Object.freeze({
    defaultTypeAccent: '#8e8e93',
    defaultBubbleFill: '#d5d8dc',
    defaultBubbleStroke: 'rgba(15,23,42,0.22)',
    agvLabelFill: 'rgba(0,113,227,0.92)',
    agvLabelStroke: 'rgba(255,255,255,0.28)',
    agvLabelText: '#f8fbff',
    palletLabelFill: 'rgba(22,163,74,0.92)',
    palletLabelStroke: 'rgba(255,255,255,0.28)',
    palletLabelText: '#f7fff9',
    workLabelFill: 'rgba(15,23,42,0.88)',
    workLabelStroke: 'rgba(255,255,255,0.22)',
    workLabelText: '#f8fafc',
    labelShadow: 'rgba(15,23,42,0.16)'
  });
  const getLinkAnimPalette = ()=> LINK_ANIM_PALETTE;
  const WORK_TYPE_ACCENTS = {
    A: '#0a84ff',
    B: '#ff9f0a',
    C: '#34c759',
    D: '#bf5af2',
    E: '#ff375f',
    F: '#64d2ff'
  };
  const ENTITY_THEME_STYLES = Object.freeze({
    blue:   { fill:'#e8f3ff', stroke:'#0a84ff', text:'#075985' },
    orange: { fill:'#fff1dc', stroke:'#d97706', text:'#7c2d12' },
    green:  { fill:'#e8f8ed', stroke:'#16833c', text:'#14532d' },
    purple: { fill:'#f3e8ff', stroke:'#8e35bd', text:'#581c87' },
    red:    { fill:'#ffe9e7', stroke:'#d92d20', text:'#7f1d1d' },
    cyan:   { fill:'#e3f8ff', stroke:'#087ea4', text:'#164e63' },
    yellow: { fill:'#fff8cf', stroke:'#a16207', text:'#713f12' },
    gray:   { fill:'#eef0f2', stroke:'#63666a', text:'#334155' }
  });

  function hashText(text){
    const raw = String(text || '');
    let hash = 0;
    for(let i = 0; i < raw.length; i++){
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function normalizeWorkType(value){
    return String(value == null ? '' : value).trim().toUpperCase();
  }

  function getWorkTypeAccent(typeValue){
    const palette = getLinkAnimPalette();
    const key = normalizeWorkType(typeValue);
    if(!key) return palette.defaultTypeAccent;
    if(WORK_TYPE_ACCENTS[key]) return WORK_TYPE_ACCENTS[key];
    const hue = hashText(key) % 360;
    return `hsl(${hue}, 74%, 46%)`;
  }

  function getAnimatedIconTheme(type, info){
    const palette = getLinkAnimPalette();
    switch(String(type || '').toLowerCase()){
      case 'agv':
        return {
          fill: '#5dade2',
          stroke: 'rgba(255,255,255,0.82)',
          lineWidth: 2
        };
      case 'pallet':
        return {
          fill: '#2ecc71',
          stroke: 'rgba(255,255,255,0.82)',
          lineWidth: 2
        };
      case 'work':{
        const accent = getWorkTypeAccent(info?.t ?? info?.type ?? '');
        return {
          fill: 'rgba(255,255,255,0.96)',
          stroke: accent,
          lineWidth: 3.5
        };
      }
      default:
        return {
          fill: palette.defaultBubbleFill,
          stroke: palette.defaultBubbleStroke,
          lineWidth: 1.5
        };
    }
  }

  function drawRoundRect(ctx, x, y, w, h, r){
    const radius = Math.max(0, Math.min(r || 0, w * 0.5, h * 0.5));
    ctx.beginPath();
    if(typeof ctx.roundRect === 'function'){
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function trimAnimatedLabel(ctx, text, maxWidth){
    const raw = String(text || '');
    if(!raw) return '';
    if(ctx.measureText(raw).width <= maxWidth) return raw;
    let out = raw;
    while(out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth){
      out = out.slice(0, -1);
    }
    return `${out}…`;
  }

  function getAnimatedLabelTheme(type){
    const palette = getLinkAnimPalette();
    switch(String(type || '').toLowerCase()){
      case 'agv':
        return {
          fill: palette.agvLabelFill,
          stroke: palette.agvLabelStroke,
          text: palette.agvLabelText
        };
      case 'pallet':
        return {
          fill: palette.palletLabelFill,
          stroke: palette.palletLabelStroke,
          text: palette.palletLabelText
        };
      default:
        return {
          fill: palette.workLabelFill,
          stroke: palette.workLabelStroke,
          text: palette.workLabelText
        };
    }
  }

  function drawAnimatedLabel(ctx, x, y, text, type){
    const theme = getAnimatedLabelTheme(type);
    const palette = getLinkAnimPalette();
    ctx.save();
    ctx.font = '600 11px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    const label = trimAnimatedLabel(ctx, text, 180);
    const padX = 9;
    const height = 19;
    const width = Math.ceil(ctx.measureText(label).width) + padX * 2;
    const left = Math.round(x - width * 0.5);
    const top = Math.round(y - height);
    ctx.shadowColor = palette.labelShadow;
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = theme.fill;
    drawRoundRect(ctx, left, top, width, height, 999);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = theme.stroke;
    ctx.lineWidth = 1;
    drawRoundRect(ctx, left + 0.5, top + 0.5, width - 1, height - 1, 999);
    ctx.stroke();
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, top + height * 0.5 + 0.5);
    ctx.restore();
  }

  function entityTypeDefinition(graph, info, entity){
    const registry = window.App?.entityModelForGraph?.(graph);
    if(!registry) return null;
    const candidate = entity || info?.entity || null;
    const typeId = candidate?.typeId ?? info?.typeId;
    const direct = typeId != null ? registry.get?.(typeId) : null;
    if(direct) return direct;
    const typeName = String(candidate?.type ?? candidate?.name ?? info?.t ?? info?.type ?? '').trim().toLowerCase();
    return typeName ? (registry.list?.() || []).find((entry)=>String(entry?.name || '').trim().toLowerCase() === typeName) || null : null;
  }

  function animatedAppearance(graph, type, info, entity){
    const definition = entityTypeDefinition(graph, info, entity);
    const shape = String(definition?.appearance?.shape || 'circle');
    const colorTheme = String(definition?.appearance?.colorTheme || 'auto');
    return {
      shape:['circle','rounded-square','square','triangle','diamond','hexagon'].includes(shape) ? shape : 'circle',
      theme:ENTITY_THEME_STYLES[colorTheme] || getAnimatedIconTheme(type, info),
      definition
    };
  }

  function beginEntityShape(ctx, shape, x, y, radius){
    const r = Math.max(1, Number(radius) || 1);
    ctx.beginPath();
    if(shape === 'rounded-square'){
      drawRoundRect(ctx, x - r, y - r, r * 2, r * 2, r * 0.38);
      return;
    }
    if(shape === 'square'){
      ctx.rect(x - r, y - r, r * 2, r * 2);
      return;
    }
    const points = shape === 'triangle' ? 3 : (shape === 'diamond' ? 4 : (shape === 'hexagon' ? 6 : 0));
    if(!points){ ctx.arc(x, y, r, 0, Math.PI * 2); return; }
    for(let index = 0; index < points; index++){
      const angle = -Math.PI / 2 + (index * Math.PI * 2 / points);
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if(index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawEntityShape(ctx, appearance, x, y, radius, lineWidth){
    const width = Math.max(1, Number(lineWidth) || Number(appearance?.theme?.lineWidth) || 2);
    beginEntityShape(ctx, appearance?.shape || 'circle', x, y, radius);
    ctx.fillStyle = appearance?.theme?.fill || '#f8fafc';
    ctx.fill();
    if(appearance?.theme?.stroke){
      beginEntityShape(ctx, appearance?.shape || 'circle', x, y, Math.max(1, radius - width * 0.5));
      ctx.lineWidth = width;
      ctx.strokeStyle = appearance.theme.stroke;
      ctx.stroke();
    }
  }

  function entityChildren(graph, info, entity){
    const candidate = entity || info?.entity || null;
    if(candidate){
      const runtimeStore = window.App?.runtimeInstancesForGraph?.(graph);
      const runtimeEntity = runtimeStore?.get?.(candidate);
      const runtimeId = runtimeEntity?.instanceId;
      if(runtimeEntity && runtimeId && runtimeStore?.instances?.has?.(String(runtimeId))){
        return { children:runtimeStore.childrenOf?.(runtimeEntity) || [], store:runtimeStore, known:true };
      }
      const legacyKeys = ['contents', 'children', 'cargo', 'pallets', 'works'];
      const directChildren = [];
      let hasLegacyCollection = false;
      for(const key of legacyKeys){
        if(!Array.isArray(candidate[key])) continue;
        hasLegacyCollection = true;
        for(const child of candidate[key]) if(child && typeof child === 'object' && !directChildren.includes(child)) directChildren.push(child);
      }
      if(hasLegacyCollection) return { children:directChildren, store:null, known:true };
      const legacyStore = window.App?.entityStoreForGraph?.(graph);
      const legacyEntity = legacyStore?.resolve?.(candidate) || candidate;
      const children = legacyStore?.childrenOf?.(legacyEntity);
      if(Array.isArray(children)) return { children, store:legacyStore, known:true };
    }
    const treeChildren = Array.isArray(info?.tree?.children) ? info.tree.children : (Array.isArray(info?.children) ? info.children : null);
    return { children:treeChildren || [], store:null, known:Array.isArray(treeChildren) };
  }

  function childCount(store, entity){
    if(!entity) return 0;
    if(store){
      const children = store.childrenOf?.(entity);
      return Array.isArray(children) ? children.length : 0;
    }
    const unique = [];
    for(const key of ['contents', 'children', 'cargo', 'pallets', 'works']){
      for(const child of (Array.isArray(entity[key]) ? entity[key] : [])){
        if(child && typeof child === 'object' && !unique.includes(child)) unique.push(child);
      }
    }
    return unique.length;
  }

  function entityDisplayTree(graph, entity, depth = 0, seen = new Set()){
    if(!entity || typeof entity !== 'object' || depth > 12 || seen.has(entity)) return null;
    const nextSeen = new Set(seen); nextSeen.add(entity);
    const definition = entityTypeDefinition(graph, { typeId:entity.typeId, t:entity.type ?? entity.name }, entity);
    const resolved = entityChildren(graph, { entity }, entity);
    return {
      instanceId:String(entity.instanceId || ''),
      displayId:String(entity.id ?? entity.palletId ?? entity.entityId ?? ''),
      typeId:String(entity.typeId || ''),
      name:String(definition?.name || entity.type || entity.name || entity.typeId || 'Entity'),
      attributes:entity.attributes && typeof entity.attributes === 'object' ? entity.attributes : {},
      children:resolved.children.map((child)=>entityDisplayTree(graph, child, depth + 1, nextSeen)).filter(Boolean)
    };
  }

  function drawEntityBadge(ctx, x, y, text, radius = 6){
    const label = String(text == null ? '' : text);
    if(!label) return;
    const width = Math.max(radius * 2, 5 + label.length * 6);
    drawRoundRect(ctx, x - width * 0.5, y - radius, width, radius * 2, radius);
    ctx.fillStyle = 'rgba(15,23,42,.92)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(7, radius + 2)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + 0.5);
  }

  function drawContainedEntities(ctx, graph, info, x, y, parentRadius){
    const resolved = entityChildren(graph, info, info?.entity);
    const children = resolved.children;
    if(children.length){
      const visible = children.slice(0, 3);
      const childRadius = Math.max(5, parentRadius * 0.29);
      const spacing = childRadius * 1.8;
      visible.forEach((child, index)=>{
        const childX = x + (index - (visible.length - 1) * 0.5) * spacing;
        const childY = y + parentRadius * 0.16;
        const childInfo = { entity:child, typeId:child?.typeId, t:child?.type ?? child?.name };
        drawEntityShape(ctx, animatedAppearance(graph, 'work', childInfo, child), childX, childY, childRadius, 1.4);
        const nested = childCount(resolved.store, child);
        if(nested > 0) drawEntityBadge(ctx, childX + childRadius * 0.68, childY - childRadius * 0.68, nested, 4.2);
      });
      if(children.length > visible.length){
        drawEntityBadge(ctx, x + parentRadius * 0.62, y - parentRadius * 0.58, `+${children.length - visible.length}`, 5.5);
      }
      return;
    }
    const legacyCount = Math.max(0, Math.floor(Number(info?.workCount) || 0));
    if(!resolved.known && legacyCount > 0) drawEntityBadge(ctx, x + parentRadius * 0.58, y - parentRadius * 0.58, legacyCount, 5.5);
  }

class LinkAnimator{
  constructor(){
    this.animations = [];
    this._max = Math.max(200, Number(cfg.maxTransient) || 1500);
    this._sampleOffset = 0;
    this._visibleHits = [];
    this._hoverAnim = null;
    this._hoverRenderedAt = 0;
    this._workVisualKeys = new WeakMap();
    this._nextWorkVisualKey = 1;
  }
  clear(graph){
    if(!graph){
      this.animations.length = 0;
      this._sampleOffset = 0;
      this._visibleHits.length = 0;
      this._hideTooltip();
      return;
    }
    this.animations = this.animations.filter((anim)=> anim && anim.graph && anim.graph !== graph);
    if(!this.animations.length) this._sampleOffset = 0;
    if(this._hoverAnim?.graph === graph) this._hideTooltip();
  }
  _tooltip(){
    let tooltip = document.getElementById('factEntityHoverTooltip');
    if(tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = 'factEntityHoverTooltip';
    tooltip.className = 'factEntityHoverTooltip';
    tooltip.hidden = true;
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
    return tooltip;
  }
  _hideTooltip(){
    const tooltip = document.getElementById('factEntityHoverTooltip');
    if(tooltip) tooltip.hidden = true;
    this._hoverAnim = null;
    this._hoverRenderedAt = 0;
  }
  _treeMatch(tree, type, info){
    if(!tree) return 0;
    const id = String(info?.id ?? '').trim().toLowerCase();
    let identityScore = 0;
    if(id){
      const displayId = String(tree.displayId ?? '').trim().toLowerCase();
      const instanceId = String(tree.instanceId ?? '').trim().toLowerCase();
      if(displayId === id || instanceId === id) identityScore += 20;
      else if(displayId.startsWith(`${id} #`)) identityScore += 12;
      else if(String(tree.name || '').trim().toLowerCase() === id) identityScore += 8;
    }
    const typeName = String(info?.t ?? info?.type ?? '').trim().toLowerCase();
    if(typeName && (String(tree.name || '').trim().toLowerCase() === typeName || String(tree.typeId || '').trim().toLowerCase() === typeName)) identityScore += 6;
    if(!identityScore) return 0;
    return identityScore;
  }
  _resolveHoverTree(anim){
    const info = anim?.info || {};
    if(info.tree && typeof info.tree === 'object') return { tree: info.tree, node: null };
    const graph = anim?.graph;
    if(info.entity && graph){
      try{
        const directTree = entityDisplayTree(graph, info.entity);
        if(directTree) return { tree:directTree, node:null };
      }catch(_e){}
    }
    let best = null;
    const visit = (tree, node)=>{
      if(!tree) return;
      const score = this._treeMatch(tree, String(anim?.type || '').toLowerCase(), info);
      if(score > (best?.score || 0)) best = { score, tree, node };
      for(const child of (Array.isArray(tree.children) ? tree.children : [])) visit(child, node);
    };
    for(const node of (Array.isArray(graph?._nodes) ? graph._nodes : [])){
      try{
        const data = typeof node.getCurrentContents === 'function'
          ? node.getCurrentContents({ includeInstances: true })
          : window.App?.currentContentsForNode?.(node, { includeInstances: true });
        for(const tree of (data?.instances || [])) visit(tree, node);
      }catch(_e){}
    }
    if(best) return best;
    const name = String(info.t ?? info.type ?? info.label ?? 'Entity');
    return {
      node: null,
      tree: {
        instanceId: String(info.instanceId ?? info.id ?? ''),
        displayId: String(info.id ?? ''),
        typeId: String(info.typeId ?? ''),
        name,
        attributes: info.attributes && typeof info.attributes === 'object' ? info.attributes : {},
        children: Array.isArray(info.children) ? info.children : []
      }
    };
  }
  _renderHoverTooltip(anim){
    const tooltip = this._tooltip();
    const resolved = this._resolveHoverTree(anim);
    const tree = resolved.tree;
    const displayLabel = (entry)=>{
      const name = String(entry?.name || entry?.typeId || 'Entity');
      const displayId = String(entry?.displayId || '');
      return displayId && displayId !== name ? `${name} · ${displayId}` : name;
    };
    tooltip.replaceChildren();
    const header = document.createElement('div');
    header.className = 'factEntityHoverHeader';
    const title = document.createElement('strong');
    title.textContent = displayLabel(tree);
    const category = document.createElement('span');
    category.textContent = String(tree.category || anim?.type || 'entity');
    header.append(title, category);
    tooltip.appendChild(header);
    const meta = document.createElement('div');
    meta.className = 'factEntityHoverMeta';
    const metaRows = [];
    if(tree.typeId) metaRows.push(`Type ID: ${tree.typeId}`);
    if(tree.instanceId) metaRows.push(`Instance ID: ${tree.instanceId}`);
    if(resolved.node) metaRows.push(`Node: ${resolved.node.title || resolved.node.type || ''} #${resolved.node.id}`);
    meta.textContent = metaRows.join('  ·  ');
    if(meta.textContent) tooltip.appendChild(meta);
    const attributes = tree.attributes && typeof tree.attributes === 'object'
      ? Object.entries(tree.attributes).filter(([key, value])=>!key.startsWith('__') && (value == null || ['string','number','boolean'].includes(typeof value))).slice(0, 8)
      : [];
    if(attributes.length){
      const attr = document.createElement('div');
      attr.className = 'factEntityHoverAttributes';
      attributes.forEach(([key, value])=>{
        const item = document.createElement('span');
        item.textContent = `${key}: ${String(value)}`;
        attr.appendChild(item);
      });
      tooltip.appendChild(attr);
    }
    const treeHost = document.createElement('div');
    treeHost.className = 'factEntityHoverTree';
    let rendered = 0;
    const appendTree = (entry, depth)=>{
      if(!entry || rendered >= 80 || depth > 12) return;
      rendered++;
      const row = document.createElement('div');
      row.className = 'factEntityHoverTreeRow';
      row.style.setProperty('--entity-hover-depth', String(depth));
      const branch = document.createElement('span');
      branch.textContent = depth ? '└' : '●';
      const definition = entityTypeDefinition(anim?.graph, { typeId:entry.typeId, t:entry.name }, entry);
      const marker = document.createElement('span');
      marker.className = 'factEntityHoverAppearance entityAppearancePreview';
      marker.dataset.shape = definition?.appearance?.shape || 'circle';
      marker.dataset.colorTheme = definition?.appearance?.colorTheme || 'auto';
      marker.setAttribute('aria-hidden', 'true');
      const glyph = document.createElement('span'); glyph.className = 'entityAppearanceGlyph'; marker.appendChild(glyph);
      const text = document.createElement('span');
      text.textContent = displayLabel(entry);
      row.append(branch, marker, text);
      treeHost.appendChild(row);
      for(const child of (Array.isArray(entry.children) ? entry.children : [])) appendTree(child, depth + 1);
    };
    appendTree(tree, 0);
    tooltip.appendChild(treeHost);
    tooltip.hidden = false;
    return tooltip;
  }
  _positionTooltip(tooltip, pointer){
    if(!tooltip || !pointer) return;
    let left = Number(pointer.clientX) + 18;
    let top = Number(pointer.clientY) + 18;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    const rect = tooltip.getBoundingClientRect();
    if(rect.right > window.innerWidth - 8) left = Math.max(8, Number(pointer.clientX) - rect.width - 18);
    if(rect.bottom > window.innerHeight - 8) top = Math.max(8, Number(pointer.clientY) - rect.height - 18);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  _updateHover(canvas){
    const pointer = canvas?.__factEntityHoverPointer;
    if(!pointer){ this._hideTooltip(); return; }
    const point = Array.isArray(canvas.graph_mouse) ? canvas.graph_mouse : null;
    if(!point){ this._hideTooltip(); return; }
    let hit = null;
    let bestDistance = Infinity;
    for(const candidate of this._visibleHits){
      if(candidate.canvas !== canvas) continue;
      const distance = Math.hypot(Number(point[0]) - candidate.x, Number(point[1]) - candidate.y);
      if(distance <= candidate.radius && distance < bestDistance){ hit = candidate; bestDistance = distance; }
    }
    if(!hit){ this._hideTooltip(); return; }
    const frameNow = getFrameNow();
    let tooltip = this._tooltip();
    if(this._hoverAnim !== hit.anim || frameNow - this._hoverRenderedAt > 250){
      tooltip = this._renderHoverTooltip(hit.anim);
      this._hoverAnim = hit.anim;
      this._hoverRenderedAt = frameNow;
    }
    this._positionTooltip(tooltip, pointer);
  }
  installHover(canvas){
    const element = canvas?.canvas;
    if(!element || element.__factEntityHoverInstalled) return;
    element.__factEntityHoverInstalled = true;
    const trackPointer = (event)=>{
      canvas.__factEntityHoverPointer = { clientX: event.clientX, clientY: event.clientY };
      canvas.dirty_canvas = true;
    };
    element.addEventListener('pointermove', trackPointer, { passive: true });
    element.addEventListener('pointerdown', trackPointer, { passive: true });
    element.addEventListener('pointerleave', ()=>{
      canvas.__factEntityHoverPointer = null;
      this._hideTooltip();
    }, { passive: true });
  }
  _trimTransient(){
    if(this.animations.length <= this._max) return;
    let over = this.animations.length - this._max;
    if(over <= 0) return;
    for(let i = 0; i < this.animations.length && over > 0;){
      const anim = this.animations[i];
      if(anim && anim.tail){
        i++;
        continue;
      }
      this.animations.splice(i, 1);
      over--;
    }
  }
  _getSlotDir(node, slotIndex, isInput){
    const slot = isInput ? (node.inputs && node.inputs[slotIndex]) : (node.outputs && node.outputs[slotIndex]);
    if(slot && slot.dir) return slot.dir;
    if(node.horizontal) return isInput ? LiteGraph.UP : LiteGraph.DOWN;
    return isInput ? LiteGraph.LEFT : LiteGraph.RIGHT;
  }
  _entityKey(type, info){
    if(String(type || '').toLowerCase() !== 'work' || !info) return '';
    const entity = info.entity;
    if(entity && (typeof entity === 'object' || typeof entity === 'function')){
      let key = this._workVisualKeys.get(entity);
      if(!key){
        key = `entity:${this._nextWorkVisualKey++}`;
        this._workVisualKeys.set(entity, key);
      }
      return key;
    }
    if(info.instanceId != null && String(info.instanceId)) return `instance:${String(info.instanceId)}`;
    if(info.id == null) return '';
    const id = String(info.id);
    const workType = String(info.t ?? info.type ?? '');
    return `${id}\u0000${workType}`;
  }

  _matchesWorkInfo(candidate, info){
    if(!candidate || typeof candidate !== 'object' || !info) return false;
    const candidateId = candidate.id ?? candidate.instanceId ?? candidate.displayId;
    const candidateType = candidate.type ?? candidate.t ?? candidate.typeId ?? candidate.name;
    const infoId = info.id ?? info.instanceId ?? info.displayId;
    const infoType = info.t ?? info.type ?? info.typeId ?? info.name;
    if(infoId != null && candidateId != null && String(infoId) !== String(candidateId)) return false;
    if(infoType != null && candidateType != null && String(infoType) !== String(candidateType)) return false;
    return infoId != null || infoType != null;
  }
  _workEntityForLink(graph, linkId, info, preferOrigin){
    const link = graph?.links?.[linkId];
    if(!link) return null;
    const originNode = graph.getNodeById?.(link.origin_id);
    const targetNode = graph.getNodeById?.(link.target_id);
    const candidatesFor = (node, origin)=> origin
      ? [node?._payload, node?._currentWork, node?._pendingWork, node?._activeRoot, node?._offer?.instance]
      : [node?._payload, node?._currentWork, node?._activeRoot, node?._incomingPayload, node?._offer?.instance];
    const ordered = preferOrigin
      ? [...candidatesFor(originNode, true), ...candidatesFor(targetNode, false)]
      : [...candidatesFor(targetNode, false), ...candidatesFor(originNode, true)];
    return ordered.find((candidate)=> this._matchesWorkInfo(candidate, info)) || null;
  }
  _withWorkEntity(graph, linkId, type, info, preferOrigin){
    if(String(type || '').toLowerCase() !== 'work' || !info || info.entity) return info;
    const entity = this._workEntityForLink(graph, linkId, info, !!preferOrigin);
    return entity ? { ...info, entity } : info;
  }
  _bezierPoint(start, startDir, end, endDir, t){
    const dist = Math.hypot(end[0]-start[0], end[1]-start[1]);
    const quarter = dist * 0.25;
    const startOff = [0,0];
    const endOff = [0,0];
    switch(startDir){
      case LiteGraph.LEFT: startOff[0] = -quarter; break;
      case LiteGraph.RIGHT: startOff[0] = quarter; break;
      case LiteGraph.UP: startOff[1] = -quarter; break;
      case LiteGraph.DOWN: startOff[1] = quarter; break;
    }
    switch(endDir){
      case LiteGraph.LEFT: endOff[0] = -quarter; break;
      case LiteGraph.RIGHT: endOff[0] = quarter; break;
      case LiteGraph.UP: endOff[1] = -quarter; break;
      case LiteGraph.DOWN: endOff[1] = quarter; break;
    }
    const c1 = [start[0] + startOff[0], start[1] + startOff[1]];
    const c2 = [end[0] + endOff[0], end[1] + endOff[1]];
    const u = 1 - t;
    const uu = u*u;
    const tt = t*t;
    const uuu = uu*u;
    const ttt = tt*t;
    const x = uuu*start[0] + 3*uu*t*c1[0] + 3*u*tt*c2[0] + ttt*end[0];
    const y = uuu*start[1] + 3*uu*t*c1[1] + 3*u*tt*c2[1] + ttt*end[1];
    return [x,y];
  }
  spawn(graph, linkId, type, durationMs, info){
    if(!graph || linkId == null) return;
    info = this._withWorkEntity(graph, linkId, type, info, false);
    const now = getNow();
    const duration = durationMs || defaultDuration;
    const processTimed = Number.isFinite(Number(durationMs)) && Number(durationMs) > 0;
    const entityId = info && info.id != null ? String(info.id) : '';
    const entityType = info ? String(info.t ?? info.type ?? '') : '';
    if(entityId && String(type).toLowerCase() === 'work'){
      const entityKey = this._entityKey(type, info);
      if(processTimed && entityKey){
        // A later process leg owns the visual for this Work. Remove an older
        // completed/incoming leg and any WAIT icon before starting the next
        // link, otherwise the same Work is drawn at IN and OUT simultaneously.
        this.animations = this.animations.filter((anim)=>{
          if(!anim || anim.graph !== graph || this._entityKey(anim.type, anim.info) !== entityKey) return true;
          if(anim.tail) return false;
          if(anim.linkId === linkId) return true;
          return !(Number(anim.start) < now);
        });
      }
      const existing = this.animations.find((anim)=>{
        if(!anim || anim.tail || anim.graph !== graph || anim.linkId !== linkId || anim.type !== type) return false;
        const activeDuration = anim.duration || defaultDuration;
        if((now - anim.start) >= activeDuration) return false;
        const activeInfo = anim.info || {};
        return String(activeInfo.id ?? '') === entityId &&
          String(activeInfo.t ?? activeInfo.type ?? '') === entityType;
      });
      if(existing){
        if(processTimed && !existing.processTimed){
          // Source may draw a short provisional hand-off before the receiver runs.
          // Once the receiver starts processing, restart the same visual at that
          // exact time so arrival coincides with PROCESS completion.
          existing.start = now;
          existing.duration = duration;
          existing.processTimed = true;
          existing.pendingProcess = false;
          existing.arrivalHoldStartedAt = null;
        }else{
          const elapsed = Math.max(0, now - existing.start);
          existing.duration = Math.max(existing.duration || defaultDuration, elapsed + duration);
        }
        existing.info = info || existing.info || null;
        return;
      }
    }
    this.animations.push({
      graph,
      linkId,
      type,
      info: info || null,
      start: now,
      duration,
      processTimed,
      pendingProcess: String(type).toLowerCase() === 'work' && !processTimed,
      arrivalHoldStartedAt: null,
      tail: false
    });
    this._trimTransient();
  }
  showPortIcon(graph, linkId, type, info){
    if(!graph || linkId == null) return;
    info = this._withWorkEntity(graph, linkId, type, info, true);
    const existing = this.animations.find(anim=>(
      anim.tail &&
      anim.graph === graph &&
      anim.linkId === linkId &&
      anim.type === type
    ));
    if(existing){
      existing.info = info || existing.info || null;
      existing.start = getNow();
      existing._tailMiss = 0;
      return;
    }
    this.animations = this.animations.filter(anim=>!(anim.tail && anim.graph===graph && anim.linkId===linkId && anim.type===type));
    this.animations.push({
      graph,
      linkId,
      type,
      info: info || null,
      start: getNow(),
      duration: null,
      tail: true,
      _tailMiss: 0
    });
  }
  hidePortIcon(graph, linkId){
    this.animations = this.animations.filter(anim=>!(anim.tail && anim.graph===graph && anim.linkId===linkId));
  }
  _waitingWork(node){
    if(!node || String(node._state || '').toUpperCase() !== 'WAIT') return null;
    const legacyWork = node._payload || node._currentWork || null;
    if(legacyWork){
      // During a hand-off the sender can remain WAIT until the next execution
      // pass even though the Store already moved the entity downstream. Do not
      // revive a sender-side icon in that short interval.
      try{
        const store = window.App?.runtimeInstancesForGraph?.(node.graph) || window.App?.entityStoreForGraph?.(node.graph);
        const stored = store?.get?.(legacyWork);
        if(stored?.locationNodeId != null && String(stored.locationNodeId) !== String(node.id)) return null;
      }catch(_e){}
      return legacyWork;
    }

    // Native Basic Nodes keep their runtime Entity in _activeRoot.
    const activeRoot = node._activeRoot || node._offer?.instance || null;
    if(!activeRoot) return null;
    try{
      const store = window.App?.runtimeInstancesForGraph?.(node.graph) || window.App?.entityStoreForGraph?.(node.graph);
      return store?.get?.(activeRoot) || activeRoot;
    }catch(_e){
      return null;
    }
  }
  _waitingWorkInfo(work){
    if(!work) return null;
    const id = work.id ?? work.instanceId ?? work.displayId ?? '';
    const type = work.type ?? work.t ?? work.typeId ?? work.name ?? '';
    if(id === '' && type === '') return null;
    return {
      id,
      t: type,
      entity: work,
      instanceId: work.instanceId,
      typeId: work.typeId,
      attributes: work.attributes
    };
  }
  _waitingOutputLinks(node){
    if(!node || !node.graph) return [];
    const graph = node.graph;
    const rememberedKeys = ['_waitIconLinks', '_waitIconLinksBranch', '_waitIconLinksSplit'];
    for(const key of rememberedKeys){
      const remembered = Array.isArray(node[key]) ? node[key] : [];
      const valid = remembered.filter((linkId)=>{
        const link = graph.links?.[linkId];
        return !!link && link.origin_id === node.id;
      });
      if(valid.length) return valid;
    }

    const connected = [];
    for(let slot = 0; slot < (node.outputs?.length || 0); slot++){
      const output = node.outputs[slot];
      if(!Array.isArray(output?.links) || !output.links.length) continue;
      const descriptor = `${output.name || ''} ${output.type || ''}`.toLowerCase();
      if(!descriptor.includes('work') && !descriptor.includes('entity')) continue;
      for(const linkId of output.links){
        const link = graph.links?.[linkId];
        if(link && link.origin_id === node.id) connected.push(linkId);
      }
    }
    // With one connected work output there is no routing ambiguity. Multi-port
    // nodes retain the exact route captured by their transition handler above.
    return connected.length === 1 ? connected : [];
  }
  _reconcileWaitingWorkIcons(graph){
    if(!graph || !Array.isArray(graph._nodes)) return;
    const desired = [];
    const waitingEntityKeys = new Set();
    for(const node of graph._nodes){
      const work = this._waitingWork(node);
      const info = this._waitingWorkInfo(work);
      if(!info) continue;
      const entityKey = this._entityKey('work', info);
      if(!entityKey) continue;
      const linkIds = this._waitingOutputLinks(node);
      if(!linkIds.length) continue;
      waitingEntityKeys.add(entityKey);
      for(const linkId of linkIds) desired.push({ linkId, info });
    }
    if(!desired.length) return;

    // WAIT plus Current Contents is authoritative. Any remaining transient for
    // these entities is stale. One filter for the whole graph keeps this pass
    // inexpensive even on large models.
    this.animations = this.animations.filter((anim)=>{
      if(!anim || anim.graph !== graph || anim.tail) return true;
      return !waitingEntityKeys.has(this._entityKey(anim.type, anim.info));
    });

    const tailsByLink = new Map();
    for(const anim of this.animations){
      if(anim && anim.tail && anim.graph === graph && anim.type === 'work') tailsByLink.set(anim.linkId, anim);
    }
    for(const { linkId, info } of desired){
      const existing = tailsByLink.get(linkId);
      if(existing){
        existing.info = info;
        existing._tailMiss = 0;
      }else{
        this.showPortIcon(graph, linkId, 'work', info);
      }
    }
  }
  _adaptiveRenderPolicy(canvas){
    const graph = canvas && canvas.graph;
    const nodeCount = Array.isArray(graph && graph._nodes) ? graph._nodes.length : 0;
    const app = window.App || null;
    const fps = (app && typeof app.getRealtimeRenderFps === 'function') ? Number(app.getRealtimeRenderFps()) : 60;
    const running = (typeof isSimRunning === 'function') ? !!isSimRunning() : false;
    if(!running){
      return { step: 1, labelEvery: 1 };
    }

    let targetTransient = 800;
    let labelEvery = 1;
    if(nodeCount >= 300 || fps < 34){
      targetTransient = 600;
      labelEvery = 2;
    }
    if(nodeCount >= 700 || fps < 24){
      targetTransient = 360;
      labelEvery = 3;
    }
    if(nodeCount >= 1100 || fps < 16){
      targetTransient = 220;
      labelEvery = 5;
    }

    let transientCount = 0;
    for(let i = 0; i < this.animations.length; i++){
      const anim = this.animations[i];
      if(anim && !anim.tail) transientCount++;
    }
    const step = (transientCount > targetTransient)
      ? Math.max(1, Math.ceil(transientCount / targetTransient))
      : 1;
    return { step, labelEvery };
  }
  draw(canvas, ctx){
    if(!canvas || !ctx) return;
    // The node/store state is the source of truth. Transition callbacks create
    // the normal fast path, while this pass repairs icons lost through a visual
    // reset, graph redraw, or a high-speed stop between animation frames.
    this._reconcileWaitingWorkIcons(canvas.graph);
    if(!this.animations.length){
      this._visibleHits.length = 0;
      this._hideTooltip();
      return;
    }
    const now = getNow();
    const frameNow = getFrameNow();
    const policy = this._adaptiveRenderPolicy(canvas);
    const step = Math.max(1, Number(policy.step) || 1);
    const labelEvery = Math.max(1, Number(policy.labelEvery) || 1);
    const drawTransientRemainder = (step > 1)
      ? (this._sampleOffset = (this._sampleOffset + 1) % step)
      : 0;
    let transientIdx = 0;
    let labelCounter = 0;
    const latestVisibleWorkStart = new Map();
    for(const anim of this.animations){
      if(!anim || anim.tail || anim.pendingProcess || !anim.graph) continue;
      const entityKey = this._entityKey(anim.type, anim.info);
      if(!entityKey) continue;
      const duration = anim.duration || defaultDuration;
      const rawT = (now - anim.start) / duration;
      const withinArrivalHold = rawT < 1 || anim.arrivalHoldStartedAt == null ||
        (frameNow - anim.arrivalHoldStartedAt) < arrivalHoldMs;
      if(!withinArrivalHold) continue;
      let graphEntries = latestVisibleWorkStart.get(anim.graph);
      if(!graphEntries){
        graphEntries = new Map();
        latestVisibleWorkStart.set(anim.graph, graphEntries);
      }
      const previousStart = graphEntries.get(entityKey);
      if(previousStart == null || Number(anim.start) > previousStart){
        graphEntries.set(entityKey, Number(anim.start));
      }
    }
    const visibleHits = [];
    ctx.save();
    this.animations = this.animations.filter(anim=>{
      const graph = anim.graph;
      if(!graph) return false;
      const link = graph.links[anim.linkId];
      if(!link) return false;
      const originNode = graph.getNodeById(link.origin_id);
      const targetNode = graph.getNodeById(link.target_id);
      if(!originNode || !targetNode) return false;
      const entityKey = this._entityKey(anim.type, anim.info);
      const latestStart = entityKey ? latestVisibleWorkStart.get(graph)?.get(entityKey) : null;
      let x, y;
        if(anim.tail){
          // Keep the WAIT icon queued, but do not draw it while the same Work
          // is still visible on an incoming/process link.
          if(latestStart != null) return true;
          const start = originNode.getConnectionPos(false, link.origin_slot);
          const allowAgvWait =
            anim.type === 'agv' &&
            originNode &&
            typeof originNode._stateName === 'string' &&
            (originNode._stateName.startsWith('workIn_idle') ||
             originNode._stateName.startsWith('workIn_process') ||
             originNode._stateName.startsWith('workOut_wait') ||
             originNode._stateName.startsWith('workOut_down') ||
             originNode._stateName.startsWith('palletOut_wait') ||
             originNode._stateName.startsWith('palletOut_down') ||
             originNode._stateName === 'agvOut_wait');
          if(originNode._state !== 'WAIT' && !allowAgvWait){
            anim._tailMiss = (anim._tailMiss || 0) + 1;
            if(anim._tailMiss <= 2) return true;
            return false;
          }
          anim._tailMiss = 0;
          x = start[0];
          y = start[1];
      }else{
        const duration = anim.duration || defaultDuration;
        const rawT = (now - anim.start) / duration;
        if(anim.pendingProcess){
          // Source publishes the payload before the receiver's execution pass.
          // Keep that provisional record invisible so motion starts only when
          // the receiver actually begins PROCESS.
          return rawT < 1;
        }
        let t = Math.max(0, Math.min(rawT, 1));
        if(rawT >= 1){
          if(anim.arrivalHoldStartedAt == null) anim.arrivalHoldStartedAt = frameNow;
          if(frameNow - anim.arrivalHoldStartedAt >= arrivalHoldMs) return false;
          t = 1;
        }else{
          anim.arrivalHoldStartedAt = null;
        }
        if(latestStart != null && Number(anim.start) < latestStart) return true;
        const shouldDrawTransient = rawT >= 1 || (step <= 1) || ((transientIdx % step) === drawTransientRemainder);
        transientIdx++;
        if(!shouldDrawTransient){
          return true;
        }
        const start = originNode.getConnectionPos(false, link.origin_slot);
        const startDir = this._getSlotDir(originNode, link.origin_slot, false);
        const end = targetNode.getConnectionPos(true, link.target_slot);
        const endDir = this._getSlotDir(targetNode, link.target_slot, true);
        [x,y] = (typeof canvas.computeConnectionPoint === 'function')
          ? canvas.computeConnectionPoint(start, end, t, startDir, endDir)
          : this._bezierPoint(start, startDir, end, endDir, t);
      }
      const info = anim.info || {};
      const appearance = animatedAppearance(graph, anim.type, info, info.entity);
      drawEntityShape(ctx, appearance, x, y, iconRadius, appearance.theme?.lineWidth || 2.5);
      drawContainedEntities(ctx, graph, info, x, y, iconRadius);
      visibleHits.push({ canvas, anim, x, y, radius: iconRadius + 6 });
      // label
      let label = '';
      if(anim.type === 'agv'){
        const kind = String(info.kind || '').toLowerCase();
        const isCarrier = kind === 'carrier';
        const countRaw = Number(info.workCount);
        const hasCount = Number.isFinite(countRaw);
        const count = hasCount ? Math.max(0, Math.floor(countRaw)) : null;

        if(info.label){
          if(isCarrier && hasCount){
            label = `${info.label} (${count})`;
          }else{
            label = info.label;
          }
        }else if(isCarrier){
          const id = info.id ? String(info.id) : 'carrier';
          if(hasCount) label = `${id} (${count})`;
          else label = id;
        }else{
          label = info.id ? `AGV:${info.id}` : 'AGV';
        }
      }else if(anim.type === 'pallet'){
        const id = info.id ? String(info.id) : 'Pallet';
        const countRaw = Number(info.workCount);
        const hasCount = Number.isFinite(countRaw);
        if(hasCount) label = `${id} (${Math.max(0, Math.floor(countRaw))})`;
        else label = id;
      }else if(anim.type === 'work'){
        const id = info.id ?? '';
        const t = info.t ?? info.type ?? '';
        if(id && t) label = `W${id}:${t}`;
        else if(id) label = `W${id}`;
        else if(t) label = String(t);
      }
      if(label){
        const shouldDrawLabel = anim.tail || (labelEvery <= 1) || ((labelCounter++ % labelEvery) === 0);
        if(shouldDrawLabel){
          drawAnimatedLabel(ctx, x, y - iconRadius - 5, label, anim.type);
        }
      }
      return anim.tail ? true : true;
    });
    ctx.restore();
    this._visibleHits = visibleHits;
    this._updateHover(canvas);
  }
}

  const animator = new LinkAnimator();
  window.WorkLinkAnimator = animator;
  window.installWorkLinkAnimationLayer = function(canvas){
    if(!canvas || canvas.__workLinkAnimationLayerInstalled) return;
    const previousForeground = canvas.onDrawForeground;
    canvas.onDrawForeground = function(ctx, visibleArea){
      if(typeof previousForeground === 'function'){
        try{ previousForeground.call(this, ctx, visibleArea); }catch(_e){}
      }
      animator.draw(this, ctx);
      // Keep transient motion and the short arrival hold repainting. Static
      // WAIT icons do not need to force continuous foreground redraws.
      if(animator.animations.some((anim)=> anim && !anim.tail)){
        this.dirty_canvas = true;
      }
    };
    canvas.__workLinkAnimationLayerInstalled = true;
    animator.installHover(canvas);
  };

  function collectConnectionCullNodes(canvas){
    const graph = canvas && canvas.graph;
    if(!graph || !Array.isArray(graph._nodes) || !graph._nodes.length) return null;

    const allNodes = graph._nodes;
    if(allNodes.length < 200 || typeof canvas.computeVisibleNodes !== 'function') return allNodes;

    const visibleBuf = canvas.__cullVisibleNodesBuf || (canvas.__cullVisibleNodesBuf = []);
    const visibleNodes = canvas.computeVisibleNodes(allNodes, visibleBuf);
    if(!visibleNodes || !visibleNodes.length) return [];
    if(visibleNodes.length >= allNodes.length) return allNodes;

    const includeIds = new Set();
    for(const node of visibleNodes){
      if(!node || typeof node.id === 'undefined') continue;
      includeIds.add(node.id);

      if(Array.isArray(node.inputs)){
        for(const inp of node.inputs){
          if(!inp || inp.link == null) continue;
          const link = graph.links && graph.links[inp.link];
          if(!link) continue;
          if(typeof link.origin_id !== 'undefined') includeIds.add(link.origin_id);
          if(typeof link.target_id !== 'undefined') includeIds.add(link.target_id);
        }
      }

      if(Array.isArray(node.outputs)){
        for(const out of node.outputs){
          if(!out || !out.links) continue;
          for(const lid of out.links){
            const link = graph.links && graph.links[lid];
            if(!link) continue;
            if(typeof link.origin_id !== 'undefined') includeIds.add(link.origin_id);
            if(typeof link.target_id !== 'undefined') includeIds.add(link.target_id);
          }
        }
      }
    }

    if(includeIds.size >= allNodes.length) return allNodes;

    const subset = canvas.__cullNodeSubsetBuf || (canvas.__cullNodeSubsetBuf = []);
    subset.length = 0;
    for(const node of allNodes){
      if(node && includeIds.has(node.id)) subset.push(node);
    }
    return subset;
  }

  const originalSetOutputData = LiteGraph.LGraphNode.prototype.setOutputData;
  LiteGraph.LGraphNode.prototype.setOutputData = function(slot, data){
    // Track output changes to allow same-tick settle passes
    const out = this.outputs && this.outputs[slot];
    if(out){
      const prev = out.__lastSet;
      if(prev !== data){
        out.__lastSet = data;
        if(this.graph){
          this.graph.__outputDirty = true;
          // Track downstream nodes impacted by this output update.
          if(!this.graph.__dirtyNodeIds) this.graph.__dirtyNodeIds = new Set();
          if(out.links){
            out.links.forEach(id=>{
              const link = this.graph.links[id];
              if(link && typeof link.target_id !== 'undefined'){
                this.graph.__dirtyNodeIds.add(link.target_id);
              }
            });
          }
        }
      }
    }
    if(this.outputs && this.outputs[slot] && !data){
      this.outputs[slot].__animToken = null;
    }
    const result = originalSetOutputData.apply(this, arguments);
    if(data && this.graph){
      const type =
        (typeof AGV !== 'undefined' && data instanceof AGV) ? 'agv' :
        (typeof Work !== 'undefined' && data instanceof Work) ? 'work' : null;
      if(type && (type === 'work' || type === 'agv')) return result;
      if(type){
        const out = this.outputs && this.outputs[slot];
        if(out && out.links){
          const same = out.__animToken === data;
          out.__animToken = data;
          if(!same){
            out.links.forEach(id=>{
              if(this.graph.links[id]) animator.spawn(this.graph, id, type);
            });
          }
        }
      }
    }
    return result;
  };

  const originalDrawConnections = LiteGraph.LGraphCanvas.prototype.drawConnections;
  LiteGraph.LGraphCanvas.prototype.drawConnections = function(ctx){
    let originalNodes = null;
    let replaced = false;
    try{
      const graph = this.graph;
      const subset = collectConnectionCullNodes(this);
      if(graph && Array.isArray(graph._nodes) && Array.isArray(subset) && subset !== graph._nodes){
        originalNodes = graph._nodes;
        graph._nodes = subset;
        replaced = true;
      }
      originalDrawConnections.call(this, ctx);
    }finally{
      if(replaced && this.graph) this.graph._nodes = originalNodes;
    }
  };
})();
