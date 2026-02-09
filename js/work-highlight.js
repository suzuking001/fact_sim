// Highlight nodes that are processing a selected Work ID (from timeline)
(function(){
  if(typeof LiteGraph === 'undefined' || !LiteGraph.LGraphCanvas) return;

  function pickWorkId(node){
    const pick = (obj)=>{
      if(!obj || typeof obj !== 'object') return null;
      const id = obj.id;
      return (id === undefined || id === null) ? null : id;
    };
    return (
      pick(node?._currentWork) ??
      pick(node?._payload) ??
      pick(node?._workOffer) ??
      pick(node?._work1) ??
      pick(node?._work2) ??
      pick(node?._lastWork) ??
      null
    );
  }

  const originalDrawNode = LiteGraph.LGraphCanvas.prototype.drawNode;
  LiteGraph.LGraphCanvas.prototype.drawNode = function(node, ctx){
    originalDrawNode.call(this, node, ctx);
    try{
      const selected = window.selectedWorkId;
      if(selected === null || typeof selected === 'undefined') return;
      const wid = pickWorkId(node);
      if(wid === null || typeof wid === 'undefined') return;
      // allow numeric/string equivalence
      if(wid != selected) return;
      let gx = node.pos[0];
      let gy = node.pos[1];
      let gw = node.size ? node.size[0] : (LiteGraph.NODE_WIDTH || 140);
      let gh = node.size ? node.size[1] : (LiteGraph.NODE_TITLE_HEIGHT || 30);
      if(typeof node.getBounding === 'function'){
        const b = new Float32Array(4);
        node.getBounding(b);
        gx = b[0]; gy = b[1]; gw = b[2]; gh = b[3];
      }
      const ds = this.ds || { scale: 1 };
      const scale = ds.scale || 1;
      const x = gx - node.pos[0];
      const y = gy - node.pos[1];
      const w = gw;
      const h = gh;
      const padOuter = 6 / scale;
      const padInner = 2 / scale;
      ctx.save();
      ctx.lineWidth = 6 / scale;
      ctx.strokeStyle = '#ffd166';
      ctx.shadowColor = 'rgba(255,105,0,0.85)';
      ctx.shadowBlur = 20 / scale;
      ctx.strokeRect(x - padOuter, y - padOuter, w + padOuter * 2, h + padOuter * 2);
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = '#ff4500';
      ctx.shadowBlur = 0;
      ctx.strokeRect(x - padInner, y - padInner, w + padInner * 2, h + padInner * 2);
      ctx.restore();
    }catch(_e){}
  };
})();
