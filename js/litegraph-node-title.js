// Append the node ID to the title shown on the canvas for disambiguation,
// e.g. "Equipment" -> "Equipment#64".
//
// This is display-only: the stored `title` is left untouched, so the title
// editing UI, save/load, Flow validation messages and engine parity keep using
// the clean type label. Only the title bar drawn by LiteGraph (via getTitle())
// gains the "#<id>" suffix.
(function(){
  'use strict';
  if(typeof LiteGraph === 'undefined' || !LiteGraph.LGraphNode || !LiteGraph.LGraphNode.prototype) return;
  const proto = LiteGraph.LGraphNode.prototype;
  if(proto.__factTitleIdPatched) return;

  const baseGetTitle = proto.getTitle;
  proto.getTitle = function(){
    const base = baseGetTitle ? baseGetTitle.call(this) : (this && this.title ? this.title : '');
    const text = String(base == null ? '' : base);
    const id = this && this.id;
    // Only real nodes have a finite numeric id; groups (LGraphGroup) do not,
    // so they keep their plain title.
    if(typeof id !== 'number' || !isFinite(id) || !text) return text;
    // Avoid duplicating a suffix the user may have typed explicitly.
    if(text.slice(-(String(id).length + 1)) === '#' + id) return text;
    return text + '#' + id;
  };
  proto.__factTitleIdPatched = true;
})();
