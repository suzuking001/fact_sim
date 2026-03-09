// Right-click menu helpers (script/properties/signals)

function defaultScript(){
  return `// work: Work object (work.id, work.type, etc.)
// signalArr: array of sigIn values

if(work.type === 'A'){
  this.properties.processTime = 5.0;
  this.properties.downTime = 3.0;
}else if(work.type === 'B'){
  this.properties.processTime = 4.0;
  this.properties.downTime = 2.0;
}else{
  // default
  this.properties.processTime = 10.0;
  this.properties.downTime = 2.0;
}

// Return true to accept this work item into PROCESS
return true;`;
}

function runNodeMutation(node, mutator){
  if(typeof mutator !== 'function') return;
  const graph = node && node.graph;
  let opened = false;
  try{
    if(graph && typeof graph.beforeChange === 'function'){
      graph.beforeChange();
      opened = true;
    }
    mutator();
  }finally{
    if(opened && graph && typeof graph.afterChange === 'function'){
      graph.afterChange();
    }
  }
}

function compactMenuSeparators(items){
  const out = [];
  let lastWasSep = true;
  for(const item of items){
    const isSep = item == null;
    if(isSep){
      if(lastWasSep) continue;
      out.push(null);
      lastWasSep = true;
      continue;
    }
    out.push(item);
    lastWasSep = false;
  }
  while(out.length && out[out.length - 1] == null) out.pop();
  return out;
}

function cloneMenuItem(item, overrides){
  if(!item || typeof item !== 'object') return item;
  return { ...item, ...(overrides || {}) };
}

function normalizeMenuLabel(label){
  const text = String(label || '').trim();
  const map = {
    'Edit Script...': 'Edit Script...',
    'Add SIG IN/OUT': 'Add Signal Ports',
    'Remove SIG IN/OUT': 'Remove Signal Ports',
    'Add workOut': 'Add Work Output',
    'Remove workOut': 'Remove Work Output',
    'Add workIn': 'Add Work Input',
    'Remove workIn': 'Remove Work Input',
    'Add carrier IN/OUT': 'Add Carrier Lane',
    'Remove carrier IN/OUT': 'Remove Carrier Lane',
    'Add work IN/OUT': 'Add Work Transfer Lane',
    'Remove work IN/OUT': 'Remove Work Transfer Lane',
    'Add pallet IN/OUT': 'Add Pallet Transfer Lane',
    'Remove pallet IN/OUT': 'Remove Pallet Transfer Lane',
    'Edit Memo...': 'Edit Memo...',
    'Font Size...': 'Edit Font Size...',
    'Background Color...': 'Change Background Color...',
    'Text Color...': 'Change Text Color...',
    'Reset Style': 'Reset Memo Style',
    'Ports: flip horizontally': 'Flip Ports Horizontally',
    'Ports: reset alignment': 'Reset Port Alignment',
    'Close subgraph': 'Close Subgraph'
  };
  return map[text] || text;
}

function relabelMenuItem(item, content){
  return cloneMenuItem(item, { content });
}

function centerViewOnNode(canvas, node){
  if(!canvas || !node || !canvas.ds || !canvas.canvas) return false;
  const b = new Float32Array(4);
  if(typeof node.getBounding === 'function') node.getBounding(b);
  else{
    b[0] = Number(node?.pos?.[0]) || 0;
    b[1] = Number(node?.pos?.[1]) || 0;
    b[2] = Number(node?.size?.[0]) || 160;
    b[3] = Number(node?.size?.[1]) || 80;
  }
  const rect = canvas.canvas.getBoundingClientRect();
  const cw = rect.width || canvas.canvas.clientWidth || canvas.canvas.width || 800;
  const ch = rect.height || canvas.canvas.clientHeight || canvas.canvas.height || 600;
  const cx = b[0] + b[2] * 0.5;
  const cy = b[1] + b[3] * 0.5;
  const scale = canvas.ds.scale || 1;
  canvas.ds.offset[0] = (cw * 0.5) / scale - cx;
  canvas.ds.offset[1] = (ch * 0.5) / scale - cy;
  canvas.setDirty(true, true);
  return true;
}

