// Note node: free-form memo text on graph

function _wrapMemoLines(ctx, text, maxWidth){
  const source = String(text || '').replace(/\r\n/g, '\n');
  const rawLines = source.split('\n');
  const out = [];

  for(let li = 0; li < rawLines.length; li++){
    const line = rawLines[li];
    if(!line){
      out.push('');
      continue;
    }

    let rest = line;
    while(rest.length){
      let chunk = rest;
      if(ctx.measureText(chunk).width <= maxWidth){
        out.push(chunk);
        break;
      }

      // Prefer split by word boundary first
      let cut = chunk.length;
      while(cut > 1 && ctx.measureText(chunk.slice(0, cut)).width > maxWidth){
        cut--;
      }
      if(cut <= 1){
        out.push(chunk.slice(0, 1));
        rest = chunk.slice(1);
        continue;
      }

      const boundary = chunk.slice(0, cut).search(/\s+\S*$/);
      if(boundary > 0){
        out.push(chunk.slice(0, boundary).trimEnd());
        rest = chunk.slice(boundary).trimStart();
      }else{
        out.push(chunk.slice(0, cut).trimEnd());
        rest = chunk.slice(cut).trimStart();
      }
    }
  }
  return out;
}

function _memoClampFontSize(v, fallback){
  const n = Number(v);
  if(!isFinite(n)) return fallback;
  return Math.max(10, Math.min(64, Math.round(n)));
}

