// Shared Add Node catalog, brand-derived icons, and node creation helpers.

(function(root){
  'use strict';

  const App = root.App || (root.App = {});

  const ICONS = Object.freeze({
    basic: '<path d="M4 12h5m0 0c3 0 4-5 8-7m-8 7c3 0 4 5 8 7m-8-7c4 0 5 0 9 0"/><circle cx="4" cy="12" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="19" cy="12" r="1.5"/><circle cx="18" cy="20" r="2"/>',
    machine: '<circle cx="4" cy="12" r="2"/><path d="M6 12h3m6 0h3"/><circle cx="12" cy="12" r="4"/><path d="M12 8V5m0 14v-3"/><circle cx="20" cy="12" r="2"/>',
    inspection: '<circle cx="5" cy="12" r="2"/><path d="M7 12h3"/><circle cx="14" cy="10" r="4" fill="none"/><path d="m17 13 4 4M11.8 10l1.4 1.4 2.7-3"/>',
    buffer: '<circle cx="4" cy="12" r="2"/><path d="M6 12h3m6 0h3M9 7h6v10H9z" fill="none"/><circle cx="12" cy="9" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="20" cy="12" r="2"/>',
    conveyor: '<path d="M4 12h16"/><circle cx="4" cy="12" r="2"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="20" cy="12" r="2"/><path d="m17 8 3 4-3 4"/>',
    router: '<circle cx="4" cy="12" r="2"/><path d="M6 12h3c4 0 4-7 9-7m-9 7h9m-9 0c4 0 4 7 9 7"/><circle cx="19" cy="5" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="19" cy="19" r="1.5"/>',
    pack: '<circle cx="4" cy="8" r="1.5"/><circle cx="5" cy="16" r="2.2"/><path d="M6 8c4 0 4 4 8 4M7 16c3 0 3-4 7-4h4"/><circle cx="20" cy="12" r="2.5"/>',
    unpack: '<circle cx="4" cy="12" r="2.5"/><path d="M6.5 12H10c4 0 4-4 8-4m-8 4c3 0 4 4 8 4"/><circle cx="20" cy="8" r="1.5"/><circle cx="19" cy="16" r="2.2"/>',
    equipment: '<circle cx="4" cy="7" r="1.5"/><circle cx="4" cy="17" r="1.5"/><path d="M5.5 7c3.5 0 3.5 5 6.5 5M5.5 17c3.5 0 3.5-5 6.5-5h6"/><circle cx="13" cy="12" r="3"/><circle cx="20" cy="12" r="2"/>',
    note: '<path d="M6 3h8l4 4v14H6z" fill="none"/><path d="M14 3v5h4M9 12h6m-6 4h5"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="16" r="1"/>',
    signal: '<circle cx="4" cy="12" r="2"/><path d="M6 12h3l2-5 3 10 2-5h4"/><circle cx="20" cy="12" r="2"/><path d="M16 12c2-2 2-4 4-5m-4 5c2 2 2 4 4 5"/>',
    shuttle: '<path d="M5 8h14m0 0-3-3m3 3-3 3M19 16H5m0 0 3-3m-3 3 3 3"/><circle cx="5" cy="8" r="1.5"/><circle cx="19" cy="16" r="1.5"/>',
    merge: '<circle cx="4" cy="7" r="1.7"/><circle cx="4" cy="17" r="1.7"/><path d="M6 7c4 0 4 5 8 5M6 17c4 0 4-5 8-5h4"/><circle cx="20" cy="12" r="2.7"/>',
    join: '<circle cx="4" cy="7" r="1.7" fill="none"/><circle cx="4" cy="17" r="1.7" fill="none"/><path d="M6 7c4 0 4 5 8 5M6 17c4 0 4-5 8-5h4"/><circle cx="14" cy="12" r="2.3" fill="none"/><circle cx="20" cy="12" r="1.7"/>',
    sequence_source: '<circle cx="4" cy="12" r="2.3"/><path d="M6 12h3c3 0 3-5 7-5m-7 5h7m-7 0c3 0 3 5 7 5"/><circle cx="18" cy="7" r="1.5"/><circle cx="18" cy="12" r="1.5"/><circle cx="18" cy="17" r="1.5"/><path d="M20 7v10"/>',
    entity_source: '<circle cx="7" cy="12" r="4" fill="none"/><circle cx="6" cy="11" r="1.2"/><circle cx="9" cy="14" r="1.2"/><path d="M11 12h7"/><circle cx="20" cy="12" r="2"/>',
    sink: '<circle cx="4" cy="5" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="19" r="1.5"/><path d="M6 5c5 0 5 7 10 7M6 12h10M6 19c5 0 5-7 10-7"/><circle cx="19" cy="12" r="3"/>',
    split: '<circle cx="4" cy="12" r="2.4"/><path d="M6.5 12H10c4 0 4-5 8-5m-8 5c4 0 4 5 8 5"/><circle cx="20" cy="7" r="2"/><circle cx="20" cy="17" r="2"/>',
    branch: '<circle cx="4" cy="12" r="2"/><path d="M6 12h5m2 0c2-3 3-5 6-5m-6 5c2 3 3 5 6 5"/><circle cx="12" cy="12" r="2.2" fill="none"/><circle cx="20" cy="7" r="1.6"/><circle cx="20" cy="17" r="1.6"/>',
    agv_route: '<circle cx="4" cy="16" r="1.7"/><path d="M6 16c4 0 5-8 10-8h3"/><path d="M10 11h5l2 3H9z" fill="none"/><circle cx="11" cy="15" r="1"/><circle cx="16" cy="15" r="1"/><circle cx="20" cy="8" r="1.7"/>',
    carrier_route: '<circle cx="4" cy="16" r="1.7"/><path d="M6 16c4 0 5-8 10-8h3"/><circle cx="12" cy="11" r="3.2" fill="none"/><circle cx="11" cy="10" r="1"/><circle cx="14" cy="12" r="1.2"/><circle cx="20" cy="8" r="1.7"/>',
    station: '<path d="M7 5h10v14H7z" fill="none"/><circle cx="4" cy="12" r="1.7"/><circle cx="10" cy="9" r="1.3"/><circle cx="14" cy="9" r="1.3"/><circle cx="12" cy="15" r="1.6"/><circle cx="20" cy="12" r="1.7"/><path d="M5.5 12H7m10 0h1.5"/>',
    transfer: '<circle cx="4" cy="8" r="1.7"/><circle cx="4" cy="16" r="1.7"/><path d="M6 8h5c3 0 3 8 7 8M6 16h5c3 0 3-8 7-8"/><circle cx="12" cy="12" r="2" fill="none"/><circle cx="20" cy="8" r="1.7"/><circle cx="20" cy="16" r="1.7"/>',
    flow_in: '<path d="M3 12h12m-4-4 4 4-4 4M19 4v16"/><circle cx="19" cy="12" r="2.2" fill="none"/>',
    flow_out: '<path d="M5 4v16"/><circle cx="5" cy="12" r="2.2" fill="none"/><path d="M7 12h14m-4-4 4 4-4 4"/>',
    flow_sequence: '<circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/><path d="M7 6h5M7 12h5M7 18h14M12 6v12m5-4 4 4-4 4"/>',
    flow_sink: '<path d="M3 6h5l4 4M3 12h7M3 18h5l4-4M12 5h9v14h-9z"/><path d="m14.5 12 2 2 3-4"/>',
    flow_sensor: '<path d="M3 17h18"/><circle cx="12" cy="17" r="2"/><path d="M9 12c1.5-1.8 4.5-1.8 6 0M7 9c3-3.5 7-3.5 10 0M12 4v2"/>',
    flow_process: '<path d="M9 3h6l.7 3 2.8-1 2.5 5-2.5 2 2.5 2-2.5 5-2.8-1-.7 3H9l-.7-3-2.8 1L3 14l2.5-2L3 10l2.5-5 2.8 1z"/><circle cx="12" cy="12" r="3" fill="none"/>',
    flow_recovery: '<path d="M8 3 5 6l3 3M6 6h8a6 6 0 0 1 0 12H9"/><circle cx="14" cy="12" r="3.5" fill="none"/><path d="M14 10v2l1.5 1"/>',
    flow_join: '<path d="M3 6h4c3 0 3 6 7 6h7M3 18h4c3 0 3-6 7-6m3-4 4 4-4 4"/>',
    flow_fork: '<path d="M3 12h7c4 0 4-6 8-6h3M10 12c4 0 4 6 8 6h3M18 3l3 3-3 3m0 6 3 3-3 3"/>',
    flow_router: '<path d="M3 12h4m5-5 5 5-5 5-5-5zM17 12h4M15 9l4-4h2M15 15l4 4h2"/><path d="m19 3 2 2-2 2m0 3 2 2-2 2m0 3 2 2-2 2"/>',
    flow_sync: '<circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/><path d="M6 6h4M6 12h4M6 18h4M10 6v12"/><circle cx="16" cy="12" r="5" fill="none"/><path d="m13.5 12 1.7 1.8 3.4-3.6"/>',
    flow_pack: '<path d="M4 10h16v11H4zM4 10l4-4h8l4 4M8 6v4m8-4v4M12 2v4m-2-2 2 2 2-2"/><rect x="7" y="13" width="4" height="4" rx=".5"/><rect x="13" y="13" width="4" height="4" rx=".5"/>',
    flow_unpack: '<path d="M4 11h16v10H4zM4 11l4-4h8l4 4"/><rect x="9.5" y="14" width="5" height="4" rx=".5"/><path d="m10 7-4-4m0 0v4m0-4h4m4 4 4-4m0 0v4m0-4h-4"/>'
  });

  const rows = [
    ['machine', 'Machine', 'machine', 'machine'],
    ['inspection', 'Inspection', 'inspection', 'inspection'],
    ['buffer', 'Buffer', 'buffer', 'buffer'],
    ['conveyor', 'Conveyor', 'conveyor', 'conveyor'],
    ['router', 'Router', 'router', 'router'],
    ['pack', 'Palletizing', 'pack', 'pack'],
    ['unpack', 'DePalletizing', 'unpack', 'unpack'],
    ['basic', 'Basic Node', 'basic', 'basic'],
    ['note', 'Memo', 'note', 'note', 'factory/note'],
    ['shuttle', 'Shuttle Stage', 'shuttle', 'shuttle'],
    ['source', 'Source', 'source', 'sequence_source', 'factory/basic', 'sequence-source'],
    ['sink', 'Sink', 'sink', 'sink'],
  ];

  const BUILTIN_CATALOG = Object.freeze(rows.map((row)=>Object.freeze({
    kind: row[0],
    label: row[1],
    templateId: row[2],
    icon: row[3],
    nodeType: row[4] || 'factory/basic',
    variant: row[5] || ''
  })));
  const BUILTIN_BY_KIND = new Map(BUILTIN_CATALOG.map((item)=>[item.kind, item]));
  const CATALOG = [];
  let BY_KIND = new Map();
  let overrides = [];

  function clone(value){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return null; }
  }

  function normalizeOverride(value){
    if(!value || typeof value !== 'object') return null;
    const kind = String(value.kind || '').trim().toLowerCase();
    if(!/^[a-z][a-z0-9_-]{1,63}$/.test(kind)) return null;
    const base = BUILTIN_BY_KIND.get(kind) || BUILTIN_BY_KIND.get(String(value.baseKind || '').trim().toLowerCase()) || BUILTIN_BY_KIND.get('basic');
    const snapshot = value.snapshot && typeof value.snapshot === 'object' ? clone(value.snapshot) : null;
    return {
      kind,
      label: String(value.label || base.label || kind).trim() || kind,
      templateId: String(value.templateId || base.templateId || 'basic'),
      icon: String(value.icon || base.icon || 'basic'),
      nodeType: String(value.nodeType || snapshot?.type || base.nodeType || 'factory/basic'),
      variant: String(value.variant || base.variant || ''),
      baseKind: String(value.baseKind || base.kind || 'basic'),
      ...(snapshot ? { snapshot } : {})
    };
  }

  function rebuildCatalog(){
    const merged = new Map(BUILTIN_CATALOG.map((item)=>[item.kind, { ...item }]));
    for(const raw of overrides){
      const item = normalizeOverride(raw);
      if(item) merged.set(item.kind, item);
    }
    CATALOG.splice(0, CATALOG.length, ...merged.values());
    BY_KIND = new Map(CATALOG.map((item)=>[item.kind, item]));
  }

  function replaceOverrides(payload){
    const items = Array.isArray(payload) ? payload : payload?.items;
    overrides = (Array.isArray(items) ? items : []).map(normalizeOverride).filter(Boolean);
    root.NODE_DEFINITIONS = { version:1, items:clone(overrides) || [] };
    rebuildCatalog();
    return { version:1, items:clone(overrides) || [] };
  }

  replaceOverrides(root.NODE_DEFINITIONS || { version:1, items:[] });

  function itemFor(kind){
    return BY_KIND.get(String(kind || '').toLowerCase()) || null;
  }

  function safeClassName(value){
    return String(value || '').split(/\s+/).filter((token)=>/^[a-zA-Z0-9_-]+$/.test(token)).join(' ');
  }

  function nodeIconSvg(kind, options){
    const item = itemFor(kind);
    const iconKey = item?.icon || (Object.prototype.hasOwnProperty.call(ICONS, kind) ? kind : 'basic');
    const className = safeClassName(options?.className || 'factNodeTypeIcon');
    const hidden = options?.hidden === false ? '' : ' aria-hidden="true"';
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false"${hidden}>${ICONS[iconKey] || ICONS.basic}</svg>`;
  }

  function createNodeFromCatalog(kind){
    const item = itemFor(kind) || itemFor('basic');
    if(!item || !root.LiteGraph) return null;
    const node = root.LiteGraph.createNode(item.nodeType);
    if(!node) return null;
    if(item.snapshot && typeof node.configure === 'function'){
      const snapshot = clone(item.snapshot) || {};
      if(Array.isArray(snapshot.inputs)) snapshot.inputs.forEach((port)=>{ port.link = null; });
      if(Array.isArray(snapshot.outputs)) snapshot.outputs.forEach((port)=>{ port.links = null; });
      node.configure(snapshot);
    }else if(node.type === 'factory/basic'){
      App.applyBasicTemplate?.(node, item.templateId);
    }
    if(!item.snapshot?.title) node.title = item.label;
    return node;
  }

  App.NODE_CREATION_CATALOG = CATALOG;
  App.BUILTIN_NODE_CREATION_CATALOG = BUILTIN_CATALOG;
  App.getNodeCreationItem = itemFor;
  App.getNodeDefinitionOverrides = ()=>({ version:1, items:clone(overrides) || [] });
  App.replaceNodeDefinitionOverrides = replaceOverrides;
  App.hasNodeDefinitionOverride = kind=>overrides.some((item)=>item.kind === String(kind || '').toLowerCase());
  App.isBuiltinNodeDefinition = kind=>BUILTIN_BY_KIND.has(String(kind || '').toLowerCase());
  App.nodeIconSvg = nodeIconSvg;
  App.createNodeFromCatalog = createNodeFromCatalog;
})(typeof self !== 'undefined' ? self : window);
