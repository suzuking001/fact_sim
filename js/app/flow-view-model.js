/* Read-only projection of the configured runtime. Never call readiness or execute here. */
(function(root){
  'use strict';
  const App = root.App = root.App || {};
  const copy = value => JSON.parse(JSON.stringify(value));
  const kinds = {
    all:'AND', any:'OR', not:'NOT', always:'常に', available:'ワークあり',
    'node-idle':'Idle', 'down-complete':'Recovery 完了', 'process-complete':'Process 完了',
    'downstream-ready':'下流の受付', 'space-available':'空き容量', 'not-full':'満杯でない',
    empty:'空', full:'満杯', 'count-reached':'個数', 'time-elapsed':'経過時間',
    'attribute-condition':'属性の比較', 'shuttle-group-idle':'グループの処理完了',
    'custom-condition':'独自条件', custom:'独自条件'
  };
  const prototypes = {
    MergeNode:'merge', JoinNode:'join', SplitNode:'split', EquipmentNode:'machine',
    BranchNode:'router', SourceNode:'source', SinkNode:'sink', CarrierRouteNode:'carrier_route',
    AGVRouteNode:'agv_route', StationNode:'station', TransferStationNode:'transfer'
  };
  function runtime(node){
    for(const [name, behavior] of Object.entries(prototypes)){
      if(root[name] && (node._runtimePrototype === root[name].prototype || node.constructor === root[name])) return behavior;
    }
    // The compiled plan is already normalized by BasicNode's configure path.
    if(node._runtimePrototype) return 'opaque';
    return node._executionPlan?.behavior || 'opaque';
  }
  const ports = (node, direction) => (node[direction === 'input' ? 'inputs' : 'outputs'] || [])
    .map((port, index)=>({ name:port.name, channel:port.channel, link:port.link, links:port.links?.slice(), index, key:String(port.portId || `${direction}-${index}`) }))
    .filter(port=>port.channel !== 'signal' && !/^sig(?:In|Out)/i.test(port.name || ''));
  function status(node, behavior){
    const state = String(behavior.endsWith('route') ? node._stateName || node._state || '未取得' : node._state || node._stateName || '未取得');
    let received = node._payload || node._activeRoot || node._currentWork ? 1 : 0;
    if(behavior === 'merge') received = Object.values(node._worksBySlot || {}).filter(Boolean).length;
    const queue = Array.isArray(node._queue) ? node._queue.length : null;
    const pending = Array.isArray(node._splitOutputOffers)
      ? node._splitOutputOffers.reduce((sum, offer)=>sum + (offer.pendingTargetIds?.size ?? offer.pendingTargetIds?.length ?? 0),0) : null;
    const reasons = { IDLE:'入力待ち', PROCESS:'処理時間の経過待ち', WAIT:'出力ルール・下流の受付待ち', DOWN:'Recovery 中（出力を提示）', TRANSFER:'同期受け渡し中' };
    let reason = reasons[node._state] || '内部制御';
    if(behavior === 'merge' && node._state === 'IDLE') reason = `ポート順の受付待ち：${(node._nextSlotCursor || 0) + 1} 番目`;
    if(behavior === 'split' && node._state === 'DOWN') reason = 'Recovery と全出力の受渡完了を待機';
    if(behavior === 'source') reason = 'Sequence・出力先・提示中の受渡完了を参照';
    if(behavior === 'sink') reason = '入力を受け取り完了に計上';
    if(behavior.endsWith('route')) reason = `搬送制御：${state}`;
    return { state, received, queue, pending, reason };
  }
  function build(node){
    const behavior = runtime(node), p = node.properties || {};
    const model = { behavior, runtime:node._runtimePrototype?.constructor?.name || behavior,
      nodes:[], edges:[], status:status(node, behavior), rules:[], nodeId:node.id };
    const add = (key, title, detail, x, y, extra={})=>{
      model.nodes.push({ key, title, detail, x, y, width:210, height:96, ...extra });
      return key;
    };
    const edge = (from,to,type='sequence',extra={})=>model.edges.push({ from,to,type,...extra });
    const step = (key,title,detail,x,y=70,extra={})=>add(key,title,detail,x,y,{ kind:'step', ...extra });
    const ins=ports(node,'input'), outs=ports(node,'output');
    const inputs = Array.isArray(p.inputRules) ? p.inputRules : [];
    const outputs = Array.isArray(p.outputRules) ? p.outputRules : [];
    const scripted = Number(p.basicNodeVersion || 0)<2 && ['machine','join','split','router'].includes(behavior) && !!String(p.script || '').trim() && !p.scriptDisabled;
    const simple = ['merge','join','machine','split','router'].includes(behavior);
    let entry='receive', exit='dispatch';
    if(scripted || behavior === 'opaque'){
      entry=exit=step('opaque','独自処理',scripted ? 'Script · 内部配線は非表示' : '未対応の実行方式',620,70,{
        kind:'opaque', help:'独自コードは解析・実行しません。実際の処理順や分岐を推測せず、このブロックの内部として扱います。', state:node._state
      });
    }else if(simple){
      const receiveTitle = behavior === 'merge' ? '順番受付' : behavior === 'join' ? '到着順キュー' : '優先選択';
      step('receive',receiveTitle,behavior === 'merge' ? '接続済みの入力をポート順に' : behavior === 'join' ? '1件ずつ取り出す' : '入力ルール順 → 残りのポート',270,70,{
        state:'IDLE', help:behavior === 'join' ? '到着時刻・登録順でキューに保持。同じ時点の検出は入力の走査開始位置が巡回します。OR 条件や並列実行ではありません。' : 'この受付順は実装で固定されています。入力ルールの並びだけから順番を変更することはできません。'
      });
      if(behavior === 'merge'){
        step('match','ID 照合','すべての入力がそろうまで',520,70,{
          help:`2件目以降は最初のワークの ID と照合します。不一致時は${p.strictIdMatch ? 'ERROR で停止' : '警告し、受付中のサイクルをリセット'}。strictIdMatch が false でも照合します。` });
        edge('receive','match');
        edge('match','receive','sequence',{ return:true, label:'次の入力', viaY:220 });
      }
      step('process','Process',behavior === 'merge' ? '全入力受付後に1回' : '選択したルールの処理時間',770,70,{ state:'PROCESS', timing:'input', help:'下のルール行で、選択される Flow Rule の時間を編集できます。' });
      edge(behavior === 'merge' ? 'match' : 'receive','process');
      step('wait','搬出待ち',behavior === 'split' ? '接続先すべての受付待ち' : '出力ルール・下流の受付',1020,70,{state:'WAIT',help:behavior === 'split' ? '選択出力の接続先がすべて受付可能になるまで待ちます。未接続ポートは判定対象外で、少なくとも1つの接続が必要です。' : '選択された出力ルールと下流の受付を待ちます。'});
      edge('process','wait');
      step('dispatch',behavior === 'split' ? '複製・同時出力' : behavior === 'router' ? '振分・選択出力' : '選択出力',behavior === 'split' ? '選択された全出力へ提示' : '選択された1ポートへ提示',1270,70,{
        state:'DOWN', help:behavior === 'router' ? 'Branch の振分制御と出力ルールに従います。複製ではありません。' : 'ワークの提示と同時に Recovery が始まります。'
      });
      edge('wait','dispatch');
      step('recovery','Recovery','出力提示と同時に開始',1020,300,{state:'DOWN',timing:'output'});
      edge('dispatch','recovery','sequence',{ return:true });
      if(behavior === 'split'){
        step('ack','全受渡完了','各出力の受付確認',1270,300,{ state:'DOWN',help:'各 offer の pendingTargetIds が空になるまで待機します。Recovery と同時進行です。' });
        step('finish','AND','時間経過 ＋ 全受渡完了',770,300,{kind:'condition'});
        edge('dispatch','ack'); edge('ack','finish','condition'); edge('recovery','finish','condition');
        edge('finish','receive','sequence',{return:true,viaY:450});
      }else edge('recovery','receive','sequence',{return:true,viaY:450,label:'次のサイクル'});
    }else if(behavior === 'shuttle'){
      step('receive','受付','外部入力・前段からの入力',270,70,{state:'IDLE'});
      step('process','Process','各ステージの処理',520,70,{state:'PROCESS',timing:'input'});
      step('wait','同期判定','グループの処理完了・下流受付',770,70,{state:'WAIT',help:'グループ全体の出力条件が成立した時点で一括 transfer を確定します。'});
      step('dispatch','同期受け渡し','TRANSFER · Recovery なし',1270,70,{state:'TRANSFER'});
      step('buffer','次の入力を保持','受け渡し中 · 入力がある場合',1020,300,{help:'TRANSFER 中に受け取った入力を保持し、次の IDLE で使用します。受け渡しと同時に行う任意の受付です。'});
      edge('receive','process'); edge('process','wait'); edge('wait','dispatch');
      edge('dispatch','buffer','condition');edge('buffer','receive','work');
      edge('dispatch','receive','sequence',{return:true,viaY:450,label:'TRANSFER 完了'});
    }else if(behavior === 'carrier_route' || behavior === 'agv_route'){
      step('receive','搬送体の受付','搬送体・パレットを捕捉',270,70,{statePrefix:'agvIn_',help:'搬送体の設定・レーン・容量を適用します。搬送体ごとの設定が時間を上書きする場合があります。'});
      step('carrier-process','搬送体 Process','agv_process',520,70,{statePrefix:'agv_process'});
      step('load','ワーク搬入 → Process','容量・接続に応じて反復／省略',770,70,{statePrefix:'workIn_',help:'搬入したワークごとに Process。搬入口がない、または容量に達した場合は搬出へ進みます。'});
      step('unload','ワーク・パレット搬出','搬出待ち → 出力＋Recovery',1020,70,{statePrefix:'workOut_',help:'接続・荷姿に応じて反復または省略。搬出待ち → 出力提示・Down → 受渡確認。パレット搬出は palletOut_* の状態で制御します。'});
      step('dispatch','搬送体の搬出','出力＋Recovery・受渡確認',1270,70,{statePrefix:'agvOut_',help:'outSequence・レーン制御に従い搬出します。内部の分岐は接続・搬送体・荷姿に依存します。'});
      edge('receive','carrier-process'); edge('carrier-process','load'); edge('load','unload'); edge('unload','dispatch');
      edge('load','load','sequence',{return:true,viaY:260,label:'次のワーク'});
      edge('dispatch','receive','sequence',{return:true,viaY:450,label:'受渡・Recovery 完了'});
    }else if(behavior === 'source'){
      entry=step('generate','生成候補','Sequence の次のワーク',520,70,{help:'Sequence の次の対象を候補とし、Output Rule と下流の受付を確認して生成します。同一時刻の重複生成は抑止され、提示中は受渡完了を待ちます。Process・Recovery の待機段階はありません。'});
      step('dispatch','生成・出力・受渡待ち','対象・下流の受付',1270,70);
      edge('generate','dispatch'); edge('dispatch','generate','sequence',{return:true,viaY:450,label:'次の生成'});
    }else if(behavior === 'sink'){
      entry=exit=step('consume','受取・完了','Sink の入力処理',770,70,{help:'受け取ったワークを完了として記録します。Process・Recovery の待機段階はありません。'});
    }else{
      entry=exit=step('controller','内部コントローラ',behavior,770,70,{kind:'opaque',help:'この実行方式は専用コントローラです。内部の分岐を推測して描きません。条件と設定値は下の参照行で確認できます。'});
    }
    ins.forEach((port,index)=>{
      const key=add(`in:${port.key}`,port.name || port.key,port.link == null ? 'INPUT · 未接続' : `INPUT · ${port.key}`,0,70+index*125,{kind:'input',portId:port.key,help:`ワーク入力 ${port.key}。${port.link == null ? '未接続' : `リンク ${port.link}`}。`});
      edge(key,entry,'work');
    });
    outs.forEach((port,index)=>{
      const key=add(`out:${port.key}`,port.name || port.key,port.links?.length ? `OUTPUT · ${port.key}` : 'OUTPUT · 未接続',1570,70+index*125,{kind:'output',portId:port.key});
      edge(exit,key,'work');
    });
    const runtimeBottom = Math.max(530,Math.max(ins.length,outs.length)*125+120);
    let rowY=runtimeBottom;
    const conditionTree = (condition, ref, depth, host)=>{
      const spec=typeof condition === 'object' && condition ? condition : {kind:condition || 'always'};
      const key=`${host}:condition:${ref.path.join('.')}`;
      const y=rowY; rowY+=120;
      const kind=String(spec.kind || 'always');
      add(key,kinds[kind] || kind,'未評価',580+depth*250,y,{kind:'condition',ref:{...ref,fingerprint:JSON.stringify(condition)},help:'条件参照です。表示用に受付判定を実行しないため、実行時の評価結果が記録されていない条件は「未評価」と表示します。'});
      const children=Array.isArray(spec.conditions) ? spec.conditions : Array.isArray(spec.children) ? spec.children : [];
      const childKey=Array.isArray(spec.conditions) ? 'conditions' : 'children';
      if(kind === 'all' || kind === 'any') children.forEach((child,i)=>{
        const id=conditionTree(child,{...ref,path:[...ref.path,childKey,i]},depth+1,host); edge(id,key,'condition');
      });
      if(kind === 'not' && (spec.condition || spec.child)){
        const field=spec.condition ? 'condition' : 'child';
        const id=conditionTree(spec[field],{...ref,path:[...ref.path,field]},depth+1,host); edge(id,key,'condition');
      }
      return key;
    };
    for(const [direction,rules] of [['input',inputs],['output',outputs]]){
      rules.forEach((rule,index)=>{
        const ref={direction,ruleId:String(rule.ruleId || ''),portId:direction === 'input' ? rule.fromPortId : null,path:[]};
        const key=`rule:${direction}:${rule.ruleId || index}`;
        const start=rowY;
        const group=String(rule.flowRuleId || '未設定');
        const used = !scripted && (simple || behavior === 'shuttle' || behavior === 'agv_route' || behavior === 'source' && direction === 'output' || behavior === 'sink' && direction === 'input');
        const conditionField=direction === 'input' ? 'acceptWhen' : 'releaseWhen';
        const condition=conditionTree(rule[conditionField],{...ref,path:[conditionField]},0,key);
        if(!used)model.nodes.filter(item=>item.key.startsWith(`${key}:condition:`)).forEach(item=>{
          item.detail='この実行方式では未使用';item.help='保存されている条件です。この専用ランタイムはこの条件を評価しません。未評価の条件を成立扱いにはしません。';
        });
        const title=`${direction === 'input' ? 'INPUT' : 'OUTPUT'} RULE ${index+1}`;
        const detail=direction === 'input' ? String(rule.fromPortId || '全入力') : (rule.toPortIds || [rule.toPortId]).filter(Boolean).join(', ');
        add(key,title,detail,270,start,{kind:'rule',ref,group,used,
          help:used ? `評価順 ${index+1} / Flow ${group}。同じ Flow 内のルールを優先順に照合します。Otherwise は通常対象の後の候補です。` : `保存された設定参照 / Flow ${group}。この実行方式はこのルールの対象・条件による選択を行いません。受付順・搬出先は上段の専用制御に従います。`});
        edge(condition,key,'condition');
        if(used){
          const runtimeTarget=direction==='input' ? entry : model.nodes.some(item=>item.key==='wait') ? 'wait' : exit;
          edge(key,runtimeTarget,'condition',{configuration:true});
        }
        const ids=direction === 'input' ? [rule.fromPortId] : rule.toPortIds || [rule.toPortId];
        ids.filter(Boolean).forEach(id=>{
          const target=`${direction === 'input' ? 'in' : 'out'}:${id}`;
          if(model.nodes.some(n=>n.key===target)) edge(target,key,'condition',{ configuration:true });
        });
        const prop=direction === 'input' ? 'processStages' : 'downStages';
        (rule[prop] || []).forEach((stage,i)=>{
          const stageKey=`${key}:stage:${stage.stageId || i}`;
          const firstPort=direction === 'input' ? ins[0]?.key : outs[0]?.key;
          const primaryRules=direction === 'input' ? inputs : outputs;
          const firstRule=primaryRules.find(candidate=>direction === 'input' ? candidate.fromPortId===firstPort : (candidate.toPortIds || [candidate.toPortId]).includes(firstPort));
          const timingUsed=!['source','sink'].includes(behavior) && (behavior !== 'carrier_route' || rule===firstRule || rule.flowRuleId && rule.flowRuleId===firstRule?.flowRuleId);
          add(stageKey,direction === 'input' ? 'Process' : 'Recovery',`${Number(stage.durationSec) || 0} s${timingUsed ? '' : ' · 未使用'}`,20,start+120+i*120,{
            kind:'timing',ref:{...ref,path:[prop],stageId:stage.stageId},group,
            help:`Flow ${group} の共有時間。${!timingUsed ? '保存値です。この実行方式の待機時間には使われません。' : behavior === 'carrier_route' ? '最初のポートの時間を、搬送コントローラ全体の共通時間として使用します。' : '同じ Flow に属する全ルールへ反映します。'}`
          }); edge(stageKey,key,'condition');
          const runtimeStage=direction==='input' ? 'process' : 'recovery';
          if(timingUsed && model.nodes.some(item=>item.key===runtimeStage))edge(stageKey,runtimeStage,'condition',{configuration:true});
        });
        rowY=Math.max(rowY,start+120+120*(rule[prop]?.length || 0))+65;
        model.rules.push({key,y:start,group,direction,order:index+1});
      });
    }
    // Dedicated controllers use scalar timers, not the equipment rule timers.
    if(node.type !== 'factory/basic' && ['carrier_route','agv_route'].includes(behavior)){
      for(const property of Object.keys(p).filter(key=>/^(processTime|downTime|interval)(\d+)?$/.test(key))){
        add(`property:${property}`,property,`${p[property]} s`,270,rowY,{kind:'property',ref:{property},help:'専用ランタイムの時間設定。搬送体設定による上書きがある場合は、そちらが優先されます。'}); rowY+=125;
      }
    }
    model.signature=JSON.stringify([behavior,p.inputRules,p.outputRules,p.script,p.scriptDisabled,p.strictIdMatch,p.processTime,p.downTime,ins,outs]);
    return model;
  }
  function resolve(node, ref){
    if(ref.property) return node.properties;
    const rules=node.properties?.[ref.direction === 'input' ? 'inputRules' : 'outputRules'] || [];
    const rule=rules.find(item=>String(item.ruleId) === ref.ruleId && (!ref.portId || item.fromPortId === ref.portId));
    if(!rule) throw new Error('編集対象のルールが変更されました。選択し直してください。');
    let value=rule;
    for(const part of ref.path || []) value=value?.[part];
    if(ref.stageId){
      value=(value || []).find(stage=>stage.stageId === ref.stageId);
      if(!value)throw new Error('時間ステージが変更されました。選択し直してください。');
    }
    if(ref.fingerprint !== undefined && JSON.stringify(value) !== ref.fingerprint) throw new Error('条件が更新されています。選択し直してください。');
    return value;
  }
  function commit(graph,nodeId,ref,value){
    if(root.isSimRunning?.()) throw new Error('実行中は設定を編集できません。');
    const node=graph.getNodeById(nodeId);
    if(!node) throw new Error('ノードが見つかりません。');
    if(ref.path?.length===1 && ['processStages','downStages'].includes(ref.path[0]) && !ref.stageId)throw new Error('安定したステージ ID がないため編集できません。');
    resolve(node,ref); // Stable node/rule/port/stage identity; reject stale condition paths.
    const property=ref.property || (ref.direction === 'input' ? 'inputRules' : 'outputRules');
    const next=ref.property ? value : copy(node.properties[property] || []);
    if(!ref.property){
      const rule=next.find(item=>String(item.ruleId)===ref.ruleId);
      if(ref.stageId){
        const stageProperty=ref.path[0];
        if(!Number.isFinite(Number(value)) || Number(value)<0) throw new Error('時間は 0 以上の数値にしてください。');
        next.filter(item=>item===rule || rule.flowRuleId && item.flowRuleId===rule.flowRuleId).forEach(item=>{
          for(const stage of item[stageProperty] || []) if(stage.stageId===ref.stageId) stage.durationSec=Number(value);
        });
      }else if(ref.path?.length){
        let parent=rule;
        for(const key of ref.path.slice(0,-1)) parent=parent[key];
        parent[ref.path.at(-1)]=copy(value);
      }else{
        // Targets may change, but the execution order and ports remain fixed.
        rule.targets=copy(value); rule.target=copy(value[0] || {mode:'otherwise'});
      }
    }
    root.flushHistory?.();
    graph.beforeChange?.();
    try{
      node.properties[property]=next;
      node.onPropertyChanged?.(property);
      if(['carrier_route','agv_route'].includes(runtime(node)) && ref.stageId){
        // Transport actions consume scalar timers materialized by configure, while
        // persistence uses port timings. Mirror the same normalized first-port
        // values on edit, so the next run and a JSON reload agree.
        const input=ports(node,'input')[0]?.key, output=ports(node,'output')[0]?.key;
        node.properties.processTime=Number(node.properties.portTimings?.inputs?.[input]?.processTimeSec) || 0;
        node.properties.downTime=Number(node.properties.portTimings?.outputs?.[output]?.downTimeSec) || 0;
      }
      graph.change?.();
    }finally{ graph.afterChange?.(); }
    root.flushHistory?.();
    node.setDirtyCanvas?.(true,true);
    return build(graph.getNodeById(nodeId));
  }
  App.FlowViewModel={build,runtime,status,resolve,commit,kinds};
})(typeof window === 'undefined' ? globalThis : window);
