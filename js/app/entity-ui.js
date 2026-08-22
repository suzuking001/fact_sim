// Entity Type manager and Basic/Flow/Contents/Advanced inspector tabs.

(function(root){
  'use strict';
  const App = root.App || (root.App = {});

  function isObject(value){ return !!value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value, fallback){ try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return fallback; } }
  function running(){ return typeof root.isSimRunning === 'function' && root.isSimRunning(); }
  function changed(mutator){
    const graph = App.graph;
    let opened = false;
    try{
      if(graph?.beforeChange){ graph.beforeChange(); opened = true; }
    }catch(err){
      console.warn('Unable to capture pre-change snapshot', err);
    }
    try{
      mutator();
      graph?.change?.();
    }finally{
      if(opened && graph?.afterChange) graph.afterChange();
      App.canvas?.setDirty?.(true, true);
    }
  }

  function button(label, action, className){
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className || 'selectionInspectorBtn is-muted';
    el.textContent = label;
    el.addEventListener('click', action);
    return el;
  }

  function select(options, value){
    const el = document.createElement('select');
    el.className = 'selectionInspectorSelect';
    for(const entry of options){
      const opt = document.createElement('option');
      opt.value = String(Array.isArray(entry) ? entry[0] : entry);
      opt.textContent = String(Array.isArray(entry) ? entry[1] : entry);
      el.appendChild(opt);
    }
    el.value = String(value == null ? '' : value);
    return el;
  }

  function typeOptions(registry, includeCategory, includeOtherwise){
    const out = [];
    if(includeOtherwise) out.push(['otherwise', 'Otherwise']);
    if(includeCategory){
      out.push(['category:work', 'Any Work'], ['category:container', 'Any Container'], ['category:carrier', 'Any Carrier']);
    }
    for(const type of registry?.list?.() || []) out.push([`type:${type.typeId}`, type.name]);
    return out;
  }

  function targetValue(target){
    const normalized = App.normalizeEntityTarget ? App.normalizeEntityTarget(target) : target;
    if(normalized?.mode === 'otherwise') return 'otherwise';
    if(normalized?.mode === 'category') return `category:${normalized.category}`;
    return `type:${normalized?.typeId || ''}`;
  }

  function parseTarget(value){
    const text = String(value || '');
    if(text === 'otherwise') return { mode: 'otherwise' };
    if(text.startsWith('category:')) return { mode: 'category', category: text.slice(9) };
    return { mode: 'type', typeId: text.replace(/^type:/, '') };
  }

  function makeCard(title, hint){
    const card = document.createElement('section');
    card.className = 'selectionInspectorCard';
    const section = document.createElement('div');
    section.className = 'selectionInspectorSection';
    const heading = document.createElement('h3');
    heading.className = 'selectionInspectorSectionTitle';
    heading.textContent = title;
    section.appendChild(heading);
    if(hint){
      const p = document.createElement('p');
      p.className = 'selectionInspectorHint';
      p.textContent = hint;
      section.appendChild(p);
    }
    card.appendChild(section);
    return { card, section };
  }

  function renderTypeManager(){
    const host = document.getElementById('entityTypesPanelBody');
    if(!host) return;
    host.innerHTML = '';
    const registry = App.entityModelForGraph?.(App.graph);
    if(!registry){ host.textContent = 'Open a graph to edit Entity Types.'; return; }
    const locked = running();
    const list = document.createElement('div');
    list.className = 'entityTypeList';
    for(const type of registry.list()){
      const row = document.createElement('div');
      row.className = 'entityTypeRow';
      const summary = document.createElement('div');
      summary.className = 'entityTypeSummary';
      const name = document.createElement('strong'); name.textContent = type.name;
      const meta = document.createElement('small');
      meta.textContent = `${type.category}${type.subtype ? ` / ${type.subtype}` : ''} · capacity ${type.capacity}`;
      summary.append(name, meta);
      const actions = document.createElement('div'); actions.className = 'entityTypeActions';
      const edit = button('Edit', ()=>openTypeEditor(type), 'selectionInspectorBtn is-muted');
      const remove = button('Delete', ()=>{
        if(locked) return;
        try{
          changed(()=>registry.remove(type.typeId));
          renderTypeManager();
        }catch(err){ root.alert?.(String(err?.message || err)); }
      }, 'selectionInspectorBtn is-danger');
      edit.disabled = remove.disabled = locked;
      actions.append(edit, remove);
      row.append(summary, actions);
      list.appendChild(row);
    }
    host.appendChild(list);
    const add = button('Add Entity Type', ()=>openTypeEditor(null), 'selectionInspectorBtn is-primary');
    add.disabled = locked;
    host.appendChild(add);
  }

  function openTypeEditor(existing){
    if(running()) return;
    const registry = App.entityModelForGraph?.(App.graph);
    if(!registry) return;
    const modal = document.createElement('div');
    modal.className = 'entityModalBackdrop';
    const dialog = document.createElement('div'); dialog.className = 'entityModal';
    const title = document.createElement('h2'); title.textContent = existing ? 'Edit Entity Type' : 'Add Entity Type';
    const form = document.createElement('div'); form.className = 'entityModalFields';
    const field = (label, control)=>{
      const wrap = document.createElement('label'); wrap.className = 'entityModalField';
      const span = document.createElement('span'); span.textContent = label;
      wrap.append(span, control); form.appendChild(wrap); return control;
    };
    const name = field('Name', document.createElement('input')); name.value = existing?.name || '';
    const category = field('Category', select(['work', 'container', 'carrier'], existing?.category || 'work'));
    const subtype = field('Subtype / tag', document.createElement('input')); subtype.value = existing?.subtype || '';
    const capacity = field('Capacity', document.createElement('input')); capacity.type = 'number'; capacity.min = '0'; capacity.step = '1'; capacity.value = String(existing?.capacity || 0);
    const allowed = field('Allowed contents', document.createElement('select'));
    allowed.multiple = true; allowed.size = Math.min(8, Math.max(3, registry.list().length));
    for(const type of registry.list()){
      if(existing && type.typeId === existing.typeId) continue;
      const option = document.createElement('option'); option.value = type.typeId; option.textContent = type.name;
      option.selected = !!existing?.allowedContentTypeIds?.includes(type.typeId); allowed.appendChild(option);
    }
    const attrs = field('Default attributes (JSON)', document.createElement('textarea'));
    attrs.value = JSON.stringify(existing?.defaultAttributes || {}, null, 2);
    const error = document.createElement('div'); error.className = 'selectionInspectorNotice is-error';
    const actions = document.createElement('div'); actions.className = 'selectionInspectorActionsRow';
    actions.append(button('Cancel', ()=>modal.remove()), button('Save', ()=>{
      try{
        const parsed = JSON.parse(attrs.value || '{}');
        if(!isObject(parsed)) throw new Error('Default attributes must be a JSON object.');
        const selected = Array.from(allowed.selectedOptions).map((entry)=>entry.value);
        changed(()=>registry.upsert({
          typeId: existing?.typeId,
          name: name.value,
          category: category.value,
          subtype: subtype.value,
          capacity: Number(capacity.value),
          allowedContentTypeIds: selected,
          defaultAttributes: parsed
        }));
        modal.remove(); renderTypeManager(); App.selectionInspector?.refresh?.();
      }catch(err){ error.textContent = String(err?.message || err); }
    }, 'selectionInspectorBtn is-primary'));
    dialog.append(title, form, error, actions); modal.appendChild(dialog); document.body.appendChild(modal);
  }

  function installTypePanel(){
    if(document.getElementById('entityTypesPanel')) return;
    const panel = document.createElement('div'); panel.id = 'entityTypesPanel';
    panel.innerHTML = '<div class="panelHeader">Entity Types</div><div id="entityTypesPanelBody" class="entityTypesPanelBody"></div>';
    const anchor = document.getElementById('addNodePanel');
    if(anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    renderTypeManager();
    root.addEventListener?.('factsim:graph-applied', ()=>renderTypeManager());
  }

  function renderFlowEditor(node){
    const registry = App.entityModelForGraph?.(App.graph || node.graph);
    const wrapper = document.createElement('div');
    const inputConditions = [['always','Always'],['space-available','Space available'],['empty','Empty'],['not-full','Not full'],['custom-condition','Custom']];
    const outputConditions = [['available','Available'],['process-complete','Process complete'],['shuttle-group-idle','Shuttle group process complete (Idle)'],['full','Full'],['empty','Empty'],['count-reached','Count reached'],['time-elapsed','Time elapsed'],['downstream-ready','Downstream ready'],['attribute-condition','Attribute condition'],['custom-condition','Custom']];
    const field = (label, content, extraClass)=>{
      const host = document.createElement('label');
      host.className = `entityRuleField${extraClass ? ` ${extraClass}` : ''}`;
      const caption = document.createElement('span'); caption.className = 'entityRuleFieldLabel'; caption.textContent = label;
      host.append(caption, content);
      return host;
    };
    const conditionKind = (condition, fallback)=>isObject(condition) ? (condition.kind || fallback) : (condition || fallback);
    const appendConditionParameter = (host, condition, commit)=>{
      const kind = conditionKind(condition, 'available');
      if(kind === 'shuttle-group-idle'){
        const parameter = document.createElement('input');
        parameter.type = 'text'; parameter.className = 'selectionInspectorInput';
        parameter.value = String(condition.groupId || node.properties?.shuttleGroupId || 'shuttle-1');
        parameter.placeholder = 'Shuttle group ID'; parameter.title = 'Shuttle group ID';
        parameter.setAttribute('aria-label', 'Shuttle group ID'); parameter.disabled = running();
        parameter.addEventListener('change', ()=>{
          condition.groupId = String(parameter.value || '').trim() || 'shuttle-1';
          parameter.value = condition.groupId; commit();
        });
        host.appendChild(parameter);
      }else if(kind === 'count-reached' || kind === 'time-elapsed'){
        const parameter = document.createElement('input');
        parameter.type = 'number'; parameter.min = '0'; parameter.step = kind === 'count-reached' ? '1' : '0.1';
        parameter.value = String(kind === 'count-reached' ? (condition.count ?? 1) : (condition.seconds ?? 0));
        parameter.title = kind === 'count-reached' ? 'Count' : 'Seconds';
        parameter.setAttribute('aria-label', parameter.title);
        parameter.disabled = running();
        parameter.addEventListener('change', ()=>{
          if(kind === 'count-reached') condition.count = Math.max(0, Math.round(Number(parameter.value) || 0));
          else condition.seconds = Math.max(0, Number(parameter.value) || 0);
          commit();
        });
        host.appendChild(parameter);
      }else if(kind === 'attribute-condition' || kind === 'custom-condition'){
        const parameter = document.createElement('input');
        parameter.type = 'text'; parameter.className = 'selectionInspectorInput';
        parameter.title = kind === 'attribute-condition' ? 'Condition JSON: path/operator/value' : 'Restricted expression AST JSON';
        parameter.setAttribute('aria-label', parameter.title);
        parameter.value = JSON.stringify(kind === 'attribute-condition'
          ? { path:condition.path || '', operator:condition.operator || 'eq', value:condition.value ?? '' }
          : (condition.expression || { op:'compare', path:'', operator:'eq', value:'' }));
        parameter.disabled = running();
        parameter.addEventListener('change', ()=>{
          try{
            const parsed = JSON.parse(parameter.value || '{}');
            if(kind === 'attribute-condition') Object.assign(condition, parsed);
            else condition.expression = parsed;
            parameter.setCustomValidity(''); commit();
          }catch(_err){ parameter.setCustomValidity('Enter valid JSON'); parameter.reportValidity(); }
        });
        host.appendChild(parameter);
      }
    };
    const renderRules = (kind)=>{
      const key = kind === 'input' ? 'inputRules' : 'outputRules';
      const card = makeCard(kind === 'input' ? 'INPUT' : 'OUTPUT', kind === 'input'
        ? 'What the node accepts. Descendants are searched automatically.'
        : 'Rules are evaluated from top to bottom. Combine conditions with AND or OR.');
      const rows = Array.isArray(node.properties?.[key]) ? node.properties[key] : [];
      const list = document.createElement('div'); list.className = 'entityRuleList';
      const commit = ()=>changed(()=>{ node.properties[key] = rows; node.setDirtyCanvas?.(true, true); });
      rows.forEach((rule, index)=>{
        const ruleCard = document.createElement('article'); ruleCard.className = 'entityRuleCard';
        const header = document.createElement('div'); header.className = 'entityRuleHeader';
        const title = document.createElement('strong'); title.className = 'entityRuleTitle'; title.textContent = `Rule ${index + 1}`;
        const controls = document.createElement('div'); controls.className = 'entityRuleControls';
        const up = button('↑', ()=>{ if(index > 0){ rows.splice(index - 1, 0, rows.splice(index, 1)[0]); commit(); App.selectionInspector?.refresh?.(); } });
        const down = button('↓', ()=>{ if(index < rows.length - 1){ rows.splice(index + 1, 0, rows.splice(index, 1)[0]); commit(); App.selectionInspector?.refresh?.(); } });
        const remove = button('×', ()=>{ rows.splice(index, 1); commit(); App.selectionInspector?.refresh?.(); }, 'selectionInspectorBtn is-danger');
        up.title = 'Move rule up'; down.title = 'Move rule down'; remove.title = 'Delete rule';
        up.disabled = running() || index === 0; down.disabled = running() || index === rows.length - 1; remove.disabled = running();
        controls.append(up, down, remove); header.append(title, controls); ruleCard.appendChild(header);

        const body = document.createElement('div'); body.className = 'entityRuleBody';
        const availableTargets = typeOptions(registry, true, kind === 'output');
        const targetRows = Array.isArray(rule.targets) && rule.targets.length
          ? rule.targets
          : [rule.target || { mode:'category', category:'work' }];
        const persistTargets = ()=>{
          rule.targets = targetRows;
          rule.target = targetRows[0] || { mode:'category', category:'work' };
          commit();
        };
        const targetsHost = document.createElement('div'); targetsHost.className = 'entityRuleMultiValue';
        const targetList = document.createElement('div'); targetList.className = 'entityRuleMultiValueList';
        targetRows.forEach((targetSpec, targetIndex)=>{
          const targetLine = document.createElement('div'); targetLine.className = 'entityRuleMultiValueLine';
          const number = document.createElement('span'); number.className = 'entityRuleConditionNumber'; number.textContent = String(targetIndex + 1);
          const target = select(availableTargets, targetValue(targetSpec));
          target.disabled = running();
          target.addEventListener('change', ()=>{
            const parsed = parseTarget(target.value);
            if(parsed.mode === 'otherwise') targetRows.splice(0, targetRows.length, parsed);
            else{
              targetRows[targetIndex] = parsed;
              for(let rowIndex = targetRows.length - 1; rowIndex >= 0; rowIndex--){
                if(targetRows[rowIndex]?.mode === 'otherwise') targetRows.splice(rowIndex, 1);
              }
            }
            persistTargets(); App.selectionInspector?.refresh?.();
          });
          const removeTarget = button('×', ()=>{
            targetRows.splice(targetIndex, 1);
            if(!targetRows.length) targetRows.push({ mode:'category', category:'work' });
            persistTargets(); App.selectionInspector?.refresh?.();
          }, 'selectionInspectorBtn is-danger entityRuleConditionRemove');
          removeTarget.title = 'Delete target'; removeTarget.disabled = running() || targetRows.length <= 1;
          targetLine.append(number, target, removeTarget); targetList.appendChild(targetLine);
        });
        targetsHost.appendChild(targetList);
        const addTarget = button('+ Add target', ()=>{
          if(targetRows.length === 1 && targetRows[0]?.mode === 'otherwise') targetRows.splice(0, 1);
          targetRows.push({ mode:'category', category:'work' });
          persistTargets(); App.selectionInspector?.refresh?.();
        }, 'selectionInspectorBtn entityRuleAddCondition');
        addTarget.disabled = running(); targetsHost.appendChild(addTarget);
        body.appendChild(field('Targets (any match)', targetsHost));

        if(kind === 'input'){
          const conditionSpec = isObject(rule.acceptWhen) ? rule.acceptWhen : { kind:conditionKind(rule.acceptWhen, 'always') };
          const condition = select(inputConditions, conditionKind(conditionSpec, 'always'));
          condition.disabled = running();
          condition.addEventListener('change', ()=>{ rule.acceptWhen = { kind:condition.value }; commit(); App.selectionInspector?.refresh?.(); });
          const conditionHost = document.createElement('div'); conditionHost.className = 'entityRuleConditionLine'; conditionHost.appendChild(condition);
          appendConditionParameter(conditionHost, conditionSpec, commit);
          body.appendChild(field('Accept when', conditionHost, 'is-wide'));
        }else{
          const stored = rule.releaseWhen;
          const isCompound = isObject(stored) && (stored.kind === 'all' || stored.kind === 'any');
          const compound = {
            kind: isCompound ? stored.kind : 'all',
            conditions: isCompound && Array.isArray(stored.conditions)
              ? stored.conditions
              : [isObject(stored) ? stored : { kind:conditionKind(stored, 'available') }]
          };
          if(!compound.conditions.length) compound.conditions.push({ kind:'available' });
          const persistCompound = ()=>{ rule.releaseWhen = { kind:compound.kind, conditions:compound.conditions }; commit(); };
          const conditionsHost = document.createElement('div'); conditionsHost.className = 'entityRuleConditions';
          const joinRow = document.createElement('div'); joinRow.className = 'entityRuleConditionJoin';
          const joinLabel = document.createElement('span'); joinLabel.textContent = 'Match';
          const join = select([['all','All conditions (AND)'],['any','Any condition (OR)']], compound.kind);
          join.disabled = running();
          join.addEventListener('change', ()=>{ compound.kind = join.value; persistCompound(); });
          joinRow.append(joinLabel, join); conditionsHost.appendChild(joinRow);
          const conditionList = document.createElement('div'); conditionList.className = 'entityRuleConditionList';
          compound.conditions.forEach((conditionSpec, conditionIndex)=>{
            const conditionLine = document.createElement('div'); conditionLine.className = 'entityRuleConditionLine';
            const number = document.createElement('span'); number.className = 'entityRuleConditionNumber'; number.textContent = String(conditionIndex + 1);
            const condition = select(outputConditions, conditionKind(conditionSpec, 'available'));
            condition.disabled = running();
            condition.addEventListener('change', ()=>{
              compound.conditions[conditionIndex] = condition.value === 'shuttle-group-idle'
                ? { kind:condition.value, groupId:String(node.properties?.shuttleGroupId || 'shuttle-1') }
                : { kind:condition.value };
              persistCompound(); App.selectionInspector?.refresh?.();
            });
            const removeCondition = button('×', ()=>{
              compound.conditions.splice(conditionIndex, 1);
              if(!compound.conditions.length) compound.conditions.push({ kind:'available' });
              persistCompound(); App.selectionInspector?.refresh?.();
            }, 'selectionInspectorBtn is-danger entityRuleConditionRemove');
            removeCondition.title = 'Delete condition'; removeCondition.disabled = running() || compound.conditions.length <= 1;
            conditionLine.append(number, condition);
            appendConditionParameter(conditionLine, conditionSpec, persistCompound);
            conditionLine.appendChild(removeCondition); conditionList.appendChild(conditionLine);
          });
          conditionsHost.appendChild(conditionList);
          const addCondition = button('+ Add condition', ()=>{
            compound.conditions.push({ kind:'available' }); persistCompound(); App.selectionInspector?.refresh?.();
          }, 'selectionInspectorBtn entityRuleAddCondition');
          addCondition.disabled = running(); conditionsHost.appendChild(addCondition);
          body.appendChild(field('Conditions', conditionsHost, 'is-wide'));

          const ports = (node.outputs || []).map((port, portIndex)=>[port.portId || `out-${portIndex + 1}`, port.name || `Out ${portIndex + 1}`]);
          const portRows = Array.isArray(rule.toPortIds) && rule.toPortIds.length
            ? rule.toPortIds
            : [rule.toPortId || ports[0]?.[0] || ''];
          const persistPorts = ()=>{
            rule.toPortIds = portRows.filter(Boolean);
            rule.toPortId = rule.toPortIds[0] || null;
            commit();
          };
          const portsHost = document.createElement('div'); portsHost.className = 'entityRuleMultiValue';
          const portList = document.createElement('div'); portList.className = 'entityRuleMultiValueList';
          portRows.forEach((portId, portIndex)=>{
            const portLine = document.createElement('div'); portLine.className = 'entityRuleMultiValueLine';
            const number = document.createElement('span'); number.className = 'entityRuleConditionNumber'; number.textContent = String(portIndex + 1);
            const to = select(ports, portId);
            to.disabled = running();
            to.addEventListener('change', ()=>{ portRows[portIndex] = to.value; persistPorts(); });
            const removePort = button('×', ()=>{
              portRows.splice(portIndex, 1);
              if(!portRows.length && ports[0]) portRows.push(ports[0][0]);
              persistPorts(); App.selectionInspector?.refresh?.();
            }, 'selectionInspectorBtn is-danger entityRuleConditionRemove');
            removePort.title = 'Delete output destination'; removePort.disabled = running() || portRows.length <= 1;
            portLine.append(number, to, removePort); portList.appendChild(portLine);
          });
          portsHost.appendChild(portList);
          const addPort = button('+ Add output', ()=>{
            const next = ports.find(([portId])=>!portRows.includes(portId))?.[0] || ports[0]?.[0];
            if(next) portRows.push(next);
            persistPorts(); App.selectionInspector?.refresh?.();
          }, 'selectionInspectorBtn entityRuleAddCondition');
          addPort.disabled = running() || !ports.length || portRows.length >= ports.length;
          portsHost.appendChild(addPort);
          body.appendChild(field('Output to (first ready)', portsHost));
        }
        ruleCard.appendChild(body); list.appendChild(ruleCard);
      });
      card.section.appendChild(list);
      const add = button(`Add ${kind === 'input' ? 'Input' : 'Output'} Rule`, ()=>{
        rows.push(kind === 'input'
          ? { ruleId:`input-rule-${Date.now()}`, targets:[{ mode:'category', category:'work' }], target:{ mode:'category', category:'work' }, acceptWhen:{ kind:'always' }, fromPortId:null }
          : { ruleId:`output-rule-${Date.now()}`, targets:[{ mode:'otherwise' }], target:{ mode:'otherwise' }, releaseWhen:{ kind:'all', conditions:[{ kind:'available' }] }, toPortIds:[node.outputs?.[0]?.portId || 'out-1'], toPortId:node.outputs?.[0]?.portId || 'out-1' });
        commit(); App.selectionInspector?.refresh?.();
      }, 'selectionInspectorBtn is-primary');
      add.disabled = running(); card.section.appendChild(add); wrapper.appendChild(card.card);
    };
    renderRules('input'); renderRules('output'); return wrapper;
  }

  function renderRecipeRows(node, rows, host, depth){
    const registry = App.entityModelForGraph?.(App.graph || node.graph);
    rows.forEach((recipe, index)=>{
      const row = document.createElement('div'); row.className = 'entityRecipeRow'; row.style.setProperty('--recipe-depth', String(depth));
      const type = select((registry?.list?.() || []).map((entry)=>[entry.typeId, entry.name]), recipe.typeId);
      const qty = document.createElement('input'); qty.type = 'number'; qty.min = '1'; qty.step = '1'; qty.value = String(recipe.quantity || 1);
      const load = select([['empty','Empty'],['full','Full'],['custom','Custom']], recipe.load || 'empty');
      const commit = ()=>changed(()=>{ node.properties.initialContents = node.properties.initialContents; node.__initialContentsDirty = true; });
      type.addEventListener('change', ()=>{ recipe.typeId = type.value; commit(); });
      qty.addEventListener('change', ()=>{ recipe.quantity = Math.max(1, Math.round(Number(qty.value) || 1)); commit(); });
      load.addEventListener('change', ()=>{ recipe.load = load.value; if(load.value === 'empty') recipe.children = []; commit(); App.selectionInspector?.refresh?.(); });
      row.append(type, qty, load);
      const actions = document.createElement('div'); actions.className = 'entityRuleControls';
      const add = button('+ Child', ()=>{ recipe.children = Array.isArray(recipe.children) ? recipe.children : []; const first = registry?.list?.()[0]; if(first) recipe.children.push({ typeId:first.typeId, quantity:1, load:'empty', children:[] }); commit(); App.selectionInspector?.refresh?.(); });
      const remove = button('×', ()=>{ rows.splice(index, 1); commit(); App.selectionInspector?.refresh?.(); }, 'selectionInspectorBtn is-danger');
      add.disabled = remove.disabled = running(); actions.append(add, remove); row.appendChild(actions); host.appendChild(row);
      if(Array.isArray(recipe.children) && recipe.children.length) renderRecipeRows(node, recipe.children, host, depth + 1);
    });
  }

  function renderCurrentTree(tree, depth){
    const row = document.createElement('details'); row.className = 'entityCurrentTree'; row.open = depth < 1;
    const summary = document.createElement('summary'); summary.textContent = `${tree.name} · ${tree.displayId}`; row.appendChild(summary);
    if(tree.children?.length){
      const children = document.createElement('div'); children.className = 'entityCurrentChildren';
      tree.children.forEach((child)=>children.appendChild(renderCurrentTree(child, depth + 1))); row.appendChild(children);
    }
    return row;
  }

  function renderContentsEditor(node){
    const wrapper = document.createElement('div');
    node.properties = isObject(node.properties) ? node.properties : {};
    if(!Array.isArray(node.properties.initialContents)) node.properties.initialContents = [];
    const initial = makeCard('INITIAL', 'Type and quantity recipes are saved. Runtime Instance IDs are generated automatically on Reset.');
    const rows = document.createElement('div'); rows.className = 'entityRecipeList';
    const refreshRows = ()=>{ rows.innerHTML = ''; renderRecipeRows(node, node.properties.initialContents, rows, 0); };
    refreshRows(); initial.section.appendChild(rows);
    const add = button('Add Initial Content', ()=>{
      try{
        const first = App.entityModelForGraph?.(App.graph || node.graph)?.list?.()[0];
        if(!first) throw new Error('Create an Entity Type first.');
        const nextRows = Array.isArray(node.properties.initialContents) ? node.properties.initialContents.slice() : [];
        nextRows.push({ typeId:first.typeId, quantity:1, load:'empty', children:[] });
        node.properties.initialContents = nextRows;
        node.__initialContentsDirty = true;
        node.graph?.change?.();
        node.setDirtyCanvas?.(true, true);
        refreshRows();
      }catch(err){
        const note = document.createElement('div'); note.className = 'selectionInspectorNotice is-error'; note.textContent = String(err?.message || err);
        initial.section.appendChild(note);
      }
    }, 'selectionInspectorBtn is-primary'); add.disabled = running(); initial.section.appendChild(add);
    if(node.__initialContentsDirty){ const note = document.createElement('div'); note.className = 'selectionInspectorNotice'; note.textContent = 'Reset to apply Initial Contents.'; initial.section.appendChild(note); }
    wrapper.appendChild(initial.card);

    const current = makeCard('CURRENT', 'Runtime / Read only');
    const data = typeof node.getCurrentContents === 'function'
      ? node.getCurrentContents({ includeInstances: false })
      : (()=>{ const store = App.runtimeInstancesForGraph?.(App.graph || node.graph); return { summary:store?.summaryAt(node.id)||[] }; })();
    const tabs = document.createElement('div'); tabs.className = 'entityContentsToggle';
    const summaryBtn = button('Summary', ()=>{ summaryHost.hidden = false; instancesHost.hidden = true; });
    let instancesLoaded = false;
    const instancesBtn = button('Instances', ()=>{
      summaryHost.hidden = true;
      instancesHost.hidden = false;
      if(instancesLoaded) return;
      instancesLoaded = true;
      const instanceData = typeof node.getCurrentContents === 'function'
        ? node.getCurrentContents({ includeInstances: true })
        : (()=>{ const store = App.runtimeInstancesForGraph?.(App.graph || node.graph); return { instances:store?.treesAt(node.id)||[] }; })();
      instancesHost.replaceChildren();
      for(const tree of instanceData.instances || []) instancesHost.appendChild(renderCurrentTree(tree, 0));
      if(!instancesHost.children.length) instancesHost.textContent = 'None';
    });
    tabs.append(summaryBtn, instancesBtn); current.section.appendChild(tabs);
    const summaryHost = document.createElement('div'); summaryHost.className = 'entityCurrentSummary';
    for(const row of data.summary || []){ const item = document.createElement('div'); item.innerHTML = `<span></span><strong>${Number(row.quantity)||0}</strong>`; item.querySelector('span').textContent = row.name; summaryHost.appendChild(item); }
    if(!summaryHost.children.length) summaryHost.textContent = 'None';
    const instancesHost = document.createElement('div'); instancesHost.className = 'entityCurrentInstances'; instancesHost.hidden = true;
    instancesHost.textContent = 'Select Instances to load the runtime tree.';
    current.section.append(summaryHost, instancesHost); wrapper.appendChild(current.card); return wrapper;
  }

  function enhanceInspector(){
    const Ctor = App.SelectionInspector;
    if(!Ctor || Ctor.prototype.__entityTabsInstalled) return;
    Ctor.prototype.__entityTabsInstalled = true;
    const raw = Ctor.prototype.renderNode;
    Ctor.prototype.renderNode = function(node){
      raw.call(this, node);
      const main = this.root?.querySelector('.selectionInspectorMain');
      if(!main) return;
      main.querySelectorAll('.entityTreeCard').forEach((entry)=>entry.remove());
      const existingCards = Array.from(main.children);
      const tabBar = document.createElement('div'); tabBar.className = 'entityInspectorTabs';
      const panels = {};
      const entityEnabled = typeof node.hasEntityContents === 'function' ? node.hasEntityContents() : !['factory/note','factory/signal'].includes(node.type);
      const names = entityEnabled ? ['Basic','Flow','Contents','Advanced'] : ['Basic','Advanced'];
      names.forEach((name)=>{ const panel = document.createElement('div'); panel.className = 'entityInspectorTabPanel'; panel.dataset.tab = name.toLowerCase(); panels[name] = panel; });
      if(existingCards[0]) panels.Basic.appendChild(existingCards[0]);
      if(existingCards[1]){
        const hiddenPropertyLabels = new Set([
          'basicNodeVersion', 'initialContents', 'inputRules', 'outputRules', 'selection', 'stateMachine',
          'legacySourceType', 'migratedCarrierConfigs'
        ]);
        for(const field of existingCards[1].querySelectorAll('.selectionInspectorField')){
          const label = field.querySelector('.selectionInspectorFieldLabel')?.textContent?.trim();
          if(hiddenPropertyLabels.has(label)) field.remove();
        }
        panels.Basic.appendChild(existingCards[1]);
      }
      existingCards.slice(2).forEach((entry)=>panels.Advanced.appendChild(entry));
      if(entityEnabled){ panels.Flow.appendChild(renderFlowEditor(node)); panels.Contents.appendChild(renderContentsEditor(node)); }
      const state = makeCard('State Machine', 'State Machine remains separate from Input / Output Rules.');
      const stateEditor = document.createElement('textarea');
      stateEditor.className = 'selectionInspectorTextarea entityAdvancedEditor';
      stateEditor.value = JSON.stringify(node.properties?.stateMachine || {}, null, 2);
      stateEditor.readOnly = running();
      const stateNotice = document.createElement('div'); stateNotice.className = 'selectionInspectorNotice';
      const saveState = button('Apply State Machine', ()=>{
        try{
          const parsed = JSON.parse(stateEditor.value || '{}');
          if(!isObject(parsed) || !Array.isArray(parsed.states) || !Array.isArray(parsed.transitions)) throw new Error('states and transitions arrays are required.');
          changed(()=>{ node.properties.stateMachine = parsed; node.setDirtyCanvas?.(true, true); });
          stateNotice.textContent = 'Applied. Reset before the next run.';
        }catch(err){ stateNotice.textContent = String(err?.message || err); stateNotice.classList.add('is-error'); }
      }, 'selectionInspectorBtn is-primary');
      saveState.disabled = running();
      state.section.append(stateEditor, saveState, stateNotice); panels.Advanced.appendChild(state.card);
      const active = names.includes(this._entityTab) ? this._entityTab : 'Basic';
      const activate = (name)=>{ this._entityTab = name; Object.entries(panels).forEach(([key,panel])=>panel.hidden = key !== name); Array.from(tabBar.children).forEach((btn)=>btn.classList.toggle('is-active', btn.dataset.tab === name)); };
      names.forEach((name)=>{ const btn = button(name, ()=>activate(name), 'entityInspectorTab'); btn.dataset.tab = name; tabBar.appendChild(btn); main.appendChild(panels[name]); });
      main.insertBefore(tabBar, main.firstChild); activate(active);
    };
  }

  App.refreshEntityTypeManager = renderTypeManager;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>{ installTypePanel(); enhanceInspector(); });
  else{ installTypePanel(); enhanceInspector(); }
})(window);