function resolveMenuEvent(menuRef, fallbackEvent){
  return (menuRef && typeof menuRef.getFirstEvent === 'function' && menuRef.getFirstEvent()) || fallbackEvent || null;
}

function openInspectorForNode(node){
  if(window.App?.selectionInspector?.openNode){
    return window.App.selectionInspector.openNode(node, true, true);
  }
  return false;
}

function openInspectorForGroup(group){
  if(window.App?.selectionInspector?.openGroup){
    return window.App.selectionInspector.openGroup(group, true);
  }
  return false;
}

function removeCanvasGroup(group, isStopGroup){
  if(!group) return false;
  const label = isStopGroup ? 'this stop group' : 'this group';
  if(!window.confirm(`Delete ${label}?`)) return false;

  let removed = false;
  if(isStopGroup && typeof window.App?.stopGroups?.removeGroup === 'function'){
    removed = !!window.App.stopGroups.removeGroup(group);
  }else{
    const graph = group.graph || window.App?.graph;
    if(graph){
      try{
        if(typeof graph.beforeChange === 'function') graph.beforeChange();
        graph.remove(group);
        removed = true;
      }finally{
        if(typeof graph.afterChange === 'function') graph.afterChange();
      }
    }
  }

  if(!removed) return false;
  if(window.App?.canvas){
    window.App.canvas.selected_group = null;
    try{ window.App.canvas.setDirty(true, true); }catch(_e){}
  }
  if(window.App?.selectionInspector?.clear){
    try{ window.App.selectionInspector.clear(true); }catch(_e){}
  }
  if(window.App?.showToast){
    window.App.showToast(isStopGroup ? 'Stop group deleted' : 'Group deleted');
  }
  return true;
}

function syncCanvasMouse(canvas, event){
  if(!canvas || !event) return null;
  try{
    const p = (typeof canvas.convertEventToCanvasOffset === 'function')
      ? canvas.convertEventToCanvasOffset(event)
      : canvas.convertEventToCanvas(event);
    canvas.graph_mouse[0] = p[0];
    canvas.graph_mouse[1] = p[1];
    canvas.__last_mouse = p.slice ? p.slice(0, 2) : [p[0], p[1]];
    return canvas.__last_mouse;
  }catch(_e){
    return null;
  }
}

function getCanvasHoverGroup(canvas){
  const point = Array.isArray(canvas?.graph_mouse) ? canvas.graph_mouse : null;
  if(!point || point.length < 2) return null;
  if(typeof window.App?.getGroupAtCanvasPos === 'function'){
    return window.App.getGroupAtCanvasPos(point[0], point[1]);
  }
  return null;
}

function getCanvasHoverNode(canvas){
  const point = Array.isArray(canvas?.graph_mouse) ? canvas.graph_mouse : null;
  if(!point || point.length < 2) return null;
  try{
    if(typeof canvas?.getNodeOnPos === 'function') return canvas.getNodeOnPos(point[0], point[1]);
    if(typeof canvas?.graph?.getNodeOnPos === 'function') return canvas.graph.getNodeOnPos(point[0], point[1]);
  }catch(_e){}
  return null;
}

function installContextMenuPointerTracking(canvas){
  if(!canvas || canvas.__factMenuPointerTrackingInstalled) return;
  const el = canvas.canvas;
  if(!el) return;
  const update = (e)=>{ syncCanvasMouse(canvas, e); };
  el.addEventListener('mousemove', update, true);
  el.addEventListener('mousedown', update, true);
  el.addEventListener('contextmenu', update, true);
  canvas.__factMenuPointerTrackingInstalled = true;
}

