// Graph link consistency repair helper

var App = window.App || (window.App = {});

App.repairGraphLinks = function(graphLike){
  const graph = graphLike || App.graph;
  if(!graph){
    return {
      nodeCount: 0,
      linkCount: 0,
      repairedInputCount: 0,
      repairedOutputCount: 0,
      droppedDanglingLinks: 0,
      droppedInvalidSlotLinks: 0,
      droppedDuplicateInputLinks: 0
    };
  }

  const nodes = Array.isArray(graph._nodes) ? graph._nodes : [];
  const sourceLinks = (graph.links && typeof graph.links === 'object') ? graph.links : {};

  const nodeById = new Map();
  for(const node of nodes){
    if(node && (typeof node.id === 'string' || typeof node.id === 'number')){
      nodeById.set(String(node.id), node);
    }
  }

  for(const node of nodes){
    if(Array.isArray(node.inputs)){
      for(const input of node.inputs){
        if(input && typeof input === 'object') input.link = null;
      }
    }
    if(Array.isArray(node.outputs)){
      for(const output of node.outputs){
        if(output && typeof output === 'object') output.links = null;
      }
    }
  }

  let repairedInputCount = 0;
  let repairedOutputCount = 0;
  let droppedDanglingLinks = 0;
  let droppedInvalidSlotLinks = 0;
  let droppedDuplicateInputLinks = 0;

  const repairedLinks = {};
  let maxLinkId = 0;

  const entries = Object.entries(sourceLinks);
  for(const [rawKey, rawLink] of entries){
    if(!rawLink || typeof rawLink !== 'object'){
      droppedInvalidSlotLinks += 1;
      continue;
    }

    const link = rawLink;
    let linkId = Number(link.id);
    if(!isFinite(linkId) || linkId <= 0){
      const fromKey = Number(rawKey);
      if(isFinite(fromKey) && fromKey > 0){
        linkId = Math.floor(fromKey);
      }else{
        droppedInvalidSlotLinks += 1;
        continue;
      }
    }else{
      linkId = Math.floor(linkId);
    }

    const originId = link.origin_id;
    const targetId = link.target_id;
    const originSlot = Number(link.origin_slot);
    const targetSlot = Number(link.target_slot);

    if((typeof originId !== 'string' && typeof originId !== 'number') ||
       (typeof targetId !== 'string' && typeof targetId !== 'number') ||
       !isFinite(originSlot) || !isFinite(targetSlot)){
      droppedInvalidSlotLinks += 1;
      continue;
    }

    const originNode = nodeById.get(String(originId));
    const targetNode = nodeById.get(String(targetId));
    if(!originNode || !targetNode){
      droppedDanglingLinks += 1;
      continue;
    }

    const os = Math.floor(originSlot);
    const ts = Math.floor(targetSlot);

    if(!Array.isArray(originNode.outputs) || !Array.isArray(targetNode.inputs) ||
       os < 0 || ts < 0 || os >= originNode.outputs.length || ts >= targetNode.inputs.length){
      droppedInvalidSlotLinks += 1;
      continue;
    }

    const outputPort = originNode.outputs[os];
    const inputPort = targetNode.inputs[ts];
    if(!outputPort || !inputPort || typeof outputPort !== 'object' || typeof inputPort !== 'object'){
      droppedInvalidSlotLinks += 1;
      continue;
    }

    if(inputPort.link !== null && typeof inputPort.link !== 'undefined' && Number(inputPort.link) !== linkId){
      droppedDuplicateInputLinks += 1;
      continue;
    }

    if(!Array.isArray(outputPort.links)) outputPort.links = [];
    if(!outputPort.links.includes(linkId)){
      outputPort.links.push(linkId);
      repairedOutputCount += 1;
    }

    if(inputPort.link === null || typeof inputPort.link === 'undefined'){
      inputPort.link = linkId;
      repairedInputCount += 1;
    }

    link.id = linkId;
    link.origin_slot = os;
    link.target_slot = ts;
    repairedLinks[String(linkId)] = link;
    if(linkId > maxLinkId) maxLinkId = linkId;
  }

  for(const node of nodes){
    if(!Array.isArray(node.outputs)) continue;
    for(const output of node.outputs){
      if(!output || typeof output !== 'object') continue;
      if(Array.isArray(output.links)){
        if(output.links.length === 0){
          output.links = null;
        }else{
          output.links.sort((a,b)=> Number(a) - Number(b));
        }
      }
    }
  }

  graph.links = repairedLinks;
  if(typeof graph.last_link_id === 'number'){
    graph.last_link_id = Math.max(graph.last_link_id, maxLinkId);
  }else{
    graph.last_link_id = maxLinkId;
  }

  return {
    nodeCount: nodes.length,
    linkCount: Object.keys(repairedLinks).length,
    repairedInputCount,
    repairedOutputCount,
    droppedDanglingLinks,
    droppedInvalidSlotLinks,
    droppedDuplicateInputLinks
  };
};
