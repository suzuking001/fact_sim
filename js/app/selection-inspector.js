// Unified inspector for selected node/group and hover edit shortcuts

var App = window.App || (window.App = {});

(function(){
  function isObjectLike(v){
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function stopGroups(){
    return App.stopGroups || {};
  }

  function withGraphChange(mutator){
    if(typeof mutator !== 'function') return false;
    const graph = App.graph;
    let opened = false;
    try{
      if(graph && typeof graph.beforeChange === 'function'){
        graph.beforeChange();
        opened = true;
      }
      mutator();
      return true;
    }finally{
      if(opened && graph && typeof graph.afterChange === 'function') graph.afterChange();
      try{
        if(App.canvas && typeof App.canvas.setDirty === 'function') App.canvas.setDirty(true, true);
      }catch(_e){}
    }
  }

  function getNodeById(id){
    if(!App.graph || typeof App.graph.getNodeById !== 'function') return null;
    return App.graph.getNodeById(id);
  }

  function getGroupMeta(group){
    const api = stopGroups();
    return typeof api.getGroupMeta === 'function' ? api.getGroupMeta(group) : null;
  }

  function getGroupBounds(group){
    const api = stopGroups();
    if(typeof api.getGroupBounds === 'function') return api.getGroupBounds(group);
    const pos = Array.isArray(group?.pos) ? group.pos : [0, 0];
    const size = Array.isArray(group?.size) ? group.size : [0, 0];
    return {
      x: Number(pos[0]) || 0,
      y: Number(pos[1]) || 0,
      w: Math.max(0, Number(size[0]) || 0),
      h: Math.max(0, Number(size[1]) || 0)
    };
  }

  function setGroupBounds(group, bounds){
    const api = stopGroups();
    if(typeof api.setGroupBounds === 'function'){
      api.setGroupBounds(group, bounds, false);
      return true;
    }
    if(!group || !bounds) return false;
    if(group._bounding && group._bounding.length >= 4){
      group._bounding[0] = Number(bounds.x) || 0;
      group._bounding[1] = Number(bounds.y) || 0;
      group._bounding[2] = Math.max(120, Number(bounds.w) || 0);
      group._bounding[3] = Math.max(80, Number(bounds.h) || 0);
    }else{
      group.pos = [Number(bounds.x) || 0, Number(bounds.y) || 0];
      group.size = [Math.max(120, Number(bounds.w) || 0), Math.max(80, Number(bounds.h) || 0)];
    }
    return true;
  }

  function listGroupNodes(group){
    const api = stopGroups();
    if(typeof api.listNodesInGroup === 'function') return api.listNodesInGroup(group, App.graph);
    return [];
  }

  function countGroupNodes(group){
    return listGroupNodes(group).length;
  }

  function groupTypeLabel(group){
    const meta = getGroupMeta(group);
    const api = stopGroups();
    if(!meta) return 'Group';
    if(typeof api.getTypeDefinition === 'function'){
      const def = api.getTypeDefinition(meta.type);
      if(def && def.label) return def.label;
    }
    return String(meta.type || 'Group');
  }

  function groupRate(group){
    const meta = getGroupMeta(group);
    const api = stopGroups();
    if(!meta || typeof api.estimateStopRatePercent !== 'function') return null;
    const rate = Number(api.estimateStopRatePercent(meta.type, meta.props));
    return isFinite(rate) ? rate : null;
  }

  function groupDescription(group){
    const meta = getGroupMeta(group);
    const api = stopGroups();
    if(meta && typeof api.describeType === 'function') return api.describeType(meta.type);
    return 'Visual grouping region for related nodes on the graph.';
  }

  function formatValue(v){
    if(v === null) return 'null';
    if(typeof v === 'undefined') return 'undefined';
    if(typeof v === 'number'){
      if(!isFinite(v)) return String(v);
      return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
    }
    if(typeof v === 'boolean') return v ? 'true' : 'false';
    if(typeof v === 'string') return v || '(empty)';
    try{
      return JSON.stringify(v);
    }catch(_e){
      return String(v);
    }
  }

  function escapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function canvasPos(canvas, e){
    if(!canvas || !e) return null;
    try{
      if(typeof canvas.convertEventToCanvasOffset === 'function') return canvas.convertEventToCanvasOffset(e);
      if(typeof canvas.convertEventToCanvas === 'function') return canvas.convertEventToCanvas(e);
    }catch(_e){}
    return [e.offsetX || 0, e.offsetY || 0];
  }

  function pointInRect(point, rect){
    return !!point && !!rect &&
      point[0] >= rect.x && point[0] <= (rect.x + rect.w) &&
      point[1] >= rect.y && point[1] <= (rect.y + rect.h);
  }

  function clamp(value, min, max){
    const n = Number(value);
    const lo = Number(min);
    const hi = Number(max);
    if(!isFinite(n)) return isFinite(lo) ? lo : 0;
    if(isFinite(lo) && n < lo) return lo;
    if(isFinite(hi) && n > hi) return hi;
    return n;
  }

  function visibleDomRect(el){
    if(!el || typeof el.getBoundingClientRect !== 'function') return null;
    const rect = el.getBoundingClientRect();
    if(!rect || rect.width <= 1 || rect.height <= 1) return null;
    try{
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if(style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return null;
    }catch(_e){}
    return rect;
  }

  function graphViewportSafeRect(canvas){
    const el = canvas?.canvas;
    const rect = visibleDomRect(el);
    if(!rect) return null;

    let safeLeft = rect.left + 14;
    let safeTop = rect.top + 14;
    let safeRight = rect.right - 14;
    let safeBottom = rect.bottom - 14;

    const sidebarRect = visibleDomRect(document.getElementById('sidebar'));
    if(sidebarRect && sidebarRect.left < safeRight && sidebarRect.right > safeLeft){
      safeLeft = Math.max(safeLeft, sidebarRect.right + 14);
    }

    const dockRect = visibleDomRect(document.getElementById('timelineDock'));
    if(dockRect && dockRect.top < safeBottom && dockRect.bottom > safeTop){
      safeBottom = Math.min(safeBottom, dockRect.top - 14);
    }

    if(safeRight <= safeLeft){
      safeLeft = rect.left + 14;
      safeRight = rect.right - 14;
    }
    if(safeBottom <= safeTop){
      safeTop = rect.top + 14;
      safeBottom = rect.bottom - 14;
    }

    const scale = Math.max(0.0001, Number(canvas?.ds?.scale) || 1);
    const ox = Number(canvas?.ds?.offset?.[0]) || 0;
    const oy = Number(canvas?.ds?.offset?.[1]) || 0;
    const toGraphX = (clientX)=> ((clientX - rect.left) / scale) - ox;
    const toGraphY = (clientY)=> ((clientY - rect.top) / scale) - oy;

    return {
      left: toGraphX(safeLeft),
      top: toGraphY(safeTop),
      right: toGraphX(safeRight),
      bottom: toGraphY(safeBottom)
    };
  }

  function resolveGroupCardPosition(canvas, bounds, width, height){
    const safe = graphViewportSafeRect(canvas);
    const pad = 12;
    const preferredX = bounds.x + pad;
    const belowY = bounds.y + bounds.h + 10;
    const aboveY = bounds.y - height - 10;
    const insideY = bounds.y + 10;

    if(!safe){
      return { x: preferredX, y: aboveY >= 0 ? aboveY : belowY };
    }

    const minX = safe.left;
    const maxX = Math.max(minX, safe.right - width);
    const x = clamp(preferredX, minX, maxX);

    if((belowY + height) <= safe.bottom){
      return { x, y: Math.max(safe.top, belowY) };
    }
    if(aboveY >= safe.top){
      return { x, y: aboveY };
    }
    if((insideY + height) <= safe.bottom){
      return { x, y: insideY };
    }
    return {
      x,
      y: clamp(insideY, safe.top, Math.max(safe.top, safe.bottom - height))
    };
  }

  function findGroupAt(graph, x, y){
    const groups = Array.isArray(graph?._groups) ? graph._groups : [];
    for(let i = groups.length - 1; i >= 0; i--){
      const group = groups[i];
      const b = getGroupBounds(group);
      if(x >= b.x && x <= (b.x + b.w) && y >= b.y && y <= (b.y + b.h)) return group;
    }
    return null;
  }

  function findNodeOverlayAction(canvas, point){
    const nodes = Array.isArray(canvas?.graph?._nodes) ? canvas.graph._nodes : [];
    for(let i = nodes.length - 1; i >= 0; i--){
      const node = nodes[i];
      if(pointInRect(point, node?.__factInspectorDetailActionRect)) return node;
    }
    return null;
  }

  function roundedRect(ctx, x, y, w, h, r){
    const radius = Math.max(0, Math.min(Number(r) || 0, w * 0.5, h * 0.5));
    if(typeof ctx.roundRect === 'function'){
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function centerNode(node){
    try{
      if(App.canvas && typeof App.canvas.centerOnNode === 'function') App.canvas.centerOnNode(node);
      if(App.canvas && typeof App.canvas.selectNode === 'function') App.canvas.selectNode(node);
      if(App.showToast) App.showToast('Centered view on node');
      return true;
    }catch(_e){
      return false;
    }
  }

  function showNodeInTable(node){
    if(!node || !App.nodePropsPanel) return false;
    App.nodePropsPanel.setSelectedNodeId(node.id, {
      ensureVisible: true,
      highlightGraph: true,
      syncTimeline: true,
      forceRefresh: true
    });
    if(App.setTimelineDockView) App.setTimelineDockView('props');
    if(App.showToast) App.showToast('Opened node properties table');
    return true;
  }

  function removeNode(node){
    return !!node && withGraphChange(()=> App.graph.remove(node));
  }

  function fitGroup(group){
    const api = stopGroups();
    if(typeof api.fitViewToGroup === 'function'){
      api.fitViewToGroup(group, { margin: 54 });
      if(App.showToast) App.showToast('Fit view to group');
      return true;
    }
    return false;
  }

  function selectGroupNodes(group){
    const api = stopGroups();
    if(typeof api.selectGroupNodes === 'function'){
      const count = api.selectGroupNodes(group);
      if(App.showToast) App.showToast(count ? `Selected ${count} nodes` : 'No nodes inside group');
      return count;
    }
    return 0;
  }

  function removeGroup(group){
    const api = stopGroups();
    if(getGroupMeta(group) && typeof api.removeGroup === 'function') return api.removeGroup(group);
    return !!group && withGraphChange(()=> App.graph.remove(group));
  }

  function drawGroupCard(canvas, ctx, group){
    const b = getGroupBounds(group);
    const title = String(group?.title || getGroupMeta(group)?.title || 'Group');
    const label = groupTypeLabel(group);
    const rate = groupRate(group);
    const lines = [
      label,
      `Nodes: ${countGroupNodes(group)}`,
      `Bounds: ${Math.round(b.x)}, ${Math.round(b.y)} | ${Math.round(b.w)} x ${Math.round(b.h)}`
    ];
    if(rate !== null) lines.push(`Reference stop rate: ${rate.toFixed(1)}%`);
    const w = Math.min(340, Math.max(220, b.w * 0.72));
    const h = 84 + lines.length * 14;
    const pos = resolveGroupCardPosition(canvas, b, w, h);
    const x = pos.x;
    const y = pos.y;
    ctx.save();
    try{
      ctx.shadowColor = 'rgba(15,23,42,0.10)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      roundedRect(ctx, x, y, w, h, 14);
      ctx.fill();
      canvas.__factGroupInspectorCard = { group, rect: { x, y, w, h } };
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(255,255,255,0.82)';
      ctx.lineWidth = 1;
      roundedRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 14);
      ctx.stroke();

      ctx.fillStyle = getGroupMeta(group) ? 'rgba(10,132,255,0.12)' : 'rgba(255,255,255,0.52)';
      roundedRect(ctx, x + 2, y + 2, w - 4, 30, 12);
      ctx.fill();
      ctx.fillStyle = '#1d1d1f';
      ctx.font = '600 12px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, x + 12, y + 17);

      const chip = 'Edit Group';
      const chipW = Math.ceil(ctx.measureText(chip).width) + 22;
      const chipX = x + w - chipW - 10;
      const chipY = y + 6;
      ctx.fillStyle = '#0a84ff';
      roundedRect(ctx, chipX, chipY, chipW, 18, 999);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(chip, chipX + 11, chipY + 9);
      canvas.__factGroupInspectorAction = { group, rect: { x: chipX, y: chipY, w: chipW, h: 18 } };

      ctx.fillStyle = 'rgba(29,29,31,0.72)';
      ctx.textBaseline = 'top';
      ctx.font = '12px "SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
      let yy = y + 40;
      for(const line of lines){
        ctx.fillText(line, x + 12, yy, w - 24);
        yy += 14;
      }
    }finally{
      ctx.restore();
    }
  }

  class SelectionInspector{
    constructor(root){
      this.root = root;
      this.graph = null;
      this.canvas = null;
      this.target = { kind: 'empty', nodeId: null, group: null };
    }

    attachGraph(graph){
      this.graph = graph || null;
      this.refresh();
    }

    currentNode(){
      return this.target.kind === 'node' ? getNodeById(this.target.nodeId) : null;
    }

    currentGroup(){
      if(this.target.kind !== 'group') return null;
      const groups = Array.isArray(this.graph?._groups) ? this.graph._groups : [];
      return groups.includes(this.target.group) ? this.target.group : null;
    }

    setMeta(text){
      const meta = document.getElementById('timelinePropsMeta');
      if(meta) meta.textContent = text;
    }

    field(label, span2){
      const wrap = document.createElement('label');
      wrap.className = 'selectionInspectorField' + (span2 ? ' is-span-2' : '');
      const cap = document.createElement('span');
      cap.className = 'selectionInspectorFieldLabel';
      cap.textContent = label;
      wrap.appendChild(cap);
      return wrap;
    }

    setNode(node){
      if(!node || typeof node.id === 'undefined') return false;
      this.target = { kind: 'node', nodeId: node.id, group: null };
      this.refresh();
      return true;
    }

    openNode(node, activate, highlight){
      if(!this.setNode(node)) return false;
      if(App.canvas) App.canvas.selected_group = null;
      if(activate && typeof App.setTimelineDockView === 'function') App.setTimelineDockView('inspector');
      if(highlight !== false){
        try{
          if(App.canvas && typeof App.canvas.selectNode === 'function') App.canvas.selectNode(node);
        }catch(_e){}
      }
      return true;
    }

    setGroup(group){
      if(!group) return false;
      this.target = { kind: 'group', nodeId: null, group };
      this.refresh();
      return true;
    }

    openGroup(group, activate){
      if(!this.setGroup(group)) return false;
      if(App.canvas) App.canvas.selected_group = group;
      if(activate && typeof App.setTimelineDockView === 'function') App.setTimelineDockView('inspector');
      return true;
    }

    clear(keepView){
      this.target = { kind: 'empty', nodeId: null, group: null };
      if(App.canvas) App.canvas.selected_group = null;
      this.refresh();
      if(!keepView && typeof App.setTimelineDockView === 'function') App.setTimelineDockView('chart');
    }

    attachCanvas(canvas){
      this.canvas = canvas || null;
      if(!canvas) return;
      if(!canvas.__factInspectorOverlayHooked){
        const prevDrawOverlay = canvas.onDrawOverlay;
        canvas.onDrawOverlay = function(ctx){
          const prevGroupCard = this.__factGroupInspectorCard || null;
          try{
            if(typeof prevDrawOverlay === 'function') prevDrawOverlay.call(this, ctx);
          }catch(_e){}
          this.__factGroupInspectorAction = null;
          this.__factGroupInspectorCard = null;
          try{
            let hover = findGroupAt(this.graph, this.graph_mouse?.[0], this.graph_mouse?.[1]);
            if(!hover && prevGroupCard && pointInRect(this.graph_mouse, prevGroupCard.rect)){
              hover = prevGroupCard.group;
            }
            const group = this.selected_group || hover;
            if(group) drawGroupCard(this, ctx, group);
          }catch(_e){}
        };
        canvas.__factInspectorOverlayHooked = true;
      }

      const el = canvas.canvas;
      if(!el) return;
      const controller = App.resetListenerController('__selectionInspectorCanvasController');
      const opts = App.listenerOptions(true, controller);
      const downEventName = (typeof window !== 'undefined' && typeof window.PointerEvent === 'function') ? 'pointerdown' : 'mousedown';

      el.addEventListener('dblclick', (e)=>{
        if(typeof e.button === 'number' && e.button !== 0) return;
        const point = canvasPos(canvas, e);
        if(!point) return;
        const node = findNodeOverlayAction(canvas, point);
        if(node){
          e.preventDefault();
          e.stopPropagation();
          try{
            if(typeof canvas.selectNode === 'function') canvas.selectNode(node);
          }catch(_e){}
          canvas.selected_group = null;
          this.openNode(node, true, false);
          return;
        }
        const groupAction = canvas.__factGroupInspectorAction;
        if(groupAction && pointInRect(point, groupAction.rect)){
          e.preventDefault();
          e.stopPropagation();
          canvas.selected_group = groupAction.group;
          this.openGroup(groupAction.group, true);
        }
      }, opts);

      el.addEventListener(downEventName, (e)=>{
        if(e.button !== 0) return;
        if(e.ctrlKey || e.metaKey) return;
        if(App.placement && App.placement.active) return;
        const point = canvasPos(canvas, e);
        if(!point) return;
        const detailNode = findNodeOverlayAction(canvas, point);
        if(detailNode){
          e.preventDefault();
          e.stopPropagation();
          try{
            if(typeof canvas.selectNode === 'function') canvas.selectNode(detailNode);
          }catch(_e){}
          canvas.selected_group = null;
          this.openNode(detailNode, true, false);
          return;
        }
        const node = (canvas.graph && typeof canvas.graph.getNodeOnPos === 'function')
          ? canvas.graph.getNodeOnPos(point[0], point[1])
          : ((typeof canvas.getNodeOnPos === 'function') ? canvas.getNodeOnPos(point[0], point[1]) : null);
        if(node){
          canvas.selected_group = null;
          this.setNode(node);
          return;
        }
        const group = findGroupAt(canvas.graph, point[0], point[1]);
        if(group){
          canvas.selected_group = group;
          try{
            if(typeof canvas.deselectAllNodes === 'function') canvas.deselectAllNodes();
          }catch(_e){}
          this.setGroup(group);
          canvas.setDirty(true, true);
          return;
        }
        if(canvas.selected_group){
          canvas.selected_group = null;
          canvas.setDirty(true, true);
        }
        if(this.target.kind === 'group') this.clear(true);
      }, opts);
    }

    renderEmpty(){
      this.root.innerHTML = '<div class="selectionInspectorEmpty"><h3>Details</h3><p>Select a node or group to edit it in one consistent place.</p><p>Right click, use Open Details, or double click the hover card action to jump here directly.</p></div>';
    }

    renderNodeProp(container, node, key, value){
      let schema = null;
      try{
        const allSchemas = typeof node.getInspectorSchema === 'function' ? node.getInspectorSchema() : null;
        schema = allSchemas && allSchemas[key] ? allSchemas[key] : null;
      }catch(_e){}
      const isScript = key === 'script' && typeof value === 'string';
      const isComplex = Array.isArray(value) || isObjectLike(value);
      const isLongText = typeof value === 'string' && (value.length > 80 || value.indexOf('\n') >= 0 || key === 'text');
      const wrap = this.field(schema?.label || key, isScript || isComplex || isLongText);
      wrap.dataset.propertyKey = key;

      const commit = (next)=>{
        if(next === value) return true;
        withGraphChange(()=>{
          node.properties = isObjectLike(node.properties) ? node.properties : {};
          node.properties[key] = next;
          if(key === 'script') node._compiled = null;
          if(typeof node.onPropertyChanged === 'function') node.onPropertyChanged(key);
          if(key === 'flipIO' && typeof window.refreshFlipIO === 'function') window.refreshFlipIO(node);
          if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true, true);
        });
        value = next;
        return true;
      };

      if(isScript){
        const hint = document.createElement('div');
        hint.className = 'selectionInspectorHint';
        hint.textContent = 'Custom scripts use a dedicated editor so incomplete text does not silently break the node.';
        wrap.appendChild(hint);
        if(typeof window.openPropertyEditor === 'function'){
          const row = document.createElement('div');
          row.className = 'selectionInspectorActionsRow';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'selectionInspectorBtn is-muted';
          btn.textContent = 'Open Script Editor';
          btn.addEventListener('click', ()=> window.openPropertyEditor(node, 'script'));
          row.appendChild(btn);
          wrap.appendChild(row);
        }
        container.appendChild(wrap);
        return;
      }

      if(isComplex){
        const preview = document.createElement('textarea');
        preview.className = 'selectionInspectorTextarea';
        preview.value = JSON.stringify(value, null, 2);
        preview.readOnly = true;
        wrap.appendChild(preview);
        const hint = document.createElement('div');
        hint.className = 'selectionInspectorHint';
        hint.textContent = 'Complex values are shown for reference. Everyday edits stay focused on the common scalar fields above.';
        wrap.appendChild(hint);
        container.appendChild(wrap);
        return;
      }

      if(schema?.type === 'select'){
        const select = document.createElement('select');
        select.className = 'selectionInspectorSelect';
        const options = Array.isArray(schema.options) ? schema.options : [];
        options.forEach((entry)=>{
          const option = document.createElement('option');
          if(Array.isArray(entry)){
            option.value = String(entry[0] ?? '');
            option.textContent = String(entry[1] ?? entry[0] ?? '');
          }else if(entry && typeof entry === 'object'){
            option.value = String(entry.value ?? entry.label ?? '');
            option.textContent = String(entry.label ?? entry.value ?? '');
          }else{
            option.value = String(entry ?? '');
            option.textContent = String(entry ?? '');
          }
          select.appendChild(option);
        });
        select.value = String(value == null ? '' : value);
        select.addEventListener('change', ()=>{
          commit(select.value);
          window.setTimeout(()=> this.refresh(), 0);
        });
        wrap.appendChild(select);
        container.appendChild(wrap);
        return;
      }

      let input = null;
      let statusText = null;
      const apply = ()=>{
        let next = value;
        if(input.type === 'checkbox'){
          next = !!input.checked;
          if(statusText) statusText.textContent = next ? 'Enabled' : 'Disabled';
        }else if(typeof value === 'number'){
          const n = Number(input.value);
          if(!isFinite(n)) return false;
          next = n;
        }else{
          next = input.value;
        }
        return commit(next);
      };

      if(typeof value === 'boolean'){
        const row = document.createElement('div');
        row.className = 'selectionInspectorCheckboxRow';
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'selectionInspectorInput';
        input.checked = !!value;
        row.appendChild(input);
        statusText = document.createElement('span');
        statusText.textContent = value ? 'Enabled' : 'Disabled';
        row.appendChild(statusText);
        wrap.appendChild(row);
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
      }else if(typeof value === 'number'){
        input = document.createElement('input');
        input.type = 'number';
        input.step = Number.isInteger(value) ? '1' : '0.1';
        input.value = String(value);
        input.className = 'selectionInspectorInput';
        wrap.appendChild(input);
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
      }else if(isLongText){
        input = document.createElement('textarea');
        input.className = 'selectionInspectorTextarea';
        input.value = String(value == null ? '' : value);
        wrap.appendChild(input);
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
      }else{
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'selectionInspectorInput';
        input.value = String(value == null ? '' : value);
        wrap.appendChild(input);
        input.addEventListener('input', apply);
        input.addEventListener('change', apply);
      }

      container.appendChild(wrap);
    }

    renderEntityTreeCard(container, node){
      if(node?.type === 'factory/basic') return;
      if(!container || !node || typeof App.entityStoreForGraph !== 'function') return;
      const store = App.entityStoreForGraph(this.graph || node.graph);
      if(!store) return;
      let roots = [];
      try{
        if(typeof node.getEntityRoots === 'function') roots = node.getEntityRoots() || [];
      }catch(_e){}
      if(!Array.isArray(roots) || !roots.length){
        roots = [node._currentAgv, node._departingAgv, node._pallet, node._sourceHost, node._targetHost]
          .filter((entity, index, rows)=> entity && rows.indexOf(entity) === index);
      }
      roots = roots.filter((entity)=> entity && typeof entity === 'object');
      if(!roots.length) return;
      roots.forEach((entity)=> store.syncLegacyTree(entity));

      const card = document.createElement('section');
      card.className = 'selectionInspectorCard entityTreeCard';
      card.innerHTML = '<div class="selectionInspectorSection"><h3 class="selectionInspectorSectionTitle">Cargo Tree</h3><p class="selectionInspectorHint">Nested contents move with their parent. While stopped, drag an entity onto another compatible entity to change its holder.</p><div class="entityTreeRoots"></div></div>';
      const host = card.querySelector('.entityTreeRoots');
      const running = document.body?.classList?.contains('sim-running');
      let draggedId = '';

      const renderRow = (tree, depth)=>{
        if(!tree) return null;
        const group = document.createElement('div');
        group.className = 'entityTreeGroup';
        const row = document.createElement('div');
        row.className = 'entityTreeRow';
        row.style.setProperty('--entity-tree-depth', String(depth));
        row.dataset.entityId = tree.internalId;
        row.draggable = !running && tree.mode !== 'root';
        row.innerHTML = `<span class="entityTreeBranch">${depth ? '↳' : '●'}</span><span class="entityTreeKind">${escapeHtml(tree.kind)}</span><span class="entityTreeId">${escapeHtml(tree.id)}</span><span class="entityTreeMode">${escapeHtml(tree.mode)}</span><span class="entityTreeCount">${tree.children.length}</span>`;
        if(row.draggable){
          row.title = 'Drag onto another entity to transfer it';
          row.addEventListener('dragstart', (event)=>{
            draggedId = tree.internalId;
            row.classList.add('is-dragging');
            try{ event.dataTransfer.setData('text/plain', draggedId); }catch(_e){}
          });
          row.addEventListener('dragend', ()=> row.classList.remove('is-dragging'));
        }
        row.addEventListener('dragover', (event)=>{
          if(running || !draggedId || draggedId === tree.internalId) return;
          event.preventDefault();
          row.classList.add('is-drop-target');
        });
        row.addEventListener('dragleave', ()=> row.classList.remove('is-drop-target'));
        row.addEventListener('drop', (event)=>{
          row.classList.remove('is-drop-target');
          if(running) return;
          event.preventDefault();
          const childId = draggedId || event.dataTransfer?.getData('text/plain');
          if(!childId || childId === tree.internalId) return;
          const result = store.transfer(childId, null, tree.internalId, { mode: 'inside' });
          if(!result.ok){
            if(App.showToast) App.showToast(`Cannot move entity: ${result.reason}`);
            return;
          }
          if(App.showToast) App.showToast('Cargo hierarchy updated');
          if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true, true);
          this.refresh();
        });
        group.appendChild(row);
        if(tree.children.length){
          const children = document.createElement('div');
          children.className = 'entityTreeChildren';
          tree.children.forEach((child)=>{
            const childRow = renderRow(child, depth + 1);
            if(childRow) children.appendChild(childRow);
          });
          group.appendChild(children);
        }
        return group;
      };

      roots.forEach((entity)=>{
        const tree = store.tree(entity, { maxDepth: 16 });
        const row = renderRow(tree, 0);
        if(row) host.appendChild(row);
      });
      if(running){
        const note = document.createElement('div');
        note.className = 'selectionInspectorNotice';
        note.textContent = 'Cargo editing is locked while the simulation is running.';
        host.appendChild(note);
      }
      container.appendChild(card);
    }

    renderNode(node){
      const props = isObjectLike(node.properties) ? node.properties : {};
      const propKeys = Object.keys(props).sort((a, b)=> a.localeCompare(b));
      this.setMeta(`Details: ${node.title || node.type || 'Node'} #${node.id}`);
      const layout = document.createElement('div');
      layout.className = 'selectionInspectorLayout';
      this.root.appendChild(layout);
      const side = document.createElement('div');
      side.className = 'selectionInspectorSidebar';
      const main = document.createElement('div');
      main.className = 'selectionInspectorMain';
      layout.appendChild(side);
      layout.appendChild(main);

      side.innerHTML = [
        '<section class="selectionInspectorCard nodeDetailsCard">',
        '<div class="selectionInspectorHeader">',
        '<div>',
        '<div class="selectionInspectorEyebrow">Node Details</div>',
        `<p class="selectionInspectorSubtitle">${escapeHtml(node.type || 'Unknown type')}</p>`,
        '</div>',
        `<div class="selectionInspectorPills"><span class="selectionInspectorPill">#${escapeHtml(node.id)}</span></div>`,
        '</div>',
        '<label class="selectionInspectorField nodeDetailsTitleField">',
        '<span class="selectionInspectorFieldLabel">Title</span>',
        '<input type="text" class="selectionInspectorInput nodeDetailsTitleInput" aria-label="Node title">',
        '</label>',
        '<div class="selectionInspectorStatGrid">',
        `<div class="selectionInspectorStat"><span class="selectionInspectorStatLabel">State</span><span class="selectionInspectorStatValue">${escapeHtml(String(node._stateName || node._state || 'N/A'))}</span></div>`,
        `<div class="selectionInspectorStat"><span class="selectionInspectorStatLabel">Properties</span><span class="selectionInspectorStatValue">${propKeys.length}</span></div>`,
        `<div class="selectionInspectorStat"><span class="selectionInspectorStatLabel">Position</span><span class="selectionInspectorStatValue">${Math.round(Number(node.pos?.[0]) || 0)}, ${Math.round(Number(node.pos?.[1]) || 0)}</span></div>`,
        `<div class="selectionInspectorStat"><span class="selectionInspectorStatLabel">Size</span><span class="selectionInspectorStatValue">${Math.round(Number(node.size?.[0]) || 0)} x ${Math.round(Number(node.size?.[1]) || 0)}</span></div>`,
        '</div>',
        '</section>'
      ].join('');

      const titleInput = side.querySelector('.nodeDetailsTitleInput');
      titleInput.value = String(node.title || node.type || 'Node');
      const titleEl = side.querySelector('.selectionInspectorTitle');
      const applyTitle = ()=>{
        const nextTitle = titleInput.value.trim() || node.type || 'Node';
        if(nextTitle !== node.title){
          withGraphChange(()=>{
            node.title = nextTitle;
            if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true, true);
          });
        }
        if(titleEl) titleEl.textContent = nextTitle;
        this.setMeta(`Details: ${nextTitle} #${node.id}`);
        return true;
      };
      titleInput.addEventListener('input', applyTitle);
      titleInput.addEventListener('change', applyTitle);

      const actionsCard = document.createElement('section');
      actionsCard.className = 'selectionInspectorCard';
      actionsCard.innerHTML = '<div class="selectionInspectorSection"><h3 class="selectionInspectorSectionTitle">Tools</h3><p class="selectionInspectorHint">Changes save automatically here and are used in the next simulation run.</p><div class="selectionInspectorActionsRow"></div></div>';
      const actionRow = actionsCard.querySelector('.selectionInspectorActionsRow');
      side.appendChild(actionsCard);
      [
        { label: 'Focus on Canvas', cls: ' is-primary', onClick: ()=> centerNode(node) },
        { label: 'Delete', cls: ' is-danger', onClick: ()=>{ if(window.confirm('Delete this node?')){ removeNode(node); if(App.showToast) App.showToast('Node deleted'); this.clear(true); } } }
      ].forEach((def)=>{
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'selectionInspectorBtn' + def.cls;
        btn.textContent = def.label;
        btn.addEventListener('click', def.onClick);
        actionRow.appendChild(btn);
      });

      const propsCard = document.createElement('section');
      propsCard.className = 'selectionInspectorCard nodePropertiesCard';
      propsCard.innerHTML = '<div class="selectionInspectorSection"><h3 class="selectionInspectorSectionTitle">Properties</h3><p class="selectionInspectorHint">Property changes save immediately. Scripts stay behind a dedicated button so the main editor stays simple.</p><div class="selectionInspectorFields"></div></div>';
      const propFields = propsCard.querySelector('.selectionInspectorFields');
      if(propKeys.length) propKeys.forEach((key)=> this.renderNodeProp(propFields, node, key, props[key]));
      else propFields.innerHTML = '<div class="selectionInspectorNotice">This node has no custom properties yet.</div>';
      side.appendChild(propsCard);
      this.renderEntityTreeCard(main, node);
    }

    renderGroup(group){
      const meta = getGroupMeta(group);
      const bounds = getGroupBounds(group);
      const rate = groupRate(group);
      this.setMeta(`Details: ${group.title || meta?.title || 'Group'}`);
      const layout = document.createElement('div');
      layout.className = 'selectionInspectorLayout';
      this.root.appendChild(layout);
      const side = document.createElement('div');
      side.className = 'selectionInspectorSidebar';
      const main = document.createElement('div');
      main.className = 'selectionInspectorMain';
      layout.appendChild(side);
      layout.appendChild(main);

      side.innerHTML = [
        '<section class="selectionInspectorCard">',
        '<div class="selectionInspectorHeader">',
        '<div>',
        `<div class="selectionInspectorEyebrow">${meta ? 'Stop Group Details' : 'Group Details'}</div>`,
        `<h2 class="selectionInspectorTitle">${escapeHtml(group.title || meta?.title || 'Group')}</h2>`,
        `<p class="selectionInspectorSubtitle">${escapeHtml(groupDescription(group))}</p>`,
        '</div>',
        `<div class="selectionInspectorPills"><span class="selectionInspectorPill">${escapeHtml(groupTypeLabel(group))}</span></div>`,
        '</div>',
        '<div class="selectionInspectorStatGrid">',
        `<div class="selectionInspectorStat"><span class="selectionInspectorStatLabel">Nodes</span><span class="selectionInspectorStatValue">${countGroupNodes(group)}</span></div>`,
        `<div class="selectionInspectorStat"><span class="selectionInspectorStatLabel">Stop Rate</span><span class="selectionInspectorStatValue">${rate === null ? 'N/A' : `${rate.toFixed(1)}%`}</span></div>`,
        `<div class="selectionInspectorStat"><span class="selectionInspectorStatLabel">Position</span><span class="selectionInspectorStatValue">${Math.round(bounds.x)}, ${Math.round(bounds.y)}</span></div>`,
        `<div class="selectionInspectorStat"><span class="selectionInspectorStatLabel">Size</span><span class="selectionInspectorStatValue">${Math.round(bounds.w)} x ${Math.round(bounds.h)}</span></div>`,
        '</div>',
        '</section>'
      ].join('');

      const actionsCard = document.createElement('section');
      actionsCard.className = 'selectionInspectorCard';
      actionsCard.innerHTML = '<div class="selectionInspectorSection"><h3 class="selectionInspectorSectionTitle">Actions</h3><div class="selectionInspectorActionsRow"></div></div>';
      const actionRow = actionsCard.querySelector('.selectionInspectorActionsRow');
      side.appendChild(actionsCard);
      [
        { label: 'Edit Nodes', cls: ' is-primary', onClick: ()=>{ const count = selectGroupNodes(group); if(count && App.setTimelineDockView) App.setTimelineDockView('props'); } },
        { label: 'Fit View', cls: '', onClick: ()=> fitGroup(group) },
        { label: 'Delete', cls: ' is-danger', onClick: ()=>{ if(window.confirm('Delete this group?')){ removeGroup(group); if(App.showToast) App.showToast('Group deleted'); this.clear(true); } } }
      ].forEach((def)=>{
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'selectionInspectorBtn' + def.cls;
        btn.textContent = def.label;
        btn.addEventListener('click', def.onClick);
        actionRow.appendChild(btn);
      });

      const general = document.createElement('section');
      general.className = 'selectionInspectorCard';
      general.innerHTML = '<div class="selectionInspectorSection"><h3 class="selectionInspectorSectionTitle">General</h3><div class="selectionInspectorFields"></div></div>';
      const generalFields = general.querySelector('.selectionInspectorFields');
      const titleField = this.field('Title', true);
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'selectionInspectorInput';
      titleInput.value = String(group.title || meta?.title || 'Group');
      titleInput.addEventListener('change', ()=>{
        withGraphChange(()=>{
          if(meta && typeof stopGroups().setGroupMeta === 'function'){
            stopGroups().setGroupMeta(group, { ...meta, title: titleInput.value.trim() || meta.title }, false);
          }else{
            group.title = titleInput.value.trim() || group.title || 'Group';
          }
        });
        this.refresh();
      });
      titleField.appendChild(titleInput);
      generalFields.appendChild(titleField);

      if(meta && typeof stopGroups().getTypeDefinitions === 'function'){
        const typeField = this.field('Type', false);
        const typeSelect = document.createElement('select');
        typeSelect.className = 'selectionInspectorSelect';
        stopGroups().getTypeDefinitions().sort((a, b)=> String(a.label || a.key).localeCompare(String(b.label || b.key))).forEach((def)=>{
          const opt = document.createElement('option');
          opt.value = def.key;
          opt.textContent = def.label || def.key;
          opt.selected = def.key === meta.type;
          typeSelect.appendChild(opt);
        });
        typeSelect.addEventListener('change', ()=>{
          withGraphChange(()=>{
            const next = stopGroups().normalizeMeta({
              ...meta,
              type: typeSelect.value,
              title: titleInput.value.trim() || meta.title,
              props: meta.props
            });
            stopGroups().setGroupMeta(group, next, false);
          });
          this.refresh();
        });
        typeField.appendChild(typeSelect);
        generalFields.appendChild(typeField);
      }else{
        const colorField = this.field('Color', false);
        const colorInput = document.createElement('input');
        colorInput.type = 'text';
        colorInput.className = 'selectionInspectorInput';
        colorInput.value = String(group.color || '#f59e0b');
        colorInput.addEventListener('change', ()=> withGraphChange(()=>{ group.color = colorInput.value.trim() || group.color; }));
        colorField.appendChild(colorInput);
        generalFields.appendChild(colorField);
      }
      main.appendChild(general);

      const boundsCard = document.createElement('section');
      boundsCard.className = 'selectionInspectorCard';
      boundsCard.innerHTML = '<div class="selectionInspectorSection"><h3 class="selectionInspectorSectionTitle">Bounds</h3><div class="selectionInspectorFields"></div></div>';
      const boundsFields = boundsCard.querySelector('.selectionInspectorFields');
      ['x', 'y', 'w', 'h'].forEach((key)=>{
        const field = this.field(key === 'w' ? 'Width' : key === 'h' ? 'Height' : key.toUpperCase(), false);
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '1';
        input.className = 'selectionInspectorInput';
        input.value = String(Math.round(Number(bounds[key]) || 0));
        input.addEventListener('change', ()=>{
          const next = { ...getGroupBounds(group), [key]: Number(input.value) || 0 };
          withGraphChange(()=> setGroupBounds(group, next));
          this.refresh();
        });
        field.appendChild(input);
        boundsFields.appendChild(field);
      });
      main.appendChild(boundsCard);

      if(meta && typeof stopGroups().getTypeDefinition === 'function'){
        const def = stopGroups().getTypeDefinition(meta.type);
        const fields = Array.isArray(def?.uiFields) ? def.uiFields.filter((field)=> field && field.key && field.key !== 'title') : [];
        if(fields.length){
          const propsCard = document.createElement('section');
          propsCard.className = 'selectionInspectorCard';
          propsCard.innerHTML = '<div class="selectionInspectorSection"><h3 class="selectionInspectorSectionTitle">Stop Settings</h3><div class="selectionInspectorFields"></div></div>';
          const propsFields = propsCard.querySelector('.selectionInspectorFields');
          fields.forEach((fieldDef)=>{
            const wrap = this.field(fieldDef.label || fieldDef.key, fieldDef.type === 'textarea');
            const input = document.createElement(fieldDef.type === 'textarea' ? 'textarea' : 'input');
            input.className = fieldDef.type === 'textarea' ? 'selectionInspectorTextarea' : 'selectionInspectorInput';
            if(fieldDef.type !== 'textarea'){
              input.type = fieldDef.type === 'number' ? 'number' : 'text';
              if(fieldDef.type === 'number') input.step = String(fieldDef.step ?? 0.1);
            }
            input.value = String(meta.props?.[fieldDef.key] ?? fieldDef.default ?? '');
            input.addEventListener('change', ()=>{
              withGraphChange(()=>{
                const next = stopGroups().normalizeMeta({
                  ...meta,
                  title: titleInput.value.trim() || meta.title,
                  props: {
                    ...(meta.props || {}),
                    [fieldDef.key]: fieldDef.type === 'number'
                      ? (isFinite(Number(input.value)) ? Number(input.value) : (fieldDef.default ?? 0))
                      : input.value
                  }
                });
                stopGroups().setGroupMeta(group, next, false);
              });
              this.refresh();
            });
            wrap.appendChild(input);
            propsFields.appendChild(wrap);
          });
          main.appendChild(propsCard);
        }
      }
    }

    refresh(){
      if(!this.root) return;
      this.root.innerHTML = '';
      const node = this.currentNode();
      if(node) return this.renderNode(node);
      const group = this.currentGroup();
      if(group) return this.renderGroup(group);
      this.setMeta('Select a node or group to inspect and edit it.');
      this.renderEmpty();
    }
  }

  App.SelectionInspector = SelectionInspector;
  App.getGroupAtCanvasPos = function(x, y){
    return App.canvas ? findGroupAt(App.graph, x, y) : null;
  };
})();
