// One persisted Entity node type. Add-node templates only seed common rules,
// timings and operations; template identity is never part of the saved node.

(function(root){
  'use strict';

  const App = root.App || (root.App = {});

  const PRESETS = Object.freeze({
    basic:       { title: 'Basic Node', category: 'Advanced', entity: true, processTime: 0, downTime: 0, contentCapacity: 1 },
    machine:     { title: 'Machine', category: 'Processing', entity: true, processTime: 2, downTime: 0, contentCapacity: 1 },
    inspection:  { title: 'Inspection', category: 'Processing', entity: true, processTime: 2, downTime: 0, contentCapacity: 1 },
    buffer:      { title: 'Buffer', category: 'Storage', entity: true, processTime: 0, downTime: 0, contentCapacity: 10 },
    conveyor:    { title: 'Conveyor', category: 'Handling', entity: true, processTime: 1, downTime: 0, contentCapacity: 1 },
    router:      { title: 'Router', category: 'Flow Control', entity: true, processTime: 0, downTime: 0, contentCapacity: 1 },
    pack:        { title: 'Pack', category: 'Handling', entity: true, processTime: 1, downTime: 0, contentCapacity: 2 },
    unpack:      { title: 'Unpack', category: 'Handling', entity: true, processTime: 1, downTime: 0, contentCapacity: 1 },
    source:      { title: 'Source', category: 'System', entity: true, processTime: 0, downTime: 0, contentCapacity: 1000000 },
    sink:        { title: 'Sink', category: 'System', entity: true, processTime: 0, downTime: 0, contentCapacity: 1000000 },
    split:       { title: 'Split', category: 'Flow Control', entity: true, processTime: 0, downTime: 0, contentCapacity: 1 },
    merge:       { title: 'Merge', category: 'Flow Control', entity: true, processTime: 0, downTime: 0, contentCapacity: 2 },
    join:        { title: 'Join', category: 'Flow Control', entity: true, processTime: 0, downTime: 0, contentCapacity: 2 },
    shuttle:     { title: 'Shuttle Stage', category: 'Handling', entity: true, processTime: 1, downTime: 0, contentCapacity: 1 },
    carrier_route:{ title: 'Carrier Route', category: 'Handling', entity: true, processTime: 1, downTime: 0, contentCapacity: 1 },
    station:     { title: 'Station', category: 'Handling', entity: true, processTime: 1, downTime: 0, contentCapacity: 2 },
    transfer:    { title: 'Transfer', category: 'Handling', entity: true, processTime: 1, downTime: 0, contentCapacity: 2 },
    signal:      { title: 'Signal', category: 'Utility', entity: false, processTime: 0, downTime: 0, contentCapacity: 0 },
    note:        { title: 'Note', category: 'Utility', entity: false, processTime: 0, downTime: 0, contentCapacity: 0 }
  });

  const TEMPLATE_OPERATIONS = Object.freeze({
    basic:        [{ operationId:'process-1', trigger:'process', kind:'process' }],
    machine:      [{ operationId:'process-1', trigger:'process', kind:'process' }],
    inspection:   [{ operationId:'process-1', trigger:'process', kind:'process' }],
    buffer:       [{ operationId:'hold-1', trigger:'input-accepted', kind:'hold' }],
    conveyor:     [{ operationId:'process-1', trigger:'process', kind:'process' }],
    router:       [{ operationId:'route-1', trigger:'release', kind:'route' }],
    pack:         [{ operationId:'attach-1', trigger:'input-accepted', kind:'attach' }],
    unpack:       [{ operationId:'detach-1', trigger:'release', kind:'detach' }],
    source:       [{ operationId:'create-1', trigger:'release', kind:'create' }],
    sink:         [{ operationId:'destroy-1', trigger:'input-accepted', kind:'destroy' }],
    split:        [{ operationId:'clone-1', trigger:'release', kind:'clone', dispatch:'all-ready' }],
    merge:        [{ operationId:'merge-1', trigger:'input-accepted', kind:'merge' }],
    join:         [{ operationId:'join-1', trigger:'input-accepted', kind:'join' }],
    shuttle:      [{ operationId:'shuttle-1', trigger:'release', kind:'synchronized-step', groupId:'shuttle-1' }],
    carrier_route:[{ operationId:'transport-1', trigger:'process', kind:'carrier-transport', routePolicy:'first-ready' }],
    station:      [{ operationId:'station-1', trigger:'process', kind:'station-transfer' }],
    transfer:     [{ operationId:'transfer-1', trigger:'process', kind:'transfer' }],
    signal:       [],
    note:         []
  });

  const OPERATION_BEHAVIOR = Object.freeze({
    create:'source', destroy:'sink', clone:'split', merge:'merge', join:'join',
    'synchronized-step':'shuttle', 'carrier-transport':'carrier_route',
    'station-transfer':'station', transfer:'transfer', attach:'pack', detach:'unpack',
    route:'router', hold:'buffer', process:'machine'
  });

  // Public, declarative registry used by both the editor and execution-plan
  // compiler. Templates only seed these operation rows; no template identity
  // is required after a node has been created.
  const ACTION_REGISTRY = Object.freeze(Object.fromEntries(
    Object.entries(OPERATION_BEHAVIOR).map(([kind, behavior])=>[
      kind,
      Object.freeze({ kind, behavior })
    ])
  ));

  const LEGACY_PROPERTY_KEYS = new Set([
    'presetId', 'sourceSequence', 'processTime', 'processTime2', 'downTime',
    'ratio', 'strictIdMatch', 'stageIndex', 'shuttleGroupId', 'initialCarrier',
    'agvIds', 'agvCapacity', 'palletWorkCapacity', 'transportMode', 'outSequence',
    'sourceMode', 'rootKind', 'rootId', 'capacity', 'accepts', 'preset', 'operation',
    'sourceKind', 'targetKind', 'itemKind', 'batchMode', 'quantity', 'relationMode',
    'searchDepth', 'autoRelease', 'script', 'scriptDisabled', 'sigEnabled', 'sigExtra'
  ]);

  const TYPE_TO_PRESET = Object.freeze({
    'factory/source': 'source',
    'factory/entitysource': 'source',
    'factory/equip': 'machine',
    'factory/branch': 'router',
    'factory/split': 'split',
    'factory/merge': 'merge',
    'factory/merge2': 'merge',
    'factory/join': 'join',
    'factory/shuttle_stage': 'shuttle',
    'factory/agvroute': 'carrier_route',
    'factory/carrierroute': 'carrier_route',
    'factory/station': 'station',
    'factory/transferstation': 'transfer',
    'factory/sink': 'sink',
    'factory/signal': 'signal',
    'factory/note': 'note'
  });

  const CONFIG_TYPES = new Set([
    'factory/carrierconfig', 'factory/carrierhome',
    'factory/palletcarrierconfig', 'factory/palletcarrier'
  ]);

  function isObject(value){ return !!value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value, fallback){ try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return fallback; } }
  function text(value){ return String(value == null ? '' : value).trim(); }
  function nowMs(){ return typeof root.simNow === 'function' ? Number(root.simNow()) || 0 : 0; }

  function hasSequenceTarget(node){
    return (Array.isArray(node?.properties?.outputRules) ? node.properties.outputRules : []).some((rule)=>{
      const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target];
      return targets.some((target)=>text(target?.mode || target?.kind || target).toLowerCase() === 'sequence');
    });
  }

  function sequenceTarget(node){
    for(const rule of (Array.isArray(node?.properties?.outputRules) ? node.properties.outputRules : [])){
      const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target];
      const target = targets.find((entry)=>text(entry?.mode || entry?.kind || entry).toLowerCase() === 'sequence');
      if(target) return target;
    }
    return null;
  }

  function sequenceEntries(node){
    const target = sequenceTarget(node);
    return Array.isArray(target?.entries) ? target.entries : [];
  }

  function operationRows(node){
    return Array.isArray(node?.properties?.operations) ? node.properties.operations : [];
  }

  function operationByKind(node, kind){
    const wanted = text(kind).toLowerCase();
    return operationRows(node).find((entry)=>text(entry?.kind).toLowerCase() === wanted) || null;
  }

  function behaviorId(node){
    if(hasSequenceTarget(node)) return 'source';
    for(const operation of operationRows(node)){
      const behavior = OPERATION_BEHAVIOR[text(operation?.kind).toLowerCase()];
      if(behavior) return behavior;
    }
    return 'basic';
  }

  function compileExecutionPlan(node){
    const properties = node?.properties || {};
    return {
      version: 2,
      behavior: behaviorId(node),
      operations: normalizeOperations(properties.operations),
      inputRules: clone(Array.isArray(properties.inputRules) ? properties.inputRules : [], []),
      outputRules: clone(Array.isArray(properties.outputRules) ? properties.outputRules : [], []),
      inputPolicy: clone(isObject(properties.inputPolicy) ? properties.inputPolicy : { mode:'first', requiredPortIds:[], match:null }, {}),
      selection: text(properties.selection) || 'first-available',
      portTimings: clone(isObject(properties.portTimings) ? properties.portTimings : { inputs:{}, outputs:{} }, { inputs:{}, outputs:{} })
    };
  }

  function operationConfig(node, kind){
    const operation = operationByKind(node, kind);
    if(!operation) return {};
    operation.config = isObject(operation.config) ? operation.config : {};
    return operation.config;
  }

  function normalizeOperations(rows){
    const result = [];
    const used = new Set();
    for(const [index, raw] of (Array.isArray(rows) ? rows : []).entries()){
      if(!isObject(raw)) continue;
      const kind = text(raw.kind).toLowerCase();
      if(!kind) continue;
      let operationId = text(raw.operationId) || `${kind}-${index + 1}`;
      while(used.has(operationId)) operationId = `${kind}-${used.size + 1}`;
      used.add(operationId);
      result.push({ ...clone(raw, {}), operationId, trigger:text(raw.trigger) || 'process', kind });
    }
    return result;
  }

  function commonProperties(properties){
    const source = isObject(properties) ? properties : {};
    const result = {
      basicNodeVersion: 2,
      contentCapacity: Math.max(0, Math.round(Number.isFinite(Number(source.contentCapacity)) ? Number(source.contentCapacity) : 1)),
      initialContents: clone(Array.isArray(source.initialContents) ? source.initialContents : [], []),
      inputRules: clone(Array.isArray(source.inputRules) ? source.inputRules : [], []),
      outputRules: clone(Array.isArray(source.outputRules) ? source.outputRules : [], []),
      portTimings: clone(isObject(source.portTimings) ? source.portTimings : { inputs:{}, outputs:{} }, { inputs:{}, outputs:{} }),
      inputPolicy: clone(isObject(source.inputPolicy) ? source.inputPolicy : { mode:'first', requiredPortIds:[], match:null }, { mode:'first', requiredPortIds:[], match:null }),
      selection: text(source.selection) || 'first-available',
      stateMachine: clone(isObject(source.stateMachine) ? source.stateMachine : { initialState:'IDLE', states:['IDLE','PROCESS','WAIT','DOWN'], transitions:[] }, {}),
      operations: normalizeOperations(source.operations)
    };
    if(Number.isFinite(Number(source.flowPortSequence))) result.flowPortSequence = Math.max(0, Math.round(Number(source.flowPortSequence)));
    return result;
  }

  function templateOperations(templateId, legacyProperties){
    const id = Object.prototype.hasOwnProperty.call(TEMPLATE_OPERATIONS, templateId) ? templateId : 'basic';
    const rows = clone(TEMPLATE_OPERATIONS[id], []);
    const legacy = isObject(legacyProperties) ? legacyProperties : {};
    const configKeys = [
      'transportMode', 'outSequence', 'strictIdMatch', 'ratio', 'preset', 'operation',
      'sourceKind', 'targetKind', 'itemKind', 'batchMode', 'quantity', 'relationMode',
      'searchDepth', 'autoRelease'
    ];
    const config = {};
    for(const key of configKeys){
      if(Object.prototype.hasOwnProperty.call(legacy, key)) config[key] = clone(legacy[key], legacy[key]);
    }
    if(rows[0] && Object.keys(config).length) rows[0].config = config;
    if(id === 'shuttle' && rows[0]) rows[0].groupId = text(legacy.shuttleGroupId) || text(rows[0].groupId) || 'shuttle-1';
    return normalizeOperations(rows);
  }

  function legacyTimingOverrides(script, model){
    const source = text(script);
    if(!source) return {};
    const result = {};
    const pattern = /work\.type\s*===\s*['"]([^'"]+)['"][\s\S]*?processTime\s*=\s*([0-9.]+)[\s\S]*?downTime\s*=\s*([0-9.]+)/g;
    let match = null;
    while((match = pattern.exec(source))){
      const typeId = typeIdForLegacyName(model, match[1]);
      if(typeId) result[typeId] = { processTimeSec:Math.max(0, Number(match[2]) || 0), downTimeSec:Math.max(0, Number(match[3]) || 0) };
    }
    return result;
  }

  function moveSequenceIntoTarget(properties){
    const rules = Array.isArray(properties?.outputRules) ? properties.outputRules : [];
    const legacyRows = Array.isArray(properties?.sourceSequence) ? properties.sourceSequence : [];
    for(const rule of rules){
      const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target].filter(Boolean);
      const sequence = targets.find((entry)=>text(entry?.mode || entry?.kind || entry).toLowerCase() === 'sequence');
      if(!sequence) continue;
      sequence.mode = 'sequence';
      sequence.entries = clone(Array.isArray(sequence.entries) ? sequence.entries : legacyRows, []);
      rule.targets = [sequence];
      rule.target = sequence;
      break;
    }
  }

  function upgradeNodeProperties(node, templateHint){
    const legacy = isObject(node?.properties) ? node.properties : {};
    const hint = text(templateHint || legacy.presetId).toLowerCase() || (hasSequenceTarget(node) ? 'source' : 'basic');
    moveSequenceIntoTarget(legacy);
    const next = commonProperties(legacy);
    if(!next.operations.length) next.operations = templateOperations(hint, legacy);
    if(legacy.strictIdMatch){
      next.inputPolicy = { mode:'all', requiredPortIds:[], match:{ path:'instanceId', operator:'eq' } };
    }
    if(text(legacy.outSequence)) next.selection = 'round-robin';
    node.properties = next;
    ensurePortTimings(node);
    const inputPorts = entityFlowPorts(node, 'input');
    const outputPorts = entityFlowPorts(node, 'output');
    inputPorts.forEach((port, index)=>{
      const key = index === 0 ? 'processTime' : `processTime${index + 1}`;
      const value = Number(legacy[key]);
      const timing = node.properties.portTimings.inputs[port.portId] || (node.properties.portTimings.inputs[port.portId] = {});
      if(Number.isFinite(value) && !Number.isFinite(Number(timing.processTimeSec))) timing.processTimeSec = Math.max(0, value);
      if(!Array.isArray(timing.processStages)){
        timing.processStages = [{ stageId:`${port.portId}-process-1`, durationSec:Math.max(0, Number(timing.processTimeSec) || 0) }];
      }
    });
    outputPorts.forEach((port, index)=>{
      const key = index === 0 ? 'downTime' : `downTime${index + 1}`;
      const value = Number(legacy[key]);
      const timing = node.properties.portTimings.outputs[port.portId] || (node.properties.portTimings.outputs[port.portId] = {});
      if(Number.isFinite(value) && !Number.isFinite(Number(timing.downTimeSec))) timing.downTimeSec = Math.max(0, value);
    });
    return hint;
  }

  function normalizeSerializedVector(value){
    if(Array.isArray(value)) return value;
    if(value && typeof value === 'object'){
      const x = Number(value[0]);
      const y = Number(value[1]);
      if(Number.isFinite(x) && Number.isFinite(y)) return [x, y];
    }
    return value;
  }

  function restoreSerializedGeometry(node, serializedNode){
    if(!node || !serializedNode) return;
    const pos = normalizeSerializedVector(serializedNode.pos);
    const size = normalizeSerializedVector(serializedNode.size);
    if(Array.isArray(pos)){
      if(node.pos && typeof node.pos.set === 'function') node.pos.set(pos.slice(0, 2));
      else node.pos = pos.slice(0, 2);
    }
    if(Array.isArray(size)){
      if(node.size && typeof node.size.set === 'function') node.size.set(size.slice(0, 2));
      else node.size = size.slice(0, 2);
    }
  }

  function ensurePortIds(node){
    const assign = (rows, prefix)=>{
      (Array.isArray(rows) ? rows : []).forEach((port, index)=>{
        if(!port) return;
        if(!port.portId) port.portId = `${prefix}-${index + 1}`;
        if(!port.channel){
          port.channel = (/^sig(?:in|out)\d*$/.test(text(port.name).toLowerCase()) || text(port.type).toLowerCase() === 'string')
            ? 'signal'
            : 'entity';
        }
      });
    };
    assign(node?.inputs, 'in');
    assign(node?.outputs, 'out');
  }

  function defaultPortCounts(presetId){
    const id = text(presetId).toLowerCase();
    if(id === 'source') return { inputs: 0, outputs: 1 };
    if(id === 'sink') return { inputs: 1, outputs: 0 };
    if(id === 'note' || id === 'signal') return { inputs: 0, outputs: 0 };
    if(id === 'pack') return { inputs: 2, outputs: 1 };
    if(id === 'unpack' || id === 'router' || id === 'split') return { inputs: 1, outputs: 2 };
    if(id === 'merge' || id === 'join') return { inputs: 2, outputs: 1 };
    return { inputs: 1, outputs: 1 };
  }

  function defaultPortNames(presetId){
    const counts = defaultPortCounts(presetId);
    return {
      inputs: Array.from({ length:counts.inputs }, (_unused, index)=>`inPort${index + 1}`),
      outputs: Array.from({ length:counts.outputs }, (_unused, index)=>`outPort${index + 1}`)
    };
  }

  function defaultEntityCategory(node){
    const behavior = behaviorId(node);
    if(behavior === 'carrier_route') return 'carrier';
    return 'work';
  }

  function presetPortCategories(node, presetId, direction, index){
    const id = text(presetId).toLowerCase() || 'basic';
    if(id === 'pack') return direction === 'input' && index === 0 ? ['work'] : ['container', 'carrier'];
    if(id === 'unpack') return direction === 'output' && index === 0 ? ['work'] : ['container', 'carrier'];
    if(id === 'station') return index === 0 ? ['work'] : ['container', 'carrier'];
    if(id === 'transfer') return ['work', 'container', 'carrier'];
    if(id === 'carrier_route'){
      const agvMode = text(node?.properties?.transportMode).toLowerCase() === 'agv';
      if(agvMode) return index === 0 ? ['work'] : ['carrier'];
      return index === 0 ? ['carrier'] : ['container'];
    }
    return [defaultEntityCategory(node)];
  }

  function targetForCategory(category){
    return { mode: 'category', category: category || 'work' };
  }

  function targetsForCategories(categories){
    const unique = [];
    for(const category of (Array.isArray(categories) ? categories : [categories])){
      const normalized = text(category).toLowerCase() || 'work';
      if(!unique.includes(normalized)) unique.push(normalized);
    }
    return unique.map(targetForCategory);
  }

  function allConditions(){
    const conditions = Array.from(arguments).flat().filter(Boolean).map((condition)=>{
      return typeof condition === 'string' ? { kind: condition } : clone(condition, condition);
    });
    return conditions.length === 1 ? conditions[0] : { kind: 'all', conditions };
  }

  function defaultReleaseCondition(node){
    const presetId = behaviorId(node);
    if(presetId === 'shuttle'){
      const shuttle = operationByKind(node, 'synchronized-step');
      return {
        kind: 'all',
        conditions: [
          { kind: 'process-complete' },
          { kind: 'shuttle-group-idle', groupId: text(shuttle?.groupId) || 'shuttle-1' },
          { kind: 'downstream-ready' }
        ]
      };
    }
    const primary = ['source', 'buffer', 'router', 'split'].includes(presetId)
      ? 'available'
      : 'process-complete';
    return {
      kind: 'all',
      conditions: [
        { kind: primary },
        { kind: 'downstream-ready' }
      ]
    };
  }

  function makeInputRule(presetId, port, index, categories, acceptKind){
    const targets = targetsForCategories(categories);
    return {
      ruleId: `${presetId}-input-${index + 1}`,
      targets,
      target: clone(targets[0], targets[0]),
      acceptWhen: { kind: acceptKind || 'space-available' },
      fromPortId: port?.portId || `in-${index + 1}`
    };
  }

  function defaultInputRules(node, presetId, inputs){
    if(hasSequenceTarget(node) || presetId === 'source' || presetId === 'note' || presetId === 'signal') return [];
    return inputs.map((port, index)=>{
      const categories = presetPortCategories(node, presetId, 'input', index);
      let acceptKind = presetId === 'sink' ? 'always' : 'space-available';
      return makeInputRule(presetId, port, index, categories, acceptKind);
    });
  }

  function makeOutputRule(presetId, index, categories, condition, ports){
    const targets = targetsForCategories(categories);
    const toPortIds = ports.map((port, portIndex)=>port?.portId || `out-${portIndex + 1}`);
    return {
      ruleId: `${presetId}-output-${index + 1}`,
      targets,
      target: clone(targets[0], targets[0]),
      releaseWhen: clone(condition, condition),
      toPortIds,
      toPortId: toPortIds[0] || null
    };
  }

  function defaultOutputRules(node, presetId, outputs){
    if(!outputs.length || presetId === 'sink' || presetId === 'note' || presetId === 'signal') return [];
    if(presetId === 'unpack'){
      const itemPort = outputs[0] ? [outputs[0]] : [];
      const containerPort = outputs[1] ? [outputs[1]] : itemPort;
      return [
        makeOutputRule(presetId, 0, ['work'], allConditions('available', 'downstream-ready'), itemPort),
        makeOutputRule(presetId, 1, ['container', 'carrier'], allConditions('empty', 'downstream-ready'), containerPort)
      ];
    }
    if(presetId === 'pack'){
      return [makeOutputRule(presetId, 0, ['container', 'carrier'], allConditions('full', 'downstream-ready'), outputs)];
    }
    if(['station', 'carrier_route', 'transfer'].includes(presetId)){
      return outputs.map((port, index)=>makeOutputRule(
        presetId,
        index,
        presetPortCategories(node, presetId, 'output', index),
        defaultReleaseCondition(node),
        [port]
      ));
    }
    const rule = makeOutputRule(presetId, 0, [defaultEntityCategory(node)], defaultReleaseCondition(node), outputs);
    if(presetId === 'source'){
      rule.targets = [{ mode:'sequence' }];
      rule.target = rule.targets[0];
    }
    return [rule];
  }

  function ensurePresetFlowRules(node, options){
    if(!node || !isObject(node.properties)) return;
    const force = options?.force === true;
    const presetId = text(options?.templateId).toLowerCase() || behaviorId(node);
    const preset = PRESETS[presetId] || PRESETS.basic;
    if(preset.entity === false){
      if(!Array.isArray(node.properties.inputRules)) node.properties.inputRules = [];
      if(!Array.isArray(node.properties.outputRules)) node.properties.outputRules = [];
      return;
    }
    ensurePortIds(node);
    const counts = hasSequenceTarget(node) ? { inputs:0, outputs:1 } : defaultPortCounts(presetId);
    const inputs = Array.isArray(node.inputs) && node.inputs.length
      ? node.inputs
      : Array.from({ length: counts.inputs }, (_unused, index)=>({ portId: `in-${index + 1}` }));
    const outputs = Array.isArray(node.outputs) && node.outputs.length
      ? node.outputs
      : Array.from({ length: counts.outputs }, (_unused, index)=>({ portId: `out-${index + 1}` }));

    if(force || !Array.isArray(node.properties.inputRules) || !node.properties.inputRules.length){
      node.properties.inputRules = defaultInputRules(node, presetId, inputs);
    }
    if(force || !Array.isArray(node.properties.outputRules) || !node.properties.outputRules.length){
      node.properties.outputRules = defaultOutputRules(node, presetId, outputs);
    }
  }

  function ensurePresetRuleCoverage(node){
    if(!node || !isObject(node.properties)) return;
    const presetId = behaviorId(node);
    if(hasSequenceTarget(node) || ['source', 'note', 'signal'].includes(presetId)) return;
    const inputRules = Array.isArray(node.properties.inputRules) ? node.properties.inputRules : (node.properties.inputRules = []);
    for(const [index, port] of (node.inputs || []).entries()){
      if(!port || isSignalPort(port) || inputRules.some((rule)=>text(rule?.fromPortId) === text(port.portId))) continue;
      inputRules.push(makeInputRule(presetId, port, index, presetPortCategories(node, presetId, 'input', index), presetId === 'sink' ? 'always' : 'space-available'));
    }
    if(['sink', 'note', 'signal'].includes(presetId)) return;
    const outputRules = Array.isArray(node.properties.outputRules) ? node.properties.outputRules : (node.properties.outputRules = []);
    for(const [index, port] of (node.outputs || []).entries()){
      if(!port || isSignalPort(port) || outputRules.some((rule)=>{
        const ids = Array.isArray(rule?.toPortIds) ? rule.toPortIds : [rule?.toPortId];
        return ids.some((portId)=>text(portId) === text(port.portId));
      })) continue;
      outputRules.push(makeOutputRule(presetId, index, presetPortCategories(node, presetId, 'output', index), defaultReleaseCondition(node), [port]));
    }
  }

  function portIndexById(rows, portId){
    if(!Array.isArray(rows)) return -1;
    const wanted = text(portId);
    if(!wanted) return rows.length ? 0 : -1;
    return rows.findIndex((port)=>text(port?.portId) === wanted);
  }

  function isSignalPort(port){
    if(text(port?.channel).toLowerCase() === 'signal') return true;
    if(text(port?.channel).toLowerCase() === 'entity') return false;
    const name = text(port?.name).toLowerCase();
    return /^sigin\d*$/.test(name) || /^sigout\d*$/.test(name) || text(port?.type).toLowerCase() === 'string';
  }

  function normalizeEntityPorts(node){
    if(!node) return node;
    ensurePortIds(node);
    const normalize = (rows, direction)=>{
      let entityIndex = 0;
      (Array.isArray(rows) ? rows : []).forEach((port)=>{
        if(!port) return;
        if(isSignalPort(port)){
          port.channel = 'signal';
          return;
        }
        entityIndex += 1;
        port.channel = 'entity';
        port.type = 0;
        port.name = `${direction === 'input' ? 'inPort' : 'outPort'}${entityIndex}`;
      });
    };
    normalize(node.inputs, 'input');
    normalize(node.outputs, 'output');
    return node;
  }

  function entityFlowPorts(node, direction){
    const rows = direction === 'input' ? node?.inputs : node?.outputs;
    return (Array.isArray(rows) ? rows : []).filter((port)=>port && !isSignalPort(port));
  }

  function entityPortSlots(node, direction){
    const rows = direction === 'input' ? node?.inputs : node?.outputs;
    const slots = [];
    (Array.isArray(rows) ? rows : []).forEach((port, index)=>{
      if(port && !isSignalPort(port)) slots.push(index);
    });
    return slots;
  }

  function ruleTargetsCategory(node, rule, category){
    const wanted = text(category).toLowerCase();
    const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target];
    return targets.filter(Boolean).some((target)=>{
      const normalized = typeof App.normalizeEntityTarget === 'function' ? App.normalizeEntityTarget(target) : target;
      const mode = text(normalized?.mode).toLowerCase();
      if(mode === 'otherwise') return true;
      if(mode === 'category') return text(normalized.category).toLowerCase() === wanted;
      if(mode !== 'type') return false;
      const registry = typeof App.entityModelForGraph === 'function' ? App.entityModelForGraph(node?.graph) : null;
      return text(registry?.get?.(normalized.typeId)?.category).toLowerCase() === wanted;
    });
  }

  function flowPortSlotsForCategory(node, direction, category){
    const rows = direction === 'input' ? node?.inputs : node?.outputs;
    const rules = direction === 'input' ? node?.properties?.inputRules : node?.properties?.outputRules;
    const ids = new Set();
    for(const rule of (Array.isArray(rules) ? rules : [])){
      if(!ruleTargetsCategory(node, rule, category)) continue;
      if(direction === 'input') ids.add(text(rule?.fromPortId));
      else for(const portId of (Array.isArray(rule?.toPortIds) ? rule.toPortIds : [rule?.toPortId])) ids.add(text(portId));
    }
    const slots = [];
    (Array.isArray(rows) ? rows : []).forEach((port, index)=>{
      if(port && !isSignalPort(port) && ids.has(text(port.portId))) slots.push(index);
    });
    return Array.isArray(rules) && rules.length ? slots : entityPortSlots(node, direction);
  }

  function targetCategoryForRule(rule){
    const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target];
    const categories = targets.filter(Boolean).map((target)=>{
      const normalized = typeof App.normalizeEntityTarget === 'function' ? App.normalizeEntityTarget(target) : target;
      if(text(normalized?.mode).toLowerCase() === 'category') return text(normalized.category).toLowerCase();
      if(text(normalized?.mode).toLowerCase() === 'type'){
        const registry = typeof App.entityModelForGraph === 'function' ? App.entityModelForGraph(rule?.__node?.graph) : null;
        return text(registry?.get?.(normalized.typeId)?.category).toLowerCase();
      }
      return '';
    }).filter(Boolean);
    return categories.length && categories.every((category)=>category === categories[0]) ? categories[0] : 'entity';
  }

  function ensurePortTimings(node){
    if(!node || !isObject(node.properties)) return { inputs:{}, outputs:{} };
    const model = isObject(node.properties.portTimings) ? node.properties.portTimings : {};
    model.inputs = isObject(model.inputs) ? model.inputs : {};
    model.outputs = isObject(model.outputs) ? model.outputs : {};
    ensurePortIds(node);
    entityFlowPorts(node, 'input').forEach((port, index)=>{
      const key = index === 0 ? 'processTime' : `processTime${index + 1}`;
      const fallback = Number(node.properties[key]);
      if(!isObject(model.inputs[port.portId])){
        model.inputs[port.portId] = { processTimeSec:Math.max(0, Number.isFinite(fallback) ? fallback : Number(node.properties.processTime) || 0) };
      }
      const timing = model.inputs[port.portId];
      if(!Array.isArray(timing.processStages) || !timing.processStages.length){
        timing.processStages = [{
          stageId:`${port.portId}-process-1`,
          durationSec:Math.max(0, Number(timing.processTimeSec) || 0)
        }];
      }
      timing.processTimeSec = timing.processStages.reduce((sum, stage)=>sum + Math.max(0, Number(stage?.durationSec) || 0), 0);
    });
    entityFlowPorts(node, 'output').forEach((port, index)=>{
      const key = index === 0 ? 'downTime' : `downTime${index + 1}`;
      const fallback = Number(node.properties[key]);
      if(!isObject(model.outputs[port.portId])){
        model.outputs[port.portId] = { downTimeSec:Math.max(0, Number.isFinite(fallback) ? fallback : Number(node.properties.downTime) || 0) };
      }
    });
    node.properties.portTimings = model;
    return model;
  }

  function flowPortTiming(node, direction, slotIndex){
    const rows = direction === 'input' ? node?.inputs : node?.outputs;
    const port = Array.isArray(rows) ? rows[slotIndex] : null;
    const model = ensurePortTimings(node);
    const value = direction === 'input'
      ? (Array.isArray(model.inputs?.[port?.portId]?.processStages)
        ? model.inputs[port.portId].processStages.reduce((sum, stage)=>sum + Math.max(0, Number(stage?.durationSec) || 0), 0)
        : model.inputs?.[port?.portId]?.processTimeSec)
      : model.outputs?.[port?.portId]?.downTimeSec;
    const fallback = direction === 'input' ? node?.properties?.processTime : node?.properties?.downTime;
    return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : Number(fallback) || 0);
  }

  function nextFlowPortId(node, direction){
    node.properties = isObject(node.properties) ? node.properties : {};
    const prefix = direction === 'input' ? 'in' : 'out';
    let sequence = Math.max(0, Math.round(Number(node.properties.flowPortSequence) || 0));
    const used = new Set([...(node.inputs || []), ...(node.outputs || [])].map((port)=>text(port?.portId)).filter(Boolean));
    let candidate = '';
    do{ sequence += 1; candidate = `${prefix}-flow-${sequence}`; }while(used.has(candidate));
    node.properties.flowPortSequence = sequence;
    return candidate;
  }

  function nextFlowPortName(node, direction, rule){
    const rows = direction === 'input' ? node.inputs : node.outputs;
    const count = entityFlowPorts(node, direction).length + 1;
    return `${direction === 'input' ? 'inPort' : 'outPort'}${count}`;
  }

  function createFlowPort(node, direction, rule, options){
    if(!node || !isObject(node.properties)) return null;
    const requestedId = text(options?.portId);
    const rows = direction === 'input' ? node.inputs : node.outputs;
    const existing = requestedId ? (rows || []).find((port)=>text(port?.portId) === requestedId) : null;
    if(existing) return existing;
    const name = text(options?.name) || nextFlowPortName(node, direction, rule || {});
    if(direction === 'input') node.addInput(name, 0);
    else node.addOutput(name, 0);
    const port = rows[rows.length - 1];
    port.portId = requestedId || nextFlowPortId(node, direction);
    port.channel = 'entity';
    port.type = 0;
    port.flowManaged = true;
    delete port.requiredByPreset;
    ensurePortTimings(node);
    const timings = node.properties.portTimings;
    if(direction === 'input'){
      const durationSec = Math.max(0, Number(node.properties.processTime) || 0);
      timings.inputs[port.portId] = {
        processTimeSec:durationSec,
        processStages:[{ stageId:`${port.portId}-process-1`, durationSec }]
      };
    }
    else timings.outputs[port.portId] = { downTimeSec:Math.max(0, Number(node.properties.downTime) || 0) };
    normalizeEntityPorts(node);
    return port;
  }

  function markEntityPortsManaged(node){
    [...(node?.inputs || []), ...(node?.outputs || [])].forEach((port)=>{
      if(!port || isSignalPort(port)) return;
      port.flowManaged = true;
      delete port.requiredByPreset;
    });
  }

  function syncFlowPorts(node, options){
    if(!node || !isObject(node.properties)) return { created:[], warnings:[] };
    const behavior = behaviorId(node);
    const preset = PRESETS[behavior] || PRESETS.basic;
    ensurePortIds(node);
    normalizeEntityPorts(node);
    if(preset.entity === false) return { created:[], warnings:[] };
    markEntityPortsManaged(node);
    const created = [];
    const warnings = [];
    const inputRules = Array.isArray(node.properties.inputRules) ? node.properties.inputRules : [];
    const outputRules = Array.isArray(node.properties.outputRules) ? node.properties.outputRules : [];
    if(behavior !== 'source'){
      for(const rule of inputRules){
        let portId = text(rule?.fromPortId);
        if(!portId || portIndexById(node.inputs, portId) < 0){
          const port = createFlowPort(node, 'input', rule, { portId:portId || undefined });
          if(port){ rule.fromPortId = port.portId; created.push({ direction:'input', portId:port.portId }); }
          else warnings.push(`Unable to create input port for ${text(rule?.ruleId) || 'rule'}`);
        }
      }
    }
    if(behavior !== 'sink'){
      for(const rule of outputRules){
        const requested = Array.isArray(rule?.toPortIds) && rule.toPortIds.length ? rule.toPortIds : [rule?.toPortId].filter(Boolean);
        const ids = requested.length ? requested : [''];
        const resolved = [];
        for(const value of ids){
          const portId = text(value);
          if(portId && portIndexById(node.outputs, portId) >= 0){ resolved.push(portId); continue; }
          const port = createFlowPort(node, 'output', rule, { portId:portId || undefined });
          if(port){ resolved.push(port.portId); created.push({ direction:'output', portId:port.portId }); }
          else warnings.push(`Unable to create output port for ${text(rule?.ruleId) || 'rule'}`);
        }
        rule.toPortIds = Array.from(new Set(resolved));
        rule.toPortId = rule.toPortIds[0] || null;
      }
    }
    ensurePortTimings(node);
    normalizeEntityPorts(node);
    if(options?.dirty !== false){
      node.setDirtyCanvas?.(true, true);
      node.graph?.change?.();
    }
    return { created, warnings };
  }

  function flowPortReferenced(node, direction, portId){
    const wanted = text(portId);
    if(direction === 'input') return (node.properties?.inputRules || []).some((rule)=>text(rule?.fromPortId) === wanted);
    return (node.properties?.outputRules || []).some((rule)=>{
      const ids = Array.isArray(rule?.toPortIds) ? rule.toPortIds : [rule?.toPortId];
      return ids.some((value)=>text(value) === wanted);
    });
  }

  function removeOrphanFlowPort(node, direction, portId, options){
    const rows = direction === 'input' ? node?.inputs : node?.outputs;
    const index = portIndexById(rows, portId);
    const port = index >= 0 ? rows[index] : null;
    if(!port || !port.flowManaged || flowPortReferenced(node, direction, portId)) return { removed:false, reason:'retained' };
    const links = direction === 'input' ? [port.link].filter((id)=>id != null) : (Array.isArray(port.links) ? port.links.slice() : []);
    if(links.length && options?.confirmLinked !== true) return { removed:false, reason:'linked', links };
    links.forEach((linkId)=>{ try{ node.graph?.removeLink?.(linkId); }catch(_e){} });
    if(direction === 'input') node.removeInput(index); else node.removeOutput(index);
    const timings = ensurePortTimings(node);
    if(direction === 'input') delete timings.inputs[portId]; else delete timings.outputs[portId];
    normalizeEntityPorts(node);
    node.setDirtyCanvas?.(true, true);
    return { removed:true, links };
  }

  function actionRuntimeCtor(node){
    const preset = behaviorId(node);
    const properties = node?.properties || {};
    if(hasSequenceTarget(node)) return root.SourceNode;
    if(preset === 'source') return root.SourceNode;
    if(preset === 'machine' || preset === 'inspection') return root.EquipmentNode;
    if(preset === 'router') return root.BranchNode;
    if(preset === 'split') return root.SplitNode;
    if(preset === 'merge') return root.MergeNode;
    if(preset === 'join') return root.JoinNode;
    if(preset === 'carrier_route') return text(operationConfig(node, 'carrier-transport')?.transportMode || properties?.transportMode).toLowerCase() === 'agv'
      ? root.AGVRouteNode
      : root.CarrierRouteNode;
    if(preset === 'station') return root.StationNode;
    if(preset === 'transfer') return root.TransferStationNode;
    if(preset === 'sink') return root.SinkNode;
    if(preset === 'signal') return root.SignalNode;
    if(preset === 'note') return root.NoteNode;
    return null;
  }

  function installActionRuntimeMethods(target, ctor){
    for(const name of (target._runtimeMethodNames || [])) delete target[name];
    target._runtimeMethodNames = [];
    let proto = ctor?.prototype;
    // Lifecycle methods stay behind BasicNode's dispatch layer. Every other
    // method must shadow the generic implementation: several legacy nodes use
    // helper names such as `_store` and `canAcceptWorkInput`, which otherwise
    // accidentally resolve to BasicNode helpers with different semantics.
    const blocked = new Set([
      'constructor', 'onExecute', 'onConfigure', 'onSerialize',
      'onPropertyChanged', 'onDrawForeground', 'getInspectorSchema',
      'getEntityRoots'
    ]);
    while(proto && proto !== root.LiteGraph?.LGraphNode?.prototype && proto !== Object.prototype){
      for(const name of Object.getOwnPropertyNames(proto)){
        if(blocked.has(name) || typeof proto[name] !== 'function') continue;
        const method = proto[name];
        Object.defineProperty(target, name, {
          configurable: true,
          writable: true,
          value: function(){ return method.apply(this, arguments); }
        });
        target._runtimeMethodNames.push(name);
      }
      proto = Object.getPrototypeOf(proto);
    }
  }

  class BasicNode extends root.LiteGraph.LGraphNode{
    constructor(){
      super();
      this.title = 'Basic Node';
      this.size = [260, 170];
      this.addInput('inPort1', 0);
      this.addOutput('outPort1', 0);
      ensurePortIds(this);
      this.properties = {
        basicNodeVersion: 2,
        contentCapacity: 1,
        initialContents: [],
        inputRules: [],
        outputRules: [],
        portTimings: { inputs:{}, outputs:{} },
        inputPolicy: { mode:'first', requiredPortIds:[], match:null },
        selection: 'first-available',
        stateMachine: { initialState: 'IDLE', states: ['IDLE', 'PROCESS', 'WAIT', 'DOWN'], transitions: [] },
        operations: templateOperations('basic')
      };
      this._state = 'IDLE';
      this._stateName = 'idle';
      this._until = 0;
      this._activeRoot = null;
      this._activeTarget = null;
      this._lastInputRefs = [];
      this._offer = null;
      this._processComplete = false;
      this._payload = null;
      this._currentWork = null;
      this._pendingTransfer = null;
      this._shuttleTransferSlot = null;
      this._incomingPayload = null;
      this._incomingPayloadOpensCycle = false;
      this._transferHold = false;
      this._lastInRef = null;
      this._runtimePrototype = null;
      this._runtimeConfigured = false;
      this._runtimeMethodNames = [];
      this._appliedTemplateId = 'basic';
      this._executionPlan = compileExecutionPlan(this);
      if(root.enableFlipIO) root.enableFlipIO(this);
    }

    _store(){ return typeof App.runtimeInstancesForGraph === 'function' ? App.runtimeInstancesForGraph(this.graph) : null; }
    hasEntityContents(){ return true; }

    configure(serializedNode){
      const normalizedNode = serializedNode && typeof serializedNode === 'object'
        ? {
            ...serializedNode,
            pos: normalizeSerializedVector(serializedNode.pos),
            size: normalizeSerializedVector(serializedNode.size)
          }
        : serializedNode;
      this._isConfiguring = true;
      try{
        return super.configure(normalizedNode);
      }finally{
        this._isConfiguring = false;
      }
    }

    applyTemplate(templateId, preserveTitle){
      const id = Object.prototype.hasOwnProperty.call(PRESETS, templateId) ? templateId : 'basic';
      const preset = PRESETS[id];
      const templateChanged = this._appliedTemplateId !== id;
      if(templateChanged){
        installActionRuntimeMethods(this, null);
        this._runtimePrototype = null;
        this._runtimeConfigured = false;
      }
      this.properties = commonProperties(this.properties);
      this.properties.basicNodeVersion = 2;
      if(templateChanged || !Number.isFinite(Number(this.properties.contentCapacity))) this.properties.contentCapacity = preset.contentCapacity;
      if(templateChanged) this.properties.portTimings = { inputs:{}, outputs:{} };
      if(!Array.isArray(this.properties.initialContents)) this.properties.initialContents = [];
      if(templateChanged || !Array.isArray(this.properties.inputRules)) this.properties.inputRules = [];
      if(templateChanged || !Array.isArray(this.properties.outputRules)) this.properties.outputRules = [];
      if(templateChanged || !Array.isArray(this.properties.operations)) this.properties.operations = templateOperations(id);
      if(id === 'shuttle' && !this.properties.inputRules.length){
        this.properties.inputRules = [{
          ruleId: 'shuttle-input-1',
          targets: [{ mode: 'category', category: 'work' }],
          target: { mode: 'category', category: 'work' },
          acceptWhen: { kind: 'space-available' },
          fromPortId: this.inputs?.[0]?.portId || 'in-1'
        }];
      }
      if(id === 'shuttle' && !this.properties.outputRules.length){
        this.properties.outputRules = [{
          ruleId: 'shuttle-output-1',
          targets: [{ mode: 'category', category: 'work' }],
          target: { mode: 'category', category: 'work' },
          releaseWhen: {
            kind: 'all',
            conditions: [
              { kind: 'process-complete' },
              { kind: 'shuttle-group-idle', groupId: text(operationByKind(this, 'synchronized-step')?.groupId) || 'shuttle-1' },
              { kind: 'downstream-ready' }
            ]
          },
          toPortIds: [this.outputs?.[0]?.portId || 'out-1'],
          toPortId: this.outputs?.[0]?.portId || 'out-1'
        }];
      }
      if(!preserveTitle) this.title = preset.title;
      this._ensureTemplatePorts(id, preset.processTime, preset.downTime);
      ensurePresetFlowRules(this, { force: templateChanged, templateId:id });
      syncFlowPorts(this, { dirty:false });
      this._appliedTemplateId = id;
      if(id === 'shuttle') this._applyShuttleStateColor();
      if(id === 'source' && this.graph){
        App.ensureSourceSequence?.(this, { createDefault:true });
        if(typeof this._parseSeq === 'function') this._parseSeq();
      }
      this._configureActionRuntime(null);
      return this;
    }

    _ensureTemplatePorts(templateId, processTime, downTime){
      if(this._runtimePrototype){ ensurePortIds(this); normalizeEntityPorts(this); return; }
      const id = templateId || behaviorId(this);
      const names = defaultPortNames(id);
      while(this.inputs.length < names.inputs.length) this.addInput(names.inputs[this.inputs.length], 0);
      while(this.outputs.length < names.outputs.length) this.addOutput(names.outputs[this.outputs.length], 0);
      while(this.inputs.length > names.inputs.length) this.removeInput(this.inputs.length - 1);
      while(this.outputs.length > names.outputs.length) this.removeOutput(this.outputs.length - 1);
      this.inputs.forEach((port, index)=>{ port.name = names.inputs[index]; });
      this.outputs.forEach((port, index)=>{ port.name = names.outputs[index]; });
      ensurePortIds(this);
      normalizeEntityPorts(this);
      markEntityPortsManaged(this);
      ensurePortTimings(this);
      for(const [portId, timing] of Object.entries(this.properties.portTimings.inputs || {})){
        const durationSec = Math.max(0, Number(processTime) || 0);
        timing.processStages = [{ stageId:`${portId}-process-1`, durationSec }];
        timing.processTimeSec = durationSec;
      }
      for(const timing of Object.values(this.properties.portTimings.outputs || {})) timing.downTimeSec = Math.max(0, Number(downTime) || 0);
    }

    _configureActionRuntime(serializedNode){
      const ctor = actionRuntimeCtor(this);
      if(!ctor){
        installActionRuntimeMethods(this, null);
        this._runtimePrototype = null;
        this._runtimeConfigured = false;
        return false;
      }
      let temp = null;
      try{ temp = new ctor(); }catch(_e){ temp = null; }
      if(temp){
        if(isObject(temp.properties)){
          this.properties = {
            ...clone(temp.properties, {}),
            ...(this.properties || {})
          };
        }
        for(const key of Object.keys(temp)){
          if(['id', 'pos', 'size', 'inputs', 'outputs', 'properties', 'graph', 'title', 'type'].includes(key)) continue;
          if(typeof temp[key] === 'function') continue;
          this[key] = temp[key];
        }
        // LiteGraph omits constructor-default ports from several older graph
        // payloads. After every persisted node became factory/basic, the Basic
        // constructor's 1-in/1-out defaults would otherwise leak into Source,
        // Sink and other presets. Materialize the selected runtime preset's
        // ports only for the sides that were not explicitly serialized.
        if(!serializedNode || !Array.isArray(serializedNode.inputs)){
          this.inputs = clone(temp.inputs, []);
        }
        if(!serializedNode || !Array.isArray(serializedNode.outputs)){
          this.outputs = clone(temp.outputs, []);
        }
      }
      const activeOperation = operationRows(this).find((operation)=>OPERATION_BEHAVIOR[text(operation?.kind).toLowerCase()] === behaviorId(this));
      if(isObject(activeOperation?.config)) Object.assign(this.properties, clone(activeOperation.config, {}));
      if(behaviorId(this) === 'carrier_route'){
        const registry = typeof App.entityModelForGraph === 'function' ? App.entityModelForGraph(this.graph) : null;
        const carrierRecipe = (Array.isArray(this.properties?.initialContents) ? this.properties.initialContents : [])
          .find((recipe)=> text(registry?.get?.(recipe?.typeId)?.category).toLowerCase() === 'carrier');
        const carrierType = carrierRecipe ? registry?.get?.(carrierRecipe.typeId) : null;
        if(carrierType){
          // Carrier Route still executes through the proven transport action
          // implementation. Feed its transient bootstrap fields from the
          // canonical Initial Contents recipe; they are intentionally removed
          // again by commonProperties() when the graph is serialized.
          this.properties.initialCarrier = text(carrierType.name) || text(carrierType.typeId);
          this.properties.initialCarrierTypeId = text(carrierType.typeId);
        }
      }
      if(behaviorId(this) === 'merge' && this.properties?.inputPolicy?.match){
        const match = this.properties.inputPolicy.match;
        this.properties.strictIdMatch = text(match.path).toLowerCase() === 'instanceid';
      }
      ensurePortIds(this);
      ensurePortTimings(this);
      const inputSlots = entityPortSlots(this, 'input');
      const outputSlots = entityPortSlots(this, 'output');
      this.properties.processTime = inputSlots.length ? flowPortTiming(this, 'input', inputSlots[0]) : 0;
      this.properties.downTime = outputSlots.length ? flowPortTiming(this, 'output', outputSlots[0]) : 0;
      installActionRuntimeMethods(this, ctor);
      this._runtimePrototype = ctor.prototype;
      // Materialize preset rules while the temporary runtime ports still carry
      // their constructor hints. Runtime execution that follows is exclusively
      // portId/Rule driven; visible entity names are normalized immediately.
      ensurePortIds(this);
      ensurePresetFlowRules(this);
      ensurePresetRuleCoverage(this);
      normalizeEntityPorts(this);
      if(typeof ctor.prototype.onConfigure === 'function'){
        try{ ctor.prototype.onConfigure.call(this, serializedNode); }catch(err){ console.error(err); }
      }
      this._runtimeConfigured = true;
      ensurePortIds(this);
      ensurePresetFlowRules(this);
      ensurePresetRuleCoverage(this);
      markEntityPortsManaged(this);
      syncFlowPorts(this, { dirty:false });
      this._executionPlan = compileExecutionPlan(this);
      return true;
    }

    onConfigure(serializedNode){
      const legacyTemplate = text(this.properties?.presetId) || (hasSequenceTarget(this) ? 'source' : 'basic');
      this._appliedTemplateId = upgradeNodeProperties(this, legacyTemplate);
      if(this._configureActionRuntime(serializedNode)){
        restoreSerializedGeometry(this, serializedNode);
        return;
      }
      this._migrateLegacyShuttleGroupSetting();
      this._state = this.properties?.stateMachine?.initialState || 'IDLE';
      this._stateName = String(this._state).toLowerCase();
      restoreSerializedGeometry(this, serializedNode);
    }

    onSerialize(serialized){
      this._migrateLegacyShuttleGroupSetting();
      ensurePresetFlowRules(this);
      syncFlowPorts(this, { dirty:false });
      serialized.type = 'factory/basic';
      ensurePortIds(this);
      const serializePorts = (rows)=>clone(rows, []).map((port)=>{
        delete port.requiredByPreset;
        if(!isSignalPort(port)) port.flowManaged = true;
        return port;
      });
      serialized.inputs = serializePorts(this.inputs);
      serialized.outputs = serializePorts(this.outputs);
      serialized.properties = commonProperties(this.properties);
    }

    onPropertyChanged(name){
      if(this._isConfiguring) return;
      if(['inputRules','outputRules','portTimings','inputPolicy','selection','stateMachine','operations'].includes(name)){
        this._executionPlan = compileExecutionPlan(this);
      }
      if(name === 'outputRules' || name === 'operations'){
        const wantsSequenceRuntime = hasSequenceTarget(this);
        const hasSequenceRuntime = this._runtimePrototype === root.SourceNode?.prototype;
        if(name === 'operations' || wantsSequenceRuntime !== hasSequenceRuntime){
          installActionRuntimeMethods(this, null);
          this._runtimePrototype = null;
          this._configureActionRuntime({ inputs:this.inputs || [], outputs:this.outputs || [] });
        }else if(wantsSequenceRuntime && typeof this._parseSeq === 'function'){
          this._parseSeq();
        }
      }
      if(this._runtimePrototype && typeof this._runtimePrototype.onPropertyChanged === 'function'){
        return this._runtimePrototype.onPropertyChanged.call(this, name);
      }
      if(name === 'contentCapacity') this.properties.contentCapacity = Math.max(0, Math.round(Number(this.properties.contentCapacity) || 0));
    }

    getInspectorSchema(){
      return { contentCapacity: { type: 'number', label: 'Node capacity' } };
    }

    getEntityRoots(){
      if(this._runtimePrototype && typeof this._runtimePrototype.getEntityRoots === 'function'){
        return this._runtimePrototype.getEntityRoots.call(this);
      }
      return this._store()?.rootsAt(this.id) || [];
    }

    getCurrentContents(options){
      if(typeof App.currentContentsForNode === 'function') return App.currentContentsForNode(this, options);
      const store = this._store();
      if(!store) return { summary: [], instances: [] };
      const includeInstances = options?.includeInstances !== false;
      return { summary: store.summaryAt(this.id), instances: includeInstances ? store.treesAt(this.id) : [] };
    }

    _flowTiming(direction, slotIndex){
      const override = this._activeTimingOverride;
      const value = direction === 'input' ? override?.processTimeSec : override?.downTimeSec;
      return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : flowPortTiming(this, direction, slotIndex);
    }

    _timingOverrideFor(value){
      const descriptor = this._runtimeValueDescriptor(value);
      for(const operation of operationRows(this)){
        const rows = operation?.config?.timingByTypeId;
        if(!isObject(rows)) continue;
        const matched = rows[descriptor.typeId] || Object.entries(rows).find(([key])=>key.toLowerCase() === descriptor.typeName.toLowerCase())?.[1];
        if(isObject(matched)) return matched;
      }
      return null;
    }

    _selectFlowInputCandidate(){
      const ruleSlots = (this.properties?.inputRules || []).map((rule)=>portIndexById(this.inputs, rule?.fromPortId)).filter((slot)=>slot >= 0);
      const slots = [...new Set([...ruleSlots, ...(this.inputs || []).map((_port, slot)=>slot)])].filter((slot)=>!isSignalPort(this.inputs?.[slot]));
      this._lastInRefs = Array.isArray(this._lastInRefs) ? this._lastInRefs : [];
      for(const slot of slots){
        const input = this.inputs?.[slot];
        if(!input || input.link == null) continue;
        const work = this.getInputData(slot);
        if(!work){ this._lastInRefs[slot] = null; continue; }
        if(typeof work !== 'object' || this._lastInRefs[slot] === work) continue;
        if(!this._runtimeSelectInputRule(work, slot)) continue;
        return { work, slot };
      }
      return null;
    }

    _acceptIncoming(slotIndex){
      const input = this.inputs?.[slotIndex];
      if(!input || input.link == null) return null;
      const value = this.getInputData(slotIndex);
      if(!value || this._lastInputRefs[slotIndex] === value) return null;
      const store = this._store();
      const instance = store?.get(value);
      if(!store || !instance) return null;
      const inputRules = Array.isArray(this.properties.inputRules) && this.properties.inputRules.length
        ? this.properties.inputRules
        : [{ ruleId: 'default-input', target: { mode: 'category', category: store.typeOf(instance)?.category || 'work' }, acceptWhen: { kind: 'space-available' } }];
      const selected = App.selectEntityRule(store, this, inputRules, { incomingRoot: instance, nowMs: nowMs() }, 'input');
      if(!selected) return null;
      this._lastInputRefs[slotIndex] = value;
      store.moveRoot(instance, this.id);
      instance.attributes.__arrivedAtMs = nowMs();
      this._activeRoot = instance;
      this._activeTarget = selected.instance;
      this._activeInputSlot = slotIndex;
      return instance;
    }

    canAcceptEntityInput(slotIndex, value){
      if(this._runtimePrototype && typeof this._runtimePrototype.canAcceptEntityInput === 'function'){
        return this._runtimePrototype.canAcceptEntityInput.call(this, slotIndex, value);
      }
      if(hasSequenceTarget(this) || behaviorId(this) === 'source') return false;
      const capacity = Math.max(0, Number(this.properties?.contentCapacity) || 0);
      const store = this._store();
      const roots = store?.rootsAt(this.id) || [];
      if(roots.length >= capacity) return false;
      const instance = store?.get(value);
      if(!instance) return false;
      const rules = Array.isArray(this.properties.inputRules) && this.properties.inputRules.length
        ? this.properties.inputRules
        : [{ ruleId: 'default-input', target: { mode: 'category', category: store.typeOf(instance)?.category || 'work' }, acceptWhen: { kind: 'space-available' } }];
      return !!App.selectEntityRule(store, this, rules, { incomingRoot: instance, nowMs: nowMs() }, 'input');
    }

    _runtimeValueDescriptor(value){
      const candidate = value && typeof value === 'object' ? value : null;
      const explicitCategory = text(candidate?.__flowCategory || candidate?.category).toLowerCase();
      const typeId = text(candidate?.typeId);
      const typeName = text(candidate?.type || candidate?.typeName || candidate?.name);
      let category = explicitCategory;
      let resolvedTypeId = typeId;
      const registry = typeof App.entityModelForGraph === 'function' ? App.entityModelForGraph(this.graph) : null;
      const types = registry?.list?.() || [];
      if(!resolvedTypeId && typeName){
        const row = types.find((entry)=>text(entry?.name).toLowerCase() === typeName.toLowerCase());
        if(row){
          resolvedTypeId = text(row.typeId);
          if(!category) category = text(row.category).toLowerCase();
        }
      }
      if(!category && resolvedTypeId){
        const row = types.find((entry)=>text(entry?.typeId) === resolvedTypeId);
        if(row) category = text(row.category).toLowerCase();
      }
      if(!category){
        const kind = text(candidate?.entityKind || candidate?.kind || candidate?.subtype).toLowerCase();
        if(/carrier|agv/.test(kind) || candidate?.carrierId != null || Array.isArray(candidate?.pallets) || Array.isArray(candidate?.cargo)) category = 'carrier';
        else if(/container|pallet|box|tray/.test(kind) || candidate?.palletId != null || Array.isArray(candidate?.works)) category = 'container';
      }
      if(!category) category = 'work';
      return { category, typeId:resolvedTypeId, typeName };
    }

    _acknowledgeAcceptedInputs(){
      if(!this.graph || !Array.isArray(this.inputs)) return;
      for(let slot = 0; slot < this.inputs.length; slot += 1){
        const input = this.inputs[slot];
        if(!input || input.link == null || isSignalPort(input)) continue;
        const link = this.graph.links?.[input.link];
        const work = link?.data;
        if(!link || !work || typeof work !== 'object') continue;
        const accepted = this._lastInRef === work
          || this._payload === work
          || this._currentWork === work
          || this._activeRoot === work
          || this._activeTarget === work
          || this._incomingPayload === work
          || (Array.isArray(this._lastInRefs) && this._lastInRefs[slot] === work)
          || (Array.isArray(this._worksBySlot) && this._worksBySlot.includes(work));
        if(!accepted) continue;
        const origin = this.graph.getNodeById?.(link.origin_id);
        origin?.acknowledgeEntityOutput?.(work, this.id, link.origin_slot);
      }
    }

    _notifyReadyEntityUpstreams(){
      if(!this.graph || this._state !== 'IDLE' || !Array.isArray(this.inputs)) return;
      if(this._payload || this._activeRoot || this._offer || this._pendingTransfer || this._incomingPayload) return;
      for(const input of this.inputs){
        if(!input || input.link == null || isSignalPort(input)) continue;
        const link = this.graph.links?.[input.link];
        const origin = link && this.graph.getNodeById?.(link.origin_id);
        if(!origin || typeof origin.acknowledgeEntityOutput !== 'function') continue;
        if(!this.graph.__dirtyNodeIds) this.graph.__dirtyNodeIds = new Set();
        this.graph.__dirtyNodeIds.add(origin.id);
      }
    }

    _runtimeTargetMatches(value, target){
      const normalized = typeof App.normalizeEntityTarget === 'function' ? App.normalizeEntityTarget(target) : target;
      const descriptor = this._runtimeValueDescriptor(value);
      const mode = text(normalized?.mode).toLowerCase();
      if(mode === 'otherwise') return true;
      if(mode === 'sequence') return hasSequenceTarget(this);
      if(mode === 'category') return descriptor.category === text(normalized?.category).toLowerCase();
      if(mode === 'type'){
        const wanted = text(normalized?.typeId);
        return !!wanted && (descriptor.typeId === wanted || descriptor.typeName.toLowerCase() === wanted.toLowerCase());
      }
      return false;
    }

    _runtimeRuleTargetMatches(value, rule){
      const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target];
      return targets.filter(Boolean).some((target)=>this._runtimeTargetMatches(value, target));
    }

    _runtimeRuleOutputSlots(rule){
      const ids = this._ruleOutputPortIds(rule);
      const slots = ids.map((portId)=>portIndexById(this.outputs, portId)).filter((slot)=>slot >= 0);
      if(!slots.length){
        const entitySlots = typeof App.basicEntityPortSlots === 'function'
          ? App.basicEntityPortSlots(this, 'output')
          : [];
        if(entitySlots.length) slots.push(entitySlots[0]);
      }
      return Array.from(new Set(slots));
    }

    _runtimePortReady(slotIndex, value){
      const output = this.outputs?.[slotIndex];
      if(!output || !Array.isArray(output.links) || !output.links.length || !this.graph) return false;
      let hasTarget = false;
      for(const linkId of output.links){
        const link = this.graph.links?.[linkId];
        const target = link && this.graph.getNodeById?.(link.target_id);
        if(!target) continue;
        hasTarget = true;
        if(typeof target.canAcceptWorkInput === 'function'){
          if(!target.canAcceptWorkInput(link.target_slot, value)) return false;
        }else if(typeof target.canAcceptEntityInput === 'function'){
          if(!target.canAcceptEntityInput(link.target_slot, value)) return false;
        }else if(typeof target._state !== 'undefined' && target._state !== 'IDLE'){
          return false;
        }
      }
      return hasTarget;
    }

    _runtimeReadAttribute(value, path){
      const parts = text(path).split('.').filter(Boolean);
      let current = value?.attributes || value;
      for(const part of parts){
        if(current == null || typeof current !== 'object') return undefined;
        current = current[part];
      }
      return current;
    }

    _runtimeEvaluateCondition(condition, value, context){
      const spec = condition && typeof condition === 'object' ? condition : { kind:condition };
      const kind = text(spec?.kind).toLowerCase().replace(/[ _]+/g, '-');
      const children = Array.isArray(spec?.conditions) ? spec.conditions : (Array.isArray(spec?.children) ? spec.children : []);
      if(kind === 'all') return children.every((child)=>this._runtimeEvaluateCondition(child, value, context));
      if(kind === 'any') return children.some((child)=>this._runtimeEvaluateCondition(child, value, context));
      if(kind === 'not') return !this._runtimeEvaluateCondition(spec.condition || spec.child, value, context);
      if(kind === 'always') return true;
      if(kind === 'available') return !!value;
      if(kind === 'process-complete') return context?.processComplete === true || this._state === 'WAIT';
      if(kind === 'downstream-ready'){
        const slots = Array.isArray(context?.slots) ? context.slots : [];
        return slots.some((slot)=>this._runtimePortReady(slot, value));
      }
      if(kind === 'space-available' || kind === 'not-full'){
        const capacity = Math.max(0, Number(this.properties?.contentCapacity) || 0);
        const occupied = this._payload || this._activeRoot || this._offer ? 1 : 0;
        return capacity > occupied;
      }
      if(kind === 'empty'){
        const childCount = Array.isArray(value?.childIds) ? value.childIds.length
          : Array.isArray(value?.children) ? value.children.length
            : Array.isArray(value?.works) ? value.works.length : 0;
        return childCount === 0;
      }
      if(kind === 'full'){
        const childCount = Array.isArray(value?.childIds) ? value.childIds.length
          : Array.isArray(value?.children) ? value.children.length
            : Array.isArray(value?.works) ? value.works.length : 0;
        const capacity = Math.max(0, Number(value?.capacity ?? this.properties?.contentCapacity) || 0);
        return capacity > 0 && childCount >= capacity;
      }
      if(kind === 'count-reached'){
        const count = Array.isArray(value?.childIds) ? value.childIds.length
          : Array.isArray(value?.children) ? value.children.length : (value ? 1 : 0);
        return count >= Math.max(0, Number(spec.count) || 0);
      }
      if(kind === 'time-elapsed'){
        const arrivedAt = Number(value?.attributes?.__arrivedAtMs ?? value?.__arrivedAtMs ?? context?.arrivedAtMs);
        return Number.isFinite(arrivedAt) && (nowMs() - arrivedAt) >= Math.max(0, Number(spec.seconds) || 0) * 1000;
      }
      if(kind === 'attribute-condition'){
        const actual = this._runtimeReadAttribute(value, spec.path);
        const expected = spec.value;
        const operator = text(spec.operator || 'eq').toLowerCase();
        if(operator === 'ne' || operator === '!=') return actual !== expected;
        if(operator === 'gt' || operator === '>') return Number(actual) > Number(expected);
        if(operator === 'gte' || operator === '>=') return Number(actual) >= Number(expected);
        if(operator === 'lt' || operator === '<') return Number(actual) < Number(expected);
        if(operator === 'lte' || operator === '<=') return Number(actual) <= Number(expected);
        if(operator === 'contains') return String(actual ?? '').includes(String(expected ?? ''));
        return actual === expected;
      }
      if(kind === 'shuttle-group-idle' && typeof this._evaluateShuttleOutputCondition === 'function'){
        return this._evaluateShuttleOutputCondition(spec, context || {});
      }
      return false;
    }

    _runtimeSelectInputRule(value, slotIndex){
      const rules = Array.isArray(this.properties?.inputRules) ? this.properties.inputRules : [];
      if(!rules.length) return { rule:null };
      const input = this.inputs?.[slotIndex];
      const candidate = value || { __flowCategory:'work' };
      let otherwise = null;
      for(const rule of rules){
        if(rule?.fromPortId && input?.portId && text(rule.fromPortId) !== text(input.portId)) continue;
        const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target];
        if(targets.some((target)=>text(target?.mode).toLowerCase() === 'otherwise')){ otherwise = rule; continue; }
        if(!this._runtimeRuleTargetMatches(candidate, rule)) continue;
        if(this._runtimeEvaluateCondition(rule.acceptWhen || { kind:'always' }, candidate, { slotIndex })){
          this._activeTimingOverride = this._timingOverrideFor(candidate);
          return { rule };
        }
      }
      if(otherwise && this._runtimeEvaluateCondition(otherwise.acceptWhen || { kind:'always' }, candidate, { slotIndex })){
        this._activeTimingOverride = this._timingOverrideFor(candidate);
        return { rule:otherwise };
      }
      return null;
    }

    _runtimeSelectOutputRule(value, context){
      const rules = Array.isArray(this.properties?.outputRules) ? this.properties.outputRules : [];
      if(!rules.length){
        const slots = typeof App.basicEntityPortSlots === 'function'
          ? App.basicEntityPortSlots(this, 'output')
          : (this.outputs || []).map((port, slot)=>({ port, slot }))
            .filter(({ port })=>port?.channel !== 'signal')
            .map(({ slot })=>slot);
        return slots.length ? { rule:null, slots, slot:slots[0] } : null;
      }
      let otherwise = null;
      const evaluate = (rule)=>{
        const slots = this._runtimeRuleOutputSlots(rule);
        const ctx = { ...(context || {}), slots };
        if(!this._runtimeEvaluateCondition(rule?.releaseWhen || { kind:'available' }, value, ctx)) return null;
        const readySlot = slots.find((slot)=>this._runtimePortReady(slot, value));
        return { rule, slots, slot:Number.isInteger(readySlot) ? readySlot : (slots[0] ?? -1) };
      };
      for(const rule of rules){
        const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target];
        if(targets.some((target)=>text(target?.mode).toLowerCase() === 'otherwise')){ otherwise = rule; continue; }
        if(!this._runtimeRuleTargetMatches(value, rule)) continue;
        const selected = evaluate(rule);
        if(selected) return selected;
      }
      return otherwise ? evaluate(otherwise) : null;
    }

    _canAcceptRuntimePayload(slotIndex, payload){
      if(!this._runtimePrototype) return null;
      if(typeof this._state !== 'undefined' && this._state !== 'IDLE') return false;
      if(this._payload || this._activeRoot || this._offer) return false;
      const currentInput = typeof this.getInputData === 'function' ? this.getInputData(slotIndex) : null;
      return !currentInput || currentInput === payload;
    }

    canAcceptWorkInput(slotIndex, work){
      if(hasSequenceTarget(this)) return false;
      if((this._executionPlan?.behavior || behaviorId(this)) === 'shuttle'){
        if(!this.inputs || slotIndex < 0 || slotIndex >= this.inputs.length) return false;
        return this._state === 'IDLE'
          && !this._payload
          && !this._pendingTransfer
          && !this._incomingPayload;
      }
      const runtime = this._canAcceptRuntimePayload(slotIndex, work);
      if(runtime === null) return this.canAcceptEntityInput(slotIndex, work);
      if(!runtime) return false;
      return !!this._runtimeSelectInputRule(work, slotIndex);
    }

    _shuttleGroupId(){
      const findGroupId = (condition)=>{
        if(!condition || typeof condition !== 'object') return '';
        const kind = text(condition.kind).toLowerCase().replace(/[ _-]+/g, '-');
        if(kind === 'shuttle-group-idle') return text(condition.groupId);
        if(kind === 'all' || kind === 'any'){
          const children = Array.isArray(condition.conditions) ? condition.conditions : (Array.isArray(condition.children) ? condition.children : []);
          for(const child of children){
            const found = findGroupId(child);
            if(found) return found;
          }
        }
        if(kind === 'not') return findGroupId(condition.condition || condition.child);
        return '';
      };
      for(const rule of (Array.isArray(this.properties?.outputRules) ? this.properties.outputRules : [])){
        const found = findGroupId(rule?.releaseWhen);
        if(found) return found;
      }
      return text(operationByKind(this, 'synchronized-step')?.groupId);
    }

    _migrateLegacyShuttleGroupSetting(){
      if(behaviorId(this) !== 'shuttle') return;
      const shuttle = operationByKind(this, 'synchronized-step');
      const legacyGroupId = text(shuttle?.groupId) || 'shuttle-1';
      const rules = Array.isArray(this.properties?.outputRules) ? this.properties.outputRules : [];
      const visit = (condition)=>{
        if(!condition || typeof condition !== 'object') return false;
        const kind = text(condition.kind).toLowerCase().replace(/[ _-]+/g, '-');
        if(kind === 'shuttle-group-idle'){
          if(!text(condition.groupId)) condition.groupId = legacyGroupId;
          return true;
        }
        const children = kind === 'all' || kind === 'any'
          ? (Array.isArray(condition.conditions) ? condition.conditions : (Array.isArray(condition.children) ? condition.children : []))
          : [];
        let found = children.some((child)=> visit(child));
        if(kind === 'not') found = visit(condition.condition || condition.child) || found;
        return found;
      };
      for(const rule of rules){
        if(visit(rule?.releaseWhen)) continue;
        const groupCondition = { kind: 'shuttle-group-idle', groupId: legacyGroupId };
        const release = rule?.releaseWhen;
        if(release && typeof release === 'object'){
          const releaseKind = text(release.kind).toLowerCase().replace(/[ _-]+/g, '-');
          if(releaseKind === 'all'){
            const conditions = Array.isArray(release.conditions)
              ? release.conditions
              : (Array.isArray(release.children) ? release.children : []);
            release.conditions = [...conditions, groupCondition];
            delete release.children;
          }else{
            rule.releaseWhen = { kind: 'all', conditions: [release, groupCondition] };
          }
        }else{
          rule.releaseWhen = groupCondition;
        }
      }
    }

    _shuttleGroupNodes(){
      const graph = this.graph;
      if(!graph || !Array.isArray(graph._nodes)) return [this];
      const groupId = this._shuttleGroupId();
      if(!groupId) return [this];
      const peers = graph._nodes.filter((node)=> node instanceof BasicNode
        && behaviorId(node) === 'shuttle'
        && node._shuttleGroupId() === groupId);
      return peers.length ? peers : [this];
    }

    _markShuttleGroupDirty(){
      if(!this.graph) return;
      if(!this.graph.__dirtyNodeIds) this.graph.__dirtyNodeIds = new Set();
      for(const node of this._shuttleGroupNodes()){
        if(node && typeof node.id !== 'undefined') this.graph.__dirtyNodeIds.add(node.id);
      }
      this.graph.__outputDirty = true;
    }

    _shuttleGroupTiming(now){
      const graph = this.graph;
      if(!graph) return { cycleOpen: false, lastObservedAt: Number(now) || 0 };
      if(!(graph.__factSimShuttleGroupTiming instanceof Map)){
        graph.__factSimShuttleGroupTiming = new Map();
      }
      const groupId = this._shuttleGroupId() || `node-${this.id}`;
      let timing = graph.__factSimShuttleGroupTiming.get(groupId);
      const current = Number(now) || 0;
      if(!timing || (Number.isFinite(timing.lastObservedAt) && current + 0.001 < timing.lastObservedAt)){
        timing = { cycleOpen: false, lastTransferAt: NaN, lastObservedAt: current };
        graph.__factSimShuttleGroupTiming.set(groupId, timing);
      }
      if(typeof timing.cycleOpen !== 'boolean') timing.cycleOpen = Number.isFinite(timing.nextTransferAt);
      delete timing.nextTransferAt;
      timing.lastObservedAt = current;
      return timing;
    }

    _shuttleGroupIsEmpty(){
      return this._shuttleGroupNodes().every((node)=> node
        && !node._payload
        && !node._pendingTransfer
        && !node._incomingPayload);
    }

    _openShuttleGroupCycle(now){
      const timing = this._shuttleGroupTiming(now);
      if(!timing.cycleOpen){
        timing.cycleOpen = true;
      }
      return timing;
    }

    _closeShuttleGroupCycle(now){
      const timing = this._shuttleGroupTiming(now);
      timing.cycleOpen = false;
      return timing;
    }

    _shuttleGroupProcessCompleteAt(){
      let completeAt = NaN;
      for(const node of this._shuttleGroupNodes()){
        if(!node?._payload || node._state !== 'PROCESS') continue;
        const until = Number(node._until);
        if(!Number.isFinite(until)) continue;
        completeAt = Number.isFinite(completeAt) ? Math.max(completeAt, until) : until;
      }
      return completeAt;
    }

    _closeShuttleGroupCycleIfEmpty(now){
      if(!this._shuttleGroupIsEmpty()) return;
      const timing = this._closeShuttleGroupCycle(now);
      timing.lastTransferAt = NaN;
    }

    _shuttleInputIsExternal(slotIndex){
      const input = this.inputs?.[Number.isInteger(slotIndex) ? slotIndex : 0];
      const link = input?.link != null ? this.graph?.links?.[input.link] : null;
      const origin = link && this.graph?.getNodeById?.(link.origin_id);
      return !!origin && !this._isSameShuttleGroup(origin);
    }

    _shuttleRuleTargetMatches(rule){
      const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target || {}];
      return targets.some((target)=>{
        const mode = text(target?.mode).toLowerCase();
        if(!mode || mode === 'otherwise') return true;
        if(mode === 'category') return text(target.category).toLowerCase() === 'work';
        if(mode === 'type'){
          const wanted = text(target.typeId);
          const payloadTypeId = text(this._payload?.typeId);
          if(payloadTypeId) return payloadTypeId === wanted;
          const registry = typeof App.entityModelForGraph === 'function' ? App.entityModelForGraph(this.graph) : null;
          const type = registry?.get?.(wanted);
          return !!type && text(type.name) === text(this._payload?.type);
        }
        return false;
      });
    }

    _evaluateShuttleOutputCondition(condition, context){
      const spec = isObject(condition) ? condition : { kind: condition };
      const kind = text(spec.kind).toLowerCase().replace(/[ _-]+/g, '-') || 'available';
      const ctx = isObject(context) ? context : {};
      if(kind === 'all' || kind === 'any'){
        const rows = Array.isArray(spec.conditions) ? spec.conditions : (Array.isArray(spec.children) ? spec.children : []);
        return kind === 'all'
          ? rows.length > 0 && rows.every((entry)=>this._evaluateShuttleOutputCondition(entry, ctx))
          : rows.some((entry)=>this._evaluateShuttleOutputCondition(entry, ctx));
      }
      if(kind === 'not') return !this._evaluateShuttleOutputCondition(spec.condition || spec.child, ctx);
      if(kind === 'available') return !!this._payload;
      if(kind === 'process-complete') return this._state === 'WAIT';
      if(kind === 'shuttle-group-idle') return !!ctx.groupIdle;
      if(kind === 'downstream-ready') return ctx.downstreamReady !== false;
      if(typeof App.evaluateEntityCondition !== 'function') return false;
      const store = this._store();
      const instance = store?.get?.(this._payload) || null;
      return !!(store && App.evaluateEntityCondition(store, this, instance, spec, {
        nowMs: nowMs(),
        processComplete: this._state === 'WAIT',
        shuttleGroupIdle: !!ctx.groupIdle,
        downstreamReady: ctx.downstreamReady !== false
      }));
    }

    _ruleOutputPortIds(rule){
      const values = Array.isArray(rule?.toPortIds) && rule.toPortIds.length ? rule.toPortIds : [rule?.toPortId];
      return [...new Set(values.map((value)=>text(value)).filter(Boolean))];
    }

    _selectShuttleOutputRule(context){
      const rules = Array.isArray(this.properties?.outputRules) && this.properties.outputRules.length
        ? this.properties.outputRules
        : [{
            ruleId: 'default-shuttle-output',
            targets: [{ mode: 'category', category: 'work' }],
            target: { mode: 'category', category: 'work' },
            releaseWhen: {
              kind: 'all',
              conditions: [
                { kind: 'process-complete' },
                { kind: 'shuttle-group-idle', groupId: this._shuttleGroupId() || 'shuttle-1' },
                { kind: 'downstream-ready' }
              ]
            },
            toPortIds: [this.outputs?.[0]?.portId || 'out-1'],
            toPortId: this.outputs?.[0]?.portId || 'out-1'
          }];
      for(const rule of rules){
        if(!this._shuttleRuleTargetMatches(rule)) continue;
        const slots = this._ruleOutputPortIds(rule)
          .map((portId)=>portIndexById(this.outputs, portId))
          .filter((slot)=>slot >= 0);
        if(!slots.length && this.outputs?.length) slots.push(0);
        const readySlot = slots.find((slot)=>this._shuttleDownstreamReady(context?.vacatingNodeIds, slot));
        const resolvedContext = { ...context, downstreamReady: Number.isInteger(readySlot) };
        if(this._evaluateShuttleOutputCondition(rule?.releaseWhen, resolvedContext)){
          return { rule, slot:Number.isInteger(readySlot) ? readySlot : (slots[0] ?? -1), downstreamReady:Number.isInteger(readySlot) };
        }
      }
      return null;
    }

    _applyShuttleStateColor(){
      switch(this._state){
        case 'PROCESS': this.color = '#2ecc71'; this.bgcolor = '#e8f8f2'; break;
        case 'WAIT': this.color = '#f39c12'; this.bgcolor = '#fff6e6'; break;
        case 'TRANSFER': this.color = '#3498db'; this.bgcolor = '#e8f1fb'; break;
        default: this.color = '#f1c40f'; this.bgcolor = '#fff9db'; break;
      }
      if(typeof root.applyNodeStateTheme === 'function'){
        root.applyNodeStateTheme(this, this._state === 'TRANSFER' ? 'DOWN' : this._state);
      }
    }

    _setShuttleWaitIcon(active){
      try{
        if(!root.WorkLinkAnimator || !this.graph) return;
        const output = this.outputs?.[0];
        if(!output || !Array.isArray(output.links) || !output.links.length){
          if(!active) this._waitIconLinks = null;
          return;
        }
        const payload = this._payload || this._currentWork || this._pendingTransfer || null;
        const info = payload ? { id: payload.id, t: payload.type, entity: payload } : null;
        if(active){
          if(this._waitIconLinks) return;
          this._waitIconLinks = output.links.slice();
          this._waitIconLinks.forEach((linkId)=> root.WorkLinkAnimator.showPortIcon(this.graph, linkId, 'work', info));
        }else if(this._waitIconLinks){
          this._waitIconLinks.forEach((linkId)=> root.WorkLinkAnimator.hidePortIcon(this.graph, linkId));
          this._waitIconLinks = null;
        }
      }catch(_e){}
    }

    _setShuttleState(next){
      if(this._state === next) return;
      const previous = this._state;
      this._state = next;
      this._stateName = next === 'TRANSFER' ? 'down' : String(next).toLowerCase();
      if(previous !== 'WAIT' && next === 'WAIT') this._setShuttleWaitIcon(true);
      if(previous === 'WAIT' && next !== 'WAIT') this._setShuttleWaitIcon(false);
      this._applyShuttleStateColor();
      this._markShuttleGroupDirty();
    }

    _hasShuttleDownstreamLinks(slot){
      if(Number.isInteger(slot)){
        const output = this.outputs?.[slot];
        return !!(output && Array.isArray(output.links) && output.links.length);
      }
      return (this.outputs || []).some((output)=>Array.isArray(output?.links) && output.links.length);
    }

    _isSameShuttleGroup(node){
      return !!node
        && node instanceof BasicNode
        && behaviorId(node) === 'shuttle'
        && node._shuttleGroupId() === this._shuttleGroupId();
    }

    _shuttleDownstreamReady(vacatingNodeIds, slot){
      if(!this._payload) return false;
      const output = this.outputs?.[Number.isInteger(slot) ? slot : 0];
      if(!output || !Array.isArray(output.links) || !output.links.length) return false;
      let found = false;
      for(const linkId of output.links){
        const link = this.graph?.links?.[linkId];
        const target = link && this.graph?.getNodeById?.(link.target_id);
        if(!target) continue;
        found = true;
        if(this._isSameShuttleGroup(target) && vacatingNodeIds?.has(target.id)) continue;
        if(typeof target.canAcceptWorkInput === 'function'){
          if(!target.canAcceptWorkInput(link.target_slot, this._payload)) return false;
        }else if(typeof target._state !== 'undefined' && target._state !== 'IDLE'){
          return false;
        }
      }
      return found;
    }

    _spawnShuttleProcessAnimation(durationMs, work, slotIndex=0){
      if(!(durationMs > 0)) return;
      try{
        const input = this.inputs?.[slotIndex];
        if(!root.WorkLinkAnimator || !this.graph || !input || input.link == null) return;
        const info = work && typeof work === 'object' ? { id: work.id, t: work.type, entity: work } : null;
        root.WorkLinkAnimator.spawn(this.graph, input.link, 'work', durationMs, info);
      }catch(_e){}
    }

    _spawnShuttleSinkAnimation(work, slot){
      try{
        const output = this.outputs?.[Number.isInteger(slot) ? slot : 0];
        if(!root.WorkLinkAnimator || !this.graph || !output || !Array.isArray(output.links)) return;
        const info = work && typeof work === 'object' ? { id: work.id, t: work.type, entity: work } : null;
        const durationMs = Math.max(120, flowPortTiming(this, 'input', Number.isInteger(this._activeInputSlot) ? this._activeInputSlot : 0) * 1000);
        for(const linkId of output.links){
          const link = this.graph.links?.[linkId];
          const target = link && this.graph.getNodeById?.(link.target_id);
          const isSink = behaviorId(target) === 'sink'
            || (root.SinkNode && target instanceof root.SinkNode);
          if(isSink) root.WorkLinkAnimator.spawn(this.graph, linkId, 'work', durationMs, info);
        }
      }catch(_e){}
    }

    _beginShuttleTransfer(slot){
      const outputSlot = Number.isInteger(slot) ? slot : 0;
      if(!this._payload || !this._hasShuttleDownstreamLinks(outputSlot)) return false;
      this._spawnShuttleSinkAnimation(this._payload, outputSlot);
      this._pendingTransfer = this._payload;
      this._shuttleTransferSlot = outputSlot;
      this._payload = null;
      this._currentWork = null;
      this._transferHold = true;
      this.setOutputData(outputSlot, this._pendingTransfer);
      this._setShuttleState('TRANSFER');
      return true;
    }

    _tryCommitShuttleGroupTransfer(){
      const peers = this._shuttleGroupNodes();
      for(const node of peers){
        if(node?._payload && node._state === 'PROCESS') return false;
      }
      const transferNodes = peers.filter((node)=> node?._payload
        && node._state === 'WAIT'
        && node._hasShuttleDownstreamLinks());
      if(!transferNodes.length) return false;
      const now = nowMs();
      const timing = this._shuttleGroupTiming(now);
      if(!timing.cycleOpen) return false;
      const groupIdle = peers.every((node)=>!node?._payload || node._state !== 'PROCESS');
      if(!groupIdle) return false;
      const vacatingNodeIds = new Set(transferNodes.map((node)=>node.id));
      const selections = new Map();
      for(const node of transferNodes){
        const selected = node._selectShuttleOutputRule({ groupIdle, vacatingNodeIds });
        if(!selected?.downstreamReady) return false;
        selections.set(node.id, selected);
      }
      let moved = false;
      for(const node of transferNodes){
        if(node._beginShuttleTransfer(selections.get(node.id)?.slot)) moved = true;
      }
      if(moved){
        timing.lastTransferAt = now;
        timing.cycleOpen = false;
        this._markShuttleGroupDirty();
      }
      return moved;
    }

    _startShuttleProcess(work, now, opensCycle, inputSlot=0){
      if(!work || typeof work !== 'object') return false;
      if(opensCycle) this._openShuttleGroupCycle(now);
      this._payload = work;
      this._currentWork = work;
      this._activeInputSlot = inputSlot;
      const processMs = flowPortTiming(this, 'input', inputSlot) * 1000;
      this._until = now + processMs;
      this._setShuttleState('PROCESS');
      this._spawnShuttleProcessAnimation(processMs, work, inputSlot);
      return true;
    }

    _shuttleGroupIsTransferring(){
      return this._shuttleGroupNodes().some((node)=>node && node._state === 'TRANSFER');
    }

    _acceptShuttleInput(now){
      if(this._incomingPayload){
        if(this._shuttleGroupIsTransferring()) return false;
        const buffered = this._incomingPayload;
        const opensCycle = !!this._incomingPayloadOpensCycle;
        this._incomingPayload = null;
        this._incomingPayloadOpensCycle = false;
        return this._startShuttleProcess(buffered, now, opensCycle, Number.isInteger(this._incomingInputSlot) ? this._incomingInputSlot : 0);
      }
      const candidate = this._selectFlowInputCandidate?.();
      if(!candidate) return false;
      const work = candidate.work;
      const inputSlot = candidate.slot;
      this._lastInRef = work;
      this._lastInRefs[inputSlot] = work;
      const opensCycle = this._shuttleInputIsExternal(inputSlot);
      if(this._shuttleGroupIsTransferring()){
        this._incomingPayload = work;
        this._incomingPayloadOpensCycle = opensCycle;
        this._incomingInputSlot = inputSlot;
        this._markShuttleGroupDirty();
        return true;
      }
      return this._startShuttleProcess(work, now, opensCycle, inputSlot);
    }

    _captureShuttleInputDuringTransfer(){
      if(this._incomingPayload) return;
      const candidate = this._selectFlowInputCandidate?.();
      if(!candidate) return;
      const work = candidate.work;
      const inputSlot = candidate.slot;
      this._lastInRef = work;
      this._lastInRefs[inputSlot] = work;
      this._incomingPayload = work;
      this._incomingPayloadOpensCycle = this._shuttleInputIsExternal(inputSlot);
      this._incomingInputSlot = inputSlot;
    }

    _executeShuttle(){
      const now = nowMs();
      for(let slot = 0; slot < (this.outputs?.length || 0); slot++) this.setOutputData(slot, null);
      switch(this._state){
        case 'PROCESS':
          if(now >= this._until) this._setShuttleState('WAIT');
          break;
        case 'WAIT':
          this._tryCommitShuttleGroupTransfer();
          break;
        case 'TRANSFER':
          this.setOutputData(Number.isInteger(this._shuttleTransferSlot) ? this._shuttleTransferSlot : 0, this._pendingTransfer);
          this._captureShuttleInputDuringTransfer();
          if(this._transferHold){
            this._transferHold = false;
          }else{
            this.setOutputData(Number.isInteger(this._shuttleTransferSlot) ? this._shuttleTransferSlot : 0, null);
            this._pendingTransfer = null;
            this._shuttleTransferSlot = null;
            this._setShuttleState('IDLE');
            this._closeShuttleGroupCycleIfEmpty(now);
          }
          break;
        case 'IDLE':
        default:
          this._currentWork = null;
          this._acceptShuttleInput(now);
          break;
      }
      if(this._state !== 'IDLE' || this._payload || this._pendingTransfer || this._incomingPayload){
        this.setDirtyCanvas(true, true);
      }
    }

    canAcceptPalletInput(slotIndex, pallet){
      const runtime = this._canAcceptRuntimePayload(slotIndex, pallet);
      return runtime === null ? this.canAcceptEntityInput(slotIndex, pallet) : runtime;
    }

    canAcceptAgv(slotIndex, carrier){
      const runtime = this._canAcceptRuntimePayload(slotIndex, carrier);
      return runtime === null ? this.canAcceptEntityInput(slotIndex, carrier) : runtime;
    }

    _downstreamReady(slot, instance){
      const output = this.outputs?.[slot];
      if(!output || !Array.isArray(output.links) || !output.links.length) return false;
      for(const linkId of output.links){
        const link = this.graph?.links?.[linkId];
        const target = link && this.graph?.getNodeById?.(link.target_id);
        if(!target) continue;
        if(typeof target.canAcceptEntityInput === 'function' && !target.canAcceptEntityInput(link.target_slot, instance)) return false;
      }
      return true;
    }

    _offerEntity(instance, slot){
      if(!instance || slot < 0) return false;
      if(!this._downstreamReady(slot, instance)) return false;
      this.setOutputData(slot, instance);
      this._offer = { instance, slot, at: nowMs() };
      return true;
    }

    _finishOffer(){
      if(!this._offer) return;
      const { instance, slot } = this._offer;
      const store = this._store();
      const current = store?.get(instance) || null;
      if(current && current.locationNodeId === this.id){
        this.setOutputData(slot, instance);
        return false;
      }
      this.setOutputData(slot, null);
      this._offer = null;
      this._activeRoot = null;
      this._activeTarget = null;
      this._processComplete = false;
      const downMs = flowPortTiming(this, 'output', slot) * 1000;
      if(downMs > 0){
        this._state = 'DOWN';
        this._stateName = 'down';
        this._until = nowMs() + downMs;
      }else{
        this._state = 'IDLE';
        this._stateName = 'idle';
      }
      return true;
    }

    _selectOutput(){
      const store = this._store();
      if(!store) return null;
      const rules = Array.isArray(this.properties.outputRules) && this.properties.outputRules.length
        ? this.properties.outputRules
        : [{ ruleId: 'default-output', targets:[{ mode:'otherwise' }], target: { mode: 'otherwise' }, releaseWhen: { kind: 'available' }, toPortIds:[this.outputs?.[0]?.portId], toPortId: this.outputs?.[0]?.portId }];
      const selected = App.selectEntityRule(store, this, rules, {
        nowMs: nowMs(),
        processComplete: this._processComplete,
        resolveDownstreamReady: (rule, instance)=>{
          const slots = this._ruleOutputPortIds(rule)
            .map((portId)=>portIndexById(this.outputs, portId))
            .filter((slot)=>slot >= 0);
          if(!slots.length && this.outputs?.length) slots.push(0);
          return slots.some((slot)=>this._downstreamReady(slot, instance));
        }
      }, 'output');
      if(!selected) return null;
      const slots = this._ruleOutputPortIds(selected.rule)
        .map((portId)=>portIndexById(this.outputs, portId))
        .filter((slot)=>slot >= 0);
      if(!slots.length && this.outputs?.length) slots.push(0);
      const slot = slots.find((candidate)=>this._downstreamReady(candidate, selected.instance));
      return { ...selected, slot:Number.isInteger(slot) ? slot : (slots[0] ?? -1) };
    }

    _executeSink(){
      for(let index = 0; index < this.inputs.length; index++){
        const incoming = this._acceptIncoming(index);
        if(!incoming) continue;
        this._store()?.destroy(incoming, { completed: true, sinkNodeId: this.id, completedAt: nowMs() });
        this._receivedCount = (this._receivedCount || 0) + 1;
      }
    }

    _executeSource(){
      const store = this._store();
      const rootInstance = store?.rootsAt(this.id)?.[0] || null;
      if(!rootInstance) return;
      this._offerEntity(rootInstance, 0);
    }

    _executePack(){
      const store = this._store();
      if(!store) return;
      for(let index = 0; index < this.inputs.length; index++) this._acceptIncoming(index);
      const roots = store.rootsAt(this.id);
      const container = roots.find((entry)=>{
        const category = store.typeOf(entry)?.category;
        return category === 'container' || category === 'carrier';
      });
      const item = roots.find((entry)=>entry !== container);
      if(container && item){
        const result = store.attach(item, container);
        if(result.ok) this._processComplete = true;
      }
      const output = this._selectOutput();
      if(output?.instance){
        if(output.instance.parentId) store.detach(output.instance);
        this._offerEntity(output.instance, output.slot);
      }
    }

    _executeUnpack(){
      const store = this._store();
      if(!store) return;
      for(let index = 0; index < this.inputs.length; index++) this._acceptIncoming(index);
      const output = this._selectOutput();
      if(output?.instance){
        if(output.instance.parentId) store.detach(output.instance);
        this._offerEntity(output.instance, output.slot);
      }
    }

    _executeGeneric(){
      const preset = behaviorId(this);
      if(this._offer){ this._finishOffer(); return; }
      if(preset === 'source'){ this._executeSource(); return; }
      if(preset === 'sink'){ this._executeSink(); return; }
      if(preset === 'pack'){ this._executePack(); return; }
      if(preset === 'unpack'){ this._executeUnpack(); return; }
      if(this._state === 'DOWN'){
        if(nowMs() < this._until) return;
        this._state = 'IDLE';
        this._stateName = 'idle';
      }
      for(let index = 0; index < this.inputs.length; index++) this._acceptIncoming(index);
      const store = this._store();
      if(!this._activeRoot) this._activeRoot = store?.rootsAt(this.id)?.[0] || null;
      if(!this._activeRoot) return;
      const now = nowMs();
      if(this._state === 'IDLE'){
        this._state = 'PROCESS';
        this._stateName = 'process';
        this._until = now + flowPortTiming(this, 'input', Number.isInteger(this._activeInputSlot) ? this._activeInputSlot : 0) * 1000;
      }
      if(this._state === 'PROCESS' && now >= this._until){
        this._processComplete = true;
        this._state = 'WAIT';
        this._stateName = 'wait';
      }
      if(this._state === 'WAIT'){
        const selected = this._selectOutput();
        if(selected?.instance){
          if(selected.instance.parentId) store.detach(selected.instance);
          this._offerEntity(selected.instance, selected.slot);
        }
      }
    }

    onExecute(){
      let result;
      if(hasSequenceTarget(this) && this._runtimePrototype && typeof this._runtimePrototype.onExecute === 'function'){
        result = this._runtimePrototype.onExecute.call(this);
      }else if((this._executionPlan?.behavior || behaviorId(this)) === 'shuttle'){
        result = this._executeShuttle();
      }else if(this._runtimePrototype && typeof this._runtimePrototype.onExecute === 'function'){
        result = this._runtimePrototype.onExecute.call(this);
      }else{
        result = this._executeGeneric();
      }
      this._acknowledgeAcceptedInputs();
      this._notifyReadyEntityUpstreams();
      return result;
    }

    onDrawForeground(ctx){
      if(hasSequenceTarget(this) && this._runtimePrototype && typeof this._runtimePrototype.onDrawForeground === 'function'){
        return this._runtimePrototype.onDrawForeground.call(this, ctx);
      }
      if(behaviorId(this) === 'shuttle'){
        const remaining = Math.max(0, this._until - nowMs());
        if(typeof root.drawStateBelow === 'function'){
          root.drawStateBelow(ctx, this, [
            `State: ${this._state}`,
            `Shuttle group: ${this._shuttleGroupId() || '-'}`,
            this._currentWork ? `Work: ID=${this._currentWork.id} Type=${this._currentWork.type}` : 'Work: (none)',
            `Remain(s): ${(remaining / 1000).toFixed(1)}`,
            `Process(s): ${flowPortTiming(this, 'input', Number.isInteger(this._activeInputSlot) ? this._activeInputSlot : 0)}`
          ], 8, 6);
        }
        return;
      }
      if(this._runtimePrototype && typeof this._runtimePrototype.onDrawForeground === 'function'){
        return this._runtimePrototype.onDrawForeground.call(this, ctx);
      }
      const store = this._store();
      const count = store?.summaryAt(this.id).reduce((sum, row)=>sum + row.quantity, 0) || 0;
      if(typeof root.drawStateBelow === 'function'){
        root.drawStateBelow(ctx, this, [
          `Operations: ${operationRows(this).map((entry)=>entry.kind).join(', ') || 'none'}`,
          `State: ${this._stateName}`,
          `Contents: ${count}`,
          `Input rules: ${this.properties.inputRules?.length || 0}`,
          `Output rules: ${this.properties.outputRules?.length || 0}`
        ], 8, 6);
      }
    }

    getEventUntil(now){
      if(behaviorId(this) === 'shuttle'){
        if(this._state === 'TRANSFER') return Number(now) || 0;
        if(this._state === 'WAIT'){
          const timing = this._shuttleGroupTiming(now);
          if(timing.cycleOpen){
            const completeAt = this._shuttleGroupProcessCompleteAt();
            if(Number.isFinite(completeAt)) return completeAt;
          }
        }
      }
      return NaN;
    }
  }

  function inferLegacyTypes(data){
    const model = isObject(data?.__factSimEntityModel)
      ? clone(data.__factSimEntityModel, { schemaVersion: 1, types: [] })
      : { schemaVersion: 1, types: [] };
    if(!Array.isArray(model.types)) model.types = [];
    const byKey = new Map(model.types.map((row)=>[`${row.category}:${String(row.name).toLowerCase()}`, row]));
    let sequence = model.types.length;
    const ensure = (name, category, capacity, subtype)=>{
      const key = `${category}:${String(name).toLowerCase()}`;
      if(byKey.has(key)) return byKey.get(key);
      const row = {
        typeId: `type-${String(name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || (++sequence)}`,
        name, category, subtype: subtype || '', tags: ['migrated'],
        capacity: category === 'work' ? 0 : Math.max(0, Math.round(Number(capacity) || 0)),
        allowedContentTypeIds: [], defaultAttributes: {}
      };
      while(model.types.some((item)=>item.typeId === row.typeId)) row.typeId += `-${++sequence}`;
      model.types.push(row); byKey.set(key, row); return row;
    };
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    for(const node of nodes){
      const props = isObject(node?.properties) ? node.properties : {};
      if(node.type === 'factory/source' || text(props.presetId).toLowerCase() === 'source'){
        if(!Array.isArray(props.sourceSequence) || !props.sourceSequence.length){
          String(props.sequence || 'A').split(/[,\n]+/).map(text).filter(Boolean).forEach((name)=>ensure(name, 'work', 0, ''));
        }
      }
      if(node.type === 'factory/carrierconfig' || node.type === 'factory/carrierhome'){
        ensure(text(props.carrierId) || `Carrier ${props.capacity || 1}`, 'carrier', props.capacity || 1, 'Carrier');
      }
      if(node.type === 'factory/palletcarrierconfig' || node.type === 'factory/palletcarrier'){
        const pallet = ensure(`Pallet ${props.palletWorkCapacity || 1}`, 'container', props.palletWorkCapacity || 1, 'Pallet');
        const carrier = ensure(text(props.carrierId) || `Pallet Carrier ${props.palletCapacity || 1}`, 'carrier', props.palletCapacity || 1, 'Carrier');
        if(!carrier.allowedContentTypeIds.includes(pallet.typeId)) carrier.allowedContentTypeIds.push(pallet.typeId);
      }
      if(node.type === 'factory/entitysource'){
        const category = String(props.rootKind).toLowerCase() === 'carrier' ? 'carrier' : (String(props.rootKind).toLowerCase() === 'work' ? 'work' : 'container');
        ensure(text(props.rootId) || text(props.rootKind) || 'Entity', category, props.capacity || 0, props.rootKind || '');
      }
    }
    const works = model.types.filter((row)=>row.category === 'work').map((row)=>row.typeId);
    for(const row of model.types){
      if(row.category === 'container' && String(row.subtype).toLowerCase() === 'pallet'){
        for(const typeId of works) if(!row.allowedContentTypeIds.includes(typeId)) row.allowedContentTypeIds.push(typeId);
      }else if(row.category === 'carrier' && !row.allowedContentTypeIds.length){
        for(const typeId of works) row.allowedContentTypeIds.push(typeId);
      }
    }
    return model;
  }

  function typeIdForLegacyName(model, name){
    const wanted = text(name).toLowerCase();
    if(!wanted) return '';
    const row = (Array.isArray(model?.types) ? model.types : []).find((entry)=>text(entry?.name).toLowerCase() === wanted);
    return text(row?.typeId);
  }

  function migratedInputRules(node, originalType){
    if(originalType === 'factory/source' || originalType === 'factory/entitysource') return [];
    const presetId = TYPE_TO_PRESET[originalType] || 'basic';
    return (Array.isArray(node?.inputs) ? node.inputs : []).map((port, index)=>({
      ruleId: `migrated-input-${index + 1}`,
      targets: targetsForCategories(presetPortCategories(node, presetId, 'input', index)),
      target: targetForCategory(presetPortCategories(node, presetId, 'input', index)[0]),
      acceptWhen: { kind: originalType === 'factory/sink' ? 'always' : 'space-available' },
      fromPortId: port.portId || `in-${index + 1}`
    }));
  }

  function migratedOutputRules(node, originalType, model){
    if(originalType === 'factory/sink') return [];
    const releaseKind = (originalType === 'factory/source' || originalType === 'factory/entitysource')
      ? 'available'
      : 'process-complete';
    return (Array.isArray(node?.outputs) ? node.outputs : []).map((port, index)=>{
      const presetId = TYPE_TO_PRESET[originalType] || 'basic';
      const categories = presetPortCategories(node, presetId, 'output', index);
      const routeTypeId = originalType === 'factory/branch'
        ? typeIdForLegacyName(model, port?.routeType)
        : '';
      return {
        ruleId: `migrated-output-${index + 1}`,
        targets: routeTypeId
          ? [{ mode: 'type', typeId: routeTypeId }]
          : targetsForCategories(categories),
        target: routeTypeId
          ? { mode: 'type', typeId: routeTypeId }
          : targetForCategory(categories[0]),
        releaseWhen: originalType === 'factory/shuttle_stage'
          ? {
              kind: 'all',
              conditions: [
                { kind: 'process-complete' },
                { kind: 'shuttle-group-idle', groupId: text(node?.properties?.shuttleGroupId || node?.properties?.groupId) || 'shuttle-1' },
                { kind: 'downstream-ready' }
              ]
            }
          : { kind: releaseKind },
        toPortIds: [port.portId || `out-${index + 1}`],
        toPortId: port.portId || `out-${index + 1}`
      };
    });
  }

  function replaceLegacySourceSequence(properties, model){
    const props = isObject(properties) ? properties : {};
    if(Array.isArray(props.sourceSequence) && props.sourceSequence.length){
      delete props.sequence;
      return props.sourceSequence;
    }
    const names = String(props.sequence || '').split(/[,\n]+/).map(text).filter(Boolean);
    const fallbackType = (Array.isArray(model?.types) ? model.types : []).find((entry)=>entry?.category === 'work') || null;
    const rows = [];
    for(const name of names){
      const typeId = typeIdForLegacyName(model, name);
      if(!typeId) continue;
      rows.push({ entryId:`source-sequence-${rows.length + 1}`, typeId, quantity:1 });
    }
    if(!rows.length && fallbackType){
      rows.push({ entryId:'source-sequence-1', typeId:fallbackType.typeId, quantity:1 });
    }
    props.sourceSequence = rows;
    delete props.sequence;
    return rows;
  }

  function markWorkSourceAsSequenceFlow(properties){
    const props = isObject(properties) ? properties : {};
    const rules = Array.isArray(props.outputRules) ? props.outputRules : [];
    if(rules.length){
      rules[0].targets = [{ mode:'sequence', entries:clone(Array.isArray(props.sourceSequence) ? props.sourceSequence : [], []) }];
      rules[0].target = rules[0].targets[0];
    }
    delete props.sourceSequence;
    delete props.sourceMode;
    return props;
  }

  function applyTemplateRuntimeVariant(properties, originalType){
    const props = isObject(properties) ? properties : {};
    const type = text(originalType).toLowerCase();
    if(type === 'factory/entitysource') props.sourceMode = 'entity';
    else if(type === 'factory/source' && !text(props.sourceMode)) props.sourceMode = 'work';
    if(type === 'factory/agvroute') props.transportMode = 'agv';
    else if(type === 'factory/carrierroute' && !text(props.transportMode)) props.transportMode = 'carrier';
    delete props.legacySourceType;
    return props;
  }

  function migrateGraphDataToBasic(source, options){
    const data = clone(source, null);
    if(!data) throw new Error('Graph data is not serializable');
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const warnings = [];
    const removedNodeIds = [];
    let convertedNodeCount = 0;
    data.__factSimEntityModel = inferLegacyTypes(data);
    const carrierConfigs = nodes.filter((node)=>CONFIG_TYPES.has(node?.type)).map((node)=>({
      nodeId: node.id,
      configKind: text(node.type).toLowerCase().includes('pallet') ? 'pallet-carrier' : 'carrier',
      properties: clone(node.properties, {})
    }));
    const kept = [];
    for(const node of nodes){
      if(!node || !node.type) continue;
      node.pos = normalizeSerializedVector(node.pos);
      node.size = normalizeSerializedVector(node.size);
      if(CONFIG_TYPES.has(node.type)){
        removedNodeIds.push(node.id);
        continue;
      }
      node.properties = isObject(node.properties) ? node.properties : {};
      const originalType = node.type;
      const templateId = text(node.properties.presetId).toLowerCase()
        || TYPE_TO_PRESET[originalType]
        || (hasSequenceTarget(node) ? 'source' : 'basic');

      if(templateId === 'note' || templateId === 'signal'){
        node.type = `factory/${templateId}`;
        const allowed = templateId === 'note'
          ? ['text', 'fontSize', 'backgroundColor', 'textColor']
          : ['script', 'sigExtra', 'sigEnabled', 'scriptDisabled'];
        node.properties = Object.fromEntries(Object.entries(node.properties).filter(([key])=>allowed.includes(key)));
        kept.push(node);
        continue;
      }

      if(originalType !== 'factory/basic'){
        if(!TYPE_TO_PRESET[originalType]){
          warnings.push({ code: 'UNKNOWN_NODE_TYPE', nodeId: node.id, type: node.type });
          kept.push(node);
          continue;
        }
        node.type = 'factory/basic';
        applyTemplateRuntimeVariant(node.properties, originalType);
        if(templateId === 'source' && text(node.properties.sourceMode || 'work').toLowerCase() !== 'entity'){
          replaceLegacySourceSequence(node.properties, data.__factSimEntityModel);
        }
        if(originalType === 'factory/shuttle_stage'){
          node.properties.shuttleGroupId = text(node.properties.shuttleGroupId || node.properties.groupId) || 'shuttle-1';
          delete node.properties.groupId;
        }
        if(!Array.isArray(node.properties.initialContents)) node.properties.initialContents = [];
        ensurePortIds(node);
        if(!Array.isArray(node.properties.inputRules) || !node.properties.inputRules.length){
          node.properties.inputRules = migratedInputRules(node, originalType);
        }
        if(!Array.isArray(node.properties.outputRules) || !node.properties.outputRules.length){
          node.properties.outputRules = migratedOutputRules(node, originalType, data.__factSimEntityModel);
        }
        if(templateId === 'source' && text(node.properties.sourceMode || 'work').toLowerCase() !== 'entity'){
          markWorkSourceAsSequenceFlow(node.properties);
        }
        convertedNodeCount += 1;
      }else if(templateId === 'source' || hasSequenceTarget(node)){
        replaceLegacySourceSequence(node.properties, data.__factSimEntityModel);
        if(!Array.isArray(node.properties.outputRules) || !node.properties.outputRules.length){
          node.properties.outputRules = migratedOutputRules(node, 'factory/source', data.__factSimEntityModel);
        }
        markWorkSourceAsSequenceFlow(node.properties);
      }
      ensurePortIds(node);
      if(!Array.isArray(node.properties.operations) || !node.properties.operations.length){
        node.properties.operations = templateOperations(templateId, node.properties);
      }
      if(templateId === 'carrier_route' && (!Array.isArray(node.properties.initialContents) || !node.properties.initialContents.length)){
        const carrierTypes = data.__factSimEntityModel.types.filter((entry)=>entry.category === 'carrier');
        const initialCarrier = text(node.properties.initialCarrier);
        const agvIds = String(node.properties.agvIds || '').split(/[,\n]+/).map(text).filter(Boolean);
        const selectedType = carrierTypes.find((entry)=>initialCarrier
          && (text(entry.typeId).toLowerCase() === initialCarrier.toLowerCase() || text(entry.name).toLowerCase() === initialCarrier.toLowerCase()))
          || carrierTypes[0];
        const quantity = agvIds.length || (initialCarrier ? 1 : 0);
        if(selectedType && quantity > 0){
          node.properties.initialContents = [{ typeId:selectedType.typeId, quantity, load:'empty', children:[] }];
        }
      }
      const timingOverrides = legacyTimingOverrides(node.properties.script, data.__factSimEntityModel);
      if(Object.keys(timingOverrides).length && node.properties.operations[0]){
        node.properties.operations[0].config = isObject(node.properties.operations[0].config) ? node.properties.operations[0].config : {};
        node.properties.operations[0].config.timingByTypeId = timingOverrides;
      }
      ensurePresetFlowRules(node, { templateId });
      upgradeNodeProperties(node, templateId);
      normalizeEntityPorts(node);
      for(const port of [...(node.inputs || []), ...(node.outputs || [])]){
        if(!port || isSignalPort(port)) continue;
        delete port.requiredByPreset;
        port.flowManaged = true;
      }
      kept.push(node);
    }
    data.nodes = kept;
    if(removedNodeIds.length && Array.isArray(data.links)){
      data.links = data.links.filter((link)=>{
        if(!Array.isArray(link)) return true;
        return !removedNodeIds.includes(link[1]) && !removedNodeIds.includes(link[3]);
      });
    }
    const preview = {
      convertedNodeCount,
      removedConfigNodeCount: removedNodeIds.length,
      removedNodeIds,
      generatedTypeCount: data.__factSimEntityModel.types.length,
      warnings,
      blocked: warnings.some((row)=>row.code === 'UNKNOWN_NODE_TYPE')
    };
    if(options?.previewOnly) return preview;
    if(preview.blocked) return { data: source, preview };
    return { data, preview };
  }

  App.BASIC_NODE_TEMPLATES = PRESETS;
  App.BASIC_NODE_TYPE_TEMPLATE_MAP = TYPE_TO_PRESET;
  App.inferEntityModelFromGraph = inferLegacyTypes;
  App.ensureBasicNodePortIds = ensurePortIds;
  App.ensureBasicTemplateFlowRules = ensurePresetFlowRules;
  App.basicNodeHasSequenceTarget = hasSequenceTarget;
  App.configureBasicSequenceGenerator = (node)=>{
    if(!node) return null;
    if(typeof node.applyTemplate === 'function') node.applyTemplate('source', true);
    App.ensureSourceSequence?.(node, { createDefault:true });
    if(typeof node.onPropertyChanged === 'function') node.onPropertyChanged('outputRules');
    syncFlowPorts(node, { dirty:false });
    return node;
  };
  App.applyBasicTemplate = (node, templateId, options)=>{
    if(!node || typeof node.applyTemplate !== 'function') throw new Error('Node is not a Basic Node');
    return node.applyTemplate(templateId, options?.preserveTitle === true);
  };
  App.basicNodeBehavior = behaviorId;
  App.basicNodeSequenceEntries = sequenceEntries;
  App.normalizeBasicOperations = normalizeOperations;
  App.commonBasicNodeProperties = commonProperties;
  App.BASIC_ACTION_REGISTRY = ACTION_REGISTRY;
  App.compileBasicExecutionPlan = compileExecutionPlan;
  App.ensureBasicPortTimings = ensurePortTimings;
  App.normalizeBasicEntityPorts = normalizeEntityPorts;
  App.basicEntityPortSlots = entityPortSlots;
  App.basicFlowPortSlotsForCategory = flowPortSlotsForCategory;
  App.basicFlowPortTiming = flowPortTiming;
  App.createBasicFlowPort = createFlowPort;
  App.syncBasicFlowPorts = syncFlowPorts;
  App.removeOrphanBasicFlowPort = removeOrphanFlowPort;
  App.migrateGraphDataToBasic = migrateGraphDataToBasic;
  App.previewBasicNodeMigration = (data)=>migrateGraphDataToBasic(data, { previewOnly: true });
  App.prepareSerializedGraphForSave = function(data){
    const result = migrateGraphDataToBasic(data || {}, {});
    App._lastBasicMigrationPreview = result.preview;
    return result;
  };
  BasicNode.title = 'Basic Node';
  root.BasicNode = BasicNode;
})(typeof self !== 'undefined' ? self : window);
