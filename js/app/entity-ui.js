// Entity Type manager and Basic/Flow/Contents/Advanced inspector tabs.

(function(root){
  'use strict';
  const App = root.App || (root.App = {});

  function isObject(value){ return !!value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value, fallback){ try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return fallback; } }
  function running(){ return typeof root.isSimRunning === 'function' && root.isSimRunning(); }
  function changed(mutator){
    App.FlowModel.pause();
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

  function confirmAction(element, message){
    const ownerWindow = element?.ownerDocument?.defaultView || root;
    if(typeof ownerWindow.confirm !== 'function') return true;
    return ownerWindow.confirm(message) !== false;
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

  const ENTITY_SHAPE_OPTIONS = [
    ['circle','Circle'], ['rounded-square','Rounded square'], ['square','Square'],
    ['triangle','Triangle'], ['diamond','Diamond'], ['hexagon','Hexagon']
  ];
  const ENTITY_THEME_OPTIONS = [
    ['auto','Auto'], ['blue','Blue'], ['orange','Orange'], ['green','Green'],
    ['purple','Purple'], ['red','Red'], ['cyan','Cyan'], ['yellow','Yellow'], ['gray','Gray']
  ];

  function entityAppearance(value, fallback){
    return App.normalizeEntityAppearance?.(value, fallback) || {
      shape:String(value?.shape || fallback?.shape || 'circle'),
      colorTheme:String(value?.colorTheme || fallback?.colorTheme || 'auto')
    };
  }

  function appearancePreview(value, className){
    const appearance = entityAppearance(value);
    const preview = document.createElement('span');
    preview.className = `entityAppearancePreview${className ? ` ${className}` : ''}`;
    preview.dataset.shape = appearance.shape;
    preview.dataset.colorTheme = appearance.colorTheme;
    preview.setAttribute('aria-hidden', 'true');
    const glyph = document.createElement('span'); glyph.className = 'entityAppearanceGlyph';
    preview.appendChild(glyph);
    return preview;
  }

  function updateAppearancePreview(preview, value){
    const appearance = entityAppearance(value);
    preview.dataset.shape = appearance.shape;
    preview.dataset.colorTheme = appearance.colorTheme;
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
      const preview = appearancePreview(type.appearance, 'is-list');
      preview.title = `${type.appearance?.shape || 'circle'} / ${type.appearance?.colorTheme || 'auto'}`;
      const summary = document.createElement('div');
      summary.className = 'entityTypeSummary';
      const name = document.createElement('strong'); name.textContent = type.name;
      const meta = document.createElement('small');
      meta.textContent = `${type.subtype ? `${type.subtype} · ` : ''}capacity ${type.capacity}`;
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
      row.append(preview, summary, actions);
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
    const subtype = field('Subtype / tag', document.createElement('input')); subtype.value = existing?.subtype || '';
    const defaultThemes = ENTITY_THEME_OPTIONS.map(([value])=>value).filter((value)=>value !== 'auto');
    const appearance = entityAppearance(existing?.appearance, {
      shape:'circle',
      colorTheme:existing ? 'auto' : defaultThemes[registry.list().length % defaultThemes.length]
    });
    const shapeControl = document.createElement('div'); shapeControl.className = 'entityAppearanceShapeControl';
    const livePreview = appearancePreview(appearance, 'is-editor');
    const shape = select(ENTITY_SHAPE_OPTIONS, appearance.shape);
    shape.setAttribute('aria-label', 'Entity shape');
    shapeControl.append(livePreview, shape); field('Shape', shapeControl);
    const themeControl = document.createElement('div'); themeControl.className = 'entityAppearanceThemes';
    themeControl.setAttribute('role', 'radiogroup'); themeControl.setAttribute('aria-label', 'Color theme');
    let selectedTheme = appearance.colorTheme;
    const refreshThemes = ()=>{
      themeControl.querySelectorAll('button').forEach((entry)=>{
        const active = entry.dataset.colorTheme === selectedTheme;
        entry.classList.toggle('is-selected', active);
        entry.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      updateAppearancePreview(livePreview, { shape:shape.value, colorTheme:selectedTheme });
    };
    ENTITY_THEME_OPTIONS.forEach(([value, label])=>{
      const option = document.createElement('button'); option.type = 'button'; option.className = 'entityAppearanceTheme';
      option.dataset.colorTheme = value; option.setAttribute('role', 'radio'); option.setAttribute('aria-label', label); option.title = label;
      option.append(appearancePreview({ shape:'circle', colorTheme:value }), document.createTextNode(label));
      option.addEventListener('click', ()=>{ selectedTheme = value; refreshThemes(); });
      themeControl.appendChild(option);
    });
    shape.addEventListener('change', refreshThemes); refreshThemes(); field('Color theme', themeControl);
    const capacity = field('Capacity', document.createElement('input')); capacity.type = 'number'; capacity.min = '0'; capacity.step = '1'; capacity.value = String(existing?.capacity || 0);
    const allowed = field('Allowed contents', document.createElement('select'));
    allowed.multiple = true; allowed.size = Math.min(8, Math.max(3, registry.list().length));
    for(const type of registry.list()){
      const option = document.createElement('option'); option.value = type.typeId; option.textContent = type.name;
      option.selected = !!existing?.allowedContentTypeIds?.includes(type.typeId); allowed.appendChild(option);
    }
    const attrs = field('Default attributes (JSON)', document.createElement('textarea'));
    attrs.value = JSON.stringify(existing?.defaultAttributes || {}, null, 2);
    const allowedHint = document.createElement('p');
    allowedHint.className = 'selectionInspectorHint';
    allowedHint.textContent = 'Leave empty to allow every Entity Type. Capacity 0 disables children.';
    form.appendChild(allowedHint);
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
          subtype: subtype.value,
          capacity: Number(capacity.value),
          allowedContentTypeIds: selected,
          defaultAttributes: parsed,
          appearance: { shape:shape.value, colorTheme:selectedTheme }
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
    App.registerSidebarCollapsiblePanel?.('entityTypesPanel');
    renderTypeManager();
    root.addEventListener?.('factsim:graph-applied', ()=>renderTypeManager());
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
    const refreshRows = ()=>{
      rows.innerHTML = '';
      const recipes = Array.isArray(node.properties.initialContents) ? node.properties.initialContents : [];
      if(!recipes.length){
        const empty = document.createElement('div');
        empty.className = 'selectionInspectorNotice';
        empty.textContent = 'None configured. This node starts empty.';
        rows.appendChild(empty);
        return;
      }
      renderRecipeRows(node, recipes, rows, 0);
    };
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
    const readCurrent = ()=> typeof node.getCurrentContents === 'function'
      ? node.getCurrentContents({ includeInstances: true })
      : (App.currentContentsForNode?.(node, { includeInstances: true })
        || (()=>{ const store = App.runtimeInstancesForGraph?.(App.graph || node.graph); return { instances:store?.treesAt(node.id)||[] }; })());
    const instancesHost = document.createElement('div'); instancesHost.className = 'entityCurrentInstances';
    let currentSignature = '';
    const refreshCurrent = (force)=>{
      const data = readCurrent();
      const signature = JSON.stringify(data?.instances || []);
      if(!force && signature === currentSignature) return;
      currentSignature = signature;
      instancesHost.replaceChildren();
      for(const tree of data?.instances || []) instancesHost.appendChild(renderCurrentTree(tree, 0));
      if(!instancesHost.children.length) instancesHost.textContent = 'None at this node.';
    };
    refreshCurrent(true);
    const updateWhileOpen = ()=>{
      if(!wrapper.isConnected) return;
      refreshCurrent(false);
      window.setTimeout(updateWhileOpen, 250);
    };
    window.setTimeout(updateWhileOpen, 250);
    current.section.appendChild(instancesHost); wrapper.appendChild(current.card); return wrapper;
  }

  function sourceEditor(node,options={}){
    node.properties.source ||= {entries:[],intervalSec:0,repeat:true};
    const config=node.properties.source,card=makeCard('Source sequence','Generates one Entity at a time. The next destination controls admission.'),types=App.entityModelForGraph(node.graph).list();
    if(options.compact){card.card.classList.add('flowSourceCompact');card.section.querySelector('.selectionInspectorSectionTitle')?.remove();card.section.querySelector('.selectionInspectorHint')?.remove();}
    const mutate=mutator=>{
      if(options.draft){App.FlowModel.pause();mutator();node.setDirtyCanvas?.(true,true);options.onChange?.(config);}
      else changed(mutator);
    };
    const rows=document.createElement('div');rows.className='flowSourceRows';card.section.append(rows);
    const renderRows=()=>{
      rows.replaceChildren();config.entries ||= [];
      config.entries.forEach((entry,index)=>{const row=document.createElement('div');row.className='flowSourceRow';const type=select(types.map(t=>[t.typeId,t.name]),entry.typeId),count=document.createElement('input');count.type='number';count.min='1';count.value=entry.count || 1;type.onfocus=count.onfocus=App.FlowModel.pause;
        type.setAttribute('aria-label',`Source Entity ${index+1}`);count.setAttribute('aria-label',`Source quantity ${index+1}`);
        type.onchange=()=>mutate(()=>{entry.typeId=type.value;});count.onchange=()=>{if(Number.isInteger(Number(count.value)) && Number(count.value)>0)mutate(()=>{entry.count=Number(count.value);});};
        row.append(type,count,button('Delete',()=>{mutate(()=>config.entries.splice(index,1));renderRows();}));rows.append(row);
      });
      if(!config.entries.length){const empty=document.createElement('p');empty.className='flowSourceEmpty';empty.textContent=types.length ? 'No Entities in the sequence. Add one to define what this Source generates.' : 'Add an Entity Type before defining the Source sequence.';rows.append(empty);}options.onLayout?.();
    };
    const add=button('Add Entity',()=>{if(!types.length)return;mutate(()=>config.entries.push({typeId:types[0].typeId,count:1}));renderRows();});add.disabled=!types.length;card.section.append(add);
    const interval=document.createElement('input');interval.type='number';interval.min='0';interval.step='any';interval.value=config.intervalSec;interval.setAttribute('aria-label','Source interval seconds');interval.onfocus=App.FlowModel.pause;interval.onchange=()=>{if(interval.value!=='' && Number(interval.value)>=0)mutate(()=>{config.intervalSec=Number(interval.value);});};const label=document.createElement('label');label.className='flowSourceField';label.append(document.createTextNode('Interval (s)'),interval);card.section.append(label);
    const repeat=document.createElement('input');repeat.type='checkbox';repeat.checked=config.repeat!==false;repeat.setAttribute('aria-label','Repeat Source sequence');repeat.onchange=()=>mutate(()=>{config.repeat=repeat.checked;});const repeated=document.createElement('label');repeated.className='flowSourceRepeat';repeated.append(repeat,document.createTextNode(' Repeat sequence'));card.section.append(repeated);renderRows();return card.card;
  }
  App.createSourceSequenceEditor=sourceEditor;
  function enhanceInspector(){
    const Ctor=App.SelectionInspector;if(!Ctor || Ctor.prototype.__entityTabsInstalled)return;Ctor.prototype.__entityTabsInstalled=true;const raw=Ctor.prototype.renderNode;
    Ctor.prototype.renderNode=function(node){
      if(node.type!=='factory/basic')return raw.call(this,node);
      this.setMeta(`Details: ${node.title} #${node.id}`);const main=document.createElement('div');main.className='selectionInspectorMain flowDetailsMain';const tabs=document.createElement('div');tabs.className='entityInspectorTabs';main.append(tabs);(this.content || this.root).append(main);
      const panels={};for(const name of ['Flow','Contents','Advanced']){const panel=document.createElement('div');panel.className='entityInspectorTabPanel';panel.dataset.tab=name.toLowerCase();panels[name]=panel;main.append(panel);const tab=button(name,()=>activate(name),'entityInspectorTab');tab.dataset.tab=name.toLowerCase();tabs.append(tab);}
      const activate=name=>{this._entityTab=name;this.root.dataset.entityTab=name.toLowerCase();for(const [key,panel] of Object.entries(panels))panel.hidden=key!==name;Array.from(tabs.children).forEach(b=>b.classList.toggle('is-active',b.dataset.tab===name.toLowerCase()));if(panels[name].childElementCount)return;
        if(name==='Flow')panels.Flow.append(App.createFlowView(node));
        if(name==='Contents')panels.Contents.append(renderContentsEditor(node));
        if(name==='Advanced'){const settings=document.createElement('div');settings.className='flowAdvanced';const description=document.createElement('textarea');description.value=node.properties.description || '';description.setAttribute('aria-label','Description');description.onfocus=App.FlowModel.pause;description.onchange=()=>changed(()=>{node.properties.description=description.value;});settings.append(description);panels.Advanced.append(settings);}
      };activate(['Flow','Contents','Advanced'].includes(this._entityTab) ? this._entityTab : 'Flow');
    };
  }
  function installSyncroGroups(){
    const list=document.getElementById('syncroGroupsList');if(!list)return;
    const render=()=>{list.replaceChildren();for(const group of App.graph?.extra?.syncroGroups || []){const row=document.createElement('div');row.className='syncroGroupRow';const marker=document.createElement('span');marker.className='syncroGroupMarker';marker.setAttribute('aria-hidden','true');if(typeof App.workspaceIconSvg==='function')marker.innerHTML=App.workspaceIconSvg('syncro');const name=document.createElement('strong');name.className='syncroGroupName';name.textContent=group.name;name.title=group.name;row.append(marker,name);list.append(row);}};
    document.getElementById('btnAddSyncroGroup').onclick=()=>{const input=document.getElementById('syncroGroupName'),name=input.value.trim();if(!name){App.showToast?.('Enter a SyncroGroup name.');return;}try{App.FlowModel.addSyncroGroup(App.graph,name);}catch(error){App.showToast?.(error.message);return;}input.value='';render();App.selectionInspector?.refresh();};render();root.addEventListener('factsim:graph-applied',render);App.registerSidebarCollapsiblePanel?.('addSyncroGroupPanel');
  }
  App.refreshEntityTypeManager=renderTypeManager;
  const install=()=>{installTypePanel();enhanceInspector();installSyncroGroups();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
