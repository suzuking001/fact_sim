// Right-click menu helpers (script/properties/signals)

function defaultScript(){
  return `// work: Work object (work.id, work.type, etc.)
// signalArr: array of sigIn values

if(work.type === 'A'){
  this.properties.processTime = 5.0;
  this.properties.downTime = 3.0;
}else if(work.type === 'B'){
  this.properties.processTime = 4.0;
  this.properties.downTime = 2.0;
}else{
  // default
  this.properties.processTime = 10.0;
  this.properties.downTime = 2.0;
}

// Return true to accept this work item into PROCESS
return true;`;
}

function menuMixin(cls){
  cls.prototype.getExtraMenuOptions = function(){
    const opts = [];
    if(this.properties.script !== undefined){
      opts.push({
        content: 'Edit Script...',
        callback: ()=>{
          if(typeof window.openPropertyEditor === 'function'){
            window.openPropertyEditor(this, 'script');
            return;
          }
          window.editingNode = this;
          scriptEditorTextarea.value = this.properties.script;
          document.getElementById('scriptEditorModal').style.display = 'block';
        }
      });
    }
    if(this.properties.processTime !== undefined || this.properties.downTime !== undefined){
      opts.push({
        content: 'Edit Properties...',
        callback: ()=>{
          const p = this.properties;
          if(p.processTime !== undefined){
            const v = prompt('ProcessTime (s):', p.processTime);
            if(v != null && !isNaN(v)) p.processTime = +v;
          }
          if(p.downTime !== undefined){
            const v = prompt('DownTime (s):', p.downTime);
            if(v != null && !isNaN(v)) p.downTime = +v;
          }
          this.setDirtyCanvas(true, true);
        }
      });
    }
    if(this.properties.sigEnabled !== undefined){
      opts.push({
        content: this.properties.sigEnabled ? 'Disable Signals' : 'Enable Signals',
        callback: ()=>{
          this.properties.sigEnabled = !this.properties.sigEnabled;
          this.setDirtyCanvas(true, true);
        }
      });
    }
    const extra = this.properties.sigExtra || 0;
    const applySigChange = ()=>{
      if(typeof this._syncSignalPorts === 'function') this._syncSignalPorts();
      else{
        syncSigPorts(this, 0);
        if(this.setDirtyCanvas) this.setDirtyCanvas(true, true);
      }
    };
    opts.push({
      content: 'Add SIG IN/OUT',
      callback: ()=>{
        this.properties.sigExtra++;
        applySigChange();
      }
    });
    opts.push({
      content: 'Remove SIG IN/OUT',
      disabled: extra === 0,
      callback: ()=>{
        if(extra === 0) return;
        this.properties.sigExtra--;
        applySigChange();
      }
    });
    return opts;
  };
}

window.defaultScript = defaultScript;
window.menuMixin = menuMixin;
