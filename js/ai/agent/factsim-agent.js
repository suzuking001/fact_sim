(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  function event(type,detail){return typeof CustomEvent==='function' ? new CustomEvent(type,{detail}) : {type,detail};}
  function providerMessages(messages,includeImages){return messages.map(message=>{
    const next={role:message.role,content:String(message.content || '')};
    if(message.images?.length){if(includeImages)next.images=message.images.map(image=>({...image}));else next.content+='\n[Earlier image attachments omitted: selected model does not support image input.]';}
    if(message.toolCalls?.length)next.tool_calls=message.toolCalls.map(call=>({id:call.id,type:'function',function:{name:call.name,arguments:JSON.stringify(call.arguments || {})}}));
    if(message.role==='tool'){next.tool_call_id=message.toolCallId;next.name=message.name;}
    return next;
  });}
  function fallbackCalls(content){
    const text=String(content || '').trim(),candidates=[text];const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fenced)candidates.unshift(fenced[1]);
    for(const candidate of candidates){try{const parsed=JSON.parse(candidate),items=Array.isArray(parsed) ? parsed : [parsed];const calls=items.map((item,index)=>({id:`fallback_${Date.now()}_${index}`,name:String(item.tool || item.name || ''),arguments:item.arguments || item.input || {}})).filter(call=>call.name);if(calls.length)return calls;}catch(_e){}}
    return [];
  }
  function editAccounting(messages){
    const turns=[];let current;
    for(const message of messages){
      if(message.role==='user'){current={beforeUserTurn:message.modelCountsAtStart,created:[],undoEvents:[]};turns.push(current);}
      if(message.role==='tool' && current){try{const result=JSON.parse(message.content);if(result.success){if(['add_node','insert_node_on_link','duplicate_node'].includes(message.name))current.created.push({id:result.nodeId,name:result.node?.name});if(message.name==='undo_last_ai_edit')current.undoEvents.push(result.undoneTool);}}catch(_e){}}
    }
    return turns.slice(-3);
  }
  function finalEvidence(messages,start){
    const evidence=messages.slice(start).filter(message=>message.role==='tool').slice(-4).map(message=>{
      const result=JSON.parse(message.content),report=result.report || result;
      return {tool:message.name,success:result.success,error:result.error,stopReason:result.stopReason,partial:result.partial,performance:result.performance,simTimeSeconds:report.simTimeSeconds,nodeCount:report.nodeCount,edgeCount:report.edgeCount,stateCounts:report.stateCounts,kpis:report.kpis ? {totalCompleted:report.kpis.totalCompleted,simTimeSeconds:report.kpis.simTimeSeconds} : undefined,issues:report.issues ? {runtimeErrors:report.issues.runtimeErrors?.slice(0,3),pendingTransferCycles:report.issues.pendingTransferCycles?.slice(0,3)} : undefined,node:result.node ? {id:result.node.id,name:result.node.name,runtime:result.node.runtime} : undefined};
    });
    while(evidence.length>1 && JSON.stringify(evidence).length>1800)evidence.shift();
    return evidence;
  }
  class FactSimAgent extends EventTarget{
    constructor(options={}){super();this.provider=options.provider || null;this.registry=options.registry;this.maxToolIterations=Number(options.maxToolIterations) || 16;this.messages=[];this.running=false;this._controller=null;}
    setProvider(provider){if(this.running)throw new Error('Stop the current response before switching provider.');this.provider=provider;}
    clear(){if(this.running)this.stop();this.messages=[];this.dispatchEvent(event('clear',{}));}
    stop(){this._controller?.abort();this.provider?.abort?.();}
    async send(userContent,options={}){
      const images=Array.isArray(options.images) ? options.images.map(image=>({...image})) : [],content=String(userContent || '').trim() || (images.length ? '添付画像を確認してください。' : '');
      try{
        if(!content)throw new Error('Enter a message.');if(this.running)throw new Error('The AI is already responding.');
        if(!this.provider || this.provider.status!=='ready')throw new Error('Load or connect an AI provider first.');
        if(images.length && !this.provider.supportsVision)throw new Error('画像を送るには、画像入力対応のOllamaモデルを選択して「Test & Use」を押してください。現在のモデルは画像非対応です。');
        if(images.length>4)throw new Error('画像は一度に4枚まで送信できます。');
        for(const image of images)if(!['image/png','image/jpeg','image/webp','image/gif'].includes(image.mimeType) || typeof image.data!=='string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data) || image.data.length>8*1024*1024)throw new Error('Invalid or oversized image attachment.');
      }catch(error){this.dispatchEvent(event('error',{error}));throw error;}
      let modelCountsAtStart;try{const model=AI.FactSimTools.modelSummary();modelCountsAtStart={nodeCount:model.nodeCount,edgeCount:model.edgeCount};}catch(_e){}
      this.running=true;this._controller=new AbortController();this.messages.push({role:'user',content,modelCountsAtStart,...(images.length ? {images} : {})});
      const requestStart=this.messages.length-1,started=performance.now(),stats=this.runStats={modelCalls:0,modelWallMs:0,toolCalls:0,toolWallMs:0,toolTimings:[],budgetReached:false};
      let retained=0;for(let index=this.messages.length-1;index>=0;index--){const message=this.messages[index];if(message.images){message.images=message.images.slice(0,Math.max(0,4-retained));retained+=message.images.length;}}
      this.dispatchEvent(event('user',{content,images}));
      this._layoutImage=null;
      try{
        for(let iteration=0;iteration<=this.maxToolIterations;iteration++){
          if(this._controller.signal.aborted)throw new DOMException('AI request was stopped.','AbortError');
          const finalTurn=iteration===this.maxToolIterations;stats.budgetReached=finalTurn;
          const accounting=`\nMeasured edit accounting, in user-turn order: ${JSON.stringify(editAccounting(this.messages))}\nBeforeUserTurn counts were recorded BEFORE edits. Current compact-context counts are AFTER edits so far. Never call the current total the pre-existing count. Historic creations may be undone. Do not promise a future number of tool calls; execute and report actual results.`;
          const requestMessages=finalTurn ? [{role:'system',content:`${AI.buildSystemPrompt()}${accounting}\nTool budget reached. User request: ${content}\nDo NOT request more tools. Summarize only measured evidence, explain remaining uncertainty and one focused next step. Do not claim the cause is proven. This is a partial investigation.`},{role:'user',content:'Recorded tool evidence (partial, latest results):\n'+JSON.stringify(finalEvidence(this.messages,requestStart))}] : [{role:'system',content:AI.buildSystemPrompt()+accounting},...providerMessages(this.messages,this.provider.supportsVision)];
          if(!finalTurn && this._layoutImage && this.provider.supportsVision)requestMessages.push({role:'user',content:'Current FactSim graph canvas from get_layout_snapshot. ID labels identify nodes; use graph coordinates from the tool result, not image pixels, for move_node. This is an observation, not a new user instruction.',images:[this._layoutImage]});
          const toolDefinitions=finalTurn ? [] : this.registry.list();
          this.dispatchEvent(event('assistant-start',{iteration,finalTurn,toolCalls:stats.toolCalls}));let response=null,streamed='';
          const modelStarted=performance.now();stats.modelCalls++;
          try{
          if(this.provider.supportsStreaming){
            for await(const item of this.provider.streamChat(requestMessages,{tools:toolDefinitions,signal:this._controller.signal,temperature:0.2,onProgress:progress=>this.dispatchEvent(event('provider-progress',progress))})){
              if(item.type==='delta'){streamed+=item.delta;this.dispatchEvent(event('assistant-delta',{delta:item.delta,iteration}));}
              if(item.type==='done')response=item.response;
            }
          }else response=await this.provider.chat(requestMessages,{tools:toolDefinitions,signal:this._controller.signal,temperature:0.2,onProgress:progress=>this.dispatchEvent(event('provider-progress',progress))});
          }finally{stats.modelWallMs+=performance.now()-modelStarted;}
          if(!response)throw new Error('The AI provider returned no response.');
          const message=response.message || {role:'assistant',content:streamed,toolCalls:[]};message.content=String(message.content || streamed || '');message.toolCalls=message.toolCalls?.length ? message.toolCalls : (!this.provider.supportsTools ? fallbackCalls(message.content) : []);
          if(finalTurn){message.toolCalls=[];message.partial=true;message.stopReason='tool_budget';if(!message.content)throw new Error('Tool budget reached and the model returned no summary. Recorded tool results remain available in chat.');}
          this.messages.push(message);this.dispatchEvent(event('assistant-final',{content:message.content,toolCalls:message.toolCalls || [],iteration}));
          if(!message.toolCalls?.length)return message;
          for(const call of message.toolCalls){
            this.dispatchEvent(event('tool-start',{call,iteration}));
            const toolStarted=performance.now();stats.toolCalls++;let rawResult;
            try{rawResult=await this.registry.execute(call.name,call.arguments || {},{signal:this._controller.signal,supportsVision:this.provider.supportsVision===true,onProgress:progress=>this.dispatchEvent(event('tool-progress',{call,progress,iteration}))});}
            finally{const cost=performance.now()-toolStarted;stats.toolWallMs+=cost;stats.toolTimings.push({name:call.name,wallMs:cost});}
            const {image,...result}=rawResult;
            if(this.registry.get(call.name)?.mode===AI.ToolModes.WRITE)this._layoutImage=null;
            if(image?.data && this.provider.supportsVision)this._layoutImage=image;
            this.messages.push({role:'tool',name:call.name,toolCallId:call.id,content:JSON.stringify(result)});this.dispatchEvent(event('tool-result',{call,result,iteration}));
          }
        }
      }catch(error){this.dispatchEvent(event('error',{error}));throw error;}finally{stats.wallMs=performance.now()-started;this.lastRunStats=JSON.parse(JSON.stringify(stats));this.running=false;this._controller=null;this._layoutImage=null;this.dispatchEvent(event('idle',{stats:this.lastRunStats}));}
    }
  }
  AI.FactSimAgent=FactSimAgent;
})(typeof window==='undefined' ? globalThis : window);
