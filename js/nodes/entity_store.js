// Unified transport entity registry and containment operations.
// Runtime entities remain regular objects for backward compatibility. The store
// adds identity and parent/child relations without forcing nested object copies.

(function(root){
  'use strict';

  const App = root.App || (root.App = {});
  const LEGACY_CHILD_KEYS = ['contents', 'children', 'cargo', 'pallets', 'works'];

  function isObject(value){
    return !!value && typeof value === 'object';
  }

  function normalizeKind(value){
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    const aliases = {
      agv: 'carrier', vehicle: 'carrier', truck: 'carrier', trailer: 'carrier',
      boat: 'ship', vessel: 'ship', item: 'work', product: 'work'
    };
    return aliases[raw] || raw || 'entity';
  }

  function inferKind(entity){
    if(!isObject(entity)) return 'entity';
    const explicit = entity.entityKind ?? entity.kind ?? entity.meta?.entityKind;
    if(explicit) return normalizeKind(explicit);
    if(typeof root.Work === 'function' && entity instanceof root.Work) return 'work';
    if(typeof root.AGV === 'function' && entity instanceof root.AGV) return 'carrier';
    if(Object.prototype.hasOwnProperty.call(entity, 'palletId') || Array.isArray(entity.works)) return 'pallet';
    if(Array.isArray(entity.pallets) || Array.isArray(entity.cargo)) return 'carrier';
    return 'entity';
  }

  function displayId(entity, fallback){
    if(!isObject(entity)) return String(fallback || 'entity');
    const value = entity.entityId ?? entity.palletId ?? entity.id ?? entity.name;
    const text = String(value == null ? '' : value).trim();
    return text || String(fallback || 'entity');
  }

  function parseKindList(value){
    if(Array.isArray(value)) return value.map(normalizeKind).filter(Boolean);
    return String(value == null ? '' : value)
      .split(/[\s,;|]+/)
      .map(normalizeKind)
      .filter((item)=> item && item !== 'entity');
  }

  class EntityStore{
    constructor(graph){
      this.graph = graph || null;
      this.entities = new Map();
      this.relations = new Map();
      this.childrenByParent = new Map();
      this.objectIds = new WeakMap();
      this.sequence = 0;
      this.revision = 0;
    }

    clear(){
      this.entities.clear();
      this.relations.clear();
      this.childrenByParent.clear();
      this.objectIds = new WeakMap();
      this.sequence = 0;
      this.revision += 1;
    }

    _nextInternalId(entity, kind){
      const label = displayId(entity, kind).replace(/[^a-zA-Z0-9_.:-]+/g, '-');
      let candidate = `${kind}:${label}`;
      while(this.entities.has(candidate) && this.entities.get(candidate) !== entity){
        this.sequence += 1;
        candidate = `${kind}:${label}:${this.sequence}`;
      }
      return candidate;
    }

    register(entity, options){
      if(!isObject(entity)) return null;
      const existing = this.objectIds.get(entity);
      if(existing && this.entities.get(existing) === entity) return existing;

      const opts = options || {};
      const kind = normalizeKind(opts.kind || inferKind(entity));
      let internalId = String(opts.internalId || '').trim();
      if(!internalId) internalId = this._nextInternalId(entity, kind);
      if(this.entities.has(internalId) && this.entities.get(internalId) !== entity){
        internalId = this._nextInternalId(entity, kind);
      }

      this.entities.set(internalId, entity);
      this.objectIds.set(entity, internalId);
      try{
        if(!entity.entityKind) entity.entityKind = kind;
      }catch(_e){}
      this.revision += 1;

      if(opts.scanLegacy !== false) this.syncLegacyTree(entity, opts.mode);
      return internalId;
    }

    resolve(value){
      if(isObject(value)){
        const id = this.objectIds.get(value) || this.register(value);
        return id ? this.entities.get(id) || null : null;
      }
      const key = String(value == null ? '' : value).trim();
      if(!key) return null;
      if(this.entities.has(key)) return this.entities.get(key) || null;
      for(const [id, entity] of this.entities){
        if(id === key || displayId(entity, '') === key) return entity;
      }
      return null;
    }

    idOf(value){
      if(!isObject(value)){
        const resolved = this.resolve(value);
        return resolved ? this.objectIds.get(resolved) || null : null;
      }
      return this.objectIds.get(value) || this.register(value);
    }

    kindOf(value){
      const entity = this.resolve(value);
      return inferKind(entity);
    }

    labelOf(value){
      const entity = this.resolve(value);
      if(!entity) return '(missing)';
      return displayId(entity, this.idOf(entity));
    }

    relationOf(value){
      const id = this.idOf(value);
      return id ? this.relations.get(id) || null : null;
    }

    parentOf(value){
      const relation = this.relationOf(value);
      return relation ? this.entities.get(relation.parentId) || null : null;
    }

    childrenOf(value, options){
      const parentId = this.idOf(value);
      if(!parentId) return [];
      const ids = this.childrenByParent.get(parentId) || [];
      const kind = normalizeKind(options?.kind || '');
      const rows = ids.map((id)=> this.entities.get(id)).filter(Boolean);
      return kind && kind !== 'entity' && kind !== 'any' ? rows.filter((entity)=> inferKind(entity) === kind) : rows;
    }

    descendantsOf(value, options){
      const opts = options || {};
      const maxDepth = Math.max(1, Number(opts.maxDepth) || 64);
      const kind = normalizeKind(opts.kind || '');
      const out = [];
      const queue = this.childrenOf(value).map((entity)=> ({ entity, depth: 1 }));
      const seen = new Set();
      while(queue.length){
        const row = queue.shift();
        const id = this.idOf(row.entity);
        if(!id || seen.has(id)) continue;
        seen.add(id);
        if(!kind || kind === 'entity' || kind === 'any' || inferKind(row.entity) === kind) out.push(row.entity);
        if(row.depth >= maxDepth) continue;
        for(const child of this.childrenOf(row.entity)) queue.push({ entity: child, depth: row.depth + 1 });
      }
      return out;
    }

    contains(parent, candidate){
      const parentId = this.idOf(parent);
      let currentId = this.idOf(candidate);
      if(!parentId || !currentId) return false;
      const seen = new Set();
      while(currentId && !seen.has(currentId)){
        if(currentId === parentId) return true;
        seen.add(currentId);
        currentId = this.relations.get(currentId)?.parentId || null;
      }
      return false;
    }

    _capacityFor(parent, childKind){
      const kind = inferKind(parent);
      const direct = Number(parent.maxChildren ?? parent.capacityByKind?.[childKind]);
      if(Number.isFinite(direct) && direct >= 0) return Math.floor(direct);
      if(kind === 'pallet' && childKind === 'work'){
        const cap = Number(parent.capacity);
        return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : Infinity;
      }
      if(kind === 'carrier' && childKind === 'pallet'){
        const cap = Number(parent.meta?.palletCapacity);
        return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : Infinity;
      }
      if(kind === 'carrier' && childKind === 'work'){
        const cap = Number(parent.capacity ?? parent.meta?.capacity);
        return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : Infinity;
      }
      const cap = Number(parent.capacity);
      return Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : Infinity;
    }

    canAttach(childValue, parentValue, options){
      const child = this.resolve(childValue);
      const parent = this.resolve(parentValue);
      if(!child || !parent) return { ok: false, reason: 'entity-not-found' };
      const childId = this.idOf(child);
      const parentId = this.idOf(parent);
      if(childId === parentId) return { ok: false, reason: 'self-parent' };
      if(this.contains(child, parent)) return { ok: false, reason: 'containment-cycle' };

      const opts = options || {};
      const childKind = inferKind(child);
      const accepts = parseKindList(parent.accepts ?? parent.meta?.accepts ?? opts.accepts);
      if(accepts.length && !accepts.includes(childKind) && !accepts.includes('any')){
        return { ok: false, reason: `kind-${childKind}-not-accepted` };
      }

      const current = this.relations.get(childId);
      const siblings = this.childrenOf(parent, { kind: childKind });
      const alreadyHere = current && current.parentId === parentId;
      const capacity = this._capacityFor(parent, childKind);
      if(!alreadyHere && Number.isFinite(capacity) && siblings.length >= capacity){
        return { ok: false, reason: 'capacity-full', capacity, count: siblings.length };
      }
      return { ok: true, child, parent, childId, parentId, capacity };
    }

    _removeChildIndex(parentId, childId){
      if(!parentId) return;
      const rows = this.childrenByParent.get(parentId);
      if(!rows) return;
      const idx = rows.indexOf(childId);
      if(idx >= 0) rows.splice(idx, 1);
      if(!rows.length) this.childrenByParent.delete(parentId);
    }

    _removeLegacyReference(parent, child){
      if(!isObject(parent)) return;
      for(const key of LEGACY_CHILD_KEYS){
        const rows = parent[key];
        if(!Array.isArray(rows)) continue;
        let idx = rows.indexOf(child);
        while(idx >= 0){
          rows.splice(idx, 1);
          idx = rows.indexOf(child);
        }
      }
    }

    _addLegacyReference(parent, child){
      if(!isObject(parent) || !isObject(child)) return;
      const parentKind = inferKind(parent);
      const childKind = inferKind(child);
      let key = 'contents';
      if(parentKind === 'pallet' && childKind === 'work') key = 'works';
      else if(parentKind === 'carrier' && childKind === 'pallet') key = 'pallets';
      else if(parentKind === 'carrier' && childKind === 'work') key = 'cargo';
      if(!Array.isArray(parent[key])) parent[key] = [];
      if(!parent[key].includes(child)) parent[key].push(child);
    }

    attach(childValue, parentValue, options){
      const check = this.canAttach(childValue, parentValue, options);
      if(!check.ok) return check;
      const current = this.relations.get(check.childId) || null;
      const oldParent = current ? this.entities.get(current.parentId) || null : null;
      if(current) this._removeChildIndex(current.parentId, check.childId);
      if(oldParent) this._removeLegacyReference(oldParent, check.child);

      const relation = {
        childId: check.childId,
        parentId: check.parentId,
        mode: String(options?.mode || current?.mode || 'inside').trim().toLowerCase() || 'inside',
        slot: options?.slot == null ? null : String(options.slot)
      };
      // Keep the compatibility tree and the canonical relation in agreement.
      // syncLegacyTree reads this field when legacy arrays are reconciled.
      check.child.relationMode = relation.mode;
      this.relations.set(check.childId, relation);
      const rows = this.childrenByParent.get(check.parentId) || [];
      if(!rows.includes(check.childId)) rows.push(check.childId);
      this.childrenByParent.set(check.parentId, rows);
      this._addLegacyReference(check.parent, check.child);
      this.revision += 1;
      return { ok: true, child: check.child, parent: check.parent, relation };
    }

    detach(childValue){
      const child = this.resolve(childValue);
      if(!child) return { ok: false, reason: 'entity-not-found' };
      const childId = this.idOf(child);
      const relation = this.relations.get(childId);
      if(!relation) return { ok: true, child, parent: null, relation: null };
      const parent = this.entities.get(relation.parentId) || null;
      this.relations.delete(childId);
      this._removeChildIndex(relation.parentId, childId);
      if(parent) this._removeLegacyReference(parent, child);
      this.revision += 1;
      return { ok: true, child, parent, relation };
    }

    transfer(childValue, fromValue, toValue, options){
      const child = this.resolve(childValue);
      const from = fromValue == null ? this.parentOf(child) : this.resolve(fromValue);
      const to = this.resolve(toValue);
      if(!child || !to) return { ok: false, reason: 'entity-not-found' };
      const actualParent = this.parentOf(child);
      if(from && actualParent && this.idOf(from) !== this.idOf(actualParent)){
        return { ok: false, reason: 'source-parent-mismatch' };
      }
      return this.attach(child, to, options);
    }

    syncLegacyTree(rootEntity, defaultMode, seen){
      if(!isObject(rootEntity)) return null;
      const visited = seen || new WeakSet();
      if(visited.has(rootEntity)) return this.idOf(rootEntity);
      visited.add(rootEntity);
      const parentId = this.objectIds.get(rootEntity) || this.register(rootEntity, { scanLegacy: false });
      const parentKind = inferKind(rootEntity);

      const legacyChildren = new Set();
      let hasLegacyCollection = false;
      for(const key of LEGACY_CHILD_KEYS){
        const rows = rootEntity[key];
        if(!Array.isArray(rows)) continue;
        hasLegacyCollection = true;
        for(const child of rows) if(isObject(child)) legacyChildren.add(child);
      }
      if(hasLegacyCollection){
        const indexed = (this.childrenByParent.get(parentId) || []).slice();
        for(const childId of indexed){
          const child = this.entities.get(childId);
          if(child && !legacyChildren.has(child)) this.detach(child);
        }
      }

      for(const key of LEGACY_CHILD_KEYS){
        const children = rootEntity[key];
        if(!Array.isArray(children)) continue;
        for(const child of children){
          if(!isObject(child)) continue;
          this.register(child, { scanLegacy: false });
          let mode = String(child.relationMode || defaultMode || 'inside').trim().toLowerCase() || 'inside';
          if(!child.relationMode && parentKind === 'carrier' && key === 'pallets') mode = 'towed';
          else if(!child.relationMode && parentKind === 'carrier') mode = 'carried';
          this.attach(child, rootEntity, { mode });
          this.syncLegacyTree(child, mode, visited);
        }
      }
      return parentId;
    }

    tree(value, options){
      const entity = this.resolve(value);
      if(!entity) return null;
      const opts = options || {};
      const maxDepth = Math.max(0, Number(opts.maxDepth) || 12);
      const build = (current, depth, seen)=>{
        const id = this.idOf(current);
        const relation = this.relationOf(current);
        const row = {
          internalId: id,
          id: displayId(current, id),
          kind: inferKind(current),
          mode: relation?.mode || 'root',
          capacity: this._capacityFor(current, 'work'),
          children: []
        };
        if(depth >= maxDepth || seen.has(id)) return row;
        const nextSeen = new Set(seen);
        nextSeen.add(id);
        row.children = this.childrenOf(current).map((child)=> build(child, depth + 1, nextSeen));
        return row;
      };
      return build(entity, 0, new Set());
    }
  }

  function entityStoreForGraph(graph){
    if(!graph || typeof graph !== 'object') return null;
    if(!(graph.__factSimEntityStore instanceof EntityStore)){
      graph.__factSimEntityStore = new EntityStore(graph);
    }
    return graph.__factSimEntityStore;
  }

  App.EntityStore = EntityStore;
  App.entityStoreForGraph = entityStoreForGraph;
  App.resetEntityStore = function(graph){
    if(!graph || typeof graph !== 'object') return null;
    graph.__factSimEntityStore = new EntityStore(graph);
    return graph.__factSimEntityStore;
  };
  App.inferEntityKind = inferKind;
  App.entityDisplayId = displayId;
  root.FactSimEntityStore = EntityStore;
})(typeof self !== 'undefined' ? self : window);
