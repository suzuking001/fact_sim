// Right-click menu helpers (script/properties/signals)

function defaultScript(){
  return `// work: Work object, signalArr: array of signals
// this._state values: IDLE, PROCESS, WAIT, DOWN
// Return true to accept work into PROCESS state.

// Default: すべて受け入れる（必要ならここに条件を記述）
return true;`;
}

function menuMixin(cls){
  cls.prototype.getExtraMenuOptions = function(){
    const opts = [];
    if(this.properties.script !== undefined){
      opts.push({
        content: 'Edit Script…',
        callback: ()=>{
          window.editingNode = this;
          scriptEditorTextarea.value = this.properties.script;
          document.getElementById('scriptEditorModal').style.display = 'block';
        }
      });
    }
    if(this.properties.processTime !== undefined || this.properties.downTime !== undefined){
      opts.push({
        content: 'Edit Properties…',
        callback: ()=>{
          const p = this.properties;
          if(p.processTime !== undefined){
            const v = prompt('ProcessTime (s):', p.processTime);
            if(v!=null && !isNaN(v)) p.processTime = +v;
          }
          if(p.downTime !== undefined){
            const v = prompt('DownTime (s):', p.downTime);
            if(v!=null && !isNaN(v)) p.downTime = +v;
          }
          this.setDirtyCanvas(true,true);
        }
      });
    }
    if(this.properties.sigEnabled !== undefined){
      opts.push({
        content: this.properties.sigEnabled ? 'Disable Signals' : 'Enable Signals',
        callback: ()=>{ this.properties.sigEnabled = !this.properties.sigEnabled; this.setDirtyCanvas(true,true); }
      });
    }
    const extra = this.properties.sigExtra || 0;
    opts.push({ content: 'Add Sig Port', callback: ()=>{ this.properties.sigExtra++; syncSigPorts(this); this.setDirtyCanvas(true,true); } });
    opts.push({ content: 'Remove Sig Port', disabled: extra===0, callback: ()=>{ if(extra===0) return; this.properties.sigExtra--; syncSigPorts(this); this.setDirtyCanvas(true,true); } });
    return opts;
  };
}

window.defaultScript = defaultScript;
window.menuMixin = menuMixin;
