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
    transfer: '<circle cx="4" cy="8" r="1.7"/><circle cx="4" cy="16" r="1.7"/><path d="M6 8h5c3 0 3 8 7 8M6 16h5c3 0 3-8 7-8"/><circle cx="12" cy="12" r="2" fill="none"/><circle cx="20" cy="8" r="1.7"/><circle cx="20" cy="16" r="1.7"/>'
  });

  const rows = [
    ['machine', 'Machine', 'machine', 'machine'],
    ['inspection', 'Inspection', 'inspection', 'inspection'],
    ['buffer', 'Buffer', 'buffer', 'buffer'],
    ['conveyor', 'Conveyor', 'conveyor', 'conveyor'],
    ['router', 'Router', 'router', 'router'],
    ['pack', 'Attach', 'pack', 'pack'],
    ['unpack', 'Detach', 'unpack', 'unpack'],
    ['basic', 'Basic Node', 'basic', 'basic'],
    ['equip', 'Equipment', 'machine', 'equipment'],
    ['note', 'Memo', 'note', 'note', 'factory/note'],
    ['signal', 'Signal', 'signal', 'signal', 'factory/signal'],
    ['shuttle', 'Shuttle Stage', 'shuttle', 'shuttle'],
    ['merge', 'Merge', 'merge', 'merge'],
    ['join', 'Join', 'join', 'join'],
    ['source', 'Sequence Source', 'source', 'sequence_source', 'factory/basic', 'sequence-source'],
    ['entitysource', 'Entity Source', 'source', 'entity_source', 'factory/basic', 'entity-source'],
    ['sink', 'Sink', 'sink', 'sink'],
    ['split', 'Split', 'split', 'split'],
    ['branch', 'Branch', 'router', 'branch'],
    ['agvroute', 'AGV Route', 'carrier_route', 'agv_route', 'factory/basic', 'agv-route'],
    ['carrierroute', 'Carrier Route', 'carrier_route', 'carrier_route', 'factory/basic', 'carrier-route'],
    ['station', 'Store', 'station', 'station'],
    ['transferstation', 'Transfer', 'transfer', 'transfer']
  ];

  const CATALOG = Object.freeze(rows.map((row)=>Object.freeze({
    kind: row[0],
    label: row[1],
    templateId: row[2],
    icon: row[3],
    nodeType: row[4] || 'factory/basic',
    variant: row[5] || ''
  })));
  const BY_KIND = new Map(CATALOG.map((item)=>[item.kind, item]));

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

  function setOperationVariant(node, key, value){
    const operations = Array.isArray(node?.properties?.operations) ? node.properties.operations : [];
    const operation = operations[0];
    if(!operation) return;
    operation.config = operation.config && typeof operation.config === 'object' ? operation.config : {};
    operation.config[key] = value;
  }

  function applyVariant(node, item){
    if(!node || !item || node.type !== 'factory/basic') return;
    if(item.variant === 'sequence-source'){
      App.configureBasicSequenceGenerator?.(node);
      return;
    }
    if(item.variant === 'entity-source'){
      node.properties.sourceMode = 'entity';
      return;
    }
    if(item.variant === 'agv-route' || item.variant === 'carrier-route'){
      const mode = item.variant === 'agv-route' ? 'agv' : 'carrier';
      node.properties.transportMode = mode;
      setOperationVariant(node, 'transportMode', mode);
      App.ensureBasicTemplateFlowRules?.(node, { force:true, templateId:item.templateId });
    }
  }

  function createNodeFromCatalog(kind){
    const item = itemFor(kind) || itemFor('equip');
    if(!item || !root.LiteGraph) return null;
    const node = root.LiteGraph.createNode(item.nodeType);
    if(!node) return null;
    if(node.type === 'factory/basic'){
      App.applyBasicTemplate?.(node, item.templateId);
      applyVariant(node, item);
      App.ensureBasicTemplateFlowRules?.(node, { force:false, templateId:item.templateId });
    }
    node.title = item.label;
    return node;
  }

  App.NODE_CREATION_CATALOG = CATALOG;
  App.getNodeCreationItem = itemFor;
  App.nodeIconSvg = nodeIconSvg;
  App.createNodeFromCatalog = createNodeFromCatalog;
})(typeof self !== 'undefined' ? self : window);
