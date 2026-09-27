(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  function baseUrl(value){return String(value || '').trim().replace(/\/+$/,'');}
  class OpenAICompatibleProvider extends AI.AIProvider{
    constructor(){super({id:'openai-compatible',name:'OpenAI-compatible',supportsTools:true,supportsStreaming:true});this.baseUrl='';this.apiKey='';}
    async initialize(config={}){
      this.baseUrl=baseUrl(config.baseUrl);this.apiKey=String(config.apiKey || '');this.modelId=String(config.modelId || '').trim();
      if(!this.baseUrl)throw new Error('Enter the API base URL.');if(!this.modelId)throw new Error('Enter a model name.');
      this.status='ready';
    }
    _headers(){const headers={'Content-Type':'application/json'};if(this.apiKey)headers.Authorization=`Bearer ${this.apiKey}`;return headers;}
    _url(path){return `${this.baseUrl}${path}`;}
    async getModels(){
      const response=await fetch(this._url('/models'),{headers:this._headers()});
      if(!response.ok)throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data=await response.json();return (data.data || []).map(model=>({id:model.id,label:model.id}));
    }
    _body(messages,options,stream){
      const body={model:this.modelId,messages,stream,temperature:options?.temperature ?? 0.2};
      if(options?.tools?.length){body.tools=AI.toOpenAITools(options.tools);body.tool_choice='auto';}
      return body;
    }
    async chat(messages,options={}){
      const controller=new AbortController();this._controller=controller;options.signal?.addEventListener('abort',()=>controller.abort(),{once:true});
      try{const response=await fetch(this._url('/chat/completions'),{method:'POST',headers:this._headers(),body:JSON.stringify(this._body(messages,options,false)),signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}: ${await response.text()}`);return AI.normalizeOpenAIResponse(await response.json());}
      catch(error){throw AI.providerError(error,'OpenAI-compatible request failed');}finally{this._controller=null;}
    }
    async *streamChat(messages,options={}){
      const controller=new AbortController();this._controller=controller;options.signal?.addEventListener('abort',()=>controller.abort(),{once:true});
      const calls=[];let content='',finishReason=null,usage=null;
      try{
        const response=await fetch(this._url('/chat/completions'),{method:'POST',headers:this._headers(),body:JSON.stringify(this._body(messages,options,true)),signal:controller.signal});
        if(!response.ok)throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
        while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value || new Uint8Array(),{stream:!done});const events=buffer.split('\n\n');buffer=done ? '' : events.pop();for(const event of events){for(const line of event.split('\n')){if(!line.startsWith('data:'))continue;const payload=line.slice(5).trim();if(!payload || payload==='[DONE]')continue;const data=JSON.parse(payload),choice=data.choices?.[0] || {},delta=choice.delta || {};if(delta.content){content+=delta.content;yield {type:'delta',delta:delta.content};}AI.mergeToolCallDeltas(calls,delta.tool_calls);finishReason=choice.finish_reason || finishReason;usage=data.usage || usage;}}if(done)break;}
        yield {type:'done',response:{message:{role:'assistant',content,toolCalls:AI.normalizeToolCalls(calls)},finishReason,usage}};
      }catch(error){throw AI.providerError(error,'OpenAI-compatible request failed');}finally{this._controller=null;}
    }
    abort(){this._controller?.abort();}
    async dispose(){this.apiKey='';this._controller?.abort();await super.dispose();}
  }
  AI.OpenAICompatibleProvider=OpenAICompatibleProvider;
})(typeof window==='undefined' ? globalThis : window);
