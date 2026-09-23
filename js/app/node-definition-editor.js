// Developer editor for Add Node definitions. Definitions affect future placements only.

(function(root){
  'use strict';
  const App = root.App || (root.App = {});
  const CONFIG_JSON = 'node-definitions.json';
  const CONFIG_JS = 'node-definitions.js';

  function clone(value, fallback=null){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return fallback; }
  }

  function supportsProjectWrite(){
    return !!(root.isSecureContext && typeof root.showDirectoryPicker === 'function');
  }

  function definitionPayload(){
    return typeof App.getNodeDefinitionOverrides === 'function'
      ? App.getNodeDefinitionOverrides()
      : { version:1, items:[] };
  }

  function definitionScript(payload){
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    for(let index=0; index<bytes.length; index+=0x8000){
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index+0x8000));
    }
    return [
      '(function(root){',
      `  var base64 = '${btoa(binary)}';`,
      '  var binary = atob(base64);',
      '  var bytes = new Uint8Array(binary.length);',
      '  for(var i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);',
      '  root.NODE_DEFINITIONS = JSON.parse(new TextDecoder("utf-8").decode(bytes));',
      '})(typeof window === "undefined" ? globalThis : window);',
      ''
    ].join('\n');
  }

  async function writableConfigDirectory(){
    if(!supportsProjectWrite()) throw new Error('Saving node definitions requires Chromium on localhost or HTTPS.');
    const picked = await root.showDirectoryPicker({ id:'fact-sim-node-definitions', mode:'readwrite' });
    if(picked.name.toLowerCase() === 'config') return picked;
    return picked.getDirectoryHandle('config', { create:true });
  }

  async function writeText(directory, name, text){
    const handle = await directory.getFileHandle(name, { create:true });
    const stream = await handle.createWritable();
    try{ await stream.write(text); await stream.close(); }
    catch(error){ try{ await stream.abort(); }catch(_e){} throw error; }
  }

  async function writePayload(payload){
    const directory = await writableConfigDirectory();
    await writeText(directory, CONFIG_JSON, JSON.stringify(payload, null, 2)+'\n');
    await writeText(directory, CONFIG_JS, definitionScript(payload));
  }

  function cleanPorts(snapshot){
    for(const port of snapshot.inputs || []) port.link = null;
    for(const port of snapshot.outputs || []) port.links = null;
    return snapshot;
  }

  function snapshotNode(node){
    const serialized = typeof node.serialize === 'function' ? clone(node.serialize(), {}) : {};
    return cleanPorts({
      type:node.type,
      title:String(node.title || 'Node'),
      size:Array.isArray(node.size) ? node.size.slice() : [230,110],
      properties:clone(node.properties, {}),
      inputs:clone(serialized.inputs || node.inputs || [], []),
      outputs:clone(serialized.outputs || node.outputs || [], [])
    });
  }

  function createDraftNode(kind){
    const node = App.createNodeFromCatalog?.(kind);
    if(!node) throw new Error('Unable to create the selected node definition.');
    const graph = new root.LGraph();
    graph.extra = clone(App.graph?.extra, {});
    if(App.graph?.__factSimEntityModel) graph.__factSimEntityModel = clone(App.graph.__factSimEntityModel, null);
    const sourceEntries = clone(node.properties?.source?.entries, null);
    graph.add(node);
    if(sourceEntries && node.properties?.source) node.properties.source.entries = sourceEntries;
    return { node, graph };
  }

  function nextCopyKind(kind){
    const base = String(kind || 'node').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'node';
    let candidate = `${base}-copy`, suffix = 2;
    while(App.getNodeCreationItem?.(candidate)) candidate = `${base}-copy-${suffix++}`;
    return candidate;
  }

  function inputField(label, input){
    const wrap = document.createElement('label');
    wrap.className = 'nodeDefinitionField';
    const caption = document.createElement('span');
    caption.textContent = label;
    wrap.append(caption, input);
    return wrap;
  }

  function makeInput(value, options={}){
    const input = document.createElement(options.multiline ? 'textarea' : 'input');
    if(!options.multiline) input.type = options.type || 'text';
    input.value = value == null ? '' : String(value);
    if(options.readOnly) input.readOnly = true;
    return input;
  }

  function showEditor(kind, duplicate){
    const item = App.getNodeCreationItem?.(kind);
    if(!item) return;
    let draft;
    try{ draft = createDraftNode(kind); }
    catch(error){ App.showToast?.(error.message); return; }

    const overlay = document.createElement('div');
    overlay.className = 'nodeDefinitionEditorOverlay';
    const dialog = document.createElement('section');
    dialog.className = 'nodeDefinitionEditor';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'nodeDefinitionEditorTitle');
    const header = document.createElement('header');
    header.className = 'nodeDefinitionEditorHeader';
    const heading = document.createElement('div');
    heading.innerHTML = `<span>Node definition</span><h2 id="nodeDefinitionEditorTitle"></h2>`;
    heading.querySelector('h2').textContent = duplicate ? `Duplicate ${item.label}` : `Edit ${item.label}`;
    const closeButton = document.createElement('button');
    closeButton.type = 'button'; closeButton.textContent = 'Close';
    header.append(heading, closeButton);

    const settings = document.createElement('div');
    settings.className = 'nodeDefinitionEditorSettings';
    const kindInput = makeInput(duplicate ? nextCopyKind(item.kind) : item.kind, { readOnly:!duplicate });
    kindInput.pattern = '[a-z][a-z0-9_-]{1,63}';
    const labelInput = makeInput(duplicate ? `${item.label} Copy` : item.label);
    const titleInput = makeInput(draft.node.title || item.label);
    const descriptionInput = makeInput(draft.node.properties?.description || '', { multiline:true });
    settings.append(
      inputField('Definition ID', kindInput),
      inputField('Menu label', labelInput),
      inputField('Default node title', titleInput),
      inputField('Description', descriptionInput)
    );

    const editorHost = document.createElement('div');
    editorHost.className = 'nodeDefinitionEditorCanvas';
    if(draft.node.type === 'factory/basic'){
      editorHost.append(App.createFlowView(draft.node, { draft:true }));
    }else{
      const message = document.createElement('div');
      message.className = 'nodeDefinitionUnsupported';
      message.textContent = 'This node type does not use a Flow definition. You can still change its menu label, title and description.';
      editorHost.append(message);
    }

    const footer = document.createElement('footer');
    footer.className = 'nodeDefinitionEditorFooter';
    const status = document.createElement('div');
    status.className = 'nodeDefinitionEditorStatus';
    status.textContent = 'Changes are kept in this draft until Save Definition.';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    const save = document.createElement('button'); save.type = 'button'; save.className = 'is-primary'; save.textContent = 'Save Definition';
    const actions = document.createElement('div'); actions.append(cancel, save);
    footer.append(status, actions);
    dialog.append(header, settings, editorHost, footer); overlay.append(dialog); document.body.append(overlay);

    let saving = false;
    const close = ()=>{ if(!saving){ overlay.remove(); try{ draft.graph.clear(); }catch(_e){} } };
    closeButton.onclick = cancel.onclick = close;
    overlay.addEventListener('pointerdown', (event)=>{ if(event.target === overlay) close(); });
    overlay.addEventListener('keydown', (event)=>{ if(event.key === 'Escape'){ event.preventDefault(); close(); } });

    save.onclick = async()=>{
      const nextKind = kindInput.value.trim().toLowerCase();
      const nextLabel = labelInput.value.trim();
      if(!/^[a-z][a-z0-9_-]{1,63}$/.test(nextKind)){
        status.textContent = 'Definition ID must start with a letter and use lowercase letters, numbers, hyphens or underscores.';
        kindInput.focus(); return;
      }
      if(!nextLabel){ status.textContent = 'Enter a menu label.'; labelInput.focus(); return; }
      if(duplicate && App.getNodeCreationItem?.(nextKind) && !root.confirm(`Overwrite the existing "${nextKind}" definition?`)) return;
      draft.node.title = titleInput.value.trim() || nextLabel;
      draft.node.properties ||= {};
      draft.node.properties.description = descriptionInput.value;
      if(draft.node.type === 'factory/basic'){
        const errors = App.FlowModel.validate(draft.node.properties.flow, draft.node)
          .filter((message)=>draft.node.properties.role !== 'source' || message !== 'Add at least one Source Entity.');
        if(errors.length){ status.textContent = `Cannot save: ${errors[0]}`; return; }
      }
      const payload = definitionPayload();
      const baseKind = item.baseKind || item.kind;
      const next = {
        kind:nextKind,
        label:nextLabel,
        baseKind,
        templateId:item.templateId,
        icon:item.icon,
        nodeType:draft.node.type,
        variant:item.variant || '',
        snapshot:snapshotNode(draft.node)
      };
      const index = payload.items.findIndex((entry)=>entry.kind === nextKind);
      if(index >= 0) payload.items[index] = next; else payload.items.push(next);
      saving = true; save.disabled = true; cancel.disabled = true; status.textContent = 'Choose the fact_sim project root or config folder…';
      try{
        await writePayload(payload);
        App.replaceNodeDefinitionOverrides?.(payload);
        App.refreshNodeCatalogUI?.(nextKind);
        updateDeveloperUi();
        overlay.remove();
        App.showToast?.(`Saved node definition: ${nextLabel}`);
      }catch(error){
        saving = false; save.disabled = false; cancel.disabled = false;
        if(error?.name === 'AbortError') status.textContent = 'Save cancelled. The draft is still open.';
        else{ console.error(error); status.textContent = error?.message || 'Failed to save the node definition.'; }
      }
    };
    requestAnimationFrame(()=>kindInput.focus());
  }

  async function removeSelectedDefinition(){
    const select = document.getElementById('nodeKindSelect');
    const kind = select?.value;
    const item = App.getNodeCreationItem?.(kind);
    if(!item || !App.hasNodeDefinitionOverride?.(kind)) return;
    const builtin = App.isBuiltinNodeDefinition?.(kind);
    const action = builtin ? 'reset this built-in definition' : 'delete this custom definition';
    if(!root.confirm(`Do you want to ${action}? Placed nodes will not be changed.`)) return;
    const payload = definitionPayload();
    payload.items = payload.items.filter((entry)=>entry.kind !== kind);
    try{
      await writePayload(payload);
      App.replaceNodeDefinitionOverrides?.(payload);
      App.refreshNodeCatalogUI?.(builtin ? kind : 'basic');
      updateDeveloperUi();
      App.showToast?.(builtin ? `Reset ${item.label}` : `Deleted ${item.label}`);
    }catch(error){
      if(error?.name !== 'AbortError'){
        console.error(error); App.showToast?.(error?.message || 'Failed to update node definitions.');
      }
    }
  }

  function updateDeveloperUi(){
    const select = document.getElementById('nodeKindSelect');
    const edit = document.getElementById('btnEditNodeDefinition');
    const duplicate = document.getElementById('btnDuplicateNodeDefinition');
    const remove = document.getElementById('btnRemoveNodeDefinition');
    const hint = document.getElementById('nodeDefinitionHint');
    const kind = select?.value;
    const item = App.getNodeCreationItem?.(kind);
    const overridden = !!App.hasNodeDefinitionOverride?.(kind);
    const builtin = !!App.isBuiltinNodeDefinition?.(kind);
    if(edit) edit.disabled = !item;
    if(duplicate) duplicate.disabled = !item;
    if(remove){ remove.disabled = !overridden; remove.textContent = builtin ? 'Reset Definition' : 'Delete Custom'; }
    if(hint){
      if(!supportsProjectWrite()) hint.textContent = 'Saving requires Chromium on localhost or HTTPS.';
      else if(overridden) hint.textContent = builtin ? 'This built-in type has a saved override. Newly placed nodes use it.' : 'This is a saved custom type. Newly placed nodes use it.';
      else hint.textContent = 'Edit the selected type. Saved changes apply to newly placed nodes only.';
    }
  }

  function install(){
    const select = document.getElementById('nodeKindSelect');
    const edit = document.getElementById('btnEditNodeDefinition');
    const duplicate = document.getElementById('btnDuplicateNodeDefinition');
    const remove = document.getElementById('btnRemoveNodeDefinition');
    if(!select || !edit || !duplicate || !remove) return;
    edit.addEventListener('click', ()=>showEditor(select.value, false));
    duplicate.addEventListener('click', ()=>showEditor(select.value, true));
    remove.addEventListener('click', removeSelectedDefinition);
    select.addEventListener('change', updateDeveloperUi);
    updateDeveloperUi();
  }

  App.openNodeDefinitionEditor = showEditor;
  App.refreshNodeDefinitionDeveloperUi = updateDeveloperUi;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})(window);
