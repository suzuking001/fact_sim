// Node list panel (one row per node, inspector-first navigation)

var App = window.App || (window.App = {});

(function(){
  function isObjectLike(v){
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function isInteractiveElement(target){
    if(!target || typeof target.closest !== 'function') return false;
    return !!target.closest('button, a, [contenteditable="true"], [contenteditable=""]');
  }

  function stringifyValue(v){
    try{
      return JSON.stringify(v, null, 2);
    }catch(_e){
      return String(v);
    }
  }

  function summarizeValue(v){
    if(typeof v === 'boolean') return v ? 'on' : 'off';
    if(typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
    if(typeof v === 'string'){
      const compact = v.replace(/\s+/g, ' ').trim();
      if(!compact) return '(empty)';
      return compact.length > 28 ? `${compact.slice(0, 28)}...` : compact;
    }
    if(Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
    if(isObjectLike(v)) return `${Object.keys(v).length} field${Object.keys(v).length === 1 ? '' : 's'}`;
    if(v === null) return 'null';
    return String(v);
  }

  function summarizeProperties(properties){
    const entries = Object.entries(isObjectLike(properties) ? properties : {});
    if(!entries.length) return 'No custom properties';
    const parts = [];
    for(let i = 0; i < entries.length && parts.length < 4; i++){
      const [key, value] = entries[i];
      parts.push(`${key}: ${key === 'script' ? 'custom logic' : summarizeValue(value)}`);
    }
    if(entries.length > parts.length){
      parts.push(`+${entries.length - parts.length} more`);
    }
    return parts.join(' • ');
  }

  class NodePropsPanel{
    constructor(root){
      this.root = root;
      this.graph = null;
      this._refreshTimer = null;
      this.selectedNodeId = null;
      this._scrollSelectedOnRefresh = false;

      this.filterInput = document.getElementById('nodePropsFilter');
      this.summaryEl = document.getElementById('nodePropsSummary');
      this.bodyEl = document.getElementById('nodePropsBody');

      if(this.filterInput){
        this.filterInput.addEventListener('input', ()=> this.requestRefresh());
      }
    }

    attachGraph(graph){
      this.graph = graph || null;
      if(this.graph && !this.graph.__nodePropsPanelHooked){
        const prev = this.graph.onAfterChange;
        this.graph.onAfterChange = (...args)=>{
          if(typeof prev === 'function') prev.apply(this.graph, args);
          this.requestRefresh();
        };
        this.graph.__nodePropsPanelHooked = true;
      }
      this.refresh();
    }

    requestRefresh(){
      if(this._refreshTimer) return;
      this._refreshTimer = setTimeout(()=>{
        this._refreshTimer = null;
        this.refresh();
      }, 0);
    }

    _normalizeId(id){
      if(id === null || typeof id === 'undefined' || id === '') return null;
      return String(id);
    }

    _nodes(){
      if(!this.graph || !Array.isArray(this.graph._nodes)) return [];
      const nodes = this.graph._nodes.slice();
      nodes.sort((a, b)=>{
        const ai = Number(a?.id);
        const bi = Number(b?.id);
        if(isFinite(ai) && isFinite(bi) && ai !== bi) return ai - bi;
        const at = String(a?.title || '').toLowerCase();
        const bt = String(b?.title || '').toLowerCase();
        return at.localeCompare(bt);
      });
      return nodes;
    }

    _formatNodeLabel(node){
      if(!node) return '(unknown)';
      const title = String(node.title || node.type || 'Node');
      const id = (typeof node.id !== 'undefined') ? node.id : '';
      return (id === '' ? title : `${title} #${id}`);
    }

    _connectedToSummary(node){
      if(!this.graph || !node || !Array.isArray(node.outputs)) return '-';
      const items = [];
      const seen = new Set();
      for(let oi = 0; oi < node.outputs.length; oi++){
        const outPort = node.outputs[oi];
        const outName = String(outPort?.name || `out${oi}`);
        const links = Array.isArray(outPort?.links) ? outPort.links : [];
        for(const linkId of links){
          const link = this.graph?.links ? this.graph.links[linkId] : null;
          if(!link) continue;
          const target = this.graph.getNodeById(link.target_id);
          if(!target) continue;
          const inName = String(target?.inputs?.[link.target_slot]?.name || `in${link.target_slot}`);
          const label = `${this._formatNodeLabel(target)} (${outName} -> ${inName})`;
          if(seen.has(label)) continue;
          seen.add(label);
          items.push(label);
        }
      }
      if(!items.length) return '-';
      return items.join(' | ');
    }

    _rows(filterText){
      const rows = [];
      const q = String(filterText || '').trim().toLowerCase();
      for(const node of this._nodes()){
        const nodeId = (node && typeof node.id !== 'undefined') ? node.id : '';
        const nodeTitle = String(node?.title || '(untitled)');
        const nodeType = String(node?.type || '');
        const connectedTo = this._connectedToSummary(node);
        const rawProperties = isObjectLike(node?.properties) ? node.properties : {};
        const properties = node?.type === 'factory/basic' && typeof App.commonBasicNodeProperties === 'function'
          ? App.commonBasicNodeProperties(rawProperties)
          : rawProperties;
        const propsText = stringifyValue(properties);
        const propsSummary = summarizeProperties(properties);
        const searchable = `${nodeId} ${nodeTitle} ${nodeType} ${connectedTo} ${propsText}`.toLowerCase();
        if(q && searchable.indexOf(q) < 0) continue;
        rows.push({
          node,
          nodeId,
          nodeTitle,
          nodeType,
          connectedTo,
          propsText,
          propsSummary
        });
      }
      return rows;
    }

    _findNodeById(id){
      if(!this.graph || !Array.isArray(this.graph._nodes)) return null;
      const target = this._normalizeId(id);
      if(target === null) return null;
      for(const node of this.graph._nodes){
        if(!node) continue;
        if(String(node.id) === target) return node;
      }
      return null;
    }

    _highlightGraphNodeById(id){
      const node = this._findNodeById(id);
      if(!node || !App.canvas) return false;
      try{
        if(typeof App.canvas.selectNode === 'function'){
          App.canvas.selectNode(node);
        }else if(typeof App.canvas.selectNodes === 'function'){
          App.canvas.selectNodes([node], false);
        }
        if(typeof App.canvas.setDirty === 'function'){
          App.canvas.setDirty(true, true);
        }else if(typeof App.canvas.draw === 'function'){
          App.canvas.draw(true, true);
        }
        return true;
      }catch(_e){
        return false;
      }
    }

    _openInspector(row){
      if(!row?.node) return false;
      if(App.selectionInspector && typeof App.selectionInspector.openNode === 'function'){
        App.selectionInspector.openNode(row.node, true, true);
        if(typeof App.setTimelineDockView === 'function') App.setTimelineDockView('inspector');
        return true;
      }
      return false;
    }

    setSelectedNodeId(id, options){
      const opts = options || {};
      const next = this._normalizeId(id);
      const changed = (next !== this.selectedNodeId);
      this.selectedNodeId = next;
      if(opts.ensureVisible) this._scrollSelectedOnRefresh = true;
      if(changed || opts.forceRefresh){
        this.refresh();
      }else if(opts.ensureVisible){
        this.refresh();
      }

      if(opts.highlightGraph){
        this._highlightGraphNodeById(next);
      }
      if(opts.syncTimeline !== false && App.timelineChart && typeof App.timelineChart.setSelectedNodeId === 'function'){
        App.timelineChart.setSelectedNodeId(next, { ensureVisible: opts.ensureVisible !== false, draw: true });
      }
      return changed;
    }

    selectNodeFromGraph(node, options){
      const opts = options || {};
      if(!node){
        this.setSelectedNodeId(null, { ensureVisible: false, syncTimeline: false, forceRefresh: true });
        return false;
      }
      const id = (typeof node.id !== 'undefined') ? node.id : null;
      this.setSelectedNodeId(id, {
        ensureVisible: opts.ensureVisible !== false,
        syncTimeline: opts.syncTimeline === true,
        forceRefresh: true
      });
      return true;
    }

    refresh(){
      if(!this.bodyEl || !this.summaryEl) return;
      const query = String(this.filterInput ? this.filterInput.value : '').trim();
      const rows = this._rows(query);
      this.bodyEl.innerHTML = '';

      rows.forEach((row)=>{
        const tr = document.createElement('tr');
        if(this.selectedNodeId !== null && String(row.nodeId) === this.selectedNodeId){
          tr.classList.add('is-node-selected');
        }
        tr.addEventListener('click', (e)=>{
          if(isInteractiveElement(e.target)) return;
          this.setSelectedNodeId(row.nodeId, {
            ensureVisible: false,
            highlightGraph: true,
            syncTimeline: true,
            forceRefresh: false
          });
        });
        tr.addEventListener('dblclick', (e)=>{
          if(isInteractiveElement(e.target)) return;
          this._openInspector(row);
        });

        const tdId = document.createElement('td');
        tdId.className = 'col-id';
        const idBtn = document.createElement('button');
        idBtn.type = 'button';
        idBtn.className = 'node-id-link';
        idBtn.textContent = String(row.nodeId);
        idBtn.title = 'Highlight this node on graph';
        idBtn.addEventListener('click', (e)=>{
          e.preventDefault();
          e.stopPropagation();
          this.setSelectedNodeId(row.nodeId, {
            ensureVisible: true,
            highlightGraph: true,
            syncTimeline: true,
            forceRefresh: true
          });
        });
        tdId.appendChild(idBtn);
        tr.appendChild(tdId);

        const tdNode = document.createElement('td');
        tdNode.className = 'col-node';
        const nodeCell = document.createElement('div');
        nodeCell.className = 'nodePropsNodeCell';
        const titleText = document.createElement('div');
        titleText.className = 'nodePropsTitle';
        titleText.textContent = row.nodeTitle;
        nodeCell.appendChild(titleText);
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'nodePropsInspectBtn';
        editBtn.textContent = 'Open Details';
        editBtn.title = 'Edit this node in Details';
        editBtn.addEventListener('click', (e)=>{
          e.preventDefault();
          e.stopPropagation();
          this._openInspector(row);
        });
        nodeCell.appendChild(editBtn);
        tdNode.appendChild(nodeCell);
        tr.appendChild(tdNode);

        const tdType = document.createElement('td');
        tdType.className = 'col-type';
        tdType.textContent = row.nodeType;
        tr.appendChild(tdType);

        const tdConn = document.createElement('td');
        tdConn.className = 'col-connected';
        tdConn.textContent = row.connectedTo;
        tr.appendChild(tdConn);

        const tdProps = document.createElement('td');
        tdProps.className = 'col-props';
        const propsSummary = document.createElement('div');
        propsSummary.className = 'nodePropsPropSummary';
        propsSummary.textContent = row.propsSummary;
        propsSummary.title = row.propsText;
        tdProps.appendChild(propsSummary);
        tr.appendChild(tdProps);

        this.bodyEl.appendChild(tr);
      });

      if(!rows.length){
        const tr = document.createElement('tr');
        tr.className = 'nodePropsEmptyRow';
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'nodePropsEmpty';
        const title = document.createElement('div');
        title.className = 'nodePropsEmptyTitle';
        title.textContent = query ? 'No nodes match this search.' : 'No nodes available.';
        const hint = document.createElement('div');
        hint.className = 'nodePropsEmptyHint';
        hint.textContent = query
          ? `Clear or change "${query}" to see matching nodes.`
          : 'Load an example or add a node to start browsing here.';
        td.appendChild(title);
        td.appendChild(hint);
        tr.appendChild(td);
        this.bodyEl.appendChild(tr);
      }

      if(this._scrollSelectedOnRefresh && this.selectedNodeId !== null){
        this._scrollSelectedOnRefresh = false;
        const first = this.bodyEl.querySelector('tr.is-node-selected');
        if(first && typeof first.scrollIntoView === 'function'){
          first.scrollIntoView({ block: 'nearest' });
        }
      }

      const summary = [`${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}`];
      if(query) summary.push(`filter: ${query}`);
      if(this.selectedNodeId !== null) summary.push(`selected #${this.selectedNodeId}`);
      this.summaryEl.textContent = summary.join(' • ');
    }
  }

  App.NodePropsPanel = NodePropsPanel;
})();