function _memoNormalizeHexColor(v, fallback){
  const s = String(v || '').trim();
  if(/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if(/^#[0-9a-fA-F]{3}$/.test(s)){
    const r = s[1], g = s[2], b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function _memoPickColor(initialHex, onChange){
  if(typeof document === 'undefined' || typeof onChange !== 'function') return false;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = _memoNormalizeHexColor(initialHex, '#ffffff');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '-9999px';
  input.style.opacity = '0';
  input.setAttribute('aria-hidden', 'true');
  document.body.appendChild(input);

  let done = false;
  const cleanup = ()=>{
    if(done) return;
    done = true;
    try{ input.removeEventListener('input', onInput); }catch(_e){}
    try{ input.removeEventListener('change', onCommit); }catch(_e){}
    try{ input.removeEventListener('blur', onBlur); }catch(_e){}
    if(input.parentNode) input.parentNode.removeChild(input);
  };
  const onInput = ()=>{
    onChange(_memoNormalizeHexColor(input.value, input.value));
  };
  const onCommit = ()=>{
    onChange(_memoNormalizeHexColor(input.value, input.value));
    cleanup();
  };
  const onBlur = ()=>{
    setTimeout(cleanup, 0);
  };

  input.addEventListener('input', onInput);
  input.addEventListener('change', onCommit);
  input.addEventListener('blur', onBlur);
  input.click();
  return true;
}

class NoteNode extends LiteGraph.LGraphNode{
  constructor(title = 'Memo'){
    super();
    this.title = title;
    this.size = [280, 180];
    this.resizable = true;
    this.color = '#64748b';
    this.bgcolor = '#f8fafc';
    this.boxcolor = '#94a3b8';
    this.properties = {
      text: 'Write memo here...',
      fontSize: 13,
      backgroundColor: '#f8fafc',
      textColor: '#0f172a'
    };
    this._applyStyleFromProperties();
    if(typeof LiteGraph !== 'undefined' && typeof LiteGraph.NEVER !== 'undefined'){
      this.mode = LiteGraph.NEVER;
    }
  }

  _applyStyleFromProperties(){
    const p = this.properties || {};
    p.fontSize = _memoClampFontSize(p.fontSize, 13);
    p.backgroundColor = _memoNormalizeHexColor(p.backgroundColor, '#f8fafc');
    p.textColor = _memoNormalizeHexColor(p.textColor, '#0f172a');
    this.bgcolor = p.backgroundColor;
  }

  _openMemoEditor(){
    if(typeof window.openPropertyEditor === 'function'){
      window.openPropertyEditor(this, 'text');
      return;
    }
    const current = String(this.properties?.text || '');
    const next = window.prompt('Memo text', current);
    if(next === null) return;
    this.properties.text = String(next);
    this.setDirtyCanvas(true, true);
  }

  _editFontSize(){
    const p = this.properties || {};
    const fontInput = window.prompt('Font size (px)', String(p.fontSize ?? 13));
    if(fontInput === null) return;
    p.fontSize = _memoClampFontSize(fontInput, p.fontSize ?? 13);
    this._applyStyleFromProperties();
    this.setDirtyCanvas(true, true);
  }

  _pickBackgroundColor(){
    const p = this.properties || {};
    _memoPickColor(p.backgroundColor || '#f8fafc', (v)=>{
      p.backgroundColor = _memoNormalizeHexColor(v, p.backgroundColor || '#f8fafc');
      this._applyStyleFromProperties();
      this.setDirtyCanvas(true, true);
    });
  }

  _pickTextColor(){
    const p = this.properties || {};
    _memoPickColor(p.textColor || '#0f172a', (v)=>{
      p.textColor = _memoNormalizeHexColor(v, p.textColor || '#0f172a');
      this._applyStyleFromProperties();
      this.setDirtyCanvas(true, true);
    });
  }

  _resetStyle(){
    const p = this.properties || {};
    p.fontSize = 13;
    p.backgroundColor = '#f8fafc';
    p.textColor = '#0f172a';
    this._applyStyleFromProperties();
    this.setDirtyCanvas(true, true);
  }

  onConfigure(){
    this._applyStyleFromProperties();
  }

  onPropertyChanged(name){
    if(name === 'text' || name === 'fontSize' || name === 'backgroundColor' || name === 'textColor'){
      this._applyStyleFromProperties();
      this.setDirtyCanvas(true, true);
    }
  }

  onDblClick(){
    this._openMemoEditor();
    return true;
  }

  getExtraMenuOptions(){
    return [
      {
        content: 'Edit Memo...',
        callback: ()=> this._openMemoEditor()
      },
      {
        content: 'Clear Memo',
        callback: ()=>{
          this.properties.text = '';
          this.setDirtyCanvas(true, true);
        }
      },
      {
        content: 'Font Size...',
        callback: ()=> this._editFontSize()
      },
      {
        content: 'Background Color...',
        callback: ()=> this._pickBackgroundColor()
      },
      {
        content: 'Text Color...',
        callback: ()=> this._pickTextColor()
      },
      {
        content: 'Reset Style',
        callback: ()=> this._resetStyle()
      }
    ];
  }

  onDrawForeground(ctx){
    const p = this.properties || {};
    const text = String(p.text || '');
    const padX = 10;
    const top = 30;
    const bottom = 8;
    const width = Math.max(20, this.size[0] - padX * 2);
    const fontSize = _memoClampFontSize(p.fontSize, 13);
    const lineHeight = Math.max(fontSize + 4, Math.round(fontSize * 1.35));
    const maxLines = Math.max(1, Math.floor((this.size[1] - top - bottom) / lineHeight));

    ctx.save();
    try{
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = _memoNormalizeHexColor(p.textColor, '#0f172a');
      ctx.textBaseline = 'top';

      const lines = _wrapMemoLines(ctx, text, width);
      const count = Math.min(lines.length, maxLines);
      for(let i = 0; i < count; i++){
        ctx.fillText(lines[i], padX, top + i * lineHeight, width);
      }
      if(lines.length > maxLines){
        ctx.fillText('...', padX, top + (maxLines - 1) * lineHeight, width);
      }else if(!lines.length){
        ctx.fillStyle = '#64748b';
        ctx.fillText('Double-click to edit memo', padX, top, width);
      }
    }finally{
      ctx.restore();
    }
    const lines = [
      `Type: Memo`,
      `Chars: ${text.length}`
    ];
    drawStateBelow(ctx, this, lines, 8, 6);
  }
}

NoteNode.title = 'Memo';
window.NoteNode = NoteNode;
