(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  const DEFAULT_MODULE_URL='https://esm.run/@mlc-ai/web-llm@0.2.85';
  const isContextError=error=>/context window size|ContextWindowSizeExceededError/i.test(String(error?.message || error));
  function compactResult(content,limit){
    if(content.length<=limit)return content;
    try{
      const result=JSON.parse(content);
      if(result.issues || result.report?.issues){
        const measured=result.report || result;
        const summary={success:result.success,source:result.source,partial:result.partial,stopReason:result.stopReason,error:result.error,performance:result.performance,advancedSeconds:result.advancedSeconds,simTimeSeconds:measured.simTimeSeconds,nodeCount:measured.nodeCount,edgeCount:measured.edgeCount,stateCounts:measured.stateCounts,totalCompleted:measured.kpis?.totalCompleted,runtimeTotals:measured.runtimeTotals,issues:{runtimeErrors:measured.issues.runtimeErrors.slice(0,2),pendingTransferCycles:measured.issues.pendingTransferCycles.slice(0,2)},suspectCount:measured.suspectCount,suspects:measured.suspects.slice(0,2).map(({id,state,pendingNodeIds,error,nextTimedSeconds})=>({id,state,pendingNodeIds,error,nextTimedSeconds})),contextTruncated:true,note:'Partial snapshot. WAIT/cycles are not proven deadlock. Use get_nodes for suspect IDs; graph omitted for context.'};
        while(summary.suspects.length && JSON.stringify(summary).length>limit)summary.suspects.pop();
        if(JSON.stringify(summary).length>limit){delete summary.runtimeTotals;delete summary.stateCounts;delete summary.note;}
        if(JSON.stringify(summary).length>limit)return JSON.stringify({success:result.success,partial:result.partial,stopReason:result.stopReason,performance:result.performance,simTimeSeconds:measured.simTimeSeconds,nodeCount:measured.nodeCount,edgeCount:measured.edgeCount,totalCompleted:measured.kpis?.totalCompleted,errorCount:measured.issues.runtimeErrors.length,pendingCycleCount:measured.issues.pendingTransferCycles.length,suspectIds:measured.suspects.slice(0,4).map(node=>node.id),contextTruncated:true,note:'Details omitted. Suspicions are not proof; get_nodes for these IDs.'});
        return JSON.stringify(summary);
      }
      if(result.viewport && Array.isArray(result.nodes) && Array.isArray(result.overlaps)){
        const overlaps=result.overlaps.slice(0,limit>1000 ? 2 : 1),ids=new Set(overlaps.flatMap(pair=>pair.nodeIds));
        const prioritized=[...result.nodes.filter(node=>ids.has(node.id)),...result.nodes.filter(node=>!ids.has(node.id))];
        const summary={success:result.success,source:'FactSim geometry (not an image)',scope:result.scope,viewport:result.viewport,nodeCount:result.nodeCount,overlapPairCount:result.overlapPairCount,overlaps,nodes:prioritized.slice(0,limit>1000 ? 4 : 2).map(({id,name,position,bounds})=>({id,name,position,bounds})),contextTruncated:true,note:'Partial geometry. Use get_node for omitted nodes.'};
        while(summary.nodes.length>1 && JSON.stringify(summary).length>limit)summary.nodes.pop();
        return JSON.stringify(summary);
      }
      function shrink(value,depth=0){
        if(Array.isArray(value)){const kept=value.slice(0,4).map(item=>shrink(item,depth+1));return value.length>4 ? {items:kept,totalCount:value.length,truncated:true} : kept;}
        if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,depth>4 ? '[omitted]' : shrink(item,depth+1)]));
        return typeof value==='string' && value.length>300 ? value.slice(0,300)+' [truncated]' : value;
      }
      const compact=JSON.stringify({...shrink(result),contextTruncated:true});
      if(compact.length<=limit)return compact;
      return JSON.stringify({success:result.success,error:result.error,contextTruncated:true,note:'Detailed result omitted to fit model context. Request a specific node or KPI.',totalCompleted:result.totalCompleted,simTimeSeconds:result.simTimeSeconds,nodeId:result.nodeId,parameter:result.parameter,previousValue:result.previousValue,newValue:result.newValue});
    }catch(_e){return JSON.stringify({contextTruncated:true,note:'Oversized tool result omitted.'});}
  }
  function boundedMessages(messages,retry){
    const copy=JSON.parse(JSON.stringify(messages));
    const systems=copy.filter(message=>message.role==='system').map(message=>({
      ...message,content:AI.SYSTEM_PROMPT && AI.WEBLLM_SYSTEM_PROMPT && message.content.startsWith(AI.SYSTEM_PROMPT)
        ? AI.WEBLLM_SYSTEM_PROMPT+message.content.slice(AI.SYSTEM_PROMPT.length) : message.content
    }));
    // Keep the latest user turn; old tool results can otherwise fill a 4k model.
    let userIndex=-1;for(let i=0;i<copy.length;i++)if(copy[i].role==='user')userIndex=i;
    // Preserve complete recent turns for references such as "make that 45 s".
    // Remove old turns only when the serialized input exceeds our soft budget.
    let start=copy.findIndex(message=>message.role==='user');start=Math.max(0,start);
    const size=value=>new TextEncoder().encode(JSON.stringify(value)).length;
    while(start<userIndex && size(copy.slice(start))>6000){
      const next=copy.findIndex((message,index)=>index>start && message.role==='user');
      if(next<0)break;start=next;
    }
    let turn=copy.slice(start).filter(message=>message.role!=='system');
    if(retry){
      turn=copy.slice(Math.max(0,userIndex)).filter(message=>message.role!=='system');
      let lastCall=-1;for(let i=1;i<turn.length;i++)if(turn[i].role==='assistant' && turn[i].tool_calls?.length)lastCall=i;
      if(lastCall>1)turn=[turn[0],...turn.slice(lastCall)];
    }
    for(const message of turn){
      if(message.role==='tool')message.content=compactResult(String(message.content || ''),retry ? 800 : 1800);
      // Tool-call arguments remain untouched; only human/assistant prose is bounded.
      else if(!message.tool_calls && String(message.content || '').length>2000)message.content=String(message.content).slice(0,2000)+'\n[Message truncated to fit model context]';
    }
    return [...systems,...turn];
  }
  function toolProtocol(tools){
    // Remove duplicate prose, but preserve every tool and schema constraint.
    function schema(value){
      if(Array.isArray(value))return value.map(schema);
      if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='description').map(([key,item])=>[key,key==='properties' ? Object.fromEntries(Object.entries(item).map(([name,property])=>[name,schema(property)])) : schema(item)]));
      return value;
    }
    const definitions=tools.map(tool=>({name:tool.name,input:schema(tool.inputSchema)}));
    return `\nRespond with one JSON object: {"reply":"your natural conversational answer","tool_calls":[]}.
Keep reply concise (2-4 sentences). For greetings, general questions, design discussion, or clarifications, answer in reply and leave tool_calls empty. For a requested FactSim operation or model facts, use tool_calls entries {"name":"registered tool name","arguments":{...}}. Never fabricate tool results. After a tool result, explain it in reply or call the next needed tool. Do not repeat a successful write. When a call needs an ID from an earlier call, wait for that result first. Available tools:\n${JSON.stringify(definitions)}`;
  }
  function decodeReply(content){
    let result;try{result=JSON.parse(content);}catch(_e){throw new Error('The AI returned an incomplete response. Please retry with a shorter request.');}
    if(typeof result?.reply!=='string' || !Array.isArray(result.tool_calls))throw new Error('The AI returned an invalid conversation response.');
    for(const call of result.tool_calls)if(typeof call?.name!=='string' || !call.arguments || typeof call.arguments!=='object' || Array.isArray(call.arguments))throw new Error('The AI returned a malformed tool call.');
    return {role:'assistant',content:result.reply,toolCalls:AI.normalizeToolCalls(result.tool_calls)};
  }

  class WebLLMProvider extends AI.AIProvider{
    constructor(){super({id:'webllm',name:'Browser AI',supportsTools:true,supportsStreaming:true});this.engine=null;this._module=null;}
    isWebGPUAvailable(){return typeof navigator!=='undefined' && !!navigator.gpu;}
    async initialize(config={}){
      if(!this.isWebGPUAvailable())throw new Error('Browser AI requires WebGPU. You can still use Ollama or an OpenAI-compatible API.');
      const modelId=String(config.modelId || AI.WebLLMModelRegistry.defaultId);
      const model=AI.WebLLMModelRegistry.get(modelId);
      if(!model)throw new Error(`Unknown Browser AI model: ${modelId}`);
      this.status='loading';
      try{
        if(this.engine)await this.engine.unload();
        this._module ||= await import(App.AI.webLLMModuleUrl || DEFAULT_MODULE_URL);
        this.engine=await this._module.CreateMLCEngine(modelId,{
          initProgressCallback:report=>config.onProgress?.({
            progress:Math.max(0,Math.min(1,Number(report?.progress) || 0)),
            text:String(report?.text || report?.timeElapsed || 'Preparing AI model...')
          })
        });
        this.modelId=modelId;this.supportsTools=true;this.status='ready';
      }catch(error){this.status='error';throw AI.providerError(error,'Browser AI model load failed');}
    }
    _request(messages,options,stream){
      if(!this.engine || this.status!=='ready')throw new Error('Load a Browser AI model first.');
      // Native Hermes tools force a function-call-only JSON schema. Use a
      // reply + tool-call envelope instead so the same model can also converse.
      let requestMessages=boundedMessages(messages,!!options?.contextRetry);
      const useTools=this.supportsTools && options?.tools?.length;
      if(useTools){
        let system=requestMessages.find(message=>message.role==='system');
        if(!system){system={role:'system',content:''};requestMessages.unshift(system);}
        system.content+=toolProtocol(options.tools);
        if(options.responseRetry)system.content+='\nYour previous response exceeded the output budget. Use a short reply (at most 80 words) and at most one tool call. Finish the JSON object.';
        requestMessages=requestMessages.map(message=>{
          if(message.role==='tool')return {role:'user',content:`FactSim tool result (${message.name || ''}, ${message.tool_call_id || ''}):\n${message.content}`};
          if(message.role==='assistant')return {role:'assistant',content:JSON.stringify({reply:message.content || '',tool_calls:(message.tool_calls || []).map(call=>({name:call.function.name,arguments:JSON.parse(call.function.arguments)}))})};
          return message;
        });
      }
      const request={messages:requestMessages,stream,temperature:options?.responseRetry ? 0 : options?.temperature ?? 0.2,max_tokens:options?.maxTokens ?? (options?.responseRetry ? 768 : 512)};
      if(useTools)request.response_format={type:'json_object',schema:JSON.stringify({type:'object',properties:{reply:{type:'string'},tool_calls:{type:'array',items:{type:'object',properties:{name:{type:'string',enum:options.tools.map(tool=>tool.name)},arguments:{type:'object'}},required:['name','arguments'],additionalProperties:false}}},required:['reply','tool_calls'],additionalProperties:false})};
      return request;
    }
    async chat(messages,options={}){
      try{
        for(let attempt=0;attempt<2;attempt++){
          const response=AI.normalizeOpenAIResponse(await this._createCompletion(messages,{...options,responseRetry:attempt>0},false));
          try{if(this.supportsTools && options.tools?.length)response.message=decodeReply(response.message.content);return response;}
          catch(error){if(attempt || response.finishReason!=='length')throw error;}
        }
      }
      catch(error){throw AI.providerError(error,'Browser AI request failed');}
    }
    async _createCompletion(messages,options,stream){
      for(let attempt=0;attempt<2;attempt++){
        if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
        // Failed prefill/generation can leave tokens in WebLLM's KV cache.
        // Every request supplies its complete bounded conversation explicitly.
        await this.engine?.resetChat?.();
        try{
          const completion=await this.engine.chat.completions.create(this._request(messages,{...options,contextRetry:attempt>0},stream));
          if(!stream)return completion;
          // Streaming prefill runs on next(), not necessarily on create().
          const iterator=completion[Symbol.asyncIterator]();let first;
          try{first=await iterator.next();}catch(error){await iterator.return?.();throw error;}
          return (async function*(){try{if(!first.done)yield first.value;while(!first.done){first=await iterator.next();if(!first.done)yield first.value;}}finally{await iterator.return?.();}})();
        }
        catch(error){if(attempt || !isContextError(error))throw error;}
      }
    }
    async *streamChat(messages,options={}){
      try{
        for(let attempt=0;attempt<2;attempt++){
          const calls=[];let content='',finishReason=null,usage=null;
          const chunks=await this._createCompletion(messages,{...options,responseRetry:attempt>0},true);
          for await(const chunk of chunks){
            if(options.signal?.aborted){this.abort();throw new DOMException('Aborted','AbortError');}
            const choice=chunk?.choices?.[0] || {},delta=choice.delta || {};
            if(delta.content){content+=delta.content;if(!options.tools?.length)yield {type:'delta',delta:delta.content};}
            AI.mergeToolCallDeltas(calls,delta.tool_calls);
            finishReason=choice.finish_reason || finishReason;usage=chunk.usage || usage;
          }
          let message;
          try{message=this.supportsTools && options.tools?.length ? decodeReply(content) : {role:'assistant',content,toolCalls:AI.normalizeToolCalls(calls)};}
          catch(error){if(!attempt && finishReason==='length')continue;throw error;}
          if(options.tools?.length && message.content)yield {type:'delta',delta:message.content};
          yield {type:'done',response:{message,finishReason,usage}};
          return;
        }
      }catch(error){throw AI.providerError(error,'Browser AI request failed');}
    }
    abort(){try{this.engine?.interruptGenerate?.();}catch(_e){}}
    async dispose(){try{await this.engine?.unload?.();}finally{this.engine=null;await super.dispose();}}
    async getModels(){return AI.WebLLMModelRegistry.list();}
  }
  AI.WebLLMProvider=WebLLMProvider;
})(typeof window==='undefined' ? globalThis : window);
