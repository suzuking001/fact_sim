// Canonical FACT SIM entity type, runtime instance, contents, and rule model.
// Model data is persisted. Runtime instances are deliberately graph-local and
// are rebuilt from node Initial Contents whenever a graph is loaded or reset.

(function(root){
  'use strict';

  const App = root.App || (root.App = {});
  const MODEL_KEY = '__factSimEntityModel';
  const SCHEMA_VERSION = 1;
  const CATEGORIES = new Set(['work', 'container', 'carrier']);
  const LOAD_MODES = new Set(['empty', 'full', 'custom']);

  function isObject(value){
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value, fallback){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return fallback; }
  }

  function normalizeText(value){
    return String(value == null ? '' : value).trim();
  }

  function normalizeCategory(value){
    const raw = normalizeText(value).toLowerCase();
    if(raw === 'agv' || raw === 'vehicle') return 'carrier';
    if(raw === 'pallet' || raw === 'box' || raw === 'tray' || raw === 'ship') return 'container';
    return CATEGORIES.has(raw) ? raw : 'work';
  }

  function normalizeCapacity(value, category){
    if(category === 'work') return 0;
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : 0;
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
    const category = normalizeCategory(source.category);
    const typeId = normalizeText(source.typeId || fallbackId);
    return {
      typeId,
      name: normalizeText(source.name) || typeId || 'Entity',
      category,
      subtype: normalizeText(source.subtype),
      tags: Array.from(new Set((Array.isArray(source.tags) ? source.tags : [])
        .map(normalizeText).filter(Boolean))),
      capacity: normalizeCapacity(source.capacity, category),
      allowedContentTypeIds: Array.from(new Set((Array.isArray(source.allowedContentTypeIds)
        ? source.allowedContentTypeIds : []).map(normalizeText).filter(Boolean))),
      defaultAttributes: isObject(source.defaultAttributes) ? clone(source.defaultAttributes, {}) : {}
    };
  }

  function normalizeTarget(value){
    if(typeof value === 'string'){
      const text = normalizeText(value);
      if(text.toLowerCase() === 'otherwise') return { mode: 'otherwise' };
      if(CATEGORIES.has(text.toLowerCase())) return { mode: 'category', category: text.toLowerCase() };
      return { mode: 'type', typeId: text };
    }
    const source = isObject(value) ? value : {};
    const mode = normalizeText(source.mode || source.kind).toLowerCase();
    if(mode === 'otherwise') return { mode: 'otherwise' };
    if(mode === 'category') return { mode: 'category', category: normalizeCategory(source.category) };
    return { mode: 'type', typeId: normalizeText(source.typeId || source.value) };
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
      const next = normalizeTypeRecord({ ...(current || {}), ...raw, typeId }, typeId);
      const duplicate = this.list().find((row)=> row.typeId !== typeId && row.name.toLowerCase() === next.name.toLowerCase());
      if(duplicate) throw new Error(`Entity Type name already exists: ${next.name}`);
      this.types.set(typeId, next);
      this._touch();
      return clone(next, next);
    }

    ensureLegacyType(name, category, options){
      const label = normalizeText(name) || 'Legacy Entity';
      const wantedCategory = normalizeCategory(category);
      const found = this.list().find((row)=> row.name === label && row.category === wantedCategory);
      if(found) return found;
      const opts = isObject(options) ? options : {};
      return this.upsert({
        name: label,
        category: wantedCategory,
        subtype: opts.subtype || (wantedCategory === 'container' ? label : ''),
        capacity: opts.capacity || 0,
        allowedContentTypeIds: opts.allowedContentTypeIds || [],
        defaultAttributes: opts.defaultAttributes || {}
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
        for(const key of ['inputRules', 'outputRules']){
          (Array.isArray(props[key]) ? props[key] : []).forEach((rule, index)=>{
            const target = normalizeTarget(rule?.target);
            if(target.mode === 'type' && target.typeId === id){
              refs.push({ kind: 'node', id: node.id, field: `${key}[${index}].target` });
            }
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
        if(!CATEGORIES.has(row.category)) errors.push({ code: 'TYPE_CATEGORY_INVALID', typeId: row.typeId });
        if(row.category === 'work' && row.capacity !== 0) errors.push({ code: 'WORK_CAPACITY_MUST_BE_ZERO', typeId: row.typeId });
        for(const allowedId of row.allowedContentTypeIds){
          if(!this.types.has(allowedId)) errors.push({ code: 'ALLOWED_TYPE_MISSING', typeId: row.typeId, allowedTypeId: allowedId });
        }
        if(row.category !== 'work' && row.capacity === 0 && row.allowedContentTypeIds.length){
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
        type: normalizeText(opts.legacyType) || type.name,
        entityKind: type.category
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
      if(!parentType || parentType.category === 'work') return { ok: false, reason: 'parent-cannot-contain' };
      if(!parentType.allowedContentTypeIds.includes(child.typeId)) return { ok: false, reason: 'type-not-allowed' };
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
      if(normalized.mode === 'type') return instance.typeId === normalized.typeId;
      const type = this.typeOf(instance);
      return !!type && type.category === normalized.category;
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
      if(type.category === 'work' && recipe.children.length){
        errors.push({ code: 'WORK_CANNOT_HAVE_CONTENTS', path, typeId: type.typeId });
      }
      if(recipe.load === 'empty' && recipe.children.length){
        errors.push({ code: 'EMPTY_LOAD_HAS_CHILDREN', path, typeId: type.typeId });
      }
      if(recipe.load === 'full'){
        if(type.capacity <= 0) errors.push({ code: 'FULL_REQUIRES_POSITIVE_CAPACITY', path, typeId: type.typeId });
        if(type.allowedContentTypeIds.length > 1){
          const total = recipe.children.reduce((sum, child)=>sum + child.quantity, 0);
          if(total !== type.capacity) errors.push({ code: 'FULL_COMPOSITION_MUST_EQUAL_CAPACITY', path, typeId: type.typeId, expected: type.capacity, actual: total });
        }
      }
      if(recipe.load === 'custom'){
        const total = recipe.children.reduce((sum, child)=>sum + child.quantity, 0);
        if(total > type.capacity) errors.push({ code: 'CUSTOM_COMPOSITION_EXCEEDS_CAPACITY', path, typeId: type.typeId, capacity: type.capacity, actual: total });
      }
      recipe.children.forEach((child, index)=>{
        if(!type.allowedContentTypeIds.includes(child.typeId)){
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
          category: type?.category || 'work',
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
        if(instance && type && type.category !== 'work') return instance.childIds.length === 0;
        return roots.length === 0;
      case 'full':
        return !!instance && !!type && type.category !== 'work' && instance.childIds.length === type.capacity;
      case 'count-reached': {
        const count = Math.max(0, Math.round(Number(spec.count ?? spec.value) || 0));
        if(instance && type && type.category !== 'work') return instance.childIds.length >= count;
        return store.findAtNode(nodeId, ctx.target).length >= count;
      }
      case 'time-elapsed': {
        const elapsedMs = Math.max(0, Number(spec.ms ?? (Number(spec.seconds) * 1000)) || 0);
        const now = Number(ctx.nowMs) || 0;
        const arrivedAt = Number(instance?.attributes?.__arrivedAtMs ?? instance?.createdAt) || 0;
        return now - arrivedAt >= elapsedMs;
      }
      case 'downstream-ready': return ctx.downstreamReady !== false;
      case 'process-complete': return !!ctx.processComplete;
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
      const base = {
        ruleId: normalizeText(source.ruleId) || `${kind}-rule-${index + 1}`,
        target: normalizeTarget(source.target)
      };
      if(kind === 'input'){
        base.acceptWhen = normalizeCondition(source.acceptWhen, 'always');
        base.fromPortId = normalizeText(source.fromPortId) || null;
      }else{
        base.releaseWhen = normalizeCondition(source.releaseWhen, 'available');
        base.toPortId = normalizeText(source.toPortId) || null;
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
      if(rule.target.mode === 'otherwise'){
        const roots = store.rootsAt(nodeId);
        const candidate = roots[0] || null;
        const condition = kind === 'input' ? rule.acceptWhen : rule.releaseWhen;
        if(evaluateCondition(store, node, candidate, condition, conditionContext(rule, candidate))) return { rule, instance: candidate };
        continue;
      }
      const candidates = context?.incomingRoot
        ? store.findInTree(context.incomingRoot, rule.target)
        : store.findAtNode(nodeId, rule.target);
      for(const instance of candidates){
        const condition = kind === 'input' ? rule.acceptWhen : rule.releaseWhen;
        if(evaluateCondition(store, node, instance, condition, conditionContext(rule, instance))) return { rule, instance };
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

  function restoreEntityModel(graph, data, initialize){
    const g = graph || App.graph;
    if(!g) return null;
    const model = clone(data?.[MODEL_KEY] || data || { schemaVersion: SCHEMA_VERSION, types: [] }, { schemaVersion: SCHEMA_VERSION, types: [] });
    g.__factSimEntityModel = model;
    g.__factSimTypeRegistry = new EntityTypeRegistry(g, model);
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
    }
    result.ok = result.errors.length === 0;
    return result;
  }

  App.ENTITY_MODEL_KEY = MODEL_KEY;
  App.ENTITY_MODEL_SCHEMA_VERSION = SCHEMA_VERSION;
  App.EntityTypeRegistry = EntityTypeRegistry;
  App.RuntimeInstanceStore = RuntimeInstanceStore;
  App.entityModelForGraph = entityModelForGraph;
  App.runtimeInstancesForGraph = runtimeInstancesForGraph;
  App.restoreEntityModel = restoreEntityModel;
  App.injectEntityModel = injectEntityModel;
  App.initializeEntityRuntime = initializeEntityRuntime;
  App.validateEntityModel = validateEntityModel;
  App.normalizeEntityRecipe = normalizeRecipe;
  App.normalizeEntityRules = normalizeRules;
  App.selectEntityRule = selectRule;
  App.evaluateEntityCondition = evaluateCondition;
  App.evaluateEntityExpression = evaluateExpression;
  App.normalizeEntityTarget = normalizeTarget;
  App.resetRuntimeInstances = initializeEntityRuntime;
})(typeof self !== 'undefined' ? self : window);
