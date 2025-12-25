// Signal ports helpers: add/remove and keep in sync with properties.sigExtra

function syncSigPorts(node, base = 0){
  const need = base + (node.properties.sigExtra || 0);
  let curIn = node.inputs.filter(i=>i.name.startsWith('sigIn')).length;
  let curOut = node.outputs.filter(o=>o.name.startsWith('sigOut')).length;
  for(let i=curIn;i<need;i++) node.addInput(`sigIn${i}`, 'string');
  for(let i=curOut;i<need;i++) node.addOutput(`sigOut${i}`, 'string');
  while(curIn>need){ curIn--; removeSigInput(node, curIn); }
  while(curOut>need){ curOut--; removeSigOutput(node, curOut); }
}

function removeSigInput(node, idx){
  const p = node.inputs.findIndex(p=>p.name===`sigIn${idx}`);
  if(p<0) return;
  if(node.inputs[p].link!=null) node.graph.removeLink(node.inputs[p].link);
  node.removeInput(p);
}

function removeSigOutput(node, idx){
  const p = node.outputs.findIndex(p=>p.name===`sigOut${idx}`);
  if(p<0) return;
  const out = node.outputs[p];
  if(out.links) [...out.links].forEach(id=>node.graph.removeLink(id));
  node.removeOutput(p);
}

window.syncSigPorts = syncSigPorts;
