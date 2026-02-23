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

function menuMixin(cls){
  cls.prototype.getExtraMenuOptions = function(){
    const opts = [];
    if(this.properties.script !== undefined){
      opts.push({
        content: 'Edit Script...',
        callback: ()=>{
          if(typeof window.openPropertyEditor === 'function'){
            window.openPropertyEditor(this, 'script');
            return;
          }
          window.editingNode = this;
          scriptEditorTextarea.value = this.properties.script;
          document.getElementById('scriptEditorModal').style.display = 'block';
        }
      });
    }
    if(this.properties.sigEnabled !== undefined){
      opts.push({
        content: this.properties.sigEnabled ? 'Disable Signals' : 'Enable Signals',
        callback: ()=>{
          this.properties.sigEnabled = !this.properties.sigEnabled;
          this.setDirtyCanvas(true, true);
        }
      });
    }
    const extra = this.properties.sigExtra || 0;
    const applySigChange = ()=>{
      if(typeof this._syncSignalPorts === 'function') this._syncSignalPorts();
      else{
        syncSigPorts(this, 0);
        if(this.setDirtyCanvas) this.setDirtyCanvas(true, true);
      }
    };
    opts.push({
      content: 'Add SIG IN/OUT',
      callback: ()=>{
        this.properties.sigExtra++;
        applySigChange();
      }
    });
    opts.push({
      content: 'Remove SIG IN/OUT',
      disabled: extra === 0,
      callback: ()=>{
        if(extra === 0) return;
        this.properties.sigExtra--;
        applySigChange();
      }
    });
    return opts;
  };
}

window.defaultScript = defaultScript;
window.menuMixin = menuMixin;

// Prune rarely-used LiteGraph default node menu items.
(function(){
  if(typeof LiteGraph === 'undefined' || !LiteGraph.LGraphCanvas) return;
  const proto = LiteGraph.LGraphCanvas.prototype;
  if(proto.__factMenuPruned) return;

  const HIDE = new Set(['Mode', 'Collapse', 'Pin', 'Shapes']);
  const rawGetNodeMenuOptions = proto.getNodeMenuOptions;
  if(typeof rawGetNodeMenuOptions !== 'function') return;

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

  proto.getNodeMenuOptions = function(){
    const menu = rawGetNodeMenuOptions.apply(this, arguments);
    if(!Array.isArray(menu)) return menu;
    const filtered = menu.filter((item)=>{
      if(!item || typeof item.content !== 'string') return true;
      return !HIDE.has(item.content.trim());
    });
    return compactMenuSeparators(filtered);
  };

  proto.__factMenuPruned = true;
})();

// Add stop-group property editor to group context menu.
(function(){
  if(typeof LiteGraph === 'undefined' || !LiteGraph.LGraphCanvas) return;
  const proto = LiteGraph.LGraphCanvas.prototype;
  if(proto.__factStopGroupMenuPatched) return;

  const rawGetGroupMenuOptions = proto.getGroupMenuOptions;
  if(typeof rawGetGroupMenuOptions !== 'function') return;

  proto.getGroupMenuOptions = function(group){
    const menu = rawGetGroupMenuOptions.apply(this, arguments);
    if(!group || !window.App || !window.App.stopGroups) return menu;
    if(typeof window.App.stopGroups.getGroupMeta !== 'function') return menu;
    const meta = window.App.stopGroups.getGroupMeta(group);
    if(!meta) return menu;

    const out = Array.isArray(menu) ? menu.slice() : [];
    out.unshift({
      content: 'Edit Stop Group...',
      callback: ()=>{
        if(typeof window.App.stopGroups.openGroupEditor === 'function'){
          window.App.stopGroups.openGroupEditor(group);
        }
      }
    });
    return out;
  };

  proto.__factStopGroupMenuPatched = true;
})();

// Flatten "Add Node" menu to factory nodes only:
// current: Add Node > factory > node
// target : Add Node > node
(function(){
  if(typeof LiteGraph === 'undefined' || !LiteGraph.LGraphCanvas) return;
  if(LiteGraph.LGraphCanvas.__factAddNodeFactoryOnly) return;

  const SKIP_TYPES = new Set([
    'factory/carrierhome', // legacy alias (keep load compatibility only)
    'factory/merge2'       // legacy alias (keep load compatibility only)
  ]);

  const rawOnMenuAdd = LiteGraph.LGraphCanvas.onMenuAdd;
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
    const nodes = Array.from(byType.values()).sort((a,b)=>{
      const at = String(a.title || a.type || '');
      const bt = String(b.title || b.type || '');
      return at.localeCompare(bt);
    });

    const menuItems = nodes.map((nt)=>({
      value: nt.type,
      content: nt.title || nt.type,
      has_submenu: false,
      callback: (item, _opt, _ctx, menuRef)=>{
        const ev =
          (menuRef && typeof menuRef.getFirstEvent === 'function' && menuRef.getFirstEvent()) ||
          event;
        graph.beforeChange();
        const node = LiteGraph.createNode(item.value);
        if(node){
          node.pos = canvas.convertEventToCanvasOffset(ev || event);
          graph.add(node);
          if(typeof onCreate === 'function') onCreate(node);
        }
        graph.afterChange();
      }
    }));

    const win = canvas.getCanvasWindow ? canvas.getCanvasWindow() : window;
    new LiteGraph.ContextMenu(menuItems, { event, parentMenu }, win);
    return false;
  };

  LiteGraph.LGraphCanvas.__factAddNodeFactoryOnly = true;
})();
