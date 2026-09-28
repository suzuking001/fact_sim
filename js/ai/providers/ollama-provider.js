(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  function endpoint(value){return String(value || 'http://localhost:11434').trim().replace(/\/+$/,'');}
  function ollamaMessages(messages){return messages.map(message=>{
    const next={role:message.role,content:String(message.content || '')};
    if(message.tool_calls)next.tool_calls=message.tool_calls.map(call=>({function:{name:call.function?.name || '',arguments:AI.safeJson(call.function?.arguments,{})}}));
    if(message.role==='tool' && message.name)next.tool_name=message.name;
    if(message.images?.length)next.images=message.images.map(image=>typeof image==='string' ? image : image.data);
    return next;
  });}
  class OllamaProvider extends AI.AIProvider{
    constructor(){super({id:'ollama',name:'Ollama',supportsTools:true,supportsStreaming:true});this.endpoint='http://localhost:11434';this.requestTimeoutMs=90000;this.generationOptions={};}
    async initialize(config={}){
      this.endpoint=endpoint(config.endpoint);this.modelId=String(config.modelId || '').trim();
      const timeout=Number(config.requestTimeoutMs ?? 90000);
      this.requestTimeoutMs=Number.isFinite(timeout) && timeout>=0 && timeout<=2147483647 ? timeout : 90000;this.think=config.think ?? false;this.generationOptions=config.generationOptions || {};
      if(!this.modelId)throw new Error('Choose or enter an Ollama model.');
      this.status='connecting';
      try{
        const models=await this.getModels(),selected=models.find(model=>model.id===this.modelId);
        let capabilities=selected?.capabilities;
        if(!capabilities){
          const response=await fetch(`${this.endpoint}/api/show`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:this.modelId})});
          if(!response.ok)throw new Error(`Cannot inspect Ollama model: HTTP ${response.status}`);
          capabilities=(await response.json()).capabilities || [];
        }
        this.supportsVision=capabilities.includes('vision');this.supportsThinking=capabilities.includes('thinking');this.status='ready';
      }catch(error){this.status='error';throw AI.providerError(error,'Ollama connection failed');}
    }
    async getModels(){
      const response=await fetch(`${this.endpoint}/api/tags`);
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();return (data.models || []).map(model=>({id:model.name,label:model.name,size:model.size || null,capabilities:model.capabilities || null}));
    }
    _body(messages,options,stream){
      options={...this.generationOptions,...options};
      const body={model:this.modelId,messages:ollamaMessages(messages),stream,options:{...options.ollamaOptions,temperature:options.temperature ?? 0.2}};
      if(options.maxTokens!=null)body.options.num_predict=options.maxTokens;
      if(options.keepAlive!=null)body.keep_alive=options.keepAlive;
      if(this.supportsThinking)body.think=options?.think ?? this.think;
      if(options?.tools?.length)body.tools=AI.toOpenAITools(options.tools);
      return body;
    }
    _requestControl(options){
      const controller=new AbortController(),started=performance.now(),abort=()=>controller.abort();this._controller=controller;
      options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
      let timedOut=false;const requested=Number(options.requestTimeoutMs ?? this.requestTimeoutMs),limit=Number.isFinite(requested) && requested>=0 && requested<=2147483647 ? requested : 90000;
      const timeout=limit>0 ? setTimeout(()=>{timedOut=true;abort();},limit) : null,progress=setInterval(()=>options.onProgress?.({phase:'waiting',elapsedSeconds:(performance.now()-started)/1000}),4000);
      return {controller,timeoutError:()=>timedOut ? new Error(`Ollamaの応答が${limit/1000}秒以内に完了しませんでした。AIの詳細設定で応答タイムアウトを延長するか、0（無制限）に設定できます。モデル読込・他の実行待ち・推論負荷を確認し、再試行してください。取得済みのツール結果はチャットに残っています。`) : null,close:()=>{clearTimeout(timeout);clearInterval(progress);options.signal?.removeEventListener('abort',abort);if(this._controller===controller)this._controller=null;}};
    }
    async chat(messages,options={}){
      const control=this._requestControl(options),controller=control.controller;
      try{
        const response=await fetch(`${this.endpoint}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(this._body(messages,options,false)),signal:controller.signal});
        if(!response.ok)throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const data=await response.json(),message=data.message || {};
        return {message:{role:'assistant',content:String(message.content || ''),toolCalls:AI.normalizeToolCalls(message.tool_calls)},finishReason:data.done_reason || null,usage:null,raw:data};
      }catch(error){throw AI.providerError(control.timeoutError() || error,'Ollama request failed');}finally{control.close();}
    }
    async *streamChat(messages,options={}){
      const control=this._requestControl(options),controller=control.controller;
      let content='',calls=[],finishReason=null;
      try{
        const response=await fetch(`${this.endpoint}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(this._body(messages,options,true)),signal:controller.signal});
        if(!response.ok)throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
        while(true){
          const {value,done}=await reader.read();buffer+=decoder.decode(value || new Uint8Array(),{stream:!done});
          const lines=buffer.split('\n');buffer=done ? '' : lines.pop();
          for(const line of lines){if(!line.trim())continue;const data=JSON.parse(line),message=data.message || {};if(message.content){content+=message.content;yield {type:'delta',delta:message.content};}if(message.tool_calls?.length)calls.push(...message.tool_calls);finishReason=data.done_reason || finishReason;}
          if(done)break;
        }
        if(buffer.trim()){const data=JSON.parse(buffer),message=data.message || {};if(message.content){content+=message.content;yield {type:'delta',delta:message.content};}if(message.tool_calls?.length)calls.push(...message.tool_calls);finishReason=data.done_reason || finishReason;}
        yield {type:'done',response:{message:{role:'assistant',content,toolCalls:AI.normalizeToolCalls(calls)},finishReason}};
      }catch(error){throw AI.providerError(control.timeoutError() || error,'Ollama request failed');}finally{control.close();}
    }
    abort(){this._controller?.abort();}
  }
  AI.OllamaProvider=OllamaProvider;
})(typeof window==='undefined' ? globalThis : window);
