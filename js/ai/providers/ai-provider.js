(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};

  class AIProvider{
    constructor(definition={}){
      this.id=String(definition.id || 'provider');
      this.name=String(definition.name || this.id);
      this.supportsTools=definition.supportsTools!==false;
      this.supportsStreaming=definition.supportsStreaming!==false;
      this.supportsVision=definition.supportsVision===true;
      this.status='idle';
      this.modelId='';
    }
    async initialize(){this.status='ready';}
    async chat(){throw new Error(`${this.name} does not implement chat().`);}
    async *streamChat(messages,options={}){
      const response=await this.chat(messages,options);
      const content=String(response?.message?.content || '');
      if(content)yield {type:'delta',delta:content};
      yield {type:'done',response};
    }
    async getModels(){return [];}
    abort(){}
    async dispose(){this.status='idle';this.modelId='';}
  }

  function safeJson(value,fallback={}){
    if(value && typeof value==='object')return value;
    try{return JSON.parse(String(value || '{}'));}catch(_e){return fallback;}
  }
  function normalizeToolCalls(calls){
    return (Array.isArray(calls) ? calls : []).map((call,index)=>({
      id:String(call?.id || `tool_${Date.now()}_${index}`),
      name:String(call?.function?.name || call?.name || ''),
      arguments:safeJson(call?.function?.arguments ?? call?.arguments,{})
    })).filter(call=>call.name);
  }
  function normalizeOpenAIResponse(data){
    const choice=data?.choices?.[0] || {},message=choice.message || {};
    return {
      message:{role:'assistant',content:String(message.content || ''),toolCalls:normalizeToolCalls(message.tool_calls)},
      finishReason:choice.finish_reason || null,
      usage:data?.usage || null,
      raw:data
    };
  }
  function toOpenAITools(tools){
    return (Array.isArray(tools) ? tools : []).map(tool=>({
      type:'function',
      function:{name:tool.name,description:tool.description,parameters:tool.inputSchema}
    }));
  }
  function mergeToolCallDeltas(target,deltas){
    for(const delta of Array.isArray(deltas) ? deltas : []){
      const index=Number.isInteger(delta?.index) ? delta.index : target.length;
      const current=target[index] || (target[index]={id:'',type:'function',function:{name:'',arguments:''}});
      if(delta.id)current.id=delta.id;
      if(delta.function?.name)current.function.name+=delta.function.name;
      if(delta.function?.arguments)current.function.arguments+=delta.function.arguments;
    }
  }
  function providerError(error,prefix){
    if(error?.name==='AbortError')return new Error('AI request was stopped.');
    const message=String(error?.message || error || 'Unknown provider error');
    if(/out of memory|device lost|allocation|buffer/i.test(message))return new Error('The AI model ran out of GPU memory. Unload it and choose a smaller model.');
    return new Error(prefix ? `${prefix}: ${message}` : message);
  }

  AI.AIProvider=AIProvider;
  AI.safeJson=safeJson;
  AI.normalizeToolCalls=normalizeToolCalls;
  AI.normalizeOpenAIResponse=normalizeOpenAIResponse;
  AI.toOpenAITools=toOpenAITools;
  AI.mergeToolCallDeltas=mergeToolCallDeltas;
  AI.providerError=providerError;
})(typeof window==='undefined' ? globalThis : window);
