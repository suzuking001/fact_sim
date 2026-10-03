// Compile LiteGraph graphs into dense structures for event-fast.

var App = window.App || (window.App = {});

(function(){
  function cloneJson(value){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return value; }
  }

  function sortNodes(nodes){
    return nodes.slice().sort((a, b)=>{
      const aId = a && typeof a.id !== 'undefined' ? a.id : '';
      const bId = b && typeof b.id !== 'undefined' ? b.id : '';
      const an = Number(aId);
      const bn = Number(bId);
      const aNum = Number.isFinite(an);
      const bNum = Number.isFinite(bn);
      if(aNum && bNum && an !== bn) return an - bn;
      return String(aId).localeCompare(String(bId));
    });
  }

  function createIndexMap(nodes){
    const indexByNodeId = Object.create(null);
    for(let i = 0; i < nodes.length; i += 1){
      indexByNodeId[String(nodes[i].id)] = i;
    }
    return indexByNodeId;
  }

  function buildOutgoing(nodes, indexByNodeId, graph){
    const first = new Uint32Array(nodes.length);
    const count = new Uint32Array(nodes.length);
    const targets = [];
    const targetSlots = [];
    const originSlots = [];

    for(let i = 0; i < nodes.length; i += 1){
      const node = nodes[i];
      first[i] = targets.length;
      const outputs = Array.isArray(node && node.outputs) ? node.outputs : [];
      for(let outputIndex = 0; outputIndex < outputs.length; outputIndex += 1){
        const out = outputs[outputIndex];
        const links = Array.isArray(out && out.links) ? out.links : [];
        for(const linkId of links){
          const link = graph && graph.links ? graph.links[linkId] : null;
          if(!link) continue;
          const targetIndex = indexByNodeId[String(link.target_id)];
          if(typeof targetIndex === 'undefined') continue;
          targets.push(targetIndex);
          targetSlots.push(Number.isFinite(Number(link.target_slot)) ? Number(link.target_slot) : -1);
          originSlots.push(outputIndex);
        }
      }
      count[i] = targets.length - first[i];
    }

    return {
      first,
      count,
      targets: Int32Array.from(targets),
      targetSlots: Int16Array.from(targetSlots),
      originSlots: Int16Array.from(originSlots)
    };
  }

  function buildIncoming(nodes, indexByNodeId, graph){
    const first = new Uint32Array(nodes.length);
    const count = new Uint32Array(nodes.length);
    const sources = [];
    const sourceSlots = [];

    for(let i = 0; i < nodes.length; i += 1){
      const node = nodes[i];
      first[i] = sources.length;
      const inputs = Array.isArray(node && node.inputs) ? node.inputs : [];
      for(const inp of inputs){
        if(!inp || inp.link == null) continue;
        const link = graph && graph.links ? graph.links[inp.link] : null;
        if(!link) continue;
        const sourceIndex = indexByNodeId[String(link.origin_id)];
        if(typeof sourceIndex === 'undefined') continue;
        sources.push(sourceIndex);
        sourceSlots.push(Number.isFinite(Number(link.origin_slot)) ? Number(link.origin_slot) : -1);
      }
      count[i] = sources.length - first[i];
    }

    return {
      first,
      count,
      sources: Int32Array.from(sources),
      sourceSlots: Int16Array.from(sourceSlots)
    };
  }

  function buildGroupBits(nodes, indexByNodeId, graph){
    const groups = (App.stopGroups && typeof App.stopGroups.listStopGroups === 'function')
      ? App.stopGroups.listStopGroups(graph)
      : [];
    const groupWordCount = Math.max(0, Math.ceil(groups.length / 32));
    const bits = new Uint32Array(nodes.length * groupWordCount);
    if(!groups.length) return { groupWordCount, groupBits: bits };

    for(let groupIndex = 0; groupIndex < groups.length; groupIndex += 1){
      const row = groups[groupIndex];
      const list = (App.stopGroups && typeof App.stopGroups.listNodesInGroup === 'function')
        ? App.stopGroups.listNodesInGroup(row.group, graph)
        : [];
      const wordIndex = Math.floor(groupIndex / 32);
      const bit = (1 << (groupIndex % 32)) >>> 0;
      for(const node of list){
        if(!node || typeof node.id === 'undefined') continue;
        const nodeIndex = indexByNodeId[String(node.id)];
        if(typeof nodeIndex === 'undefined') continue;
        bits[nodeIndex * groupWordCount + wordIndex] |= bit;
      }
    }

    return { groupWordCount, groupBits: bits };
  }

  // Compile static synchronization membership in original graph/Flow order.
  // Cells and admission decisions remain live and are evaluated on every call.
  App.compileFastFlowSync = function(graph){
    const groups = graph.extra?.syncroGroups || [];
    const membersByGroup = new Map(groups.map(group=> [group.id, []]));
    const flows = [];
    const syncItems = [];
    for(const node of graph._nodes || []){
      const flow = node.properties?.flow;
      flows.push({ node, flow, nodes: flow?.nodes, links: flow?.links,
        nodeCount: flow?.nodes?.length, linkCount: flow?.links?.length,
        signalCache: flow?.__signalCache });
      for(const item of flow?.nodes || []){
        if(item.kind !== 'syncroJudgment') continue;
        syncItems.push({ flow, item, groupId: item.config.groupId });
        const members = membersByGroup.get(item.config.groupId);
        if(members) members.push({ node, item });
      }
    }
    return { nodes: graph._nodes, version: graph._version, flows, syncItems,
      memberships: groups.map(group=> ({ group, id: group.id, members: membersByGroup.get(group.id) })) };
  };

  App.isFastFlowSyncCurrent = function(graph, plan){
    const groups = graph.extra?.syncroGroups || [];
    if(!plan || plan.nodes !== graph._nodes || plan.version !== graph._version
      || plan.flows.length !== graph._nodes.length || groups.length !== plan.memberships.length) return false;
    for(let i = 0; i < groups.length; i++){
      if(groups[i] !== plan.memberships[i].group || groups[i].id !== plan.memberships[i].id) return false;
    }
    for(let i = 0; i < plan.flows.length; i++){
      const row = plan.flows[i], node = graph._nodes[i], flow = node.properties?.flow;
      if(row.node !== node || row.flow !== flow || row.nodes !== flow?.nodes || row.links !== flow?.links
        || row.nodeCount !== flow?.nodes?.length || row.linkCount !== flow?.links?.length
        || row.signalCache !== flow?.__signalCache) return false;
    }
    for(const row of plan.syncItems){
      if(row.item.kind !== 'syncroJudgment' || row.item.config.groupId !== row.groupId
        || !row.flow.nodes.includes(row.item)) return false;
    }
    return true;
  };

  // Topology is immutable between FlowModel commits. Keep these indexes in
  // the engine, outside the serialized Flow/runtime, and refresh after edits.
  App.prepareFastFlowTopology = function(graph, context){
    if(!context.topology) return;
    context.currentFlow = null; context.currentTopology = null;
    for(const node of graph._nodes || []){
      const flow = node.properties?.flow;
      if(!flow?.nodes || !flow.links) continue;
      let plan = context.topology.get(flow);
      if(plan && plan.nodes === flow.nodes && plan.links === flow.links
        && plan.nodeCount === flow.nodes.length && plan.linkCount === flow.links.length
        && plan.signalCache === flow.__signalCache) continue;
      const signals = App.FlowModel.signalLinks(flow);
      plan = { nodes: flow.nodes, links: flow.links, nodeCount: flow.nodes.length,
        linkCount: flow.links.length, signalCache: signals, byId: new Map(),
        firstByKind: new Map(), outgoing: new Map(), linksFrom: new Map(),
        workLinksFrom: new Map(), joinInputs: new WeakMap(), routes: new WeakMap(),
        assembly: new Map(), signalBranches: new WeakMap(), workBranches: new WeakMap() };
      for(const item of flow.nodes){
        // Array.find uses strict equality and returns the first match.
        if(!Number.isNaN(item.id) && !plan.byId.has(item.id)) plan.byId.set(item.id,item);
        if(!plan.firstByKind.has(item.kind)) plan.firstByKind.set(item.kind,item);
      }
      for(const link of flow.links){
        if(Number.isNaN(link.from)) continue;
        if(!plan.linksFrom.has(link.from)) plan.linksFrom.set(link.from,[]);
        plan.linksFrom.get(link.from).push(link);
        if(!signals.has(link)){
          if(!plan.workLinksFrom.has(link.from)) plan.workLinksFrom.set(link.from,[]);
          plan.workLinksFrom.get(link.from).push(link);
        }
        if(!plan.outgoing.has(link.from)) plan.outgoing.set(link.from,new Map());
        const ports = plan.outgoing.get(link.from);
        if(!Number.isNaN(link.output) && !ports.has(link.output)) ports.set(link.output,link);
      }
      context.topology.set(flow,plan);
    }
  };

  App.compileFastGraph = function(graph){
    const g = graph || App.graph;
    if(!g || !Array.isArray(g._nodes)) throw new Error('graph is not initialized');
    const nodes = sortNodes(g._nodes.filter((node)=> node && typeof node.id !== 'undefined'));
    const indexByNodeId = createIndexMap(nodes);
    const outgoing = buildOutgoing(nodes, indexByNodeId, g);
    const incoming = buildIncoming(nodes, indexByNodeId, g);
    const groupInfo = buildGroupBits(nodes, indexByNodeId, g);
    const kernels = App.fastKernels || {};
    const inferKindId = (typeof kernels.inferKindId === 'function')
      ? kernels.inferKindId
      : (()=> 0);
    const canHandleKind = (typeof kernels.canHandleKind === 'function')
      ? kernels.canHandleKind
      : (()=> false);
    const getKindName = (typeof kernels.getKindName === 'function')
      ? kernels.getKindName
      : ((kindId)=> String(kindId));

    const nodeIds = new Int32Array(nodes.length);
    const kindIds = new Uint16Array(nodes.length);
    const fallbackMask = new Uint8Array(nodes.length);
    const sourceNodeIndices = [];
    const sinkNodeIndices = [];
    const fallbackNodeIds = [];
    const kernelNodeIds = [];
    const kindNameSet = new Set();

    for(let i = 0; i < nodes.length; i += 1){
      const node = nodes[i];
      const kindId = Number(inferKindId(node)) || 0;
      nodeIds[i] = Number(node.id);
      kindIds[i] = kindId;
      if(!canHandleKind(kindId)) fallbackMask[i] = 1;
      if(fallbackMask[i]) fallbackNodeIds.push(Number(node.id));
      else kernelNodeIds.push(Number(node.id));
      const kindName = getKindName(kindId);
      if(kindName) kindNameSet.add(kindName);
      if(kindId === kernels.KINDS?.Source) sourceNodeIndices.push(i);
      if(kindId === kernels.KINDS?.Sink) sinkNodeIndices.push(i);
    }

    return {
      version: 1,
      nodeCount: nodes.length,
      edgeCount: outgoing.targets.length,
      groupWordCount: groupInfo.groupWordCount,
      nodeIds,
      kindIds,
      fallbackMask,
      firstOutEdge: outgoing.first,
      outEdgeCount: outgoing.count,
      outTargets: outgoing.targets,
      outOriginSlots: outgoing.originSlots,
      outTargetSlots: outgoing.targetSlots,
      firstInEdge: incoming.first,
      inEdgeCount: incoming.count,
      inSources: incoming.sources,
      inSourceSlots: incoming.sourceSlots,
      groupBits: groupInfo.groupBits,
      meta: {
        indexByNodeId: cloneJson(indexByNodeId),
        kindNames: Array.from(kindNameSet.values()),
        fallbackNodeIds,
        fallbackNodeCount: fallbackNodeIds.length,
        kernelNodeIds,
        kernelNodeCount: kernelNodeIds.length,
        sourceNodeIndices,
        sinkNodeIndices
      }
    };
  };
})();