function menuMixin(cls){
  cls.prototype.getExtraMenuOptions = function(){
    const opts = [];
    if(this.properties.sigEnabled !== undefined){
      if(opts.length) opts.push(null);
      opts.push({
        content: this.properties.sigEnabled ? 'Disable Signals' : 'Enable Signals',
        callback: ()=>{
          this.properties.sigEnabled = !this.properties.sigEnabled;
          this.setDirtyCanvas(true, true);
        }
      });
    }
    const extra = this.properties.sigExtra || 0;
    const applySigChange = (delta)=>{
      runNodeMutation(this, ()=>{
        if(Number(delta)){
          this.properties.sigExtra = Math.max(0, Number(this.properties.sigExtra || 0) + Number(delta));
        }
        let handled = false;
        if(typeof this._syncSignalPorts === 'function'){
          this._syncSignalPorts();
          handled = true;
        }
        if(typeof this._syncSignalOutputs === 'function'){
          this._syncSignalOutputs();
          handled = true;
        }
        if(!handled) syncSigPorts(this, 0);
        if(this.setDirtyCanvas) this.setDirtyCanvas(true, true);
      });
    };
    if(this.properties.sigEnabled !== undefined || extra >= 0){
      opts.push({
        content: 'Add Signal Ports',
        callback: ()=> applySigChange(1)
      });
      opts.push({
        content: 'Remove Signal Ports',
        disabled: extra === 0,
        callback: ()=>{
          if(extra === 0) return;
          applySigChange(-1);
        }
      });
    }
    return compactMenuSeparators(opts);
  };
}

window.defaultScript = defaultScript;
window.menuMixin = menuMixin;
window.runNodeMutation = runNodeMutation;

