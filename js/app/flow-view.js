(function(root){
  'use strict';
  const App=root.App=root.App || {};
  const sessions=new WeakMap();
  const colors={ sequence:'#526171', work:'#27877c', condition:'#9b779f' };
  const clone=value=>JSON.parse(JSON.stringify(value));
  const Conditions=App.FlowConditions;
  const conditionLabels={all:'すべて満たす（AND）',any:'どれかを満たす（OR）',not:'満たさない（NOT）',always:'条件なし',available:'ワークがある',
    'node-idle':'設備が待機中','down-complete':'復帰が完了','process-complete':'処理が完了','downstream-ready':'送り先が受取可能',
    'space-available':'空き容量がある','not-full':'満杯でない',empty:'ワークがない',full:'満杯になった',
    'count-reached':'指定個数に達した','time-elapsed':'指定時間が経過した','attribute-condition':'ワークの属性を比較する',
    'shuttle-group-idle':'グループの処理が完了',custom:'独自の条件式','custom-condition':'独自の条件式'};
  function workName(graph,target){
    return target.mode==='type' ? graph.__factSimTypeRegistry?.get?.(target.typeId)?.name || target.typeId :
      ({any:'すべてのワーク',otherwise:'ほかの条件に該当しないワーク',sequence:'指定した順番のワーク'})[target.mode] || target.mode;
  }
  function create(node){
    const sourceGraph=node.graph || App.graph, nodeId=node.id;
    let saved=sessions.get(sourceGraph);
    if(!saved){ saved=new Map(); sessions.set(sourceGraph,saved); }
    let session=saved.get(nodeId);
    if(!session){ session={flips:new Map(),positions:new Map(),selected:'',scale:0.8,offset:[30,15],initialized:false,open:true}; saved.set(nodeId,session); }
    session.compactPositions=session.compactPositions || new Map();
    const positions=()=>session.detailed ? session.positions : session.compactPositions;
    const el=(tag,className,text)=>{const item=document.createElement(tag); if(className)item.className=className; if(text!==undefined)item.textContent=text; return item;};
    const host=el('section','flowView');
    host.setAttribute('aria-label','Flow グラフ');
    const toolbar=el('div','flowViewToolbar');
    const brand=el('div','flowViewBrand');
    const icon=el('span','flowViewIcon'); icon.innerHTML=App.workspaceIconSvg?.('flow') || '';
    brand.append(icon,el('strong','','FLOW'));
    const runtimeLabel=el('span','flowViewRuntime'); brand.append(runtimeLabel);
    const controls=el('div','flowViewControls');
    const btn=(label,action,title)=>{
      const b=el('button','',label); b.type='button'; b.addEventListener('click',action); if(title){b.title=title;b.setAttribute('aria-label',title);} return b;
    };
    const help=el('details','flowViewHelp');
    const helpSummary=el('summary','','?'); helpSummary.setAttribute('aria-label','Flow の使い方');
    const helpText=el('div','','出力口から同じ種類の入力口へドラッグして配線します。Recovery は右入力・左出力です。右クリックの Flip IO で端子の左右を反転できます。配線の下書きは設備ごとに保持します。内部コントローラの配線変更はまだ実行へ適用されません。時間・条件・対象ワークの設定変更は従来どおり反映します。');
    help.append(helpSummary,helpText);
    toolbar.append(brand,controls,help);
    const live=el('div','flowViewLive'); live.setAttribute('role','status');
    const navigation=el('div','flowViewNavigation');
    const picker=el('select','flowViewPicker'); picker.setAttribute('aria-label','Flow 要素を選択');
    const legend=el('div','flowViewLegend');
    for(const [type,label] of [['sequence','実行順序'],['work','ワーク'],['condition','条件参照']]){
      const item=el('span',`is-${type}`,label); legend.append(item);
    }
    navigation.append(picker,legend);
    const viewport=el('div','flowViewViewport');
    const canvas=el('canvas','flowViewCanvas'); canvas.tabIndex=0;
    canvas.setAttribute('aria-label','Flow。矢印キーでパン、プラス・マイナスでズーム。要素の選択には上の一覧も使用できます。');
    const tooltip=el('div','flowViewTooltip'); tooltip.hidden=true; tooltip.setAttribute('role','tooltip');
    viewport.append(canvas,tooltip);
    const editor=el('details','flowViewEditor'); editor.open=session.open;
    const summary=el('summary','','設定');
    const editorBody=el('div','flowViewEditorBody');
    editor.append(summary,editorBody);
    editor.addEventListener('toggle',()=>{session.open=editor.open;});
    const notice=el('div','flowViewNotice'); notice.setAttribute('role','status');
    host.append(toolbar,live,navigation,viewport,editor,notice);
    let graph=new root.LGraph(), view, model, display=new Map(), disposed=false, mounted=false,building=false;
    const portTypes=['sequence','work','condition'],portLabels=['実行','ワーク','条件'];
    function wireChanged(){
      if(building || disposed)return;
      const drawn=Object.values(graph.links).map(link=>({from:graph.getNodeById(link.origin_id)._flow.key,to:graph.getNodeById(link.target_id)._flow.key,type:link.type,output:link.origin_slot,input:link.target_slot}));
      const hidden=(session.wires || model.edges).filter(edge=>!display.has(edge.from) || !display.has(edge.to) || !session.detailed && edge.type==='condition');
      session.wires=clone([...hidden,...drawn]);model.edges=clone(session.wires);
      notice.textContent='配線の下書き · 実行には未反映。時間・条件の設定編集は反映されます。';
      paint();
    }
    let owner=canvas.ownerDocument, timer, lastNode=node, lastRunning=null, editorKey='';
    function remember(){
      if(!view)return;
      session.scale=view.ds.scale; session.offset=Array.from(view.ds.offset);
      for(const [key,item] of display){
        if(Math.abs(item.pos[0]-item._flow.x)>0.1 || Math.abs(item.pos[1]-item._flow.y)>0.1)positions().set(key,[item.pos[0],item.pos[1]]);
        else positions().delete(key);
      }
    }
    function zoom(factor){
      if(!view)return;
      const old=view.ds.scale, next=Math.max(0.16,Math.min(2,old*factor));
      view.ds.offset[0]+=canvas.width/2/next-canvas.width/2/old;
      view.ds.offset[1]+=canvas.height/2/next-canvas.height/2/old;
      view.ds.scale=next; remember(); paint();
    }
    function fit(mode){
      if(!view || !display.size)return;
      const items=Array.from(display.values()).filter(item=>mode !== 'cycle' || !item._flow.ref);
      const left=Math.min(...items.map(item=>item.pos[0]))-30, top=Math.min(...items.map(item=>item.pos[1]))-40;
      const right=Math.max(...items.map(item=>item.pos[0]+item.size[0]))+30, bottom=Math.max(...items.map(item=>item.pos[1]+item.size[1]))+40;
      view.ds.scale=Math.max(0.16,Math.min(1,canvas.width/(right-left),canvas.height/(bottom-top)));
      view.ds.offset[0]=-left+(canvas.width/view.ds.scale-(right-left))/2;
      view.ds.offset[1]=-top+(canvas.height/view.ds.scale-(bottom-top))/2;
      remember(); paint();
    }
    controls.append(btn('−',()=>zoom(1/1.2),'縮小'),btn('+',()=>zoom(1.2),'拡大'),
      btn('サイクル',()=>fit('cycle')),btn('全体表示',()=>fit('all')),
      btn('配置を戻す',()=>{positions().clear();session.flips.clear();rebuild(true);fit('cycle');}),
      btn('配線を実装どおりに戻す',()=>{session.wires=null;notice.textContent='';rebuild();}));
    const detailToggle=btn(session.detailed ? '通常表示' : '詳細表示',()=>{
      remember();session.detailed=!session.detailed;detailToggle.textContent=session.detailed ? '通常表示' : '詳細表示';detailToggle.setAttribute('aria-pressed',String(!!session.detailed));rebuild(true);fit('all');
    });
    detailToggle.setAttribute('aria-pressed',String(!!session.detailed));controls.prepend(detailToggle);
    function choose(key,focusNode=false){
      const spec=model.nodes.find(item=>item.key===key);
      if(!spec)return;
      session.selected=key; picker.value=key;
      if(focusNode){
        const item=display.get(key);
        if(item){view.ds.scale=Math.max(0.8,view.ds.scale);
        view.ds.offset[0]=canvas.width/2/view.ds.scale-item.pos[0]-item.size[0]/2;
        view.ds.offset[1]=canvas.height/2/view.ds.scale-item.pos[1]-item.size[1]/2;}
      }
      renderEditor(spec); remember(); paint();
    }
    picker.addEventListener('change',()=>choose(picker.value,true));
    function field(label,control){
      const wrap=el('label','flowViewField');control.setAttribute('aria-label',label);wrap.append(el('span','',label),control); editorBody.append(wrap); return control;
    }
    function select(options,value){
      const input=el('select');
      for(const [id,label] of options){const opt=el('option','',label);opt.value=id;input.append(opt);}
      if(!options.some(([id])=>id===value)){const opt=el('option','',value);opt.value=value;input.append(opt);}
      input.value=value; return input;
    }
    function textInput(value,type='text'){
      const input=el('input'); input.type=type; input.value=String(value ?? '');
      if(type==='number'){input.min='0';input.step='any';} return input;
    }
    function apply(spec,value){
      try{
        App.FlowViewModel.commit(sourceGraph,nodeId,spec.ref,value);
        notice.textContent='保存しました'; notice.classList.remove('is-error');
        rebuild();
      }catch(error){notice.textContent=error.message;notice.classList.add('is-error');}
    }
    function renderEditor(spec){
      editorBody.replaceChildren();
      const label=spec.kind==='timing' ? (spec.ref.direction==='input' ? '処理にかかる時間' : '次の受付までの復帰時間') :
        spec.kind==='rule' ? (spec.ref.direction==='input' ? '受け取るワーク' : '送り出すワーク') :
        spec.kind==='condition' ? '動作する条件' : ({Process:'処理にかかる時間',Recovery:'次の受付までの復帰時間'})[spec.title] || spec.title;
      summary.textContent=`設定 · ${label}`;
      editorKey=spec.key;
      const current=sourceGraph.getNodeById(nodeId);
      const rule=spec.ref?.ruleId && current.properties[spec.ref.direction==='input' ? 'inputRules' : 'outputRules']?.find(r=>String(r.ruleId)===spec.ref.ruleId);
      const groupIndex=Array.from(new Set(model.rules.map(r=>r.group))).indexOf(spec.group)+1;
      editorBody.append(el('p','flowViewSelectionHelp',`${current.title}${groupIndex ? ` · 設定 ${groupIndex}` : ''}${spec.ref || spec.timing ? ' · 変更するとすぐに反映されます。' : ''}`));
      if(spec.used===false || spec.detail?.includes('未使用'))editorBody.append(el('p','flowViewSelectionHelp','保存された設定です。この設備の現在の動作には使用されません。'));
      if(rule){
        const direction=spec.ref.direction,ids=direction==='input' ? [rule.fromPortId] : rule.toPortIds || [rule.toPortId];
        const ports=(current[direction==='input' ? 'inputs' : 'outputs'] || []).filter(p=>ids.includes(p.portId));
        const names=ports.map(p=>{
          const links=direction==='input' ? [p.link] : p.links || [];
          const peers=links.map(id=>sourceGraph.links[id]).filter(Boolean).map(l=>sourceGraph.getNodeById(direction==='input' ? l.origin_id : l.target_id)?.title).filter(Boolean);
          return `${p.name || p.portId}：${peers.join('、') || '未接続'}`;
        });
        if(names.length)editorBody.append(el('p','flowViewSelectionHelp',`${direction==='input' ? '受取元' : '送り先'} · ${names.join(' / ')}`));
      }
      if(spec.help){const help=el('details','flowSettingHelp');help.append(el('summary','','この設定の説明'),el('p','',spec.help));editorBody.append(help);}
      if(!spec.ref){
        if(spec.timing){
          const seen=new Set();
          model.nodes.filter(item=>item.kind==='timing' && item.ref.direction===spec.timing).forEach(item=>{
            if(seen.has(item.group))return;seen.add(item.group);
            const value=App.FlowViewModel.resolve(current,item.ref);
            const groupNumber=Array.from(new Set(model.rules.map(r=>r.group))).indexOf(item.group)+1;
            const input=field(`設定 ${groupNumber}（秒）`,textInput(value?.durationSec,'number'));
            input.disabled=!!root.isSimRunning?.();
            input.addEventListener('change',()=>{if(input.reportValidity() && input.value!=='')apply(item,Number(input.value));});
          });
        }else editorBody.append(el('span','flowViewReadOnly','実行方式で固定'));
        return;
      }
      let value;
      try{value=App.FlowViewModel.resolve(current,spec.ref);}catch(error){editorBody.append(el('p','',error.message));return;}
      if(spec.kind==='timing' || spec.kind==='property'){
        const input=field('時間（秒）',textInput(spec.kind==='timing' ? value?.durationSec : value[spec.ref.property],'number'));
        input.addEventListener('change',()=>{if(input.reportValidity() && input.value!=='')apply(spec,Number(input.value));});
      }else if(spec.kind==='rule'){
        const targets=clone(value.targets?.length ? value.targets : [value.target || {mode:'otherwise'}]);
        const list=el('div','flowViewTargets'); editorBody.append(list);
        targets.forEach((target,index)=>{
          const row=el('div','flowViewTargetRow');
          const mode=select([['any','すべてのワーク'],['type','種類を指定する'],['otherwise','ほかの条件に該当しないワーク'],['sequence','指定した順番で生成する']],target.mode || 'any');
          // Changing a target to/from Sequence changes the runtime itself; keep it fixed.
          for(const opt of mode.options) if((target.mode==='sequence') !== (opt.value==='sequence'))opt.disabled=true;
          mode.setAttribute('aria-label',`対象 ${index+1}`);
          mode.addEventListener('change',()=>{targets[index]={mode:mode.value,...(mode.value==='type' ? {typeId:target.typeId || sourceGraph.__factSimTypeRegistry?.list?.()?.[0]?.typeId || ''} : {})};apply(spec,targets);});
          if(target.mode!=='sequence'){const modeLabel=el('label','flowViewField');modeLabel.append(el('span','',`対象 ${index+1}`),mode);row.append(modeLabel);}
          if(target.mode==='type'){
            const types=sourceGraph.__factSimTypeRegistry?.list?.() || [];
            const control=types.length ? select(types.map(type=>[type.typeId,type.name || type.typeId]),target.typeId) : textInput(target.typeId);
            control.setAttribute('aria-label',`対象 ${index+1} のワークの種類`);
            control.addEventListener('change',()=>{targets[index].typeId=control.value;apply(spec,targets);});
            const typeLabel=el('label','flowViewField');typeLabel.append(el('span','','ワークの種類'),control);row.append(typeLabel);
          }
          if(target.mode==='sequence'){
            const entries=target.entries || [],sequence=el('div','flowSequenceRows');
            sequence.append(el('p','flowViewSelectionHelp','上から順番に生成します。ワークの種類と個数を設定してください。'));
            const types=sourceGraph.__factSimTypeRegistry?.list?.() || [];
            entries.forEach((entry,i)=>{
              const line=el('div','flowSequenceRow'),type=select(types.map(t=>[t.typeId,t.name || t.typeId]),entry.typeId),quantity=textInput(entry.quantity,'number');
              type.setAttribute('aria-label',`${i+1} 番目のワーク`);quantity.setAttribute('aria-label',`${i+1} 番目の個数`);quantity.min='1';quantity.required=true;
              const typeWrap=el('label','flowViewField'),quantityWrap=el('label','flowViewField');
              typeWrap.append(el('span','',`${i+1}. ワークの種類`),type);quantityWrap.append(el('span','','個数'),quantity);
              type.addEventListener('change',()=>{entries[i]={...entry,typeId:type.value};targets[index].entries=entries;apply(spec,targets);});
              quantity.addEventListener('change',()=>{if(quantity.reportValidity()){entries[i]={...entry,quantity:Number(quantity.value)};targets[index].entries=entries;apply(spec,targets);}});
              const move=delta=>{[entries[i],entries[i+delta]]=[entries[i+delta],entries[i]];targets[index].entries=entries;apply(spec,targets);};
              line.append(typeWrap,quantityWrap);
              if(i>0)line.append(btn('上へ',()=>move(-1)));
              if(i<entries.length-1)line.append(btn('下へ',()=>move(1)));
              line.append(btn('削除',()=>{entries.splice(i,1);targets[index].entries=entries;apply(spec,targets);}));sequence.append(line);
            });
            if(types.length)sequence.append(btn('生成するワークを追加',()=>{targets[index].entries=[...entries,{typeId:types[0].typeId,quantity:1}];apply(spec,targets);}));
            else sequence.append(el('p','flowViewSelectionHelp','追加するワークの種類を Entity Types で登録してください。'));
            row.append(sequence);
          }
          if(target.mode!=='sequence' && targets.length>1)row.append(btn('対象を外す',()=>{targets.splice(index,1);apply(spec,targets);}));
          list.append(row);
        });
        if(!targets.some(target=>target.mode==='sequence'))list.append(btn('対象ワークを追加',()=>{
          const type=sourceGraph.__factSimTypeRegistry?.list?.()?.find(type=>!targets.some(target=>target.typeId===type.typeId));
          targets.push(type ? {mode:'type',typeId:type.typeId} : {mode:'any'});apply(spec,targets);
        }));
        const conditionField=spec.ref.direction==='input' ? 'acceptWhen' : 'releaseWhen';
        const conditionValue=value[conditionField],conditionRef={...spec.ref,path:[conditionField],fingerprint:JSON.stringify(conditionValue)};
        Conditions.render(editorBody,{tree:Conditions.legacyTree(conditionValue),types:sourceGraph.__factSimTypeRegistry?.list?.() || [],mode:'legacy',disabled:()=>!!root.isSimRunning?.(),change:(path,action,arg)=>{
          App.FlowViewModel.resolve(sourceGraph.getNodeById(nodeId),conditionRef);
          apply({ref:conditionRef},Conditions.editLegacy(conditionValue,path,action,arg));
        }});
      }else if(spec.kind==='condition'){
        const owningRule=current.properties[spec.ref.direction==='input' ? 'inputRules' : 'outputRules']?.find(rule=>String(rule.ruleId)===spec.ref.ruleId);
        const targetNames=(owningRule?.targets || [owningRule?.target]).filter(Boolean).map(target=>workName(sourceGraph,target));
        editorBody.append(el('span','flowViewGroup',`対象：${targetNames.join(' / ') || '未設定'}`));
        const condition=typeof value==='object' && value ? clone(value) : {kind:value || 'always'};
        const kind=condition.kind || 'always';
        const logical=['all','any','not'].includes(kind);
        if(logical){
          const children=model.nodes.filter(s=>s.kind==='condition' && s.ref?.ruleId===spec.ref.ruleId && s.ref.direction===spec.ref.direction &&
            s.ref.path.length===spec.ref.path.length+(kind==='not' ? 1 : 2) && spec.ref.path.every((part,i)=>s.ref.path[i]===part));
          const list=el('div','flowSettingChildren');list.append(el('p','flowViewSelectionHelp','組み合わせる条件（クリックで編集）'));
          for(const child of children){
            const c=App.FlowViewModel.resolve(current,child.ref),childKind=typeof c==='string' ? c : c?.kind;
            const title=childKind==='count-reached' ? `ワークが ${c.count} 個以上` : childKind==='time-elapsed' ? `${c.seconds} 秒経過` : childKind==='attribute-condition' ? `属性 ${c.path} を比較` : conditionLabels[childKind] || child.title;
            list.append(btn(title,()=>choose(child.key,true)));
          }
          editorBody.append(list);
        }
        const options=Object.entries(App.FlowViewModel.kinds).filter(([key])=>logical ? ['all','any','not'].includes(key) : !['all','any','not'].includes(key)).map(([key,label])=>[key,conditionLabels[key] || label]);
        const control=field('条件',select(options,kind));
        control.addEventListener('change',()=>{
          if(logical){
            const children=condition.conditions || condition.children || [condition.condition || condition.child || {kind:'always'}];
            if(control.value==='not' && children.length!==1){notice.textContent='NOT は子条件が1つのときに選択できます。';control.value=kind;return;}
            apply(spec,control.value==='not' ? {kind:'not',condition:children[0]} : {kind:control.value,conditions:children});
          }else apply(spec,{...condition,kind:control.value});
        });
        if(kind==='attribute-condition'){
          const path=field('調べる属性',textInput(condition.path));path.placeholder='例：temperature';
          const operator=field('比較',select([['eq','等しい（＝）'],['ne','等しくない（≠）'],['gt','より大きい（>）'],['gte','以上（≥）'],['lt','より小さい（<）'],['lte','以下（≤）'],['contains','含む']],condition.operator || 'eq'));
          const currentValue=condition.value ?? '';
          const valueKind=typeof currentValue==='object' ? 'json' : typeof currentValue;
          const valueType=field('値の種類',select([['string','文字列'],['number','数値'],['boolean','真偽値'],['json','JSON']],valueKind));
          valueType.addEventListener('change',()=>{
            const next=valueType.value==='number' ? Number(currentValue) || 0 : valueType.value==='boolean' ? currentValue===true : valueType.value==='string' ? String(currentValue) : typeof currentValue==='object' ? currentValue : {};
            apply(spec,{...condition,value:next});
          });
          const comparison=field('比較値',valueKind==='boolean' ? select([['true','true'],['false','false']],String(currentValue)) : textInput(valueKind==='json' ? JSON.stringify(currentValue) : currentValue,valueKind==='number' ? 'number' : 'text'));
          comparison.removeAttribute('min');
          path.addEventListener('change',()=>apply(spec,{...condition,path:path.value}));
          operator.addEventListener('change',()=>apply(spec,{...condition,operator:operator.value}));
          comparison.addEventListener('change',()=>{
            try{
              const value=valueKind==='json' ? JSON.parse(comparison.value) : valueKind==='number' ? Number(comparison.value) : valueKind==='boolean' ? comparison.value==='true' : comparison.value;
              if(valueKind==='number' && (comparison.value==='' || !Number.isFinite(value)))throw new Error('数値を入力してください。');
              apply(spec,{...condition,value});
            }catch(error){notice.textContent=error.message;}
          });
        }
        for(const [conditionKind,property,label,type] of [
          ['count-reached','count','個数','number'],['time-elapsed','seconds','経過時間（秒）','number'],
          ['process-complete','stageId','対象の処理ステージ ID','text'],['shuttle-group-idle','groupId','対象のグループ ID','text']
        ]) if(kind===conditionKind){
          const input=field(label,textInput(condition[property],type));
          if(property==='count')input.step='1';
          input.addEventListener('change',()=>{if(input.reportValidity())apply(spec,{...condition,[property]:type==='number' ? Number(input.value) : input.value});});
        }
        if(kind==='custom' || kind==='custom-condition'){
          const area=el('textarea');area.value=JSON.stringify(condition.expression || {},null,2);field('独自の条件式（JSON）',area);
          editorBody.append(btn('式を反映',()=>{try{apply(spec,{...condition,expression:JSON.parse(area.value)});}catch(_e){notice.textContent='JSON を確認してください。';}}));
        }
        const composition=el('div','flowViewComposition');
        for(const [op,label] of [['all','すべて満たす条件にする（AND）'],['any','どれかを満たす条件にする（OR）'],['not','条件を反転する（NOT）']])composition.append(btn(label,()=>apply(spec,op==='not' ? {kind:op,condition} : {kind:op,conditions:[condition]})));
        if(kind==='all' || kind==='any')composition.append(btn('条件を追加',()=>apply(spec,{kind,conditions:[...(condition.conditions || condition.children || []),{kind:'always'}]})));
        if(kind==='not')composition.append(btn('条件の反転を解除',()=>apply(spec,condition.condition || condition.child)));
        const path=spec.ref.path;
        if(typeof path.at(-1)==='number'){
          const parentPath=path.slice(0,-2), parentRef={...spec.ref,path:parentPath};delete parentRef.fingerprint;
          const parent=App.FlowViewModel.resolve(current,parentRef);
          const siblings=parent?.conditions || parent?.children || [];
          if(siblings.length>1)composition.append(btn('この条件を外す',()=>{
            const children=clone(siblings);children.splice(path.at(-1),1);
            apply({...spec,ref:{...parentRef,fingerprint:JSON.stringify(parent)}},{kind:parent.kind,conditions:children});
          }));
        }
        const more=el('details','flowSettingMore');more.append(el('summary','','条件の追加・組み合わせ'),composition);editorBody.append(more);
      }
      editorBody.querySelectorAll('input,select,textarea,button').forEach(input=>input.disabled=!!root.isSimRunning?.());
    }
    function drawLogo(ctx,x,y){
      ctx.strokeStyle='#59616a';ctx.lineWidth=1.8;
      ctx.beginPath();ctx.moveTo(x,y+9);ctx.lineTo(x+12,y+2);ctx.lineTo(x+24,y+9);ctx.lineTo(x+12,y+17);ctx.closePath();ctx.stroke();
      for(const [dx,dy] of [[0,9],[12,2],[24,9],[12,17]]){ctx.beginPath();ctx.arc(x+dx,y+dy,3,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.stroke();}
    }
    function shortText(ctx,text,width){
      let value=String(text || '');
      if(ctx.measureText(value).width<=width)return value;
      while(value.length && ctx.measureText(value+'…').width>width)value=value.slice(0,-1);
      return value+'…';
    }
    function drawNode(item,ctx){
      const spec=item._flow;
      const current=sourceGraph.getNodeById(nodeId);
      const active=spec.state ? current?._state===spec.state : spec.statePrefix ? String(current?._stateName || '').startsWith(spec.statePrefix) || spec.key==='unload' && String(current?._stateName || '').startsWith('palletOut_') : spec.kind==='rule' ? String((spec.ref.direction==='input' ? current?._activeFlowInputRule : current?._activeFlowOutputRule)?.ruleId || '')===spec.ref.ruleId : false;
      let detail=spec.detail;
      if(active && spec.key==='receive')detail=`搬入済み ${App.FlowViewModel.status(current,model.behavior).received}`;
      if(active && ['process','recovery'].includes(spec.key) && Number.isFinite(current?._until))detail=`残り ${Math.max(0,(current._until-(root.simNow?.() || 0))/1000).toFixed(2)} s`;
      ctx.save();
      ctx.fillStyle='#fff9dc';ctx.strokeStyle=session.selected===spec.key ? '#527da2' : '#d8dde3';ctx.lineWidth=session.selected===spec.key ? 2.5 : 1.3;
      ctx.shadowColor='#26303b33';ctx.shadowBlur=6;ctx.shadowOffsetY=3;
      ctx.beginPath();ctx.roundRect(0,0,item.size[0],item.size[1],12);ctx.fill();ctx.stroke();
      ctx.shadowColor='transparent';ctx.fillStyle='#f3c70b';ctx.beginPath();ctx.roundRect(0,0,item.size[0],40,[12,12,0,0]);ctx.fill();
      ctx.fillStyle='#009af5';ctx.beginPath();ctx.arc(18,20,7,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#26303b';ctx.font='20px "Segoe UI", sans-serif';ctx.fillText(shortText(ctx,spec.title,item.size[0]-48),36,27);
      ctx.fillStyle='#fdfdfc';ctx.strokeStyle='#e0e4e9';ctx.lineWidth=1.3;ctx.beginPath();ctx.roundRect(8,item._cardY,item.size[0]-16,71,10);ctx.fill();ctx.stroke();
      ctx.save();ctx.translate(0,item._cardY-64);
      ctx.font='600 11px "Segoe UI", sans-serif';ctx.fillStyle=active ? '#27877c' : '#877022';
      ctx.fillText(spec.kind==='condition' ? 'CONDITION · 未評価' : spec.kind==='rule' ? 'RULE · 評価順' : spec.kind==='opaque' ? 'OPAQUE' : active ? '● 現在位置' : 'LOGIC',20,83);
      ctx.fillStyle='#273343';ctx.font='600 17px "Segoe UI", sans-serif';ctx.fillText(shortText(ctx,detail,item.size[0]-40),20,108);
      ctx.fillStyle='#e7e9ec';ctx.fillRect(20,127,item.size[0]-40,4);
      ctx.restore();
      for(const [input,slots] of [[true,item.inputs],[false,item.outputs]])slots.forEach((slot,index)=>{
        const point=item.getConnectionPos(input,index),x=point[0]-item.pos[0],y=point[1]-item.pos[1];
        ctx.fillStyle=colors[slot.type];ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.stroke();
        ctx.font='12px Segoe UI';ctx.fillStyle='#738090';const left=input!==item.properties.flipIO;ctx.textAlign=left ? 'left' : 'right';ctx.fillText(slot.name,left ? 12 : item.size[0]-12,y+4);
      });
      ctx.restore();
    }
    function drawEdges(ctx){
      ctx.save();
      // Section captions distinguish ordered configuration rows from execution.
      ctx.font='600 17px "Segoe UI", sans-serif';ctx.fillStyle='#738090';
      ctx.fillText('実行サイクル',0,20);
      if(model.rules.length)ctx.fillText('ルールと条件 · 上から評価（実行線ではありません）',270,model.rules[0].y-28);
      for(const link of model.edges){
        if(!session.detailed && link.type==='condition')continue;
        // Port references can be revealed on selection without long crossing lines.
        const a=display.get(link.from),b=display.get(link.to);if(!a || !b)continue;
        if(link.output!==undefined){
          const p=a.getConnectionPos(false,link.output),q=b.getConnectionPos(true,link.input);
          ctx.strokeStyle=colors[link.type];ctx.lineWidth=link.type==='work' ? 3 : 2;ctx.setLineDash(link.type==='condition' ? [3,6] : []);
          ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.bezierCurveTo(p[0]+(a.properties.flipIO ? -80 : 80),p[1],q[0]+(b.properties.flipIO ? 80 : -80),q[1],q[0],q[1]);ctx.stroke();ctx.setLineDash([]);continue;
        }
        const reverse=b.pos[0]<a.pos[0];
        const x1=a.pos[0]+(link.return ? a.size[0]/2+(a===b ? a.size[0]/3 : 0) : reverse ? 0 : a.size[0]);
        const y1=a.pos[1]+(link.return ? a.size[1] : 51);
        const x2=b.pos[0]+(link.return ? b.size[0]/2-(a===b ? b.size[0]/3 : 0) : reverse ? b.size[0] : 0);
        const y2=b.pos[1]+(link.return ? b.size[1] : 51);
        ctx.strokeStyle=colors[link.type];ctx.fillStyle=colors[link.type];ctx.lineWidth=link.type==='work' ? 3 : 1.8;
        ctx.setLineDash(link.type==='condition' ? [3,6] : link.type==='sequence' ? [9,4] : []);
        ctx.beginPath();ctx.moveTo(x1,y1);
        if(link.return){
          const yy=link.viaY ?? Math.max(y1,y2)+40;
          ctx.lineTo(x1,yy);ctx.lineTo(x2,yy);ctx.lineTo(x2,y2);
          if(link.label){ctx.font='13px "Segoe UI", sans-serif';ctx.fillText(link.label,Math.min(x1,x2)+20,yy-8);}
        }else ctx.bezierCurveTo(x1+(reverse ? -70 : 70),y1,x2+(reverse ? 70 : -70),y2,x2,y2);
        ctx.stroke();ctx.setLineDash([]);
        // Square = execution, circle = work, diamond = condition.
        for(const [x,y] of [[x1,y1],[x2,y2]]){
          ctx.beginPath();
          if(link.type==='work')ctx.arc(x,y,4,0,Math.PI*2);
          else if(link.type==='sequence')ctx.rect(x-3.5,y-3.5,7,7);
          else {ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();}
          ctx.fill();
        }
        // Direction marker at the receiving end.
        if(link.type==='sequence'){
          ctx.beginPath();ctx.moveTo(x2,y2);
          if(link.return){ctx.lineTo(x2-4,y2+9);ctx.lineTo(x2+4,y2+9);}
          else {const sign=reverse ? 1 : -1;ctx.lineTo(x2+sign*10,y2-4);ctx.lineTo(x2+sign*10,y2+4);}
          ctx.closePath();ctx.fill();
        }
      }
      ctx.restore();
    }
    function setup(){
      view=new root.LGraphCanvas(null,graph,{skip_render:true});
      view.show_info=false;view.render_shadows=false;view.render_canvas_border=false;
      view.background_image=null;view.clear_background_color='#f8fafb';
      view.allow_searchbox=false;view.allow_reconnect_links=true;view.allow_dragnodes=true;
      view.drawConnections=()=>{};
      graph.onConnectionChange=wireChanged;
      view.getCanvasMenuOptions=()=>[];
      view.getNodeMenuOptions=item=>[{content:item.properties.flipIO ? 'Flip IO · Ports: reset alignment' : 'Flip IO · Ports: flip horizontally',disabled:!!root.isSimRunning?.(),callback:()=>{
        if(root.isSimRunning?.())return;
        item.properties.flipIO=!item.properties.flipIO;session.flips.set(item._flow.key,item.properties.flipIO);orientPorts(item);paint();
      }}];
      view.showSearchBox=()=>{};view.processDrop=()=>false;
      view.processKey=event=>{
        if(event.target!==canvas)return;
        if(event.type!=='keydown')return;
        const moves={ArrowLeft:[60,0],ArrowRight:[-60,0],ArrowUp:[0,60],ArrowDown:[0,-60]};
        if(moves[event.key]){view.ds.offset[0]+=moves[event.key][0]/view.ds.scale;view.ds.offset[1]+=moves[event.key][1]/view.ds.scale;remember();paint();}
        else if(event.key==='+' || event.key==='=')zoom(1.2);
        else if(event.key==='-')zoom(1/1.2);
        else if(event.key==='0')fit('all');
        else if(event.key==='Enter' && session.selected){editor.open=true;editor.querySelector('input,select,button')?.focus();}
        else if(!['Delete','Backspace','c','v','a'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
      };
      view.drawNode=drawNode;view.onDrawBackground=drawEdges;
      view.onSelectionChange=items=>{const selected=Object.values(items)[0];if(selected)choose(selected._flow.key);};
      view.onNodeMoved=()=>remember();
      view.setCanvas(canvas);
      view.ds.scale=session.scale;view.ds.offset.set(session.offset);
    }
    function unbind(){
      // LiteGraph 0.7's unbindEvents omits capture flags and some handlers.
      // Remove the exact bound handlers, including the document before adoption.
      for(const type of ['pointer','mouse','touch']){
        for(const [suffix,callback,capture] of [['down',view._mousedown_callback,true],['move',view._mousemove_callback,false],['up',view._mouseup_callback,true]]){
          canvas.removeEventListener(type+suffix,callback,capture);
          owner.removeEventListener(type+suffix,callback,capture);
          owner.removeEventListener(type+suffix,callback,!capture);
        }
      }
      canvas.removeEventListener('keydown',view._key_callback,true);
      owner.removeEventListener('keyup',view._key_callback,true);
      canvas.removeEventListener('dragover',view._doNothing);
      canvas.removeEventListener('dragend',view._doNothing);
      view.setCanvas(null);
      // setCanvas creates a fresh back canvas but LiteGraph keeps the previous
      // context. Without clearing it, edges are painted into a detached buffer.
      view.bgctx=null;
    }
    function orientPorts(item){
      for(const [input,slots] of [[true,item.inputs],[false,item.outputs]])for(const slot of slots)slot.dir=(input!==item.properties.flipIO) ? root.LiteGraph.LEFT : root.LiteGraph.RIGHT;
      item.setDirtyCanvas(true,true);
    }
    function rebuild(reset=false){
      const current=sourceGraph.getNodeById(nodeId);if(!current)return;
      if(!reset)remember();
      model=App.FlowViewModel.build(current);lastNode=current;
      for(const spec of model.nodes){
        if(spec.title==='AND' && !spec.ref)spec.title='全条件の成立を待つ';
        if(spec.kind==='rule'){
          const rule=App.FlowViewModel.resolve(current,spec.ref),field=spec.ref.direction==='input' ? 'acceptWhen' : 'releaseWhen';
          const tree=Conditions.legacyTree(rule[field]);spec.conditionSummary=Conditions.summary(tree,sourceGraph.__factSimTypeRegistry?.list?.() || []);
          spec.detail=`${spec.used===false ? '未使用 · ' : ''}${spec.conditionSummary}`;
          spec.help=`${spec.help} 条件：${spec.conditionSummary}`;
        }
      }
      const visible=model.nodes.filter(spec=>session.detailed || !(spec.kind==='condition' && spec.ref));
      if(!session.detailed){
        const base=Math.max(350,...visible.filter(s=>!s.ref).map(s=>s.y+s.height))+100;
        let y=base;
        for(const row of model.rules){
          const rule=visible.find(s=>s.key===row.key);row.y=y;if(rule){rule.x=270;rule.y=y;}
          const timings=visible.filter(s=>s.kind==='timing' && s.ref.ruleId===rule?.ref.ruleId && s.ref.direction===rule?.ref.direction);
          timings.forEach((s,i)=>{s.x=20;s.y=y+i*140;});y+=Math.max(1,timings.length)*140+55;
        }
      }
      // Presentation scaling only: the projection and execution settings stay intact.
      for(const spec of model.nodes){spec.x*=1.5;spec.y*=2.5;spec.width*=1.5;spec.height*=1.5;}
      for(const edge of model.edges)if(edge.viaY!==undefined)edge.viaY*=2.5;
      for(const rule of model.rules)rule.y*=2.5;
      const edges=session.wires || model.edges;
      building=true;graph.clear();display.clear();picker.replaceChildren();
      for(const spec of visible){
        const item=new root.LGraphNode(spec.title);item._flow=spec;item.pos=positions().get(spec.key) || [spec.x,spec.y];item.size=[spec.width,spec.height];
        item.resizable=false;item.removable=false;item.clonable=false;item.flags={};
        for(const [i,type] of portTypes.entries()){
          if(!session.detailed && type==='condition')continue;
          const incoming=edges.filter(edge=>edge.to===spec.key && edge.type===type).length;
          for(let j=0;j<Math.max(1,incoming+1);j++)item.addInput(`${portLabels[i]}${j ? ' '+(j+1) : ''}`,type);
          item.addOutput(portLabels[i],type);
        }
        item.properties.flipIO=session.flips.get(spec.key) ?? (spec.key==='recovery');
        orientPorts(item);
        item._cardY=50+Math.max(item.inputs.length,item.outputs.length)*18;
        item.size[1]=item._cardY+80;
        item.getConnectionPos=function(input,index,out){out=out || new Float32Array(2);out[0]=this.pos[0]+(input!==this.properties.flipIO ? 0 : this.size[0]);out[1]=this.pos[1]+50+index*18;return out;};
        item.onConnectInput=()=>!root.isSimRunning?.();item.onConnectOutput=()=>!root.isSimRunning?.();
        graph.add(item);display.set(spec.key,item);
        const option=el('option','',`${spec.kind==='rule' ? `優先 ${spec.title}` : spec.title} · ${spec.detail}`);option.value=spec.key;picker.append(option);
      }
      model.edges=clone(edges);
      for(const edge of edges){
        if(!session.detailed && edge.type==='condition')continue;
        const a=display.get(edge.from),b=display.get(edge.to);if(!a || !b)continue;
        const output=a.outputs.findIndex(slot=>slot.type===edge.type),input=b.inputs.findIndex(slot=>slot.type===edge.type && slot.link==null);
        if(output<0 || input<0)continue;
        a.connect(output,b,input);Object.assign(model.edges[edges.indexOf(edge)],{output,input});
      }
      building=false;
      runtimeLabel.textContent=model.runtime;
      legend.querySelector('.is-condition').hidden=!session.detailed;
      const selected=visible.find(spec=>spec.key===session.selected) || visible[0];
      if(selected)choose(selected.key);
      paint();
    }
    function paint(){if(view && !disposed && host.isConnected && viewport.clientWidth)view.draw(true,true);}
    function resize(){
      if(disposed || !view || !viewport.clientWidth)return;
      const width=Math.round(viewport.clientWidth),height=Math.round(viewport.clientHeight);
      if(session.initialized){
        view.ds.offset[0]+=(width-canvas.width)/2/view.ds.scale;
        view.ds.offset[1]+=(height-canvas.height)/2/view.ds.scale;
      }
      view.resize(width,height);
      if(!session.initialized){
        session.initialized=true;fit('cycle');
        // Start legibly on narrow docks. Fit remains an explicit overview action.
        if(view.ds.scale<0.9){view.ds.scale=0.9;view.ds.offset.set([24,16]);remember();paint();}
      }else paint();
    }
    canvas.addEventListener('pointermove',event=>{
      if(!view || !model)return;
      const rect=canvas.getBoundingClientRect();
      const x=(event.clientX-rect.left)/view.ds.scale-view.ds.offset[0],y=(event.clientY-rect.top)/view.ds.scale-view.ds.offset[1];
      const item=Array.from(display.values()).reverse().find(item=>x>=item.pos[0] && x<=item.pos[0]+item.size[0] && y>=item.pos[1] && y<=item.pos[1]+item.size[1]);
      tooltip.hidden=!item || !!event.buttons;
      if(item){tooltip.textContent=item._flow.help || `${item._flow.title} · ${item._flow.detail}`;tooltip.style.left=`${Math.max(8,Math.min(rect.width-300,event.clientX-rect.left+14))}px`;tooltip.style.top=`${Math.min(rect.height-90,event.clientY-rect.top+22)}px`;}
    });
    canvas.addEventListener('pointerleave',()=>tooltip.hidden=true);
    function tick(){
      if(disposed)return;
      if(!host.isConnected){if(mounted)dispose();return;}
      mounted=true;
      if(canvas.ownerDocument!==owner){
        remember();unbind();owner=canvas.ownerDocument;view.setCanvas(canvas);resize();
      }
      view.pause_rendering=!viewport.clientWidth;
      if(!viewport.clientWidth)return;
      const current=sourceGraph.getNodeById(nodeId);
      if(!current){live.textContent='ノードが削除されました';editorBody.querySelectorAll('input,select,button,textarea').forEach(input=>input.disabled=true);return;}
      const next=App.FlowViewModel.build(current), running=!!root.isSimRunning?.();
      view.read_only=running;
      if(next.signature!==model.signature || current!==lastNode)rebuild();
      const s=next.status;
      const statusText=`${s.state} · ${s.reason} · 搬入済み ${s.received}${s.queue!==null ? ` · キュー ${s.queue}` : ''}${s.pending!==null && running ? ` · 未受渡 ${s.pending}` : ''}${running ? ' · 編集ロック中' : ''}`;
      if(live.textContent!==statusText)live.textContent=statusText;
      if(lastRunning!==running){lastRunning=running;const spec=model.nodes.find(item=>item.key===editorKey);if(spec)renderEditor(spec);}
      remember();paint();
    }
    function dispose(){
      if(disposed)return;
      remember();disposed=true;clearInterval(timer);observer.disconnect();view?.stopRendering();unbind();view?.setGraph(null);graph=null;display.clear();
    }
    const observer=new ResizeObserver(resize);observer.observe(viewport);
    setup();rebuild();
    // Rendering follows pointer movement at animation-frame speed. This starts
    // only the canvas renderer: the display graph itself is never started.
    view.startRendering();
    timer=setInterval(tick,250);
    host.flowView={dispose,refresh:()=>{rebuild();resize();},get model(){return model;},get view(){return view;}};
    requestAnimationFrame(()=>{resize();tick();});
    return host;
  }
  App.createFlowView=create;
})(window);
