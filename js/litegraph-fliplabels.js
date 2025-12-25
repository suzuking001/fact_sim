(function(){
  if(typeof LiteGraph === 'undefined' || !LiteGraph.LGraphCanvas) return;
  const original = LiteGraph.LGraphCanvas.prototype.drawNode;
  LiteGraph.LGraphCanvas.prototype.drawNode = function(node, ctx){
    const flipped = [];
    const isFlipped = node && node.properties && node.properties.flipIO;
    const collect = (slots, isInput)=>{
      if(!slots || !isFlipped) return;
      slots.forEach((slot, idx)=>{
        if(!slot || !slot.__flipActive) return;
        const hadLabel = Object.prototype.hasOwnProperty.call(slot, 'label');
        flipped.push({ slot, idx, isInput, hadLabel, label: slot.label, name: slot.name });
        if(hadLabel) slot.label = '';
        slot.name = '';
      });
    };
    if(node){
      collect(node.inputs, true);
      collect(node.outputs, false);
    }
    original.call(this, node, ctx);
    if(!flipped.length) return;
    ctx.save();
    ctx.fillStyle = LiteGraph.NODE_TEXT_COLOR;
    ctx.font = this.inner_text_font;
    flipped.forEach(info=>{
      const text = (info.hadLabel ? info.label : info.name) || '';
      if(!text) return;
      const pos = node.getConnectionPos(info.isInput, info.idx);
      const localX = pos[0] - node.pos[0];
      const localY = pos[1] - node.pos[1];
      const prevAlign = ctx.textAlign;
      if(info.isInput){
        ctx.textAlign = 'right';
        ctx.fillText(text, localX - 8, localY + 5);
      }else{
        ctx.textAlign = 'left';
        ctx.fillText(text, localX + 8, localY + 5);
      }
      ctx.textAlign = prevAlign;
      if(info.hadLabel) info.slot.label = info.label;
      else delete info.slot.label;
      info.slot.name = info.name;
    });
    ctx.restore();
  };
})();
