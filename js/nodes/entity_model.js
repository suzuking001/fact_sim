// Canonical FACT SIM entity type, runtime instance, contents, and rule model.
// Model data is persisted. Runtime instances are deliberately graph-local and
// are rebuilt from node Initial Contents whenever a graph is loaded or reset.

(function(root){
  'use strict';

  const App = root.App || (root.App = {});
  const MODEL_KEY = '__factSimEntityModel';
  const SCHEMA_VERSION = 3;
  const LEGACY_CATEGORIES = new Set(['work', 'container', 'carrier', 'pallet', 'agv', 'vehicle', 'box', 'tray', 'ship']);
  const LOAD_MODES = new Set(['empty', 'full', 'custom']);
  const ENTITY_SHAPES = Object.freeze(['circle', 'rounded-square', 'square', 'triangle', 'diamond', 'hexagon']);
  const ENTITY_COLOR_THEMES = Object.freeze(['auto', 'blue', 'orange', 'green', 'purple', 'red', 'cyan', 'yellow', 'gray']);
  const NEW_TYPE_COLOR_THEMES = Object.freeze(ENTITY_COLOR_THEMES.filter((theme)=>theme !== 'auto'));

  function isObject(value){
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value, fallback){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return fallback; }
  }

  function normalizeText(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizeCapacity(value){
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function normalizeAppearance(value, fallback){
    const source = isObject(value) ? value : {};
    const defaults = isObject(fallback) ? fallback : {};
    const requestedShape = normalizeText(source.shape || defaults.shape).toLowerCase();
    const requestedTheme = normalizeText(source.colorTheme || defaults.colorTheme).toLowerCase();
    return {
      shape: ENTITY_SHAPES.includes(requestedShape) ? requestedShape : 'circle',
      colorTheme: ENTITY_COLOR_THEMES.includes(requestedTheme) ? requestedTheme : 'auto'
    };
  }

  function slug(value){
    const out = normalizeText(value).toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return out || 'entity';
  }

  function stableNodeSort(a, b){
    const an = Number(a?.id);
    const bn = Number(b?.id);
    if(Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  }

  function runtimeNowMs(graph){
    if(typeof root.simNow === 'function') return Number(root.simNow()) || 0;
    const fixed = Number(graph?.fixedtime);
    if(Number.isFinite(fixed)) return fixed * 1000;
    return 0;
  }

  function normalizeTypeRecord(raw, fallbackId){
    const source = isObject(raw) ? raw : {};
    const typeId = normalizeText(source.typeId || fallbackId);
    return {
      typeId,
      name: normalizeText(source.name) || typeId || 'Entity',
      subtype: normalizeText(source.subtype),
      tags: Array.from(new Set((Array.isArray(source.tags) ? source.tags : [])
        .map(normalizeText).filter(Boolean))),
      capacity: normalizeCapacity(source.capacity),
      allowedContentTypeIds: Array.from(new Set((Array.isArray(source.allowedContentTypeIds)
        ? source.allowedContentTypeIds : []).map(normalizeText).filter(Boolean))),
      defaultAttributes: isObject(source.defaultAttributes) ? clone(source.defaultAttributes, {}) : {},
      appearance: normalizeAppearance(source.appearance)
    };
  }

  function normalizeTarget(value){
    if(typeof value === 'string'){
      const text = normalizeText(value);
      if(text.toLowerCase() === 'otherwise') return { mode: 'otherwise' };
      if(text.toLowerCase() === 'sequence') return { mode: 'sequence' };
      if(text.toLowerCase() === 'any' || text.toLowerCase() === 'entity' || text.toLowerCase() === 'any entity') return { mode: 'any' };
      if(LEGACY_CATEGORIES.has(text.toLowerCase())) return { mode: 'any' };
      return { mode: 'type', typeId: text };
    }
    const source = isObject(value) ? value : {};
    const mode = normalizeText(source.mode || source.kind).toLowerCase();
    if(mode === 'otherwise') return { mode: 'otherwise' };
    if(mode === 'sequence') return {
      mode: 'sequence',
      entries:(Array.isArray(source.entries) ? source.entries : []).map((entry)=>(
        isObject(entry) ? {
          entryId:normalizeText(entry.entryId),
          typeId:normalizeText(entry.typeId),
          quantity:Number(entry.quantity)
        } : entry
      ))
    };
    if(mode === 'any' || mode === 'entity' || mode === 'category') return { mode: 'any' };
    return { mode: 'type', typeId: normalizeText(source.typeId || source.value) };
  }

  function normalizeTargets(values, fallback){
    const source = Array.isArray(values) && values.length ? values : [fallback];
    const result = [];
    for(const value of source){
      const target = normalizeTarget(value);
      const key = target.mode === 'type' ? `type:${target.typeId}` : target.mode;
      if(!result.some((entry)=>entry.key === key)) result.push({ key, target });
    }
    return result.map((entry)=>entry.target);
  }

  function normalizeCondition(value, fallback){
    if(typeof value === 'string') return { kind: normalizeText(value).toLowerCase().replace(/[ _-]+/g, '-') };
    const source = isObject(value) ? clone(value, {}) : {};
    source.kind = normalizeText(source.kind || fallback || 'always').toLowerCase().replace(/[ _-]+/g, '-');
    if(source.kind === 'all' || source.kind === 'any'){
      const rows = Array.isArray(source.conditions) ? source.conditions : (Array.isArray(source.children) ? source.children : []);
      source.conditions = rows.map((entry)=>normalizeCondition(entry, 'always'));
      delete source.children;
    }else if(source.kind === 'not'){
      source.condition = normalizeCondition(source.condition || source.child, 'always');
      delete source.child;
    }
    return source;
  }

  function normalizeTimingStages(rows, prefix){
    const result = [];
    const used = new Set();
    for(const [index, raw] of (Array.isArray(rows) ? rows : []).entries()){
      if(!isObject(raw)) continue;
      let stageId = normalizeText(raw.stageId) || `${prefix}-${index + 1}`;
      while(used.has(stageId)) stageId = `${prefix}-${used.size + 1}`;
      used.add(stageId);
      result.push({
        stageId,
        name:normalizeText(raw.name) || `${prefix.startsWith('down') ? 'Down' : 'Process'} ${result.length + 1}`,
        durationSec:Math.max(0, Number(raw.durationSec) || 0),
        ...(normalizeText(raw.portId) ? { portId:normalizeText(raw.portId) } : {})
      });
    }
    return result;
  }

  function normalizeRecipe(raw){
    const source = isObject(raw) ? raw : {};
    const load = normalizeText(source.load || 'empty').toLowerCase();
    return {
      typeId: normalizeText(source.typeId),
      quantity: Math.max(1, Math.round(Number(source.quantity) || 1)),
      load: LOAD_MODES.has(load) ? load : 'empty',
      children: (Array.isArray(source.children) ? source.children : []).map(normalizeRecipe)
    };
  }

  function nextSourceSequenceEntryId(rows){
    const used = new Set((Array.isArray(rows) ? rows : []).map((entry)=>normalizeText(entry?.entryId)).filter(Boolean));
    let index = 1;
    while(used.has(`source-sequence-${index}`)) index += 1;
    return `source-sequence-${index}`;
  }

  function sourceSequenceTarget(node){
    for(const rule of (Array.isArray(node?.properties?.outputRules) ? node.properties.outputRules : [])){
      const targets = Array.isArray(rule?.targets) && rule.targets.length ? rule.targets : [rule?.target].filter(Boolean);
      const target = targets.find((entry)=>normalizeText(entry?.mode || entry?.kind || entry).toLowerCase() === 'sequence');
      if(target) return target;
    }
    return null;
  }

  function sourceSequenceRows(node){
    const target = sourceSequenceTarget(node);
    return Array.isArray(target?.entries) ? target.entries : [];
  }

  function inspectSourceSequence(node, registryOverride){
    const registry = registryOverride || entityModelForGraph(node?.graph || App.graph);
    const rows = sourceSequenceRows(node);
    const errors = [];
    const entries = [];
    const entryIds = new Set();
    if(!rows.length) errors.push({ code:'SOURCE_SEQUENCE_EMPTY', nodeId:node?.id ?? null });
    rows.forEach((raw, index)=>{
      const entryId = normalizeText(raw?.entryId);
      const typeId = normalizeText(raw?.typeId);
      const quantity = Number(raw?.quantity);
      const type = registry?.get?.(typeId) || null;
      if(!entryId) errors.push({ code:'SOURCE_SEQUENCE_ENTRY_ID_REQUIRED', nodeId:node?.id ?? null, index });
      else if(entryIds.has(entryId)) errors.push({ code:'SOURCE_SEQUENCE_ENTRY_ID_DUPLICATE', nodeId:node?.id ?? null, index, entryId });
      else entryIds.add(entryId);
      if(!typeId || !type) errors.push({ code:'SOURCE_SEQUENCE_TYPE_MISSING', nodeId:node?.id ?? null, index, typeId });
      if(!Number.isInteger(quantity) || quantity < 1) errors.push({ code:'SOURCE_SEQUENCE_QUANTITY_INVALID', nodeId:node?.id ?? null, index, quantity:raw?.quantity });
      entries.push({
        entryId,
        typeId,
        quantity,
        typeName:type?.name || ''
      });
    });
    return { ok:errors.length === 0, nodeId:node?.id ?? null, entries, errors };
  }

  function normalizeSourceSequence(rows, registry, nodeId){
    const used = new Set();
    const normalized = (Array.isArray(rows) ? rows : []).map((raw, index)=>{
      let entryId = normalizeText(raw?.entryId);
      if(!entryId || used.has(entryId)){
        entryId = nextSourceSequenceEntryId(Array.from(used).map((value)=>({ entryId:value })));
      }
      used.add(entryId);
      return {
        entryId,
        typeId:normalizeText(raw?.typeId),
        quantity:Number(raw?.quantity)
      };
    });
    const probe = { id:nodeId ?? null, graph:registry?.graph || null, properties:{ outputRules:[{ targets:[{ mode:'sequence', entries:normalized }] }] } };
    const validation = inspectSourceSequence(probe, registry);
    if(!validation.ok){
      const error = new Error(`Invalid Source Sequence: ${validation.errors.map((entry)=>entry.code).join(', ')}`);
      error.validation = validation;
      throw error;
    }
    return normalized;
  }

  function ensureSourceSequence(node, options){
    if(!node) return { ok:false, errors:[{ code:'SOURCE_NODE_REQUIRED' }] };
    node.properties = isObject(node.properties) ? node.properties : {};
    const registry = entityModelForGraph(node.graph || App.graph);
    if(!registry) return { ok:false, errors:[{ code:'GRAPH_REQUIRED', nodeId:node.id ?? null }] };
    const target = sourceSequenceTarget(node);
    if(!target) return { ok:false, errors:[{ code:'SOURCE_SEQUENCE_TARGET_REQUIRED', nodeId:node.id ?? null }] };
    if(sourceSequenceRows(node).length){
      return inspectSourceSequence(node, registry);
    }
    if(options?.createDefault === false) return inspectSourceSequence(node, registry);
    let entityType = registry.list()[0] || null;
    if(!entityType){
      entityType = registry.upsert({
        name:'Entity A', subtype:'', tags:['preset'], capacity:0,
        allowedContentTypeIds:[], defaultAttributes:{}
      });
    }
    target.entries = [{ entryId:'source-sequence-1', typeId:entityType.typeId, quantity:1 }];
    try{ node.graph?.change?.(); }catch(_e){}
    return inspectSourceSequence(node, registry);
  }

  class EntityTypeRegistry{
    constructor(graph, model){
      this.graph = graph || null;
      this.schemaVersion = SCHEMA_VERSION;
      this.types = new Map();
      this.sequence = 0;
      this.restore(model);
    }

    restore(model){
      this.types.clear();
      const source = isObject(model) ? model : {};
      this.schemaVersion = SCHEMA_VERSION;
      const rows = Array.isArray(source.types) ? source.types : [];
      for(let index = 0; index < rows.length; index++){
        const fallback = `type-${index + 1}`;
        const row = normalizeTypeRecord(rows[index], fallback);
        if(!row.typeId || this.types.has(row.typeId)) continue;
        this.types.set(row.typeId, row);
      }
      this.sequence = this.types.size;
      return this;
    }

    serialize(){
      return {
        schemaVersion: SCHEMA_VERSION,
        types: this.list().map((row)=> clone(row, row))
      };
    }

    list(){
      return Array.from(this.types.values());
    }

    get(typeId){
      return this.types.get(normalizeText(typeId)) || null;
    }

    _nextId(name){
      const base = `type-${slug(name)}`;
      let candidate = base;
      while(this.types.has(candidate)){
        this.sequence += 1;
        candidate = `${base}-${this.sequence}`;
      }
      return candidate;
    }

    upsert(value){
      const raw = isObject(value) ? value : {};
      const requestedId = normalizeText(raw.typeId);
      const current = requestedId ? this.types.get(requestedId) : null;
      const typeId = current?.typeId || requestedId || this._nextId(raw.name);
      if(current && requestedId !== current.typeId) throw new Error('typeId is immutable');
      const defaultAppearance = current?.appearance || (!raw.appearance
        ? { shape:'circle', colorTheme:NEW_TYPE_COLOR_THEMES[this.types.size % NEW_TYPE_COLOR_THEMES.length] }
        : null);
      const next = normalizeTypeRecord({ ...(current || {}), ...raw, typeId,
        appearance:normalizeAppearance(raw.appearance, defaultAppearance) }, typeId);
      const duplicate = this.list().find((row)=> row.typeId !== typeId && row.name.toLowerCase() === next.name.toLowerCase());
      if(duplicate) throw new Error(`Entity Type name already exists: ${next.name}`);
      this.types.set(typeId, next);
      this._touch();
      return clone(next, next);
    }

    ensureLegacyType(name, _category, options){
      const label = normalizeText(name) || 'Legacy Entity';
      const found = this.list().find((row)=> row.name === label);
      if(found) return found;
      const opts = isObject(options) ? options : {};
      return this.upsert({
        name: label,
        subtype: opts.subtype || '',
        capacity: opts.capacity || 0,
        allowedContentTypeIds: opts.allowedContentTypeIds || [],
        defaultAttributes: opts.defaultAttributes || {},
        appearance: opts.appearance || { shape:'circle', colorTheme:'auto' }
      });
    }

    referencesTo(typeId){
      const id = normalizeText(typeId);
      const refs = [];
      for(const row of this.list()){
        if(row.allowedContentTypeIds.includes(id)) refs.push({ kind: 'type', id: row.typeId, field: 'allowedContentTypeIds' });
      }
      const nodes = Array.isArray(this.graph?._nodes) ? this.graph._nodes : [];
      const walkRecipe = (rows, nodeId, path)=>{
        (Array.isArray(rows) ? rows : []).forEach((entry, index)=>{
          if(entry?.typeId === id) refs.push({ kind: 'node', id: nodeId, field: `${path}[${index}].typeId` });
          walkRecipe(entry?.children, nodeId, `${path}[${index}].children`);
        });
      };
      for(const node of nodes){
        const props = isObject(node?.properties) ? node.properties : {};
        walkRecipe(props.initialContents, node.id, 'initialContents');
        sourceSequenceRows(node).forEach((entry, index)=>{
          if(normalizeText(entry?.typeId) === id) refs.push({ kind:'node', id:node.id, field:`outputRules.sequence.entries[${index}].typeId` });
        });
        for(const key of ['inputRules', 'outputRules']){
          (Array.isArray(props[key]) ? props[key] : []).forEach((rule, index)=>{
            const targets = normalizeTargets(rule?.targets, rule?.target);
            targets.forEach((target, targetIndex)=>{
              if(target.mode === 'type' && target.typeId === id){
                refs.push({ kind: 'node', id: node.id, field: `${key}[${index}].targets[${targetIndex}]` });
              }
            });
          });
        }
      }
      return refs;
    }

    remove(typeId){
      const id = normalizeText(typeId);
      if(!this.types.has(id)) return false;
      const refs = this.referencesTo(id);
      if(refs.length){
        const error = new Error(`Entity Type is still referenced: ${id}`);
        error.references = refs;
        throw error;
      }
      this.types.delete(id);
      this._touch();
      return true;
    }

    validate(){
      const errors = [];
      const warnings = [];
      const names = new Map();
      for(const row of this.list()){
        if(!row.typeId) errors.push({ code: 'TYPE_ID_REQUIRED', typeId: row.typeId });
        const nameKey = row.name.toLowerCase();
        if(names.has(nameKey)) errors.push({ code: 'TYPE_NAME_DUPLICATE', typeId: row.typeId, otherTypeId: names.get(nameKey) });
        else names.set(nameKey, row.typeId);
        for(const allowedId of row.allowedContentTypeIds){
          if(!this.types.has(allowedId)) errors.push({ code: 'ALLOWED_TYPE_MISSING', typeId: row.typeId, allowedTypeId: allowedId });
        }
        if(row.capacity === 0 && row.allowedContentTypeIds.length){
          warnings.push({ code: 'ZERO_CAPACITY_WITH_ALLOWED_TYPES', typeId: row.typeId });
        }
      }
      return { ok: errors.length === 0, schemaVersion: SCHEMA_VERSION, typeCount: this.types.size, errors, warnings };
    }

    _touch(){
      if(this.graph) this.graph.__factSimEntityModel = this.serialize();
      try{ this.graph?.change?.(); }catch(_e){}
    }
  }

  class RuntimeInstanceStore{
    constructor(graph, registry){
      this.graph = graph || null;
      this.registry = registry || new EntityTypeRegistry(graph, null);
      this.instances = new Map();
      this.rootsByNode = new Map();
      this.completed = [];
      this.typeSequences = new Map();
      this.arrivalSequence = 0;
      this.revision = 0;
    }

    clear(){
      this.instances.clear();
      this.rootsByNode.clear();
      this.completed = [];
      this.typeSequences.clear();
      this.arrivalSequence = 0;
      this.revision += 1;
    }

    _displayId(type, ordinal){
      return `${type?.name || type?.typeId || 'Entity'} #${String(ordinal).padStart(3, '0')}`;
    }

    create(typeId, options){
      const type = this.registry.get(typeId);
      if(!type) throw new Error(`Unknown Entity Type: ${typeId}`);
      const ordinal = (this.typeSequences.get(type.typeId) || 0) + 1;
      this.typeSequences.set(type.typeId, ordinal);
      const instanceId = `${type.typeId}:${ordinal}`;
      const opts = isObject(options) ? options : {};
      const instance = {
        instanceId,
        typeId: type.typeId,
        parentId: null,
        childIds: [],
        locationNodeId: opts.locationNodeId == null ? null : opts.locationNodeId,
        attributes: { ...clone(type.defaultAttributes, {}), ...(isObject(opts.attributes) ? clone(opts.attributes, {}) : {}) },
        arrivalSequence: ++this.arrivalSequence,
        createdAt: Number(opts.createdAt) || 0,
        id: normalizeText(opts.legacyId) || this._displayId(type, ordinal),
        type: normalizeText(opts.legacyType) || type.name
      };
      this.instances.set(instanceId, instance);
      if(instance.locationNodeId != null) this._addRoot(instance.locationNodeId, instanceId);
      this.revision += 1;
      return instance;
    }

    get(value){
      if(!value) return null;
      if(typeof value === 'string' || typeof value === 'number') return this.instances.get(String(value)) || null;
      if(value.instanceId) return this.instances.get(String(value.instanceId)) || value;
      return null;
    }

    register(value){ return this.get(value); }

    idOf(value){ return this.get(value)?.instanceId || null; }

    labelOf(value){
      const instance = this.get(value);
      return instance ? (instance.id || instance.instanceId) : '(missing)';
    }

    typeOf(value){
      const instance = this.get(value);
      return instance ? this.registry.get(instance.typeId) : null;
    }

    _addRoot(nodeId, instanceId){
      const key = String(nodeId);
      const rows = this.rootsByNode.get(key) || [];
      if(!rows.includes(instanceId)) rows.push(instanceId);
      rows.sort((a, b)=> (this.get(a)?.arrivalSequence || 0) - (this.get(b)?.arrivalSequence || 0));
      this.rootsByNode.set(key, rows);
    }

    _removeRoot(nodeId, instanceId){
      if(nodeId == null) return;
      const key = String(nodeId);
      const rows = this.rootsByNode.get(key);
      if(!rows) return;
      const index = rows.indexOf(instanceId);
      if(index >= 0) rows.splice(index, 1);
      if(!rows.length) this.rootsByNode.delete(key);
    }

    rootsAt(nodeId){
      return (this.rootsByNode.get(String(nodeId)) || []).map((id)=>this.get(id)).filter(Boolean);
    }

    childrenOf(value){
      const instance = this.get(value);
      return instance ? instance.childIds.map((id)=>this.get(id)).filter(Boolean) : [];
    }

    parentOf(value){
      const instance = this.get(value);
      return instance?.parentId ? this.get(instance.parentId) : null;
    }

    nodeOf(value){
      let current = this.get(value);
      const seen = new Set();
      while(current && current.parentId && !seen.has(current.instanceId)){
        seen.add(current.instanceId);
        current = this.get(current.parentId);
      }
      return current?.locationNodeId ?? null;
    }

    descendantsOf(value){
      const rootInstance = this.get(value);
      if(!rootInstance) return [];
      const out = [];
      const queue = this.childrenOf(rootInstance);
      const seen = new Set([rootInstance.instanceId]);
      while(queue.length){
        const current = queue.shift();
        if(!current || seen.has(current.instanceId)) continue;
        seen.add(current.instanceId);
        out.push(current);
        queue.push(...this.childrenOf(current));
      }
      return out;
    }

    contains(parentValue, candidateValue){
      const parent = this.get(parentValue);
      let candidate = this.get(candidateValue);
      if(!parent || !candidate) return false;
      const seen = new Set();
      while(candidate && !seen.has(candidate.instanceId)){
        if(candidate.instanceId === parent.instanceId) return true;
        seen.add(candidate.instanceId);
        candidate = candidate.parentId ? this.get(candidate.parentId) : null;
      }
      return false;
    }

    canAttach(childValue, parentValue){
      const child = this.get(childValue);
      const parent = this.get(parentValue);
      if(!child || !parent) return { ok: false, reason: 'instance-not-found' };
      if(child.instanceId === parent.instanceId) return { ok: false, reason: 'self-parent' };
      if(this.contains(child, parent)) return { ok: false, reason: 'containment-cycle' };
      const parentType = this.typeOf(parent);
      if(!parentType || parentType.capacity <= 0) return { ok: false, reason: 'parent-cannot-contain' };
      if(parentType.allowedContentTypeIds.length && !parentType.allowedContentTypeIds.includes(child.typeId)) return { ok: false, reason: 'type-not-allowed' };
      const alreadyHere = child.parentId === parent.instanceId;
      if(!alreadyHere && parent.childIds.length >= parentType.capacity){
        return { ok: false, reason: 'capacity-full', capacity: parentType.capacity, count: parent.childIds.length };
      }
      return { ok: true, child, parent, parentType };
    }

    attach(childValue, parentValue){
      const check = this.canAttach(childValue, parentValue);
      if(!check.ok) return check;
      const child = check.child;
      const oldParent = this.parentOf(child);
      if(oldParent){
        const index = oldParent.childIds.indexOf(child.instanceId);
        if(index >= 0) oldParent.childIds.splice(index, 1);
      }else if(child.locationNodeId != null){
        this._removeRoot(child.locationNodeId, child.instanceId);
      }
      child.parentId = check.parent.instanceId;
      child.locationNodeId = null;
      if(!check.parent.childIds.includes(child.instanceId)) check.parent.childIds.push(child.instanceId);
      this.revision += 1;
      return { ok: true, child, parent: check.parent };
    }

    transfer(childValue, sourceValue, targetValue){
      const child = this.get(childValue);
      const source = this.get(sourceValue);
      if(!child) return { ok:false, reason:'instance-not-found' };
      if(source && child.parentId !== source.instanceId) return { ok:false, reason:'source-parent-mismatch' };
      return this.attach(child, targetValue);
    }

    detach(value){
      const child = this.get(value);
      if(!child) return { ok: false, reason: 'instance-not-found' };
      const parent = this.parentOf(child);
      if(!parent) return { ok: true, child, parent: null };
      const nodeId = this.nodeOf(parent);
      const index = parent.childIds.indexOf(child.instanceId);
      if(index >= 0) parent.childIds.splice(index, 1);
      child.parentId = null;
      child.locationNodeId = nodeId;
      child.arrivalSequence = ++this.arrivalSequence;
      child.attributes.__arrivedAtMs = runtimeNowMs(this.graph);
      if(nodeId != null) this._addRoot(nodeId, child.instanceId);
      this.revision += 1;
      return { ok: true, child, parent };
    }

    moveRoot(value, nodeId){
      const instance = this.get(value);
      if(!instance) return { ok: false, reason: 'instance-not-found' };
      if(instance.parentId) this.detach(instance);
      if(instance.locationNodeId != null) this._removeRoot(instance.locationNodeId, instance.instanceId);
      instance.locationNodeId = nodeId;
      instance.arrivalSequence = ++this.arrivalSequence;
      instance.attributes.__arrivedAtMs = runtimeNowMs(this.graph);
      if(nodeId != null) this._addRoot(nodeId, instance.instanceId);
      this.revision += 1;
      return { ok: true, instance };
    }

    destroy(value, options){
      const rootInstance = this.get(value);
      if(!rootInstance) return { ok: false, reason: 'instance-not-found' };
      const rows = [rootInstance, ...this.descendantsOf(rootInstance)];
      const parent = this.parentOf(rootInstance);
      if(parent){
        const index = parent.childIds.indexOf(rootInstance.instanceId);
        if(index >= 0) parent.childIds.splice(index, 1);
      }else if(rootInstance.locationNodeId != null){
        this._removeRoot(rootInstance.locationNodeId, rootInstance.instanceId);
      }
      const opts = isObject(options) ? options : {};
      const summary = {};
      for(const row of rows){
        summary[row.typeId] = (summary[row.typeId] || 0) + 1;
        this.instances.delete(row.instanceId);
      }
      if(opts.completed){
        this.completed.push({
          instanceId: rootInstance.instanceId,
          typeId: rootInstance.typeId,
          sinkNodeId: opts.sinkNodeId ?? null,
          completedAt: Number(opts.completedAt) || 0,
          summary
        });
      }
      this.revision += 1;
      return { ok: true, destroyed: rows.length, summary };
    }

    _targetMatches(instance, target){
      const normalized = normalizeTarget(target);
      if(normalized.mode === 'otherwise') return true;
      if(normalized.mode === 'any') return true;
      // Sequence is a virtual OUTPUT target that creates the next Entity. It
      // never matches an Instance already held by a node.
      if(normalized.mode === 'sequence') return false;
      if(normalized.mode === 'type') return instance.typeId === normalized.typeId;
      return false;
    }

    findInTree(rootValue, target){
      const rootInstance = this.get(rootValue);
      if(!rootInstance) return [];
      const out = [];
      const queue = [rootInstance];
      const seen = new Set();
      while(queue.length){
        const current = queue.shift();
        if(!current || seen.has(current.instanceId)) continue;
        seen.add(current.instanceId);
        if(this._targetMatches(current, target)) out.push(current);
        queue.push(...this.childrenOf(current));
      }
      return out;
    }

    findAtNode(nodeId, target){
      const out = [];
      for(const rootInstance of this.rootsAt(nodeId)) out.push(...this.findInTree(rootInstance, target));
      return out;
    }

    _validateRecipe(recipe, path){
      const errors = [];
      const type = this.registry.get(recipe.typeId);
      if(!type){
        errors.push({ code: 'INITIAL_TYPE_MISSING', path, typeId: recipe.typeId });
        return errors;
      }
      if(recipe.load === 'empty' && recipe.children.length){
        errors.push({ code: 'EMPTY_LOAD_HAS_CHILDREN', path, typeId: type.typeId });
      }
      if(recipe.load === 'full'){
        if(type.capacity <= 0) errors.push({ code: 'FULL_REQUIRES_POSITIVE_CAPACITY', path, typeId: type.typeId });
        if(!recipe.children.length && type.allowedContentTypeIds.length !== 1){
          errors.push({ code: 'FULL_COMPOSITION_REQUIRED', path, typeId: type.typeId });
        }else if(recipe.children.length){
          const total = recipe.children.reduce((sum, child)=>sum + child.quantity, 0);
          if(total !== type.capacity) errors.push({ code: 'FULL_COMPOSITION_MUST_EQUAL_CAPACITY', path, typeId: type.typeId, expected: type.capacity, actual: total });
        }
      }
      if(recipe.load === 'custom'){
        const total = recipe.children.reduce((sum, child)=>sum + child.quantity, 0);
        if(total > type.capacity) errors.push({ code: 'CUSTOM_COMPOSITION_EXCEEDS_CAPACITY', path, typeId: type.typeId, capacity: type.capacity, actual: total });
      }
      recipe.children.forEach((child, index)=>{
        if(type.allowedContentTypeIds.length && !type.allowedContentTypeIds.includes(child.typeId)){
          errors.push({ code: 'INITIAL_CHILD_TYPE_NOT_ALLOWED', path: `${path}.children[${index}]`, typeId: type.typeId, childTypeId: child.typeId });
        }
        errors.push(...this._validateRecipe(child, `${path}.children[${index}]`));
      });
      return errors;
    }

    validateInitialContents(node){
      const rows = (Array.isArray(node?.properties?.initialContents) ? node.properties.initialContents : []).map(normalizeRecipe);
      const errors = [];
      rows.forEach((row, index)=> errors.push(...this._validateRecipe(row, `initialContents[${index}]`)));
      return { ok: errors.length === 0, errors, recipes: rows };
    }

    _expandedChildren(recipe, type){
      if(recipe.load === 'empty') return [];
      if(recipe.load === 'full' && !recipe.children.length && type.allowedContentTypeIds.length === 1){
        return [{ typeId: type.allowedContentTypeIds[0], quantity: type.capacity, load: 'empty', children: [] }];
      }
      return recipe.children;
    }

    _createRecipe(recipe, locationNodeId, parent){
      const type = this.registry.get(recipe.typeId);
      if(!type) throw new Error(`Unknown Entity Type: ${recipe.typeId}`);
      const created = [];
      for(let index = 0; index < recipe.quantity; index++){
        const instance = this.create(type.typeId, { locationNodeId: parent ? null : locationNodeId });
        created.push(instance);
        if(parent){
          const attached = this.attach(instance, parent);
          if(!attached.ok) throw new Error(`Cannot create Initial Contents: ${attached.reason}`);
        }
        for(const childRecipe of this._expandedChildren(recipe, type)){
          this._createRecipe(childRecipe, locationNodeId, instance);
        }
      }
      return created;
    }

    initializeFromGraph(){
      this.clear();
      const nodes = (Array.isArray(this.graph?._nodes) ? this.graph._nodes.slice() : []).sort(stableNodeSort);
      const errors = [];
      for(const node of nodes){
        const validation = this.validateInitialContents(node);
        if(!validation.ok){
          errors.push(...validation.errors.map((entry)=>({ ...entry, nodeId: node.id })));
          continue;
        }
        for(const recipe of validation.recipes){
          try{ this._createRecipe(recipe, node.id, null); }
          catch(err){ errors.push({ code: 'INITIAL_CREATE_FAILED', nodeId: node.id, message: String(err?.message || err) }); }
        }
      }
      this.initializationErrors = errors;
      return { ok: errors.length === 0, instanceCount: this.instances.size, errors };
    }

    summaryAt(nodeId){
      const counts = {};
      for(const rootInstance of this.rootsAt(nodeId)){
        for(const instance of [rootInstance, ...this.descendantsOf(rootInstance)]){
          counts[instance.typeId] = (counts[instance.typeId] || 0) + 1;
        }
      }
      return Object.entries(counts).map(([typeId, quantity])=>({
        typeId,
        name: this.registry.get(typeId)?.name || typeId,
        quantity
      })).sort((a, b)=>a.name.localeCompare(b.name));
    }

    tree(value){
      const instance = this.get(value);
      if(!instance) return null;
      const seen = new Set();
      const build = (current)=>{
        if(!current || seen.has(current.instanceId)) return null;
        seen.add(current.instanceId);
        const type = this.typeOf(current);
        return {
          instanceId: current.instanceId,
          displayId: current.id,
          typeId: current.typeId,
          name: type?.name || current.typeId,
          attributes: clone(current.attributes, {}),
          children: this.childrenOf(current).map(build).filter(Boolean)
        };
      };
      return build(instance);
    }

    treesAt(nodeId){
      return this.rootsAt(nodeId).map((entry)=>this.tree(entry)).filter(Boolean);
    }

    exportSubtree(value){
      const tree = this.tree(value);
      return tree ? clone(tree, null) : null;
    }
  }

  function migrateLegacyInitialContents(graph, registry){
    let migrated = 0;
    const types = registry?.list?.() || [];
    for(const node of (Array.isArray(graph?._nodes) ? graph._nodes : [])){
      const props = isObject(node?.properties) ? node.properties : null;
      if(!props || (Array.isArray(props.initialContents) && props.initialContents.length)) continue;
      const transport = (Array.isArray(props.operations) ? props.operations : []).find((operation)=>normalizeText(operation?.kind).toLowerCase() === 'carrier-transport');
      if(!transport) continue;
      const initialCarrier = normalizeText(transport?.config?.initialCarrier);
      if(!initialCarrier || initialCarrier.toLowerCase() === 'undefined' || initialCarrier.toLowerCase() === 'none') continue;
      const needle = initialCarrier.toLowerCase();
      const type = types.find((entry)=>entry.typeId.toLowerCase() === needle || entry.name.toLowerCase() === needle);
      if(!type) continue;
      props.initialContents = [{ typeId: type.typeId, quantity: 1, load: 'empty', children: [] }];
      migrated += 1;
    }
    return migrated;
  }

  function currentContentsForNode(node, options){
    const graph = node?.graph || App.graph;
    const store = runtimeInstancesForGraph(graph);
    if(!node || !store) return { summary: [], instances: [] };
    const registry = store.registry;
    const includeInstances = options?.includeInstances !== false;
    const candidates = [];
    const push = (value)=>{
      if(!value || typeof value !== 'object') return;
      if(!candidates.includes(value)) candidates.push(value);
    };
    try{
      if(typeof node.getEntityRoots === 'function'){
        for(const value of (node.getEntityRoots() || [])) push(value);
      }
    }catch(_e){}
    [
      node._activeRoot, node._currentAgv, node._departingAgv, node._pallet,
      node._payload, node._currentWork, node._pendingWork, node._pendingTransfer,
      node._sourceHost, node._targetHost, node._palletOffer, node._workOffer
    ].forEach(push);
    [node._worksBySlot, node._recv, node._workQueue, node._palletQueue].forEach((rows)=>{
      if(Array.isArray(rows)) rows.forEach(push);
    });

    const legacyRoots = candidates.filter((value)=>!store.get(value));
    if(!legacyRoots.length){
      if(node._initialCarrierSpawned === true && App.basicNodeBehavior?.(node) === 'carrier_route'){
        return { summary: [], instances: [] };
      }
      return {
        summary: store.summaryAt(node.id),
        instances: includeInstances ? store.treesAt(node.id) : []
      };
    }

    const used = new Set();
    const typeFor = (value)=>{
      const direct = registry.get(normalizeText(value?.typeId));
      if(direct) return direct;
      const names = [value?.type, value?.id, value?.carrierId, value?.meta?.carrierId]
        .map((entry)=>normalizeText(entry).toLowerCase()).filter(Boolean);
      return registry.list().find((entry)=>names.includes(entry.typeId.toLowerCase()) || names.includes(entry.name.toLowerCase()))
        || null;
    };
    const legacyKindFor = (value)=>{
      const explicit = normalizeText(value?.entityKind || value?.kind).toLowerCase();
      if(LEGACY_CATEGORIES.has(explicit)) return explicit;
      if(Array.isArray(value?.cargo) || Array.isArray(value?.pallets) || value?.meta?.carrierId) return 'carrier';
      if(Array.isArray(value?.works) || value?.palletId != null) return 'container';
      return 'entity';
    };
    const childrenFor = (value)=>{
      const out = [];
      const append = (rows)=>{
        if(!Array.isArray(rows)) return;
        for(const child of rows){
          if(child && typeof child === 'object' && !out.includes(child)) out.push(child);
        }
      };
      append(value?.children);
      append(value?.pallets);
      append(value?.cargo);
      append(value?.works);
      return out;
    };
    const build = (value)=>{
      if(!value || typeof value !== 'object' || used.has(value)) return null;
      used.add(value);
      const runtime = store.get(value);
      if(runtime) return store.tree(runtime);
      const legacyKind = legacyKindFor(value);
      const type = typeFor(value);
      const displayId = normalizeText(value.id || value.instanceId || value.palletId) || `${type?.name || 'Entity'}`;
      return {
        instanceId: normalizeText(value.instanceId) || `legacy:${legacyKind}:${displayId}`,
        displayId,
        typeId: type?.typeId || `legacy-${legacyKind}`,
        name: type?.name || normalizeText(value.type) || 'Entity',
        attributes: clone(value.attributes || value.meta || {}, {}),
        children: childrenFor(value).map(build).filter(Boolean)
      };
    };
    const trees = [];
    for(const value of legacyRoots){
      const tree = build(value);
      if(tree) trees.push(tree);
    }
    const counts = new Map();
    const countTree = (tree)=>{
      if(!tree) return;
      const key = tree.typeId || tree.name;
      const current = counts.get(key) || { typeId: tree.typeId, name: tree.name, quantity: 0 };
      current.quantity += 1;
      counts.set(key, current);
      for(const child of (tree.children || [])) countTree(child);
    };
    trees.forEach(countTree);
    return {
      summary: Array.from(counts.values()).sort((a, b)=>a.name.localeCompare(b.name)),
      instances: includeInstances ? trees : []
    };
  }

  function valueAtPath(source, path){
    const parts = Array.isArray(path) ? path : normalizeText(path).split('.').filter(Boolean);
    let current = source;
    for(const key of parts){
      if(current == null) return undefined;
      current = current[key];
    }
    return current;
  }

  function compareAttribute(actual, operator, expected){
    switch(normalizeText(operator || 'eq').toLowerCase()){
      case 'ne': case '!=': return actual !== expected;
      case 'gt': case '>': return Number(actual) > Number(expected);
      case 'gte': case '>=': return Number(actual) >= Number(expected);
      case 'lt': case '<': return Number(actual) < Number(expected);
      case 'lte': case '<=': return Number(actual) <= Number(expected);
      case 'contains': return Array.isArray(actual) ? actual.includes(expected) : String(actual ?? '').includes(String(expected ?? ''));
      case 'exists': return typeof actual !== 'undefined';
      case 'eq': case '==': case '===': default: return actual === expected;
    }
  }

  function evaluateExpression(expression, instance, type){
    if(!isObject(expression)) return false;
    const op = normalizeText(expression.op || expression.kind).toLowerCase();
    const rows = Array.isArray(expression.children) ? expression.children : [];
    if(op === 'and') return rows.length > 0 && rows.every((row)=>evaluateExpression(row, instance, type));
    if(op === 'or') return rows.some((row)=>evaluateExpression(row, instance, type));
    if(op === 'not') return !evaluateExpression(expression.child || rows[0], instance, type);
    if(op === 'compare' || op === 'attribute'){
      const source = expression.source === 'type' ? type : instance?.attributes;
      return compareAttribute(valueAtPath(source, expression.path), expression.operator, expression.value);
    }
    return false;
  }

  function evaluateCondition(store, node, instance, condition, context){
    const spec = normalizeCondition(condition, 'always');
    const nodeId = node?.id;
    const roots = store.rootsAt(nodeId);
    const type = store.typeOf(instance);
    const ctx = isObject(context) ? context : {};
    switch(spec.kind){
      case 'all': return spec.conditions.length > 0 && spec.conditions.every((entry)=>evaluateCondition(store, node, instance, entry, ctx));
      case 'any': return spec.conditions.some((entry)=>evaluateCondition(store, node, instance, entry, ctx));
      case 'not': return !evaluateCondition(store, node, instance, spec.condition, ctx);
      case 'always': case 'available': return !!instance;
      case 'space-available': case 'not-full': {
        const capacity = Number(node?.properties?.contentCapacity);
        return !Number.isFinite(capacity) || capacity < 0 || roots.length < capacity;
      }
      case 'empty':
        return instance ? instance.childIds.length === 0 : roots.length === 0;
      case 'full':
        return !!instance && !!type && type.capacity > 0 && instance.childIds.length >= type.capacity;
      case 'count-reached': {
        const count = Math.max(0, Math.round(Number(spec.count ?? spec.value) || 0));
        if(instance && type) return instance.childIds.length >= count;
        return store.findAtNode(nodeId, ctx.target).length >= count;
      }
      case 'time-elapsed': {
        const elapsedMs = Math.max(0, Number(spec.ms ?? (Number(spec.seconds) * 1000)) || 0);
        const now = Number(ctx.nowMs) || 0;
        const arrivedAt = Number(instance?.attributes?.__arrivedAtMs ?? instance?.createdAt) || 0;
        return now - arrivedAt >= elapsedMs;
      }
      case 'downstream-ready': return ctx.downstreamReady !== false;
      case 'node-idle': case 'down-complete': {
        const stateName = normalizeText(node?._stateName).toLowerCase();
        return node?._state === 'IDLE' || stateName === 'idle' || /(?:^|_)idle(?:_|$)/.test(stateName);
      }
      case 'process-complete': {
        if(!ctx.processComplete) return false;
        const stageId = normalizeText(spec.stageId);
        if(!stageId || stageId === 'all') return true;
        return (Array.isArray(ctx.activeProcessStageIds) ? ctx.activeProcessStageIds : []).includes(stageId);
      }
      case 'shuttle-group-idle': return !!ctx.shuttleGroupIdle;
      case 'attribute-condition': {
        const source = spec.source === 'type' ? type : instance?.attributes;
        return compareAttribute(valueAtPath(source, spec.path), spec.operator, spec.value);
      }
      case 'custom': case 'custom-condition':
        return evaluateExpression(spec.expression || spec.ast, instance, type);
      default: return false;
    }
  }

  function normalizeRules(rows, kind){
    return (Array.isArray(rows) ? rows : []).map((raw, index)=>{
      const source = isObject(raw) ? raw : {};
      const targets = normalizeTargets(source.targets, source.target);
      const base = {
        ruleId: normalizeText(source.ruleId) || `${kind}-rule-${index + 1}`,
        flowRuleId: normalizeText(source.flowRuleId) || null,
        targets,
        target: targets[0]
      };
      if(kind === 'input'){
        base.acceptWhen = normalizeCondition(source.acceptWhen, 'always');
        base.fromPortId = normalizeText(source.fromPortId) || null;
        base.processStages = normalizeTimingStages(source.processStages, `${base.ruleId}-process`);
      }else{
        base.releaseWhen = normalizeCondition(source.releaseWhen, 'available');
        base.dispatch = normalizeText(source.dispatch) || 'first-match';
        const sourcePortIds = Array.isArray(source.toPortIds) && source.toPortIds.length ? source.toPortIds : [source.toPortId];
        base.toPortIds = [...new Set(sourcePortIds.map((entry)=>normalizeText(entry)).filter(Boolean))];
        base.toPortId = base.toPortIds[0] || null;
        base.downStages = normalizeTimingStages(source.downStages, `${base.ruleId}-down`);
      }
      return base;
    });
  }

  function selectRule(store, node, rules, context, kind){
    const normalized = normalizeRules(rules, kind);
    const nodeId = node?.id;
    const conditionContext = (rule, instance)=>{
      const resolved = { ...context, target: rule.target, rule };
      if(typeof context?.resolveDownstreamReady === 'function'){
        resolved.downstreamReady = !!context.resolveDownstreamReady(rule, instance);
      }
      return resolved;
    };
    for(const rule of normalized){
      const targets = Array.isArray(rule.targets) && rule.targets.length ? rule.targets : [rule.target];
      const explicitTargets = targets.filter((target)=>target.mode !== 'otherwise');
      for(const target of explicitTargets){
        const candidates = context?.incomingRoot
          ? store.findInTree(context.incomingRoot, target)
          : store.findAtNode(nodeId, target);
        for(const instance of candidates){
          const condition = kind === 'input' ? rule.acceptWhen : rule.releaseWhen;
          const resolvedRule = { ...rule, target };
          if(evaluateCondition(store, node, instance, condition, conditionContext(resolvedRule, instance))){
            return { rule: resolvedRule, instance };
          }
        }
      }
      if(targets.some((target)=>target.mode === 'otherwise')){
        const roots = store.rootsAt(nodeId);
        const candidate = roots[0] || null;
        const condition = kind === 'input' ? rule.acceptWhen : rule.releaseWhen;
        if(evaluateCondition(store, node, candidate, condition, conditionContext(rule, candidate))) return { rule, instance: candidate };
      }
    }
    return null;
  }

  function entityModelForGraph(graph){
    const g = graph || App.graph;
    if(!g) return null;
    if(!(g.__factSimTypeRegistry instanceof EntityTypeRegistry)){
      g.__factSimTypeRegistry = new EntityTypeRegistry(g, g.__factSimEntityModel || null);
    }
    return g.__factSimTypeRegistry;
  }

  function runtimeInstancesForGraph(graph){
    const g = graph || App.graph;
    if(!g) return null;
    const registry = entityModelForGraph(g);
    if(!(g.__factSimRuntimeInstances instanceof RuntimeInstanceStore)){
      g.__factSimRuntimeInstances = new RuntimeInstanceStore(g, registry);
    }
    return g.__factSimRuntimeInstances;
  }

  function migrateLegacyGraphShape(graph){
    for(const node of (Array.isArray(graph?._nodes) ? graph._nodes : [])){
      node.properties = isObject(node?.properties) ? node.properties : {};
      const roleForLegacyCategory = (value)=>{
        const category = normalizeText(value).toLowerCase();
        if(category === 'work' || category === 'item' || category === 'product') return 'item';
        if(category === 'carrier' || category === 'agv' || category === 'vehicle') return 'transport';
        if(category === 'container' || category === 'pallet') return 'attachment';
        return '';
      };
      const migrateRules = (rules, direction)=>{
        const ports = direction === 'input' ? (node.inputs || []) : (node.outputs || []);
        const byId = new Map(ports.map((port)=>[normalizeText(port?.portId), port]));
        const migrated = (Array.isArray(rules) ? rules : []).map((source)=>{
          if(!isObject(source)) return source;
          const rule = clone(source, source);
          const rawTargets = Array.isArray(rule.targets) && rule.targets.length ? rule.targets : [rule.target];
          const legacyRole = normalizeText(rule.entityRole) || rawTargets
            .map((target)=>target?.mode === 'category' ? roleForLegacyCategory(target?.category) : '')
            .find(Boolean) || '';
          if(legacyRole) rule.entityRole = legacyRole;
          const portIds = direction === 'input'
            ? [rule.fromPortId]
            : (Array.isArray(rule.toPortIds) && rule.toPortIds.length ? rule.toPortIds : [rule.toPortId]);
          for(const portId of portIds){
            const port = byId.get(normalizeText(portId));
            if(port && legacyRole && !normalizeText(port.entityRole)) port.entityRole = legacyRole;
          }
          return rule;
        });
        return normalizeRules(migrated, direction);
      };
      if(Array.isArray(node.properties.inputRules)) node.properties.inputRules = migrateRules(node.properties.inputRules, 'input');
      if(Array.isArray(node.properties.outputRules)) node.properties.outputRules = migrateRules(node.properties.outputRules, 'output');
      if(Array.isArray(node.properties.operations)){
        node.properties.operations = node.properties.operations.map((operation)=>{
          if(!isObject(operation)) return operation;
          const next = clone(operation, operation);
          if(normalizeText(next.kind).toLowerCase() === 'carrier-transport') next.kind = 'entity-transport';
          return next;
        });
      }
      for(const port of [...(node.inputs || []), ...(node.outputs || [])]){
        const channel = normalizeText(port?.channel || port?.type).toLowerCase();
        if(channel === 'signal' || channel === '-1') continue;
        if(!normalizeText(port.entityRole)) port.entityRole = roleForLegacyCategory(channel) || undefined;
        port.channel = 'entity';
        port.type = 'entity';
      }
    }
  }

  function restoreEntityModel(graph, data, initialize){
    const g = graph || App.graph;
    if(!g) return null;
    const model = clone(data?.[MODEL_KEY] || data || { schemaVersion: SCHEMA_VERSION, types: [] }, { schemaVersion: SCHEMA_VERSION, types: [] });
    migrateLegacyGraphShape(g);
    g.__factSimEntityModel = model;
    g.__factSimTypeRegistry = new EntityTypeRegistry(g, model);
    migrateLegacyInitialContents(g, g.__factSimTypeRegistry);
    g.__factSimRuntimeInstances = new RuntimeInstanceStore(g, g.__factSimTypeRegistry);
    if(initialize !== false) g.__factSimRuntimeInstances.initializeFromGraph();
    return g.__factSimTypeRegistry;
  }

  function injectEntityModel(serialized, graph){
    if(!serialized || typeof serialized !== 'object') return serialized;
    const registry = entityModelForGraph(graph);
    serialized[MODEL_KEY] = registry ? registry.serialize() : { schemaVersion: SCHEMA_VERSION, types: [] };
    return serialized;
  }

  function initializeEntityRuntime(graph){
    const g = graph || App.graph;
    if(!g) return { ok: false, errors: [{ code: 'GRAPH_REQUIRED' }] };
    const registry = entityModelForGraph(g);
    migrateLegacyInitialContents(g, registry);
    g.__factSimRuntimeInstances = new RuntimeInstanceStore(g, registry);
    return g.__factSimRuntimeInstances.initializeFromGraph();
  }

  function validateEntityModel(graph){
    const g = graph || App.graph;
    const registry = entityModelForGraph(g);
    if(!registry) return { ok: false, errors: [{ code: 'GRAPH_REQUIRED' }], warnings: [] };
    const result = registry.validate();
    const store = new RuntimeInstanceStore(g, registry);
    const nodes = Array.isArray(g?._nodes) ? g._nodes : [];
    for(const node of nodes){
      const validation = store.validateInitialContents(node);
      result.errors.push(...validation.errors.map((entry)=>({ ...entry, nodeId: node.id })));
      const hasSequenceTarget = (Array.isArray(node?.properties?.outputRules) ? node.properties.outputRules : [])
        .some((rule)=>normalizeTargets(rule?.targets, rule?.target).some((target)=>target.mode === 'sequence'));
      if(hasSequenceTarget){
        const sourceValidation = inspectSourceSequence(node, registry);
        result.errors.push(...sourceValidation.errors);
      }
    }
    result.ok = result.errors.length === 0;
    return result;
  }

  App.ENTITY_MODEL_KEY = MODEL_KEY;
  App.ENTITY_MODEL_SCHEMA_VERSION = SCHEMA_VERSION;
  App.ENTITY_SHAPES = ENTITY_SHAPES;
  App.ENTITY_COLOR_THEMES = ENTITY_COLOR_THEMES;
  App.normalizeEntityAppearance = normalizeAppearance;
  App.EntityTypeRegistry = EntityTypeRegistry;
  App.RuntimeInstanceStore = RuntimeInstanceStore;
  App.entityModelForGraph = entityModelForGraph;
  App.runtimeInstancesForGraph = runtimeInstancesForGraph;
  App.currentContentsForNode = currentContentsForNode;
  App.migrateLegacyInitialContents = migrateLegacyInitialContents;
  App.migrateLegacyEntityGraphShape = migrateLegacyGraphShape;
  App.restoreEntityModel = restoreEntityModel;
  App.injectEntityModel = injectEntityModel;
  App.initializeEntityRuntime = initializeEntityRuntime;
  App.validateEntityModel = validateEntityModel;
  App.normalizeEntityRecipe = normalizeRecipe;
  App.nextSourceSequenceEntryId = nextSourceSequenceEntryId;
  App.inspectSourceSequence = inspectSourceSequence;
  App.normalizeSourceSequence = normalizeSourceSequence;
  App.ensureSourceSequence = ensureSourceSequence;
  App.sourceSequenceTarget = sourceSequenceTarget;
  App.sourceSequenceRows = sourceSequenceRows;
  App.normalizeEntityRules = normalizeRules;
  App.selectEntityRule = selectRule;
  App.evaluateEntityCondition = evaluateCondition;
  App.evaluateEntityExpression = evaluateExpression;
  App.normalizeEntityTarget = normalizeTarget;
  App.normalizeEntityTargets = normalizeTargets;
  App.resetRuntimeInstances = initializeEntityRuntime;
})(typeof self !== 'undefined' ? self : window);
