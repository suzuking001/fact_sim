/* Condition presentation/editing only. Persist the existing trees and v1 graphs. */
(function(root){
  'use strict';
  const App=root.App=root.App || {},copy=value=>JSON.parse(JSON.stringify(value));
  const logical=['all','any','not'],predicateKinds=new Set(['test','and','or','not']);
  const toKind={and:'all',or:'any',not:'not'},fromKind={all:'and',any:'or',not:'not'};
  const labels={all:'すべて満たす',any:'どれかを満たす',not:'満たさない',always:'条件なし',available:'ワークがある',type:'ワークの種類が一致する',attribute:'ワークの属性を比較する',count:'ワークが指定個数以上ある','ids-match':'すべてのワークの ID が一致する',empty:'ワークがない',full:'設備の容量に達した',
    'node-idle':'設備が待機中','down-complete':'復帰が完了','process-complete':'処理が完了','downstream-ready':'送り先が受取可能','space-available':'空き容量がある','not-full':'満杯でない','count-reached':'指定個数に達した','time-elapsed':'指定時間が経過した','attribute-condition':'ワークの属性を比較する','shuttle-group-idle':'グループの処理が完了',custom:'独自の条件式','custom-condition':'独自の条件式'};
  const programKinds=['always','available','type','attribute','count','ids-match','empty','full'];
  const operators=[['eq','等しい（＝）'],['ne','等しくない（≠）'],['gt','より大きい（>）'],['gte','以上（≥）'],['lt','より小さい（<）'],['lte','以下（≤）'],['contains','含む']];
  function leafErrors(kind,c){
    if(!labels[kind])return ['未対応の条件です。詳細表示で確認してください。'];
    if(['count','count-reached','time-elapsed'].includes(kind)){
      const value=c[kind==='count' ? 'value' : kind==='count-reached' ? 'count' : 'seconds'];
      if(!Number.isFinite(value) || value<0)return ['0 以上の数値を入力してください。'];
    }
    if(kind==='type' && !c.typeId)return ['ワークの種類を選択してください。'];
    return [];
  }
  function programTree(program,ref){
    const nodes=new Map(program.nodes.map(n=>[n.id,n]));let budget=512;
    function visit(ref,seen){
      const n=nodes.get(ref.id),base={ref,kind:'missing',config:{},children:[],errors:[],shared:[]};
      if(!n)return {...base,errors:['条件が未接続です。']};
      if(seen.has(n.id) || --budget<0)return {...base,errors:[seen.has(n.id) ? '条件が循環しています。詳細表示で接続を修正してください。' : '条件が大きいため、詳細表示で確認してください。']};
      const next=new Set(seen);next.add(n.id);
      const kind=toKind[n.kind] || (n.kind==='test' ? n.config?.test : 'unknown');
      const inputs=program.links.filter(l=>l.to===n.id).sort((a,b)=>a.input-b.input);
      const children=inputs.map(l=>visit({id:l.from,to:n.id,input:l.input},next));
      const errors=[...(ref.errors || []),...(logical.includes(kind) ? (kind==='not' ? children.length!==1 : children.length<2 || children.length>4) ? ['条件の接続数が不正です。'] : [] : leafErrors(kind,n.config || {}))];
      if(inputs.some(l=>l.output!==0 || !Number.isInteger(l.input) || l.input<0 || l.input>=(kind==='not' ? 1 : logical.includes(kind) ? 4 : 0)) || new Set(inputs.map(l=>l.input)).size!==inputs.length)errors.push('条件の接続口が不正です。');
      if(program.links.filter(l=>l.from===n.id).length>1){
        const uses=new Set(),visited=new Set();
        const follow=id=>{if(visited.has(id))return;visited.add(id);for(const l of program.links.filter(l=>l.from===id)){const target=nodes.get(l.to);if(predicateKinds.has(target?.kind))follow(l.to);else if(target)uses.add(`${target.kind==='wait' ? '条件待ち' : target.kind==='branch' ? '条件分岐' : target.kind} #${target.id}`);}};
        follow(n.id);base.shared=[...uses];
      }
      return {...base,kind,config:n.config || {},children,errors};
    }
    return visit(ref,new Set());
  }
  function legacyTree(value,path=[]){
    const c=typeof value==='object' && value ? value : {kind:value || 'always'},kind=c.kind || 'always';
    const arrayKey=Array.isArray(c.conditions) ? 'conditions' : 'children',childKey=c.condition ? 'condition' : 'child';
    const children=kind==='not' ? (c[childKey] ? [legacyTree(c[childKey],[...path,childKey])] : []) : ['all','any'].includes(kind) ? (c[arrayKey] || []).map((v,i)=>legacyTree(v,[...path,arrayKey,i])) : [];
    return {ref:path,kind,config:c,children,shared:[],errors:logical.includes(kind) ? children.length ? [] : ['条件を追加してください。'] : leafErrors(kind,c)};
  }
  function summary(tree,types=[]){
    if(tree.errors.length)return `⚠ ${tree.errors[0]}`;
    const c=tree.config,k=tree.kind;
    if(logical.includes(k))return k==='not' ? `満たさない（${summary(tree.children[0],types)}）` : `（${tree.children.map(t=>summary(t,types)).join(k==='all' ? '、かつ ' : '、または ')}）`;
    if(k==='type')return `ワークが「${types.find(t=>t.typeId===c.typeId)?.name || c.typeId}」`;
    if(k==='count' || k==='count-reached')return `ワークが ${k==='count' ? c.value : c.count} 個以上`;
    if(k==='time-elapsed')return `${c.seconds} 秒経過`;
    if(k==='attribute' || k==='attribute-condition')return `属性 ${c.path || '（未指定）'} ${operators.find(([key])=>key===(c.operator || 'eq'))?.[1] || c.operator} ${JSON.stringify(c.value) ?? '（未指定）'}`;
    return labels[k] || k;
  }
  function issues(tree){return [...new Set([...tree.errors,...tree.children.flatMap(issues)])];}
  function programRoot(program,id){
    const links=program.links.filter(l=>l.to===id && l.input===1);
    return {id:links[0]?.from,to:id,input:1,errors:links.length>1 || links.some(l=>l.output!==0) ? ['条件の接続口が不正です。詳細表示で接続を修正してください。'] : []};
  }
  function compactLayout(program,visible){
    const ids=new Set(visible.map(n=>n.id)),levels=new Map(),lanes=new Map(),occupied=new Map();
    const links=program.links.filter(l=>ids.has(l.from) && ids.has(l.to) && !predicateKinds.has(program.nodes.find(n=>n.id===l.from)?.kind) && !(l.input===1 && ['branch','wait'].includes(program.nodes.find(n=>n.id===l.to)?.kind)));
    // Walk once even for executable cycles. Branches get separate lanes instead
    // of sending a bypass wire through intermediate cards.
    const place=(id,level,lane)=>{
      if(levels.has(id))return false;
      const used=occupied.get(level) || new Set();while(used.has(lane))lane++;
      used.add(lane);occupied.set(level,used);levels.set(id,level);lanes.set(id,lane);return true;
    };
    const queue=[];
    for(const n of visible.filter(n=>n.kind==='start')){place(n.id,0,0);queue.push(n.id);}
    for(let i=0;i<queue.length;i++){
      const id=queue[i],out=links.filter(l=>l.from===id).sort((a,b)=>a.output-b.output);
      out.forEach((l,index)=>{if(place(l.to,levels.get(id)+1,lanes.get(id)+index))queue.push(l.to);});
    }
    let orphanLane=Math.max(0,...lanes.values())+1;
    for(const n of visible)if(!levels.has(n.id))place(n.id,0,orphanLane++);
    return new Map(visible.map(n=>[n.id,[80+levels.get(n.id)*390,80+lanes.get(n.id)*260]]));
  }
  function attachedPredicates(program){
    const ids=new Set(),nodes=new Map(program.nodes.map(n=>[n.id,n]));
    const visit=id=>{if(ids.has(id) || !predicateKinds.has(nodes.get(id)?.kind))return;ids.add(id);program.links.filter(l=>l.to===id).forEach(l=>visit(l.from));};
    program.nodes.filter(n=>['branch','wait'].includes(n.kind)).forEach(n=>visit(programRoot(program,n.id).id));return ids;
  }
  function editProgram(value,ref,action,arg){
    const p=copy(value),node=id=>p.nodes.find(n=>n.id===id);
    const fresh=(kind,config={})=>{const n={id:Math.max(0,...p.nodes.map(n=>n.id))+1,kind,config,pos:[80,400]};p.nodes.push(n);return n;};
    const drop=id=>{p.nodes=p.nodes.filter(n=>n.id!==id);p.links=p.links.filter(l=>l.from!==id && l.to!==id);};
    // Only collect the removed subtree. Unrelated draft/orphan nodes survive.
    const prune=id=>{if(!predicateKinds.has(node(id)?.kind) || p.links.some(l=>l.from===id))return;const inputs=p.links.filter(l=>l.to===id).map(l=>l.from);drop(id);inputs.forEach(prune);};
    const replace=(id,child)=>{const outputs=p.links.filter(l=>l.from===id && l.to!==id);drop(id);outputs.forEach(l=>p.links.push({...l,from:child}));};
    let n=node(ref.id);
    if(action==='add-root'){
      if(p.links.some(l=>l.to===ref.to && l.input===ref.input))throw new Error('条件が更新されています。選択し直してください。');
      n=fresh('test',{test:'always'});p.links.push({from:n.id,output:0,to:ref.to,input:ref.input});
    }else if(!n || !predicateKinds.has(n.kind))throw new Error('条件を選択し直してください。');
    else if(action==='patch'){
      if(arg.kind){
        if(logical.includes(arg.kind)){
          const inputs=p.links.filter(l=>l.to===n.id);
          if(arg.kind==='not' && inputs.length!==1)throw new Error('「満たさない」は条件が1つのグループで選択できます。');
          n.kind=fromKind[arg.kind];inputs.forEach((l,i)=>l.input=i);
        }else {n.kind='test';n.config={...n.config,test:arg.kind};}
      }else Object.assign(n.config,arg);
    }else if(action==='wrap'){
      const outputs=p.links.filter(l=>l.from===n.id),wrapper=fresh(fromKind[arg]);
      outputs.forEach(l=>l.from=wrapper.id);p.links.push({from:n.id,output:0,to:wrapper.id,input:0});
      if(arg!=='not'){const extra=fresh('test',{test:'always'});p.links.push({from:extra.id,output:0,to:wrapper.id,input:1});}
      if(ref.to===undefined)ref={id:wrapper.id};
    }else if(action==='add'){
      const used=new Set(p.links.filter(l=>l.to===n.id).map(l=>l.input)),max=n.kind==='not' ? 1 : 4;
      const slot=Array.from({length:max},(_,i)=>i).find(i=>!used.has(i));
      if(slot===undefined)throw new Error('1 グループは4条件までです。条件をグループで包んで追加してください。');
      const extra=fresh('test',{test:'always'});p.links.push({from:extra.id,output:0,to:n.id,input:slot});
    }else if(action==='unwrap'){
      const inputs=p.links.filter(l=>l.to===n.id);if(inputs.length!==1)throw new Error('解除できるのは条件が1つのグループです。');replace(n.id,inputs[0].from);
    }else if(action==='remove'){
      if(ref.to===undefined)prune(n.id);
      else {
        p.links=p.links.filter(l=>!(l.from===n.id && l.to===ref.to && l.input===ref.input));prune(n.id);
        const parent=node(ref.to),inputs=p.links.filter(l=>l.to===ref.to);
        if(['and','or'].includes(parent?.kind) && inputs.length===1)replace(parent.id,inputs[0].from);
      }
    }
    if(p.nodes.length>256 || p.links.length>1024)throw new Error('Flow が大きすぎます（256 ノード / 1024 接続まで）。');
    return p;
  }
  function editLegacy(value,path,action,arg){
    let result=copy(value ?? {kind:'always'}),parent=null,key=null,c=result;
    for(const part of path){parent=c;key=part;c=c?.[part];}
    c=typeof c==='object' && c ? c : {kind:c || 'always'};
    const tree=legacyTree(c),children=tree.children.map(t=>copy(t.config));let next=c;
    if(action==='patch'){
      if(arg.kind && logical.includes(arg.kind))next=arg.kind==='not' ? children.length===1 ? {kind:'not',condition:children[0]} : null : {kind:arg.kind,conditions:children};
      else next={...c,...arg};
      if(!next)throw new Error('「満たさない」は条件が1つのグループで選択できます。');
    }else if(action==='wrap')next=arg==='not' ? {kind:'not',condition:c} : {kind:arg,conditions:[c,{kind:'always'}]};
    else if(action==='add')next=c.kind==='not' ? {kind:'not',condition:{kind:'always'}} : {kind:c.kind,conditions:[...children,{kind:'always'}]};
    else if(action==='unwrap')next=children[0] || {kind:'always'};
    else if(action==='remove'){
      if(Array.isArray(parent)){parent.splice(key,1);return result;}
      next={kind:'always'};
    }
    if(parent)parent[key]=next;else result=next;
    return result;
  }
  function render(container,{tree,types=[],mode='program',change,disabled=()=>false}){
    const doc=container.ownerDocument,el=(tag,text)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const host=el('section');host.className='flowConditionEditor';host.setAttribute('aria-label','動作する条件');
    const heading=el('h4','動作する条件'),full=el('p',summary(tree,types));full.className='flowConditionSummary';
    const error=el('p');error.className='flowConditionError';error.setAttribute('role','status');
    host.append(heading,full,error);container.append(host);
    const act=(ref,op,arg)=>{if(disabled())return;try{change(ref,op,arg);}catch(e){error.textContent=e.message;}};
    const button=(parent,label,fn)=>{const b=el('button',label);b.type='button';b.disabled=disabled();b.addEventListener('click',()=>{if(!disabled())fn();});parent.append(b);return b;};
    function row(t,depth=0){
      const block=el('div');block.className='flowConditionRow';block.dataset.conditionRef=JSON.stringify(t.ref);
      function field(label,value,options,patch,type='text'){
        const wrap=el('label');wrap.className='flowViewField';const input=el(options ? 'select' : 'input');
        if(options){for(const [id,text] of options){const o=el('option',text);o.value=id;input.append(o);}if(!options.some(([id])=>String(id)===String(value ?? ''))){const o=el('option',value ? `未登録：${value}` : '選択してください');o.value=value ?? '';input.append(o);}}
        else {input.type=type;if(type==='number'){input.step='any';input.required=true;}}
        input.value=String(value ?? '');input.setAttribute('aria-label',label);input.disabled=disabled();
        input.addEventListener('change',()=>{if(disabled() || !input.reportValidity())return;try{act(t.ref,'patch',patch(type==='number' ? Number(input.value) : input.value));}catch(e){error.textContent=e.message;}});
        wrap.append(el('span',label),input);block.append(wrap);return input;
      }
      for(const message of t.errors){const p=el('p',message);p.className='flowConditionError';block.append(p);}
      if(t.shared.length){const p=el('p',`共通条件 · 使用先：${t.shared.join('、')}。変更はすべての使用先に反映されます。`);p.className='flowConditionShared';block.append(p);}
      if(t.kind==='missing'){
        if(t.ref.to!==undefined && t.ref.id===undefined)button(block,'条件を追加',()=>act(t.ref,'add-root'));
        return block;
      }
      const isGroup=logical.includes(t.kind);
      const choices=isGroup ? logical : mode==='program' ? programKinds : Object.keys(App.FlowViewModel.kinds).filter(k=>!logical.includes(k));
      const select=field(isGroup ? '条件の組み合わせ' : '条件',t.kind,choices.map(k=>[k,labels[k] || k]),kind=>({kind}));
      if(isGroup && t.children.length!==1)for(const o of select.options)if(o.value==='not')o.disabled=true;
      const c=t.config,k=t.kind;
      if(k==='type')field('対象ワーク',c.typeId,types.map(t=>[t.typeId,t.name || t.typeId]),typeId=>({typeId}));
      for(const [kind,key,label] of [['count','value','個数'],['count-reached','count','個数'],['time-elapsed','seconds','経過時間（秒）']])if(k===kind)field(label,c[key],null,value=>({[key]:value}),'number').min='0';
      if(k==='process-complete')field('対象の処理ステージ ID',c.stageId,null,stageId=>({stageId}));
      if(k==='shuttle-group-idle')field('対象のグループ ID',c.groupId,null,groupId=>({groupId}));
      if(k==='attribute' || k==='attribute-condition'){
        field('調べる属性',c.path,null,path=>({path})).placeholder='例：temperature';
        field('比較',c.operator || 'eq',operators,operator=>({operator}));
        const value=c.value ?? '',valueKind=typeof value==='object' ? 'json' : typeof value;
        field('値の種類',valueKind,[['string','文字列'],['number','数値'],['boolean','真偽値'],['json','JSON']],kind=>({value:kind==='number' ? Number(value) || 0 : kind==='boolean' ? value===true : kind==='json' ? typeof value==='object' ? value : {} : String(value)}));
        field('比較値',valueKind==='json' ? JSON.stringify(value) : value,valueKind==='boolean' ? [['true','true'],['false','false']] : null,v=>({value:valueKind==='json' ? JSON.parse(v) : valueKind==='boolean' ? v==='true' : v}),valueKind==='number' ? 'number' : 'text');
      }
      if(k==='custom' || k==='custom-condition'){
        const wrap=el('label');wrap.className='flowViewField';const area=el('textarea');area.value=JSON.stringify(c.expression || {},null,2);area.disabled=disabled();area.setAttribute('aria-label','独自の条件式（JSON）');wrap.append(el('span','独自の条件式（JSON）'),area);block.append(wrap);
        button(block,'式を反映',()=>{try{act(t.ref,'patch',{expression:JSON.parse(area.value)});}catch(e){error.textContent=e.message;}});
      }
      if(t.children.length){const nested=el('div');nested.className='flowConditionChildren';t.children.forEach(child=>nested.append(row(child,depth+1)));block.append(nested);}
      const actions=el('div');actions.className='flowConditionActions';block.append(actions);
      if(isGroup && (k!=='not' || !t.children.length))button(actions,'条件を追加',()=>act(t.ref,'add'));
      const more=el('details');more.className='flowConditionMore';more.append(el('summary','条件の追加・組み合わせ'));actions.append(more);
      for(const [kind,label] of [['all','すべて満たすグループで包む'],['any','どれかを満たすグループで包む'],['not','条件を反転する']])button(more,label,()=>act(t.ref,'wrap',kind));
      if(isGroup && t.children.length===1)button(more,'グループを解除',()=>act(t.ref,'unwrap'));
      button(actions,depth ? 'この条件を外す' : mode==='legacy' ? '条件なしにする' : '条件を外す',()=>act(t.ref,'remove'));
      return block;
    }
    host.append(row(tree));return host;
  }
  App.FlowConditions={labels,predicateKinds,programRoot,programTree,legacyTree,summary,issues,attachedPredicates,compactLayout,editProgram,editLegacy,render};
})(typeof window==='undefined' ? globalThis : window);