(function(){
  if(typeof LiteGraph === 'undefined' || !LiteGraph.LGraphCanvas) return;
  const proto = LiteGraph.LGraphCanvas.prototype;
  if(proto.__factContextMenusPatched) return;

  const rawGetNodeMenuOptions = proto.getNodeMenuOptions;
  const rawGetGroupMenuOptions = proto.getGroupMenuOptions;
  const rawGetCanvasMenuOptions = proto.getCanvasMenuOptions;
  const rawOnMenuAdd = LiteGraph.LGraphCanvas.onMenuAdd;

  if(typeof rawGetNodeMenuOptions === 'function'){
    proto.getNodeMenuOptions = function(node){
      installContextMenuPointerTracking(this);
      const rawMenu = rawGetNodeMenuOptions.apply(this, arguments);
      if(!Array.isArray(rawMenu)) return rawMenu;

      const custom = [];
      let resizeItem = null;
      let duplicateItem = null;
      let deleteItem = null;

      for(const item of rawMenu){
        if(!item || typeof item.content !== 'string') continue;
        const label = String(item.content || '').trim();
        const normalizedLabel = normalizeMenuLabel(label);
        if(!label) continue;
        if(label === 'Title'){
          continue;
        }
        if(label === 'Resize'){
          resizeItem = relabelMenuItem(item, 'Resize Node...');
          continue;
        }
        if(label === 'Clone'){
          duplicateItem = relabelMenuItem(item, 'Duplicate Node');
          continue;
        }
        if(label === 'Remove'){
          deleteItem = relabelMenuItem(item, 'Delete Node');
          continue;
        }
        if(label === 'Inputs' || label === 'Outputs'){
          if(item.disabled) continue;
        }
        if(label === 'Properties' || label === 'Mode' || label === 'Collapse' || label === 'Pin' || label === 'Shapes' || label === 'Colors'){
          continue;
        }
        if(
          label === 'Edit Script...' ||
          label === 'Edit Memo...' ||
          label === 'Disable Signals' ||
          label === 'Enable Signals' ||
          label === 'Add Signal Ports' ||
          label === 'Remove Signal Ports' ||
          label === 'Ports: flip horizontally' ||
          label === 'Ports: reset alignment' ||
          normalizedLabel === 'Flip Ports Horizontally' ||
          normalizedLabel === 'Reset Port Alignment'
        ){
          continue;
        }
        custom.push(relabelMenuItem(item, normalizedLabel));
      }

      const menu = [{
        content: `Node: ${String(node?.title || node?.type || 'Node')}${typeof node?.id !== 'undefined' ? ` #${node.id}` : ''}`,
        disabled: true
      }, {
        content: 'Edit Properties...',
        callback: ()=> openInspectorForNode(node)
      }];
      if(custom.length) menu.push(null, ...custom);
      const utility = [];
      utility.push({
        content: 'Center Canvas on Node',
        callback: ()=>{
          if(centerViewOnNode(this, node) && window.App?.showToast){
            window.App.showToast('Centered view on node');
          }
        }
      });
      if(resizeItem) utility.push(resizeItem);
      if(duplicateItem) utility.push(duplicateItem);
      if(deleteItem) utility.push(deleteItem);
      if(utility.length){
        if(menu.length) menu.push(null);
        menu.push(...utility);
      }
      return compactMenuSeparators(menu);
    };
  }

  if(typeof rawGetGroupMenuOptions === 'function'){
    proto.getGroupMenuOptions = function(group){
      installContextMenuPointerTracking(this);
      const rawMenu = rawGetGroupMenuOptions.apply(this, arguments);
      const isStopGroup = !!(window.App?.stopGroups?.getGroupMeta && window.App.stopGroups.getGroupMeta(group));
      if(!Array.isArray(rawMenu)) return rawMenu;

      let renameItem = null;
      let colorItem = null;
      let fontItem = null;
      let deleteItem = null;
      const extras = [];

      for(const item of rawMenu){
        if(!item || typeof item.content !== 'string') continue;
        const label = String(item.content || '').trim();
        const normalizedLabel = normalizeMenuLabel(label);
        if(label === 'Title'){
          renameItem = relabelMenuItem(item, 'Rename Group...');
          continue;
        }
        if(label === 'Color'){
          colorItem = relabelMenuItem(item, 'Group Color...');
          continue;
        }
        if(label === 'Font size'){
          fontItem = relabelMenuItem(item, 'Group Font Size...');
          continue;
        }
        if(label === 'Remove'){
          deleteItem = relabelMenuItem(item, isStopGroup ? 'Delete Stop Group' : 'Delete Group');
          deleteItem.callback = ()=> removeCanvasGroup(group, isStopGroup);
          continue;
        }
        if(/^Edit Group(?:\.\.\.)?$/i.test(label) || /^Edit Group(?:\.\.\.)?$/i.test(normalizedLabel)){
          continue;
        }
        extras.push(relabelMenuItem(item, normalizedLabel));
      }

      const menu = [];
      menu.push({
        content: `${isStopGroup ? 'Stop Group' : 'Group'}: ${String(group?.title || 'Group')}`,
        disabled: true
      });
      menu.push({
        content: 'Edit Group...',
        callback: ()=> openInspectorForGroup(group)
      });
      if(isStopGroup){
        menu.push({
          content: 'Open Group Modal...',
          callback: ()=>{
            if(typeof window.App?.stopGroups?.openGroupEditor === 'function'){
              window.App.stopGroups.openGroupEditor(group);
            }
          }
        });
      }
      if(renameItem || colorItem || fontItem){
        if(menu.length) menu.push(null);
        if(renameItem) menu.push(renameItem);
        if(colorItem) menu.push(colorItem);
        if(fontItem) menu.push(fontItem);
      }
      menu.push(null, {
        content: 'Open Nodes in Table',
        callback: ()=>{
          const count = window.App?.stopGroups?.selectGroupNodes ? window.App.stopGroups.selectGroupNodes(group) : 0;
          if(count && window.App?.setTimelineDockView) window.App.setTimelineDockView('props');
          if(window.App?.showToast) window.App.showToast(count ? `Selected ${count} nodes` : 'No nodes inside group');
        }
      }, {
        content: 'Select Group Nodes',
        callback: ()=>{
          const count = window.App?.stopGroups?.selectGroupNodes ? window.App.stopGroups.selectGroupNodes(group) : 0;
          if(window.App?.showToast) window.App.showToast(count ? `Selected ${count} nodes` : 'No nodes inside group');
        }
      }, {
        content: 'Fit Canvas to Group',
        callback: ()=>{
          const ok = window.App?.stopGroups?.fitViewToGroup ? window.App.stopGroups.fitViewToGroup(group, { margin: 54 }) : false;
          if(ok && window.App?.showToast) window.App.showToast('Fit view to group');
        }
      });
      if(isStopGroup && typeof window.App?.stopGroups?.duplicateGroup === 'function'){
        menu.push({
          content: 'Duplicate Stop Group',
          callback: ()=>{
            const copy = window.App.stopGroups.duplicateGroup(group);
            if(copy && window.App?.showToast) window.App.showToast('Stop group duplicated');
          }
        });
      }
      if(extras.length){
        menu.push(null, ...extras);
      }
      if(deleteItem){
        menu.push(null, deleteItem);
      }
      return compactMenuSeparators(menu);
    };
  }

  if(typeof rawGetCanvasMenuOptions === 'function'){
    proto.getCanvasMenuOptions = function(){
      installContextMenuPointerTracking(this);
      const rawMenu = rawGetCanvasMenuOptions.apply(this, arguments);
      const placementActive = !!window.App?.placement?.active;
      if(!placementActive){
        const hoveredNode = getCanvasHoverNode(this);
        if(hoveredNode && typeof this.getNodeMenuOptions === 'function'){
          return compactMenuSeparators(this.getNodeMenuOptions(hoveredNode));
        }
        const hoveredGroup = getCanvasHoverGroup(this);
        if(hoveredGroup && typeof this.getGroupMenuOptions === 'function'){
          this.selected_group = hoveredGroup;
          return compactMenuSeparators(this.getGroupMenuOptions(hoveredGroup));
        }
      }
      const menu = [];
      const extras = [];
      let addNodeItem = null;
      let closeSubgraphItem = null;

      if(Array.isArray(rawMenu)){
        for(const item of rawMenu){
          if(!item || typeof item.content !== 'string') continue;
          const label = String(item.content || '').trim();
          if(label === 'Add Node'){
            addNodeItem = relabelMenuItem(item, 'Add Node Here...');
            continue;
          }
          if(label === 'Add Group') continue;
          if(label === 'Close subgraph'){
            closeSubgraphItem = relabelMenuItem(item, 'Close Subgraph');
            continue;
          }
          extras.push(relabelMenuItem(item, normalizeMenuLabel(label)));
        }
      }

      menu.push({ content: 'Canvas', disabled: true });
      if(window.App?.placement?.active && typeof window.App.finishPlacement === 'function'){
        menu.push({
          content: 'Cancel Placement',
          callback: ()=>{
            window.App.finishPlacement(false);
            this.setDirty(true, true);
          }
        });
        menu.push(null);
      }
      menu.push(addNodeItem || { content: 'Add Node Here...', has_submenu: true, callback: LiteGraph.LGraphCanvas.onMenuAdd });
      menu.push({
        content: 'Create Stop Group Here...',
        callback: (_item, _opt, _ctx, menuRef)=>{
          const ev = resolveMenuEvent(menuRef, null);
          const pos = syncCanvasMouse(this, ev);
          const defaultType = String(document.getElementById('groupKindSelect')?.value || 'random_stop');
          if(typeof window.App?.stopGroups?.openCreateGroupEditor === 'function'){
            window.App.stopGroups.openCreateGroupEditor({ type: defaultType, placementPos: pos });
          }
        }
      });

      if(typeof window.doPaste === 'function'){
        menu.push({
          content: 'Paste Here',
          callback: (_item, _opt, _ctx, menuRef)=>{
            const ev = resolveMenuEvent(menuRef, null);
            syncCanvasMouse(this, ev);
            window.doPaste();
          }
        });
      }

      if((this.selected_group || (this.selected_nodes && Object.keys(this.selected_nodes).length)) && typeof this.deselectAllNodes === 'function'){
        menu.push({
          content: 'Clear Selection',
          callback: ()=>{
            try{ this.deselectAllNodes(); }catch(_e){}
            this.selected_group = null;
            if(window.App?.selectionInspector?.clear) window.App.selectionInspector.clear(true);
            this.setDirty(true, true);
          }
        });
      }

      menu.push({
        content: 'Show Node Builder',
        callback: ()=>{
          const panel = document.getElementById('addNodePanel');
          const header = panel?.querySelector('.panelHeader');
          if(panel?.classList.contains('is-collapsed') && header) header.click();
        }
      }, {
        content: 'Show Stop Group Builder',
        callback: ()=>{
          const panel = document.getElementById('addGroupPanel');
          const header = panel?.querySelector('.panelHeader');
          if(panel?.classList.contains('is-collapsed') && header) header.click();
        }
      });

      menu.push(null, {
        content: 'Fit Canvas to Graph',
        callback: ()=>{
          if(typeof window.fitToScreen === 'function') window.fitToScreen();
        }
      });

      if(typeof window.autoLayoutGraph === 'function'){
        menu.push({
          content: 'Auto Layout Graph',
          callback: ()=>{
            const mode = String(document.getElementById('autoLayoutMode')?.value || 'flow');
            window.autoLayoutGraph({ mode, spacing: 80, fit: true });
          }
        });
      }

      if(extras.length) menu.push(null, ...extras);
      if(closeSubgraphItem) menu.push(null, closeSubgraphItem);
      return compactMenuSeparators(menu);
    };
  }

  // Flatten "Add Node" menu to factory nodes only:
  // current: Add Node > factory > node
  // target : Add Node > node
  const SKIP_TYPES = new Set([
    'factory/carrierhome',
    'factory/merge2',
    'factory/palletcarrier'
  ]);

  LiteGraph.LGraphCanvas.onMenuAdd = function(value, options, event, parentMenu, onCreate){
    const canvas = LiteGraph.LGraphCanvas.active_canvas;
    const graph = canvas && canvas.graph;
    if(!canvas || !graph){
      if(typeof rawOnMenuAdd === 'function') return rawOnMenuAdd.apply(this, arguments);
      return false;
    }

    const filter = canvas.filter || graph.filter;
    let list = LiteGraph.getNodeTypesInCategory('factory', filter) || [];
    list = list.filter((nt)=>
      nt &&
      !nt.skip_list &&
      typeof nt.type === 'string' &&
      nt.type.startsWith('factory/') &&
      !SKIP_TYPES.has(nt.type)
    );

    if(!list.length){
      if(typeof rawOnMenuAdd === 'function') return rawOnMenuAdd.apply(this, arguments);
      return false;
    }

    const byType = new Map();
    for(const nt of list){
      if(!byType.has(nt.type)) byType.set(nt.type, nt);
    }
    const nodes = Array.from(byType.values()).sort((a, b)=>
      String(a.title || a.type || '').localeCompare(String(b.title || b.type || ''))
    );

    const menuItems = nodes.map((nt)=>({
      value: nt.type,
      content: nt.title || nt.type,
      has_submenu: false,
      callback: (item, _opt, _ctx, menuRef)=>{
        const ev = resolveMenuEvent(menuRef, event);
        const pos = syncCanvasMouse(canvas, ev) || [0, 0];
        try{
          if(typeof graph.beforeChange === 'function') graph.beforeChange();
          const node = LiteGraph.createNode(item.value);
          if(node){
            if(typeof window.enforceNodeOverlayMinSize === 'function'){
              try{ window.enforceNodeOverlayMinSize(node); }catch(_e){}
            }
            node.pos = pos;
            graph.add(node);
            if(typeof onCreate === 'function') onCreate(node);
          }
        }finally{
          if(typeof graph.afterChange === 'function') graph.afterChange();
        }
      }
    }));

    const win = canvas.getCanvasWindow ? canvas.getCanvasWindow() : window;
    new LiteGraph.ContextMenu(menuItems, { event, parentMenu }, win);
    return false;
  };

  proto.__factContextMenusPatched = true;
  LiteGraph.LGraphCanvas.__factAddNodeFactoryOnly = true;
})();

window.installContextMenuPointerTracking = installContextMenuPointerTracking;
