(function(root){
  'use strict';
  const App=root.App,API=App.FlowProgram,legacyCreate=App.createFlowView,sessions=new WeakMap();
  const copy=API.clone;
  const Conditions=App.FlowConditions;
  const label=kind=>({join:'全経路の完了を待つ',merge:'到着ごとに進む'})[kind] || API.definitions[kind]?.label || kind;
  const settingNames={start:'サイクルを開始',input:'ワークを受け取る',process:'処理にかかる時間',output:'ワークを送り出す',recovery:'次の受付までの復帰時間',end:'サイクルを終了',test:'動作する条件',and:'すべて満たす（AND）',or:'どれかを満たす（OR）',not:'条件を反転する（NOT）'};
  function create(node){
    const ownerGraph=node.graph,nodeId=node.id;
    let records=sessions.get(ownerGraph);if(!records){records=new Map();sessions.set(ownerGraph,records);}
    const signature=()=>JSON.stringify(ownerGraph.getNodeById(nodeId)?.properties.flowProgram || null);
    let saved=records.get(nodeId);
    if(!saved || !saved.dirty && saved.baseline!==signature()){
      saved={program:copy(node.properties.flowProgram?.nodes ? node.properties.flowProgram : API.template(node)),baseline:signature(),dirty:false,selected:null,scale:0.8,offset:[20,50]};records.set(nodeId,saved);
    }
    let program=copy(saved.program),detailed=!!saved.detailed,projectedIds=new Set(),hiddenIds=new Set(),renderedLinks=new Set();
    const linkKey=l=>`${l.from}:${l.output}:${l.to}:${l.input}`;
    const compactPositions=new Map();
    const el=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
    const host=el('section');host.className='flowView flowProgram';
    const toolbar=el('div');toolbar.className='flowViewToolbar';
    const heading=el('strong','FLOW EDITOR'),badge=el('span'),buttons=el('div');buttons.className='flowViewControls';toolbar.append(heading,badge,buttons);
    const notice=el('div');notice.className='flowViewLive';notice.setAttribute('role','status');
    const viewport=el('div');viewport.className='flowViewViewport';
    const canvas=el('canvas');canvas.className='flowViewCanvas';canvas.tabIndex=0;canvas.setAttribute('aria-label','実行 Flow エディタ');viewport.append(canvas);
    const settings=el('details');settings.className='flowViewEditor';settings.open=true;
    const summary=el('summary','ノード設定'),form=el('div');form.className='flowViewEditorBody';settings.append(summary,form);
    const help=el('details');help.className='flowProgramHelp';help.append(el('summary','操作・接続の意味'),el('p','出力口から入力口へドラッグして処理順をつなぎます。条件は「条件分岐」「条件待ち」の設定欄で編集します。「詳細表示」では条件ノードと紫の条件線を直接編集できます。右クリックの Flip IO で端子の左右を反転できます。並列処理には「並列開始」、条件による振り分けには「条件分岐」を使います。複数ワークは同一サイクルで共有し、OUTPUT は先頭の1件を搬出します。END までに全ワークを搬出・消滅させてください。変更は「Flow を適用」で反映されます。実行方式は dt です。'));
    host.append(toolbar,notice,viewport,settings,help);
    let graph=new root.LGraph(),view,building=false,disposed=false,mounted=false,doc=canvas.ownerDocument;
    let undo=[],redo=[],lastSnapshot='',lastBaseline=saved.baseline,conflict=false,pendingChange=false;
    const button=(text,callback)=>{const b=el('button',text);b.type='button';b.addEventListener('click',callback);return b;};
    const running=()=>!!root.isSimRunning?.();
    function data(){
      const next=copy(program),visible=new Map(graph._nodes.map(n=>[n.id,n]));
      const deleted=new Set([...projectedIds].filter(id=>!visible.has(id)));
      next.nodes=next.nodes.filter(n=>!deleted.has(n.id));
      for(const item of visible.values()){
        let spec=next.nodes.find(n=>n.id===item.id);
        if(!spec){spec={id:item.id,kind:item._kind,config:{},pos:Array.from(item.pos)};next.nodes.push(spec);}
        const config=copy(item.properties);
        if(item._implicitFlip && config.flipIO===item._initialFlip)delete config.flipIO;
        if(JSON.stringify(config)!==JSON.stringify(spec.config || {}))spec.config=config;
        if(detailed && (item.pos[0]!==item._initialPos[0] || item.pos[1]!==item._initialPos[1]))spec.pos=Array.from(item.pos);
        if(!detailed)compactPositions.set(item.id,Array.from(item.pos));
      }
      // The canvas owns execution links; hidden condition links remain canonical.
      const consumed=new Set();
      const preserved=next.links.filter(l=>{
        if(deleted.has(l.from) || deleted.has(l.to))return false;
        const key=linkKey(l);if(!renderedLinks.has(key) || consumed.has(key))return true;consumed.add(key);return false;
      });
      const drawn=Object.values(graph.links).map(l=>({from:l.origin_id,output:visible.get(l.origin_id)._outputSlots[l.origin_slot],to:l.target_id,input:visible.get(l.target_id)._inputSlots[l.target_slot]}));
      next.links=[...preserved,...drawn];
      // Preserve serialized link order when merely viewing or editing properties.
      const order=new Map(program.links.map((l,i)=>[linkKey(l),i]));
      next.links.sort((a,b)=>(order.get(linkKey(a)) ?? Infinity)-(order.get(linkKey(b)) ?? Infinity));
      return next;
    }
    function isConditionLink(l){return API.definitions[program.nodes.find(n=>n.id===l.from)?.kind]?.outputs[l.output]==='condition' || API.definitions[program.nodes.find(n=>n.id===l.to)?.kind]?.inputs[l.input]==='condition';}
    function updateBadge(){badge.textContent=conflict ? '外部変更あり' : saved.dirty ? '未適用の変更' : API.enabled(ownerGraph.getNodeById(nodeId)) ? '適用済み · dt' : '新規 Flow · 未適用';}
    function colorLinks(){for(const link of Object.values(graph.links))link.color=link.type==='flow-condition' ? '#9b779f' : '#526d8a';}
    function captureChange(){
      if(building || disposed)return;
      const next=JSON.stringify(data());if(next===lastSnapshot)return;
      undo.push(lastSnapshot);if(undo.length>60)undo.shift();redo=[];lastSnapshot=next;
      program=JSON.parse(next);saved.program=copy(program);saved.dirty=true;updateBadge();rememberProjection();
      const expected=Conditions.attachedPredicates(program);
      if(!detailed && (expected.size!==hiddenIds.size || [...expected].some(id=>!hiddenIds.has(id))))load(program);
    }
    function rememberProjection(){
      projectedIds=new Set(graph._nodes.map(n=>n.id));
      renderedLinks=new Set(Object.values(graph.links).map(l=>linkKey({from:l.origin_id,output:graph.getNodeById(l.origin_id)._outputSlots[l.origin_slot],to:l.target_id,input:graph.getNodeById(l.target_id)._inputSlots[l.target_slot]})));
    }
    function changed(){
      colorLinks();
      if(building || disposed || pendingChange)return;
      pendingChange=true;queueMicrotask(()=>{pendingChange=false;captureChange();});
    }
    function add(spec){
      const item=new root.LGraphNode(!detailed && API.predicates.has(spec.kind) ? `未接続の条件 · ${label(spec.kind)}` : label(spec.kind));item._kind=spec.kind;item.properties=copy(spec.config || {});
      item.id=spec.id;item.pos=spec.pos || [60,90];item.resizable=false;
      item.color='#f3c70b';item.bgcolor='#fff9dc';item.boxcolor='#009af5';item.shape=root.LiteGraph.ROUND_SHAPE;
      item._inputSlots=[];item._outputSlots=[];
      for(const [index,kind] of API.definitions[spec.kind].inputs.entries()){
        if(!detailed && kind==='condition')continue;item._inputSlots.push(index);
        item.addInput(kind==='condition' ? '条件' : index ? `実行 ${index+1}` : '実行',kind==='condition' ? 'flow-condition' : 'flow-step');
      }
      for(const [index,name] of API.definitions[spec.kind].outputs.entries()){
        if(!detailed && name==='condition')continue;item._outputSlots.push(index);
        item.addOutput(name==='condition' ? '条件' : name==='next' ? '次へ' : name==='true' ? 'はい' : name==='false' ? 'いいえ' : name,name==='condition' ? 'flow-condition' : 'flow-step');
      }
      const slotsHeight=Math.max(item.inputs.length,item.outputs.length,1)*root.LiteGraph.NODE_SLOT_HEIGHT;
      item.size=[320,slotsHeight+116];
      item._implicitFlip=item.properties.flipIO===undefined;
      item.properties.flipIO=item.properties.flipIO ?? (detailed && spec.kind==='recovery');
      item._initialFlip=item.properties.flipIO;
      item._initialPos=Array.from(item.pos);
      root.refreshFlipIO(item);
      item.onDrawForeground=ctx=>{
        const spec=ownerGraph.getNodeById(nodeId),run=spec?._flowRun;
        const task=run?.tasks.find(task=>task.id===item.id),active=!!task;
        const timed=['process','recovery'].includes(item._kind),seconds=Number(item.properties.seconds)||0;
        const state=!API.enabled(spec) ? 'DRAFT' : active && running() ? 'ACTIVE' : 'READY';
        const label=active ? '現在の実行位置' : API.predicates.has(item._kind) ? '条件を参照' : ({input:'ワークを搬入',output:'ワークを搬出',process:'ワークを処理',recovery:'次の受付へ復帰',start:'サイクルを開始',end:'サイクルを終了'})[item._kind] || item.title;
        let detail=timed ? `Cycle ${seconds} s` : item.properties.portId || item.properties.test || '接続口をドラッグして配線';
        if(['branch','wait'].includes(item._kind))detail=Conditions.summary(Conditions.programTree(program,Conditions.programRoot(program,item.id)),ownerGraph.__factSimTypeRegistry?.list?.() || []);
        const y=slotsHeight+10,w=item.size[0]-16;
        ctx.save();ctx.beginPath();ctx.roundRect(8,y,w,96,12);ctx.fillStyle='#fdfdfc';ctx.shadowColor='#26303b22';ctx.shadowBlur=4;ctx.shadowOffsetY=2;ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle='#e0e4e9';ctx.lineWidth=1.5;ctx.stroke();
        ctx.beginPath();ctx.roundRect(20,y+9,76,22,11);ctx.fillStyle=active ? '#dff3e6' : '#fbf3d5';ctx.fill();
        ctx.fillStyle=active ? '#249b64' : '#e5b800';ctx.beginPath();ctx.arc(30,y+20,3.5,0,Math.PI*2);ctx.fill();
        ctx.font='600 11px Segoe UI';ctx.fillStyle='#665c28';ctx.fillText(state,39,y+24);
        ctx.font='14px Segoe UI';ctx.fillStyle='#748296';ctx.textAlign='right';ctx.fillText(active && running() ? '実行中' : 'Available',w-4,y+24);ctx.textAlign='left';
        ctx.font='600 18px Segoe UI';ctx.fillStyle='#273343';ctx.fillText(label,20,y+50,w-22);
        ctx.font='14px Segoe UI';ctx.fillStyle=detail.includes('⚠') ? '#a8443b' : '#7d8999';
        let short=detail;while(short.length && ctx.measureText(short+(short===detail ? '' : '…')).width>w-22)short=short.slice(0,-1);
        ctx.fillText(short+(short===detail ? '' : '…'),20,y+71);
        ctx.fillStyle='#e7e9ec';ctx.fillRect(20,y+84,w-24,4);
        if(active && timed && seconds>0){ctx.fillStyle='#e9bd09';ctx.fillRect(20,y+84,(w-24)*Math.max(0,Math.min(1,1-((task.until||root.simNow())-root.simNow())/(seconds*1000))),4);}
        ctx.restore();
      };
      item.onConnectInput=()=>!running();item.onConnectOutput=()=>!running();
      graph.add(item);return item;
    }
    function load(program){
      saved.program=copy(program);setProgram(saved.program);
      building=true;graph.clear();
      hiddenIds=detailed ? new Set() : Conditions.attachedPredicates(program);
      const visible=program.nodes.filter(n=>!hiddenIds.has(n.id));projectedIds=new Set(visible.map(n=>n.id));
      const layout=Conditions.compactLayout(program,visible);
      for(const spec of visible){
        let pos=spec.pos;
        if(!detailed){
          pos=compactPositions.get(spec.id);
          if(!pos)pos=layout.get(spec.id);
        }
        add({...spec,pos});
      }
      for(const link of program.links){
        if(!detailed && isConditionLink(link))continue;
        const from=graph.getNodeById(link.from),to=graph.getNodeById(link.to);
        const output=from?._outputSlots.indexOf(link.output),input=to?._inputSlots.indexOf(link.input);
        if(from && to && output>=0 && input>=0)from.connect(output,to,input);
      }
      colorLinks();
      rememberProjection();building=false;lastSnapshot=JSON.stringify(program);
      if(saved.selected && graph.getNodeById(saved.selected))edit(graph.getNodeById(saved.selected));
      else {saved.selected=null;form.replaceChildren();summary.textContent='ノード設定';}
      updateBadge();view?.setDirty(true,true);
    }
    function setProgram(value){program=copy(value);}
    function changeCondition(ref,action,arg){
      if(running())return;
      if(pendingChange){pendingChange=false;captureChange();}
      const next=Conditions.editProgram(data(),ref,action,arg);
      if(JSON.stringify(next)===lastSnapshot)return;
      undo.push(lastSnapshot);if(undo.length>60)undo.shift();redo=[];
      saved.dirty=true;load(next);updateBadge();
    }
    function history(back){
      if(running())return;
      if(pendingChange){pendingChange=false;captureChange();}
      const from=back ? undo : redo,to=back ? redo : undo;if(!from.length)return;
      to.push(lastSnapshot);load(JSON.parse(from.pop()));saved.dirty=true;updateBadge();
    }
    function newNode(kind,position){
      if(running())return;
      const current=ownerGraph.getNodeById(nodeId),type=current.graph.__factSimTypeRegistry?.list?.()?.[0];
      const config=['process','recovery'].includes(kind) ? {seconds:1} : kind==='input' || kind==='output' ? {portId:(kind==='input' ? current.inputs : current.outputs)?.find(port=>port.channel!=='signal')?.portId || '',typeId:''}
        : kind==='test' ? {test:'always',path:'',operator:'eq',value:0} : kind==='create' ? {typeId:type?.typeId || ''} : kind==='duplicate' ? {count:2} : {};
      const spec={id:Math.max(0,...program.nodes.map(item=>item.id),...graph._nodes.map(item=>item.id))+1,kind,config,pos:position || [canvas.width/2/view.ds.scale-view.ds.offset[0]-120,canvas.height/2/view.ds.scale-view.ds.offset[1]]};
      const item=add(spec);changed();view.selectNode(item);edit(item);
    }
    function edit(item){
      saved.selected=item.id;summary.textContent=`設定 · ${settingNames[item._kind] || label(item._kind)}`;form.replaceChildren();
      const current=ownerGraph.getNodeById(nodeId),c=item.properties;
      const guide={start:'ここから 1 サイクルを開始します。',input:'選んだ入口からワークを 1 件受け取って次へ進みます。',process:'この処理にかかる時間を指定します。',recovery:'次の動作まで待つ時間です。配線した位置で実行します。',test:'条件の内容を選ぶと、必要な項目だけが表示されます。',and:'接続した条件がすべて成立すると成立します。',or:'接続した条件がひとつでも成立すると成立します。',not:'接続した条件の成立・不成立を反転します。',branch:'条件を満たしたら「はい」、満たさなければ「いいえ」の経路へ進みます。',wait:'設定した条件を満たすまで待ちます。'};
      if(guide[item._kind]){const p=el('p',guide[item._kind]);p.className='flowViewSelectionHelp';form.append(p);}
      const note=el('p','変更は「Flow を適用」で反映されます。');note.className='flowViewSelectionHelp';form.append(note);
      if(['branch','wait'].includes(item._kind) || !detailed && API.predicates.has(item._kind)){
        const p=data(),ref=API.predicates.has(item._kind) ? {id:item.id} : Conditions.programRoot(p,item.id);
        Conditions.render(form,{tree:Conditions.programTree(p,ref),types:current.graph.__factSimTypeRegistry?.list?.() || [],change:changeCondition,disabled:running});
      }
      function field(label,key,options,type='text'){
        const wrap=el('label'),caption=el('span',label);wrap.className='flowViewField';
        const control=el(options ? 'select' : 'input');
        if(options){for(const [value,text] of options){const option=el('option',text);option.value=value;control.append(option);}}
        else {control.type=type;if(type==='number'){control.min='0';control.step='any';}}
        if(options && !options.some(([value])=>String(value)===String(c[key] ?? ''))){const unknown=el('option',c[key] ? `未登録：${c[key]}` : '選択してください');unknown.value=String(c[key] ?? '');control.append(unknown);}
        control.value=String(c[key] ?? '');control.setAttribute('aria-label',label);control.disabled=running();if(type==='number')control.required=true;wrap.append(caption,control);form.append(wrap);
        control.addEventListener('change',()=>{
          if(running() || !control.reportValidity())return;
          c[key]=type==='number' ? Number(control.value) : control.value;changed();view.setDirty(true,true);
          if(key==='test')edit(item);
        });return control;
      }
      if(['process','recovery'].includes(item._kind))field('時間（秒）','seconds',null,'number');
      const types=(current.graph.__factSimTypeRegistry?.list?.() || []).map(type=>[type.typeId,type.name]);
      if(['input','output'].includes(item._kind))field(item._kind==='input' ? '受け取る入口' : '送り出す出口','portId',(item._kind==='input' ? current.inputs : current.outputs).filter(port=>port.channel!=='signal').map(port=>{
        const links=item._kind==='input' ? [port.link] : port.links || [];
        const names=links.map(id=>ownerGraph.links[id]).filter(Boolean).map(l=>ownerGraph.getNodeById(item._kind==='input' ? l.origin_id : l.target_id)?.title).filter(Boolean);
        return [port.portId,`${port.name || port.portId}：${names.join('、') || '未接続'}`];
      }));
      if(item._kind==='input')field('対象ワーク','typeId',[['','すべて'],...types]);
      if(item._kind==='create')field('生成するワーク','typeId',types);
      if(item._kind==='duplicate')field('複製後の個数','count',null,'number');
      if(item._kind==='test' && detailed){
        field('条件','test',[['always','条件なし'],['available','ワークがある'],['type','ワークの種類が一致する'],['attribute','ワークの属性を比較する'],['count','ワークが指定個数以上ある'],['ids-match','すべてのワークの ID が一致する'],['empty','ワークがない'],['full','設備の容量に達した']]);
        if(c.test==='type')field('対象ワーク','typeId',types);
        if(c.test==='count')field('個数','value',null,'number');
        if(c.test==='attribute'){
          field('調べる属性','path').placeholder='例：temperature';field('比較','operator',[['eq','等しい（＝）'],['ne','等しくない（≠）'],['gt','より大きい（>）'],['gte','以上（≥）'],['lt','より小さい（<）'],['lte','以下（≤）'],['contains','含む']]);
          const input=field('比較値','value',null,typeof c.value==='number' ? 'number' : 'text');input.removeAttribute('min');
          const convert=button(typeof c.value==='number' ? '文字列に切替' : '数値に切替',()=>{c.value=typeof c.value==='number' ? String(c.value) : Number(c.value) || 0;changed();edit(item);});convert.disabled=running();form.append(convert);
        }
      }
      const descriptions={parallel:'接続した経路を同時に開始します。ワークはサイクル全体で共有します。',join:'接続された全経路が到達するまで待機します。',merge:'いずれかの経路が到達するたびに次へ進みます。',output:'先頭のワークを1件搬出し、全接続先の受渡完了を待って次へ進みます。',match:'保持中の全ワークの ID を照合し、最初の1件へ統合します。',end:'サイクルを終了します。全経路の終了後、次のサイクルを開始します。'};
      if(descriptions[item._kind])form.append(el('p',descriptions[item._kind]));
    }
    const kinds=el('select');kinds.setAttribute('aria-label','追加する Flow ノード');
    function fillKinds(){const previous=kinds.value;kinds.replaceChildren();for(const key of Object.keys(API.definitions)){if(!detailed && API.predicates.has(key))continue;const option=el('option',label(key));option.value=key;kinds.append(option);}if([...kinds.options].some(o=>o.value===previous))kinds.value=previous;}
    fillKinds();
    const detailToggle=button(detailed ? '通常表示' : '詳細表示',()=>{
      if(pendingChange){pendingChange=false;captureChange();}
      const p=data();detailed=!detailed;saved.detailed=detailed;detailToggle.textContent=detailed ? '通常表示' : '詳細表示';detailToggle.setAttribute('aria-pressed',String(detailed));fillKinds();load(p);fit();
    });
    detailToggle.setAttribute('aria-pressed',String(detailed));buttons.append(detailToggle);
    buttons.append(kinds,button('＋ ノード追加',()=>newNode(kinds.value)),button('元に戻す',()=>history(true)),button('やり直す',()=>history(false)));
    function commit(enabled){
      if(running())return;
      if(pendingChange){pendingChange=false;captureChange();}
      if(root.simNow()>0){notice.textContent='Flow を適用する前にシミュレーションを Reset してください。途中のワークを失わずに切り替えるためです。';return;}
      if(signature()!==lastBaseline){conflict=true;notice.textContent='設備設定が変更されています。再読込してから適用してください。';updateBadge();return;}
      const current=ownerGraph.getNodeById(nodeId),program=data();program.enabled=enabled;
      if(enabled){const errors=API.validate(program,current);if(errors.length){notice.textContent=errors.join(' / ');return;}}
      root.flushHistory?.();ownerGraph.beforeChange();
      try{current.properties.flowProgram=copy(program);current.onPropertyChanged('flowProgram');ownerGraph.change();}finally{ownerGraph.afterChange();}
      root.flushHistory?.();lastBaseline=signature();saved.baseline=lastBaseline;saved.dirty=false;conflict=false;updateBadge();
      notice.textContent=enabled ? '配線を適用しました。この設備は Flow を実行します（dt）。' : '従来の動作へ切り替えました。';
    }
    buttons.append(button('Flow を適用',()=>commit(true)),button('従来動作へ切替',()=>commit(false)));
    buttons.append(button('設定を再読込',()=>{const current=ownerGraph.getNodeById(nodeId);load(current.properties.flowProgram?.nodes ? current.properties.flowProgram : API.template(current));lastBaseline=signature();saved.baseline=lastBaseline;saved.dirty=false;conflict=false;undo=[];redo=[];updateBadge();}));
    function fit(){
      if(!graph._nodes.length)return;
      const minX=Math.min(...graph._nodes.map(n=>n.pos[0]))-40,minY=Math.min(...graph._nodes.map(n=>n.pos[1]))-60;
      const maxX=Math.max(...graph._nodes.map(n=>n.pos[0]+n.size[0]))+40,maxY=Math.max(...graph._nodes.map(n=>n.pos[1]+n.size[1]))+40;
      view.ds.scale=Math.min(1,canvas.width/(maxX-minX),canvas.height/(maxY-minY));view.ds.offset.set([-minX,-minY]);view.setDirty(true,true);
    }
    buttons.append(button('全体表示',fit));
    for(const [label,factor] of [['−',0.8],['＋',1.25]])buttons.append(button(label,()=>{view.ds.changeScale(Math.max(0.15,Math.min(2,view.ds.scale*factor)),[canvas.width/2,canvas.height/2]);view.setDirty(true,true);}));
    view=new root.LGraphCanvas(null,graph,{skip_render:true});view.show_info=false;view.allow_searchbox=false;view.background_image=null;
    view.render_canvas_border=false;view.title_text_font='20px Segoe UI';view.inner_text_font='17px Segoe UI';view.allow_reconnect_links=true;
    view.clear_background_color=App.canvas?.clear_background_color || '#f6f8fb';
    for(const key of ['links_render_mode','connections_width','render_connection_arrows','round_radius'])if(App.canvas?.[key]!==undefined)view[key]=App.canvas[key];
    view.default_connection_color_byType={'flow-step':'#70ff73','flow-condition':'#b796e5'};
    view.default_connection_color_byTypeOff=view.default_connection_color_byType;
    view.onDrawBackground=(ctx,area)=>root.drawEditorGrid?.(ctx,area,view);
    view.onSelectionChange=selected=>{const item=Object.values(selected)[0];if(item)edit(item);};
    view.onNodeMoved=changed;view.onNodeDblClicked=edit;
    view.getCanvasMenuOptions=()=>[{content:'ノード追加',has_submenu:true,submenu:{options:Object.keys(API.definitions).filter(kind=>detailed || !API.predicates.has(kind)).map(kind=>({content:label(kind),callback:()=>newNode(kind,Array.from(view.graph_mouse).slice(0,2))}))}}];
    view.getNodeMenuOptions=item=>[{content:'設定を開く',callback:()=>edit(item)},
      {content:item.properties.flipIO ? 'Flip IO · Ports: reset alignment' : 'Flip IO · Ports: flip horizontally',disabled:running(),callback:()=>{
        if(running())return;
        item.properties.flipIO=!item.properties.flipIO;root.refreshFlipIO(item);changed();
      }},
      {content:'入力リンクを解除',disabled:running(),callback:()=>{if(!running()){item.inputs.forEach((_,index)=>item.disconnectInput(index));changed();}}},{content:'削除',disabled:running(),callback:()=>{if(!running()){graph.remove(item);changed();}}}];
    view.showSearchBox=()=>{};view.processDrop=()=>false;
    const nativeKey=view.processKey;
    const nativeMouseDown=view.processMouseDown;
    view.processMouseDown=function(event){view.read_only=running();return nativeMouseDown.call(view,event);};
    view.processKey=function(event){
      if(event.target!==canvas)return;
      if((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())){if(event.type==='keydown')history(event.key.toLowerCase()==='z' && !event.shiftKey);event.preventDefault();event.stopPropagation();return;}
      if((event.ctrlKey || event.metaKey) && ['c','v'].includes(event.key.toLowerCase())){event.preventDefault();return;}
      if(running()){event.preventDefault();return;}
      nativeKey.call(view,event);changed();
    };
    graph.onConnectionChange=changed;graph.onAfterChange=changed;
    view.setCanvas(canvas);load(saved.program);view.ds.scale=saved.scale;view.ds.offset.set(saved.offset);view.startRendering();
    let firstResize=true;
    const resize=()=>{if(disposed || !viewport.clientWidth)return;const width=viewport.clientWidth,height=viewport.clientHeight;if(!firstResize)view.ds.offset[0]+=(width-canvas.width)/2/view.ds.scale;view.resize(width,height);firstResize=false;};
    const observer=new ResizeObserver(resize);observer.observe(viewport);
    function unbind(){
      for(const [suffix,callback,capture] of [['down',view._mousedown_callback,true],['move',view._mousemove_callback,false],['up',view._mouseup_callback,true]]){
        root.LiteGraph.pointerListenerRemove(canvas,suffix,callback,capture);root.LiteGraph.pointerListenerRemove(doc,suffix,callback,capture);root.LiteGraph.pointerListenerRemove(doc,suffix,callback,!capture);
      }
      canvas.removeEventListener('keydown',view._key_callback,true);doc.removeEventListener('keyup',view._key_callback,true);view.setCanvas(null);view.bgctx=null;
    }
    function dispose(){if(disposed)return;disposed=true;saved.scale=view.ds.scale;saved.offset=Array.from(view.ds.offset);clearInterval(timer);observer.disconnect();view.stopRendering();unbind();view.setGraph(null);}
    let lastRunning=null;
    const timer=setInterval(()=>{
      if(!host.isConnected){if(mounted)dispose();return;}mounted=true;
      if(canvas.ownerDocument!==doc){unbind();doc=canvas.ownerDocument;view.setCanvas(canvas);resize();}
      const active=running();view.read_only=active;view.pause_rendering=!viewport.clientWidth;
      if(lastRunning!==active){lastRunning=active;buttons.querySelectorAll('button,select').forEach(control=>control.disabled=active);if(saved.selected && graph.getNodeById(saved.selected))edit(graph.getNodeById(saved.selected));}
      if(signature()!==lastBaseline){
        if(saved.dirty){conflict=true;updateBadge();}
        else {const p=ownerGraph.getNodeById(nodeId)?.properties.flowProgram;load(p?.nodes ? p : API.template(ownerGraph.getNodeById(nodeId)));lastBaseline=signature();saved.baseline=lastBaseline;}
      }
      const run=ownerGraph.getNodeById(nodeId)?._flowRun;
      if(active)notice.textContent=run?.error || `dt · ${ownerGraph.getNodeById(nodeId)._state} · 保持ワーク ${run?.works.length || 0} · サイクル ${run?.cycle || 0}`;
      saved.scale=view.ds.scale;saved.offset=Array.from(view.ds.offset);view.setDirty(true,true);
    },150);
    notice.textContent=node.properties.flowProgram?.enabled ? '出力口からドラッグして配線を変更できます。' : '新規の実行 Flow です。適用すると、この設備の従来動作を置き換えます。テンプレートは専用の搬送・同期動作の自動変換ではありません。';
    host.flowView={dispose,refresh:()=>{resize();view.draw(true,true);},get view(){return view;},get program(){return data();}};
    requestAnimationFrame(()=>{if(!disposed){resize();if(!saved.initialized){view.ds.scale=1;view.ds.offset.set([-30,60]);saved.initialized=true;}}});
    return host;
  }
  App.createFlowView=function(node){
    if(!API.enabled(node))return createLegacy(node);
    const editor=create(node),toggle=document.createElement('button');toggle.type='button';toggle.textContent='従来動作の表示';toggle.className='flowProgramOpen';
    toggle.addEventListener('click',()=>{editor.flowView.dispose();editor.replaceWith(createLegacy(node.graph.getNodeById(node.id)));});editor.prepend(toggle);return editor;
  };
  function createLegacy(node){
    const host=legacyCreate(node),button=document.createElement('button');button.type='button';button.className='flowProgramOpen';button.textContent='配線編集 · 実行 Flow を作成';
    button.addEventListener('click',()=>{const current=node.graph.getNodeById(node.id);const editor=create(current);host.flowView.dispose();host.replaceWith(editor);});
    host.prepend(button);return host;
  };
  App.createFlowProgramEditor=create;
})(window);
