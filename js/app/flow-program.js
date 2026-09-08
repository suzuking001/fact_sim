/* Opt-in, token-driven equipment flow. Legacy runtimes remain unchanged. */
(function(root){
  'use strict';
  const App=root.App=root.App || {};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const definitions={
    start:{label:'START',inputs:[],outputs:['next']},
    input:{label:'INPUT',inputs:['step'],outputs:['next']},
    process:{label:'Process',inputs:['step'],outputs:['next']},
    output:{label:'OUTPUT',inputs:['step'],outputs:['next']},
    recovery:{label:'Recovery',inputs:['step'],outputs:['next']},
    wait:{label:'条件待ち',inputs:['step','condition'],outputs:['next']},
    branch:{label:'条件分岐',inputs:['step','condition'],outputs:['true','false']},
    parallel:{label:'並列開始',inputs:['step'],outputs:['1','2','3','4']},
    join:{label:'全経路待ち AND',inputs:['step','step','step','step'],outputs:['next']},
    merge:{label:'合流 OR',inputs:['step','step','step','step'],outputs:['next']},
    create:{label:'ワーク生成',inputs:['step'],outputs:['next']},
    destroy:{label:'ワーク消滅',inputs:['step'],outputs:['next']},
    duplicate:{label:'ワーク複製',inputs:['step'],outputs:['next']},
    match:{label:'ID照合・ワーク統合',inputs:['step'],outputs:['next']},
    end:{label:'END / 次のサイクル',inputs:['step'],outputs:[]},
    test:{label:'条件',inputs:[],outputs:['condition']},
    and:{label:'AND',inputs:['condition','condition','condition','condition'],outputs:['condition']},
    or:{label:'OR',inputs:['condition','condition','condition','condition'],outputs:['condition']},
    not:{label:'NOT',inputs:['condition'],outputs:['condition']}
  };
  const predicates=new Set(['test','and','or','not']);
  const enabled=node=>node?.properties?.flowProgram?.enabled===true;
  const portRows=(node,direction)=>(node[direction==='input' ? 'inputs' : 'outputs'] || []).filter(port=>port.channel!=='signal' && !/^sig(In|Out)/.test(port.name || ''));
  function validate(program,node){
    const errors=[];
    if(program?.version!==1 || !Array.isArray(program.nodes) || !Array.isArray(program.links))return ['Flow の形式が不正です。'];
    if(program.nodes.length>256 || program.links.length>1024)return ['Flow が大きすぎます（256 ノード / 1024 接続まで）。'];
    const nodes=new Map();
    for(const item of program.nodes){
      if(!Number.isInteger(item.id) || nodes.has(item.id))errors.push('ノード ID が不正・重複しています。');
      nodes.set(item.id,item);
      if(!definitions[item.kind])errors.push(`#${item.id}: 未対応のノードです。`);
      if(['process','recovery'].includes(item.kind) && (!Number.isFinite(item.config?.seconds) || item.config.seconds<0))errors.push(`#${item.id}: 時間は 0 以上にしてください。`);
      if(['input','output'].includes(item.kind) && !portRows(node,item.kind).some(port=>port.portId===item.config?.portId))errors.push(`#${item.id}: ${item.kind.toUpperCase()} ポートを選択してください。`);
      if(item.kind==='create' && !node.graph?.__factSimTypeRegistry?.get?.(item.config?.typeId))errors.push(`#${item.id}: 生成するワーク種別を選択してください。`);
      if(item.kind==='duplicate' && (!Number.isInteger(item.config?.count) || item.config.count<2 || item.config.count>100))errors.push(`#${item.id}: 複製数は 2〜100 にしてください。`);
      if(item.kind==='test' && !['always','available','type','attribute','count','ids-match','empty','full'].includes(item.config?.test))errors.push(`#${item.id}: 条件を選択してください。`);
    }
    const occupied=new Set(),outgoing=new Set();
    for(const link of program.links){
      const from=nodes.get(link.from),to=nodes.get(link.to),output=definitions[from?.kind]?.outputs[link.output],input=definitions[to?.kind]?.inputs[link.input];
      if(!output || !input || (output==='condition')!==(input==='condition')){errors.push('接続の種類または接続口が不正です。');continue;}
      const key=`${link.to}:${link.input}`;if(occupied.has(key))errors.push('同じ入力口への複数接続はできません。');occupied.add(key);
      const outKey=`${link.from}:${link.output}`;
      if(output!=='condition' && outgoing.has(outKey))errors.push(`#${link.from}: 実行線の分岐には「並列開始」を使ってください。`);
      outgoing.add(outKey);
    }
    const starts=program.nodes.filter(item=>item.kind==='start');
    if(starts.length!==1)errors.push('START は 1 つ必要です。');
    if(!program.nodes.some(item=>item.kind==='end'))errors.push('END が必要です。');
    for(const item of program.nodes){
      const def=definitions[item.kind];if(!def)continue;
      const inputs=program.links.filter(link=>link.to===item.id);
      const outputs=program.links.filter(link=>link.from===item.id);
      if(item.kind!=='start' && item.kind!=='test' && !inputs.length)errors.push(`#${item.id}: 入力が未接続です。`);
      if(item.kind!=='end' && !outputs.length)errors.push(`#${item.id}: 出力が未接続です。`);
      if(['wait','branch'].includes(item.kind) && !inputs.some(link=>link.input===1))errors.push(`#${item.id}: 条件を接続してください。`);
      if(item.kind==='branch' && ![0,1].every(slot=>outputs.some(link=>link.output===slot)))errors.push(`#${item.id}: true / false の両方を接続してください。`);
      if(['and','or','join','parallel'].includes(item.kind) && (item.kind==='parallel' ? outputs : inputs).length<2)errors.push(`#${item.id}: 2 本以上の接続が必要です。`);
    }
    // Reject predicate recursion and cycles that cannot yield to the simulator.
    const walk=(id,path,done)=>{
      if(path.has(id)){errors.push(`#${id}: 待機のない循環があります。`);return;}
      if(done.has(id))return;done.add(id);
      const item=nodes.get(id);if(!item)return;
      if(['input','output','end'].includes(item.kind) || ['process','recovery'].includes(item.kind) && item.config.seconds>0)return;
      const next=new Set(path);next.add(id);
      program.links.filter(link=>link.from===id).forEach(link=>walk(link.to,next,done));
    };
    for(const item of program.nodes)walk(item.id,new Set(),new Set());
    const reachable=new Set();
    const visit=id=>{if(reachable.has(id))return;reachable.add(id);program.links.filter(link=>link.from===id && !predicates.has(nodes.get(id)?.kind)).forEach(link=>visit(link.to));};
    if(starts[0])visit(starts[0].id);
    for(const item of program.nodes)if(!predicates.has(item.kind) && !reachable.has(item.id))errors.push(`#${item.id}: START から到達できません。`);
    return [...new Set(errors)];
  }
  function template(node){
    const input=portRows(node,'input')[0],output=portRows(node,'output')[0];
    const type=node.graph?.__factSimTypeRegistry?.list?.()?.[0];
    const steps=[{kind:'start',config:{}}, input ? {kind:'input',config:{portId:input.portId,typeId:''}} : {kind:'create',config:{typeId:type?.typeId || ''}},
      {kind:'process',config:{seconds:Number(node.properties.inputRules?.[0]?.processStages?.[0]?.durationSec) || 0}},
      output ? {kind:'output',config:{portId:output.portId}} : {kind:'destroy',config:{}},
      {kind:'recovery',config:{seconds:Number(node.properties.outputRules?.[0]?.downStages?.[0]?.durationSec) || 0}},{kind:'end',config:{}}];
    return {version:1,enabled:true,nodes:steps.map((item,index)=>({...item,id:index+1,pos:[80+index*420,100]})),links:steps.slice(1).map((_,index)=>({from:index+1,output:0,to:index+2,input:0}))};
  }
  function reset(node){
    const p=node.properties.flowProgram;
    node._flowRun={program:p,tasks:[{id:(Array.isArray(p.nodes) ? p.nodes : []).find(item=>item.kind==='start')?.id}],works:[],offers:[],joins:new Map(),last:new Map(),completed:0,cycle:0,nextAt:0,error:null};
    node._payload=null;node._currentWork=null;node._state='IDLE';node._stateName='flow_idle';node._until=0;
    node._lastInRefs=[];
    const errors=validate(p,node);if(errors.length)node._flowRun.error=errors.join(' ');
    return node._flowRun;
  }
  function predicate(node,run,id,seen=new Set()){
    if(seen.has(id))return false;seen=new Set(seen);seen.add(id);
    const item=run.program.nodes.find(item=>item.id===id);if(!item)return false;
    const refs=run.program.links.filter(link=>link.to===id).sort((a,b)=>a.input-b.input);
    const results=()=>refs.map(link=>predicate(node,run,link.from,seen));
    if(item.kind==='and')return refs.length>0 && results().every(Boolean);
    if(item.kind==='or')return results().some(Boolean);
    if(item.kind==='not')return refs.length===1 && !predicate(node,run,refs[0].from,seen);
    const c=item.config || {},work=run.works[0];
    if(c.test==='always')return true;
    if(c.test==='available')return !!work;
    if(c.test==='empty')return !run.works.length;
    if(c.test==='full')return run.works.length>=Math.max(1,Number(node.properties.contentCapacity) || 1);
    if(c.test==='count')return run.works.length>=Math.max(0,Number(c.value) || 0);
    if(c.test==='ids-match')return run.works.length>1 && run.works.every(value=>value.id===work.id);
    if(c.test==='type')return !!work && work.typeId===c.typeId;
    if(c.test==='attribute'){
      let actual=work?.attributes || work;for(const key of String(c.path || '').split('.').filter(Boolean))actual=actual?.[key];
      if(!work || actual===undefined)return false;
      switch(c.operator){case 'ne':return actual!==c.value;case 'gt':return actual>c.value;case 'gte':return actual>=c.value;case 'lt':return actual<c.value;case 'lte':return actual<=c.value;case 'contains':return String(actual).includes(String(c.value));default:return actual===c.value;}
    }
    return false;
  }
  function acceptable(node,slot,work){
    if(!enabled(node))return false;
    const program=node.properties.flowProgram,run=node._flowRun;
    if(!Array.isArray(program.nodes) || !Array.isArray(program.links))return false;
    if(run?.error)return false;
    const visited=new Set();
    const frontier=id=>{
      if(visited.has(id))return false;visited.add(id);
      const item=program.nodes.find(item=>item.id===id);if(!item)return false;
      if(item.kind==='input')return node.inputs?.[slot]?.portId===item.config.portId && (!item.config.typeId || work?.typeId===item.config.typeId) && (!work || run?.last.get(slot)!==work);
      if(!['start','parallel','merge'].includes(item.kind))return false;
      return program.links.filter(link=>link.from===id).some(link=>frontier(link.to));
    };
    return (run?.tasks || [{id:program.nodes.find(item=>item.kind==='start')?.id}]).some(task=>frontier(task.id));
  }
  function bind(node){
    if(!enabled(node))return;
    const remember=name=>{node._flowOriginalMethods=node._flowOriginalMethods || new Map();if(!node._flowOriginalMethods.has(name))node._flowOriginalMethods.set(name,Object.getOwnPropertyDescriptor(node,name));};
    for(const name of ['canAcceptWorkInput','canAcceptEntityInput','canAcceptPalletInput','canAcceptAgv']){
      if(!node[name]?.__flowMethod){
        remember(name);
        const fn=function(slot,work){return acceptable(this,slot,work);};fn.__flowMethod=true;node[name]=fn;
      }
    }
    const ack=function(work,target,slot){for(const offer of this._flowRun?.offers || [])if(offer.work===work && offer.slot===slot)offer.pending.delete(target);};
    if(!node.acknowledgeEntityOutput?.__flowMethod){remember('acknowledgeEntityOutput');ack.__flowMethod=true;node.acknowledgeEntityOutput=ack;}
  }
  function execute(node){
    bind(node);
    const program=node.properties.flowProgram;
    let run=node._flowRun;
    if(!run || run.program!==program || root.simNow()<(run.lastNow || 0)){
      run=reset(node);const errors=validate(program,node);if(errors.length)run.error=errors.join(' ');
    }
    if(run.error){node._state='ERROR';node._stateName='flow_error';return;}
    const now=root.simNow();
    run.lastNow=now;
    if(!run.tasks.length){
      if(now<run.nextAt)return;
      if(run.works.length){run.error='END に未搬出ワークが残っています。OUTPUT またはワーク消滅を接続してください。';return;}
      run.tasks=[{id:program.nodes.find(item=>item.kind==='start').id}];run.cycle++;
    }
    const advance=(task,output=0)=>{
      const links=program.links.filter(link=>link.from===task.id && link.output===output);
      run.tasks=run.tasks.filter(item=>item!==task);
      links.forEach(link=>run.tasks.push({id:link.to,arrival:`${link.from}:${link.output}:${link.input}`}));
    };
    let progress=true,budget=512;
    while(progress && budget-->0){
      progress=false;
      for(const task of run.tasks.slice()){
        if(!run.tasks.includes(task))continue;
        const item=program.nodes.find(item=>item.id===task.id);if(!item){run.error='接続先がありません。';break;}
        const c=item.config || {};
        if(item.kind==='start' || item.kind==='merge'){advance(task);progress=true;}
        else if(item.kind==='input'){
          const slot=node.inputs.findIndex(port=>port.portId===c.portId),work=node.getInputData(slot);
          if(!work){run.last.delete(slot);continue;}
          if(run.last.get(slot)===work || c.typeId && work.typeId!==c.typeId)continue;
          run.last.set(slot,work);run.works.push(work);
          node._lastInRefs=node._lastInRefs || [];node._lastInRefs[slot]=work;
          // Acknowledge immediately while the accepted object is still visible.
          const link=node.graph.links[node.inputs[slot].link];node.graph.getNodeById(link.origin_id)?.acknowledgeEntityOutput?.(work,node.id,link.origin_slot);
          advance(task);progress=true;
        }else if(item.kind==='process' || item.kind==='recovery'){
          if(task.until===undefined)task.until=now+c.seconds*1000;
          if(now>=task.until){advance(task);progress=true;}
        }else if(item.kind==='wait' || item.kind==='branch'){
          const condition=program.links.find(link=>link.to===item.id && link.input===1);
          const result=!!condition && predicate(node,run,condition.from);
          if(result || item.kind==='branch'){advance(task,result ? 0 : 1);progress=true;}
        }else if(item.kind==='parallel'){
          run.tasks=run.tasks.filter(entry=>entry!==task);
          program.links.filter(link=>link.from===item.id).forEach(link=>run.tasks.push({id:link.to,arrival:`${link.from}:${link.output}:${link.input}`}));progress=true;
        }else if(item.kind==='join'){
          const joined=run.joins.get(item.id) || new Map();joined.set(task.arrival,task);run.joins.set(item.id,joined);
          const needed=program.links.filter(link=>link.to===item.id).length;
          if(joined.size===needed){run.tasks=run.tasks.filter(entry=>!Array.from(joined.values()).includes(entry) || entry===task);run.joins.delete(item.id);advance(task);progress=true;}
        }else if(item.kind==='output'){
          const slot=node.outputs.findIndex(port=>port.portId===c.portId);
          if(!task.offer){
            if(run.offers.some(offer=>offer.slot===slot))continue;
            const work=run.works[0],links=(node.outputs[slot]?.links || []).map(id=>node.graph.links[id]).filter(Boolean);
            if(!work || !links.length)continue;
            if(!links.every(link=>{const target=node.graph.getNodeById(link.target_id);return typeof target?.canAcceptWorkInput==='function' ? target.canAcceptWorkInput(link.target_slot,work) : target?._state==='IDLE';}))continue;
            task.offer={slot,work:run.works.shift(),pending:new Set(links.map(link=>link.target_id)),at:now};run.offers.push(task.offer);
          }
          node.setOutputData(slot,task.offer.work);
          if(!task.offer.pending.size && now>task.offer.at){node.setOutputData(slot,null);run.offers=run.offers.filter(offer=>offer!==task.offer);advance(task);progress=true;}
        }else if(item.kind==='create'){
          const type=node.graph.__factSimTypeRegistry.get(c.typeId);node._counter=(node._counter || 0)+1;
          const work=new root.Work(node._counter,type.name,type.typeId);work.attributes=clone(type.defaultAttributes || {});
          run.works.push(work);advance(task);progress=true;
        }else if(item.kind==='destroy'){
          if(!run.works.length)continue;
          const work=run.works.shift();node._recv=node._recv || [];node._recv.push(work);run.completed++;advance(task);progress=true;
        }else if(item.kind==='duplicate'){
          if(!run.works.length)continue;
          const work=run.works[0];for(let i=1;i<c.count;i++)run.works.push(clone(work));advance(task);progress=true;
        }else if(item.kind==='match'){
          if(run.works.length<2)continue;
          if(!run.works.every(work=>work.id===run.works[0].id)){run.error='ワーク ID が一致しません。';break;}
          run.works.splice(1);advance(task);progress=true;
        }else if(item.kind==='end'){run.tasks=run.tasks.filter(entry=>entry!==task);run.nextAt=now+0.001;progress=true;}
        if(run.works.length>1024){run.error='サイクル内のワーク数が上限を超えました。';break;}
      }
      if(run.error)break;
    }
    if(budget<=0)run.error='同一時刻の実行回数を超えました。循環を確認してください。';
    const active=run.tasks.map(task=>program.nodes.find(item=>item.id===task.id));
    node._state=run.error ? 'ERROR' : active.some(item=>item.kind==='process') ? 'PROCESS' : active.some(item=>item.kind==='recovery') ? 'DOWN' : active.some(item=>['output','wait','join'].includes(item.kind)) ? 'WAIT' : 'IDLE';
    node._stateName=`flow_${node._state.toLowerCase()}`;node._until=Math.max(now,...run.tasks.map(task=>task.until || now));
    node._payload=run.works[0] || null;node._currentWork=node._payload;
    root.applyNodeStateTheme?.(node,node._state);
  }
  const proto=root.BasicNode.prototype;
  const previousExecute=proto.onExecute,previousConfigure=proto._configureActionRuntime,previousChange=proto.onPropertyChanged,previousDraw=proto.onDrawForeground;
  const previousRoots=proto.getEntityRoots;
  proto.getEntityRoots=function(){return enabled(this) ? Array.from(new Set([...(this._flowRun?.works || []),...(this._flowRun?.offers || []).map(offer=>offer.work)])) : previousRoots.call(this);};
  proto.onExecute=function(){if(enabled(this))return execute(this);return previousExecute.call(this);};
  proto._configureActionRuntime=function(...args){
    for(const [name,descriptor] of this._flowOriginalMethods || []){if(descriptor)Object.defineProperty(this,name,descriptor);else delete this[name];}
    delete this._flowOriginalMethods;
    const result=previousConfigure.apply(this,args);bind(this);return result;
  };
  proto.onPropertyChanged=function(name,...args){
    const result=previousChange.call(this,name,...args);
    if(name==='flowProgram'){
      delete this._flowRun;
      this._configureActionRuntime({inputs:this.inputs,outputs:this.outputs});
      if(enabled(this))reset(this);
    }
    return result;
  };
  proto.onDrawForeground=function(ctx){
    if(!enabled(this))return previousDraw.call(this,ctx);
    root.drawStateBelow?.(ctx,this,[`Flow: ${this._state || 'IDLE'}`,`Work: ${this._flowRun?.works.length || 0}`,this._flowRun?.error || 'Engine: dt (Flow)'],8,6);
  };
  // Compiled kernels do not execute arbitrary flow programs. Use the proven dt
  // runner for the whole graph, including its legacy equipment and handshakes.
  const hasProgram=graph=>(graph?._nodes || graph?.nodes || []).some(enabled);
  function runtimeGraph(value){
    if(typeof value?.runStep==='function')return value;
    const graph=new root.LGraph();graph.configure(clone(value));App.restoreEntityModel?.(graph,value,true);App.repairGraphLinks?.(graph);root.configureGraphClock?.(graph);return graph;
  }
  const createEngine=App.createSimEngine;
  App.createSimEngine=function(mode,graph,...args){
    const fallback=hasProgram(graph);const engine=createEngine.call(this,fallback ? 'dt' : mode,fallback ? runtimeGraph(graph) : graph,...args);
    if(fallback)engine.runtimeMode='fallback-flow-dt';return engine;
  };
  const createHeadless=App.createHeadlessSimRunner;
  if(createHeadless)App.createHeadlessSimRunner=function(mode,graph,...args){return createHeadless.call(this,hasProgram(graph) ? 'dt' : mode,graph,...args);};
  App.FlowProgram={definitions,predicates,validate,template,enabled,reset,bind,execute,clone};
})(window);
