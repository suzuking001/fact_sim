(function(){
  if(typeof LiteGraph === 'undefined') return;

  const SLOT_HEIGHT = LiteGraph.NODE_SLOT_HEIGHT || 24;
  const SLOT_OFFSET = SLOT_HEIGHT * 0.5;

  function computeY(node, idx){
    const start = node.constructor?.slot_start_y || 0;
    return start + (idx + 0.7) * SLOT_HEIGHT;
  }

  function assignSlotPositions(node, slots, isInput){
    if(!slots || !node.size) return;
    const width = node.size ? node.size[0] : (LiteGraph.NODE_WIDTH || 140);
    slots.forEach((slot, idx)=>{
      if(!slot) return;
      if(!slot.pos) slot.pos = [0,0];
      slot.pos[0] = isInput ? (width - SLOT_OFFSET) : SLOT_OFFSET;
      slot.pos[1] = computeY(node, idx);
      if(typeof slot._flipPrevDir === 'undefined')
        slot._flipPrevDir = (typeof slot.dir === 'undefined') ? null : slot.dir;
      slot.dir = isInput ? LiteGraph.RIGHT : LiteGraph.LEFT;
      slot.__flipActive = true;
    });
  }

  function clearSlotPositions(slots){
    if(!slots) return;
    slots.forEach(slot=>{
      if(!slot) return;
      if(slot.pos) delete slot.pos;
      const wasActive = !!slot.__flipActive;
      if(slot.__flipActive) delete slot.__flipActive;
      if(slot._flipPrevDir !== undefined){
        if(slot._flipPrevDir === null) delete slot.dir;
        else slot.dir = slot._flipPrevDir;
        delete slot._flipPrevDir;
      }else if(wasActive){
        delete slot.dir;
      }
    });
  }

  function applyFlipState(node){
    if(!node || !node.properties) return;
    if(node.properties.flipIO){
      assignSlotPositions(node, node.inputs, true);
      assignSlotPositions(node, node.outputs, false);
    }else{
      clearSlotPositions(node.inputs);
      clearSlotPositions(node.outputs);
    }
    if(typeof node.setDirtyCanvas === 'function') node.setDirtyCanvas(true,true);
  }

  function wrapMenu(node){
    if(!node) return;
    const proto = Object.getPrototypeOf(node);
    if(proto.__flipMenuPatched) return;
    const prev = proto.getExtraMenuOptions;
    proto.getExtraMenuOptions = function(){
      let opts = prev ? prev.apply(this, arguments) : [];
      if(!Array.isArray(opts)) opts = [];
      if(this.properties && Object.prototype.hasOwnProperty.call(this.properties, 'flipIO')){
        opts.push({
          content: this.properties.flipIO ? 'Ports: reset alignment' : 'Ports: flip horizontally',
          callback: ()=>{
            this.properties.flipIO = !this.properties.flipIO;
            this.onPropertyChanged?.('flipIO');
            if(window.refreshFlipIO) window.refreshFlipIO(this);
            this.graph?.change?.();
          }
        });
      }
      return opts;
    };
    proto.__flipMenuPatched = true;
  }

  window.refreshFlipIO = function(node){
    applyFlipState(node);
  };

  window.enableFlipIO = function(node){
    if(!node) return;
    node.properties = node.properties || {};
    if(typeof node.properties.flipIO === 'undefined') node.properties.flipIO = false;
    wrapMenu(node);
    if(!node.__flipResizePatched){
      const origResize = node.onResize;
      node.onResize = function(size){
        if(origResize) origResize.call(this, size);
        if(window.enforceNodeOverlayMinSize) window.enforceNodeOverlayMinSize(this);
        if(window.refreshFlipIO) window.refreshFlipIO(this);
      };
      node.__flipResizePatched = true;
    }
    if(window.refreshFlipIO) window.refreshFlipIO(node);
  };

  const originalConfigure = LiteGraph.LGraphNode.prototype.configure;
  LiteGraph.LGraphNode.prototype.configure = function(info){
    const r = originalConfigure ? originalConfigure.call(this, info) : undefined;
    if(this.__flipResizePatched && this.properties && Object.prototype.hasOwnProperty.call(this.properties, 'flipIO')){
      if(window.refreshFlipIO) window.refreshFlipIO(this);
    }
    return r;
  };
})();
