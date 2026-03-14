var App = window.App || (window.App = {});

(function(){
  const MAX_DEFAULT_PARTITIONS = 4;
  const MIN_PAR_NODE_COUNT = 8;
  const MAX_CUT_RATIO = 0.45;

  function cloneJson(value){
    try{ return JSON.parse(JSON.stringify(value)); }catch(_e){ return value; }
  }

  function compactGraphData(data){
    return (typeof App.compactGraphData === 'function')
      ? App.compactGraphData(cloneJson(data))
      : cloneJson(data);
  }

  function createGraphFromData(graphData){
    const data = compactGraphData(graphData);
    const graph = new LGraph();
    graph.configure(data);
    if(App.repairGraphLinks && typeof App.repairGraphLinks === 'function'){
      try{ App.repairGraphLinks(graph); }catch(_e){}
    }
    if(App.stopGroups && typeof App.stopGroups.restoreSerializedData === 'function'){
      try{ App.stopGroups.restoreSerializedData(graph, data, false); }catch(_e){}
    }
    if(typeof configureGraphClock === 'function'){
      try{ configureGraphClock(graph); }catch(_e){}
    }
    return graph;
  }

  function getDefaultPartitionCount(nodeCount){
    const hc = Math.max(2, Number((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) || 4);
    const desired = Math.min(MAX_DEFAULT_PARTITIONS, Math.max(2, hc - 1));
    return Math.max(1, Math.min(desired, Math.floor(nodeCount / MIN_PAR_NODE_COUNT) || 1));
  }

  function buildUndirectedAdjacency(compiled){
    const adjacency = new Array(compiled.nodeCount);
    for(let i = 0; i < compiled.nodeCount; i += 1) adjacency[i] = [];
    for(let nodeIndex = 0; nodeIndex < compiled.nodeCount; nodeIndex += 1){
      const start = compiled.firstOutEdge[nodeIndex];
      const end = start + compiled.outEdgeCount[nodeIndex];
      for(let edgeIndex = start; edgeIndex < end; edgeIndex += 1){
        const targetIndex = compiled.outTargets[edgeIndex];
        if(targetIndex < 0 || targetIndex >= compiled.nodeCount) continue;
        adjacency[nodeIndex].push(targetIndex);
        adjacency[targetIndex].push(nodeIndex);
      }
    }
    return adjacency;
  }

  function buildConnectedComponents(adjacency){
    const visited = new Uint8Array(adjacency.length);
    const components = [];
    for(let start = 0; start < adjacency.length; start += 1){
      if(visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      const component = [];
      for(let head = 0; head < queue.length; head += 1){
        const nodeIndex = queue[head];
        component.push(nodeIndex);
        const neighbors = adjacency[nodeIndex];
        for(let i = 0; i < neighbors.length; i += 1){
          const next = neighbors[i];
          if(visited[next]) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
      components.push(component);
    }
    components.sort((a, b)=> b.length - a.length);
    return components;
  }

  function assignDisconnectedComponents(components, partitionCount, nodeCount){
    const partitionIdByNode = new Int16Array(nodeCount);
    partitionIdByNode.fill(-1);
    const counts = new Uint32Array(partitionCount);
    const partitionCountEff = Math.min(partitionCount, components.length);
    for(let i = 0; i < components.length; i += 1){
      let targetPartition = 0;
      for(let p = 1; p < partitionCountEff; p += 1){
        if(counts[p] < counts[targetPartition]) targetPartition = p;
      }
      const component = components[i];
      for(let j = 0; j < component.length; j += 1){
        const nodeIndex = component[j];
        partitionIdByNode[nodeIndex] = targetPartition;
        counts[targetPartition] += 1;
      }
    }
    return { partitionIdByNode, counts, partitionCount: partitionCountEff };
  }

  function chooseSeeds(compiled, adjacency, partitionCount){
    const seeds = [];
    const seen = new Set();
    const preferred = Array.isArray(compiled.meta && compiled.meta.sourceNodeIndices)
      ? compiled.meta.sourceNodeIndices.slice()
      : [];
    for(const nodeIndex of preferred){
      if(seeds.length >= partitionCount) break;
      if(nodeIndex < 0 || nodeIndex >= compiled.nodeCount || seen.has(nodeIndex)) continue;
      seeds.push(nodeIndex);
      seen.add(nodeIndex);
    }
    const ranked = [];
    for(let i = 0; i < compiled.nodeCount; i += 1){
      ranked.push({ nodeIndex: i, degree: adjacency[i].length });
    }
    ranked.sort((a, b)=> b.degree - a.degree || a.nodeIndex - b.nodeIndex);
    for(const row of ranked){
      if(seeds.length >= partitionCount) break;
      if(seen.has(row.nodeIndex)) continue;
      seeds.push(row.nodeIndex);
      seen.add(row.nodeIndex);
    }
    return seeds;
  }

  function assignConnectedGraph(compiled, adjacency, requestedPartitionCount){
    const partitionCount = Math.max(2, Math.min(requestedPartitionCount, compiled.nodeCount));
    const partitionIdByNode = new Int16Array(compiled.nodeCount);
    partitionIdByNode.fill(-1);
    const counts = new Uint32Array(partitionCount);
    const queues = new Array(partitionCount);
    const targetSize = Math.ceil(compiled.nodeCount / partitionCount);
    const seeds = chooseSeeds(compiled, adjacency, partitionCount);

    for(let p = 0; p < partitionCount; p += 1){
      const seed = seeds[p];
      queues[p] = [];
      if(typeof seed === 'number'){
        partitionIdByNode[seed] = p;
        counts[p] += 1;
        queues[p].push(seed);
      }
    }

    let assigned = seeds.length;
    while(assigned < compiled.nodeCount){
      let progressed = false;
      for(let p = 0; p < partitionCount; p += 1){
        const queue = queues[p];
        while(queue.length > 0 && counts[p] < targetSize){
          const nodeIndex = queue.shift();
          const neighbors = adjacency[nodeIndex];
          for(let i = 0; i < neighbors.length; i += 1){
            const next = neighbors[i];
            if(partitionIdByNode[next] >= 0) continue;
            partitionIdByNode[next] = p;
            counts[p] += 1;
            assigned += 1;
            queue.push(next);
            progressed = true;
            if(counts[p] >= targetSize) break;
          }
        }
      }

      if(progressed) continue;

      let fallbackNode = -1;
      for(let i = 0; i < compiled.nodeCount; i += 1){
        if(partitionIdByNode[i] < 0){
          fallbackNode = i;
          break;
        }
      }
      if(fallbackNode < 0) break;
      let targetPartition = 0;
      for(let p = 1; p < partitionCount; p += 1){
        if(counts[p] < counts[targetPartition]) targetPartition = p;
      }
      partitionIdByNode[fallbackNode] = targetPartition;
      counts[targetPartition] += 1;
      assigned += 1;
      queues[targetPartition].push(fallbackNode);
    }

    return { partitionIdByNode, counts, partitionCount };
  }

  function buildCutEdges(graph, compiled, partitionIdByNode){
    const cutEdges = [];
    const byPartition = new Map();
    const links = graph && graph.links ? graph.links : null;
    const indexByNodeId = compiled.meta && compiled.meta.indexByNodeId ? compiled.meta.indexByNodeId : {};
    for(const [rawLinkId, link] of Object.entries(links || {})){
      if(!link) continue;
      const originIndex = indexByNodeId[String(link.origin_id)];
      const targetIndex = indexByNodeId[String(link.target_id)];
      if(typeof originIndex === 'undefined' || typeof targetIndex === 'undefined') continue;
      const fromPartitionId = partitionIdByNode[originIndex];
      const toPartitionId = partitionIdByNode[targetIndex];
      if(fromPartitionId < 0 || toPartitionId < 0 || fromPartitionId === toPartitionId) continue;
      const edge = {
        linkId: /^\d+$/.test(String(rawLinkId)) ? Number(rawLinkId) : String(rawLinkId),
        originId: Number(link.origin_id),
        originSlot: Number.isFinite(Number(link.origin_slot)) ? Number(link.origin_slot) : -1,
        targetId: Number(link.target_id),
        targetSlot: Number.isFinite(Number(link.target_slot)) ? Number(link.target_slot) : -1,
        fromPartitionId,
        toPartitionId
      };
      cutEdges.push(edge);
      const list = byPartition.get(fromPartitionId) || [];
      list.push(edge);
      byPartition.set(fromPartitionId, list);
    }
    return { cutEdges, byPartition };
  }

  function stripStopGroupExtra(graphData){
    const data = cloneJson(graphData);
    if(data && data.extra && typeof data.extra === 'object'){
      delete data.extra.stopGroupsV1;
      if(Object.keys(data.extra).length === 0) delete data.extra;
    }
    return data;
  }

  function buildLocalGraphData(graphData, nodeIds){
    const idSet = new Set(Array.isArray(nodeIds) ? nodeIds.map((id)=> Number(id)) : []);
    const data = stripStopGroupExtra(graphData);
    data.nodes = (Array.isArray(data.nodes) ? data.nodes : []).filter((node)=> idSet.has(Number(node && node.id)));
    data.links = (Array.isArray(data.links) ? data.links : []).filter((row)=>{
      if(Array.isArray(row)){
        return idSet.has(Number(row[1])) && idSet.has(Number(row[3]));
      }
      return idSet.has(Number(row && row.origin_id)) && idSet.has(Number(row && row.target_id));
    });
    data.groups = [];
    return data;
  }

  function buildPartitions(graphData, compiled, partitionIdByNode, partitionCount, byPartition, buildLocalGraph){
    const partitions = new Array(partitionCount);
    for(let p = 0; p < partitionCount; p += 1){
      partitions[p] = {
        partitionId: p,
        nodeIndices: [],
        nodeIds: [],
        outgoingCutEdges: byPartition.get(p) || [],
        ownedSinkIds: []
      };
    }
    const sinkSet = new Set(Array.isArray(compiled.meta && compiled.meta.sinkNodeIndices) ? compiled.meta.sinkNodeIndices : []);
    for(let nodeIndex = 0; nodeIndex < compiled.nodeCount; nodeIndex += 1){
      const partitionId = partitionIdByNode[nodeIndex];
      if(partitionId < 0 || partitionId >= partitionCount) continue;
      const part = partitions[partitionId];
      const nodeId = Number(compiled.nodeIds[nodeIndex]);
      part.nodeIndices.push(nodeIndex);
      part.nodeIds.push(nodeId);
      if(sinkSet.has(nodeIndex)) part.ownedSinkIds.push(nodeId);
    }
    const compact = partitions.filter((part)=> part.nodeIndices.length > 0);
    if(buildLocalGraph){
      for(const part of compact){
        part.localGraphData = buildLocalGraphData(graphData, part.nodeIds);
      }
    }
    return compact;
  }

  App.createEventFastParPlan = function(graphOrData, options){
    const graphData = compactGraphData(
      graphOrData && typeof graphOrData.serialize === 'function'
        ? graphOrData.serialize()
        : graphOrData
    );
    const graph = createGraphFromData(graphData);
    const compiled = App.compileFastGraph(graph);
    const compat = (typeof App.createFastCompatAdapter === 'function')
      ? App.createFastCompatAdapter(graph, compiled)
      : null;
    const fallbackProfile = compat && typeof compat.getFallbackProfile === 'function'
      ? compat.getFallbackProfile()
      : { executableCount: 0, executableTypes: [] };

    const executableTypes = Array.isArray(fallbackProfile.executableTypes)
      ? fallbackProfile.executableTypes.map((row)=> String(row || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const hasExecutableFallback = executableTypes.length > 0 || (Number(fallbackProfile.executableCount) || 0) > 0;

    if(hasExecutableFallback){
      return {
        canParallelize: false,
        fallbackMode: 'event-fast-worker',
        reason: 'executable-fallback-present',
        graphData,
        compiledMeta: compiled.meta || {},
        fallbackProfile
      };
    }

    if(compiled.nodeCount < MIN_PAR_NODE_COUNT){
      return {
        canParallelize: false,
        fallbackMode: 'event-fast-worker',
        reason: 'graph-too-small',
        graphData,
        compiledMeta: compiled.meta || {},
        fallbackProfile
      };
    }

    const requestedPartitionCount = Math.max(
      1,
      Math.floor(Number(options && options.partitionCount) || getDefaultPartitionCount(compiled.nodeCount))
    );
    if(requestedPartitionCount < 2){
      return {
        canParallelize: false,
        fallbackMode: 'event-fast-worker',
        reason: 'single-partition',
        graphData,
        compiledMeta: compiled.meta || {},
        fallbackProfile
      };
    }

    const adjacency = buildUndirectedAdjacency(compiled);
    const components = buildConnectedComponents(adjacency);
    const assignment = components.length > 1
      ? assignDisconnectedComponents(components, requestedPartitionCount, compiled.nodeCount)
      : assignConnectedGraph(compiled, adjacency, requestedPartitionCount);
    const { cutEdges, byPartition } = buildCutEdges(graph, compiled, assignment.partitionIdByNode);
    const cutRatio = cutEdges.length / Math.max(1, compiled.edgeCount || 1);

    if(cutRatio > MAX_CUT_RATIO){
      return {
        canParallelize: false,
        fallbackMode: 'event-fast-worker',
        reason: 'cut-ratio-too-high',
        cutRatio,
        graphData,
        compiledMeta: compiled.meta || {},
        fallbackProfile
      };
    }

    const partitions = buildPartitions(
      graphData,
      compiled,
      assignment.partitionIdByNode,
      assignment.partitionCount,
      byPartition,
      cutEdges.length === 0
    );
    if(partitions.length < 2){
      return {
        canParallelize: false,
        fallbackMode: 'event-fast-worker',
        reason: 'effective-single-partition',
        graphData,
        compiledMeta: compiled.meta || {},
        fallbackProfile
      };
    }

    return {
      canParallelize: true,
      graphData,
      partitionCount: partitions.length,
      edgeCount: compiled.edgeCount,
      cutEdgeCount: cutEdges.length,
      cutRatio,
      partitions,
      partitionIdByNode: Array.from(assignment.partitionIdByNode),
      compiledMeta: cloneJson(compiled.meta || {}),
      fallbackProfile
    };
  };
})();
