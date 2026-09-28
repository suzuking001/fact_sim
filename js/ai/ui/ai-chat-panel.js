(function(root){
  'use strict';
  const App=root.App=root.App || {},AI=App.AI=App.AI || {};
  const $=id=>document.getElementById(id);
  function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el;}
  function appendMessage(role,text){const host=$('aiChatMessages'),row=document.createElement('div');row.className=`aiMessage aiMessage-${role}`;const label=document.createElement('span');label.className='aiMessageRole';label.textContent=role==='user' ? 'You' : role==='assistant' ? 'AI' : 'FactSim Tool';const body=document.createElement('div');body.className='aiMessageBody';body.textContent=String(text || '');row.append(label,body);host.append(row);host.scrollTop=host.scrollHeight;return body;}
  function setStatus(text,state='idle'){const el=$('aiProviderStatus');el.textContent=text;el.dataset.state=state;}
  async function prepareChatImage(file){
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('PNG・JPEG・WebP・GIFの画像を添付してください。');
    if(file.size>10*1024*1024)throw new Error('画像は1枚10MB以下にしてください。');
    const url=URL.createObjectURL(file),picture=new Image();
    try{
      picture.src=url;await picture.decode();
      if(!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth*picture.naturalHeight>32000000)throw new Error('画像の解像度が大きすぎます。');
      const ratio=Math.min(1,1600/Math.max(picture.naturalWidth,picture.naturalHeight)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(picture.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(picture.naturalHeight*ratio));
      canvas.getContext('2d').drawImage(picture,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/png').split(',')[1];if(data.length>8*1024*1024)throw new Error('画像データが大きすぎます。小さい画像にしてください。');
      return {mimeType:'image/png',data,name:file.name || '貼り付け画像',width:canvas.width,height:canvas.height};
    }catch(error){throw new Error(`画像を読み込めませんでした: ${error.message}`);}finally{URL.revokeObjectURL(url);}
  }
  AI.prepareChatImage=prepareChatImage;
  function imageElement(image){const picture=document.createElement('img');picture.src=`data:${image.mimeType};base64,${image.data}`;picture.alt=image.name || '添付画像';return picture;}
  function initPanelResize(panel){
    const handle=$('aiPanelResizeHandle');if(!handle)return;
    const storageKey='factsim-ai-panel-width';
    let preferredWidth=panel.getBoundingClientRect().width,appliedWidth=0,drag=null,resizeFrame=0;
    try{const saved=Number(localStorage.getItem(storageKey));if(Number.isFinite(saved) && saved>0)preferredWidth=saved;}catch(_e){}
    function bounds(){
      const viewport=root.innerWidth;
      // Keep some canvas space on desktop; small screens use the existing overlay layout.
      const graphLeft=document.body.classList.contains('sidebar-hidden') ? 0 : Math.max(0,$('sidebar')?.getBoundingClientRect().right || 0);
      const max=Math.max(1,Math.floor(viewport<=520 ? viewport : viewport<=900 ? viewport*.92 : Math.max(280,viewport-graphLeft-240)));
      return {min:Math.min(280,max),max};
    }
    function applyWidth(value){
      const {min,max}=bounds(),width=Math.max(min,Math.min(max,Math.round(value)));
      handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));handle.setAttribute('aria-valuenow',String(width));handle.setAttribute('aria-valuetext',`${width} px`);
      if(width!==appliedWidth){
        appliedWidth=width;document.documentElement.style.setProperty('--ai-panel-width',`${width}px`);
        if(!resizeFrame)resizeFrame=root.requestAnimationFrame(()=>{resizeFrame=0;root.dispatchEvent(new Event('resize'));});
      }
      return width;
    }
    function persistWidth(){try{localStorage.setItem(storageKey,String(preferredWidth));}catch(_e){}}
    function finishDrag(event){
      if(!drag || event.pointerId!==drag.pointerId)return;
      const pointerId=drag.pointerId;drag=null;document.body.classList.remove('ai-panel-resizing');
      if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);
      persistWidth();
    }
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0 || !event.isPrimary || panel.classList.contains('is-collapsed'))return;
      event.preventDefault();handle.focus({preventScroll:true});
      drag={pointerId:event.pointerId,startX:event.clientX,startWidth:panel.getBoundingClientRect().width};
      handle.setPointerCapture(event.pointerId);document.body.classList.add('ai-panel-resizing');
    });
    handle.addEventListener('pointermove',event=>{
      if(!drag || event.pointerId!==drag.pointerId)return;
      preferredWidth=applyWidth(drag.startWidth+drag.startX-event.clientX);
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,finishDrag);
    handle.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const {min,max}=bounds(),step=event.shiftKey ? 50 : 10;
      preferredWidth=applyWidth(event.key==='Home' ? min : event.key==='End' ? max : appliedWidth+(event.key==='ArrowLeft' ? step : -step));persistWidth();
    });
    root.addEventListener('resize',()=>applyWidth(preferredWidth));applyWidth(preferredWidth);
  }
  function init(){
    const panel=$('aiPanel');if(!panel || panel.dataset.ready)return;panel.dataset.ready='true';
    let provider=null,streamBody=null,pendingImages=[],loadingImages=0,attachmentEpoch=0,ollamaModelsRequest=0;
    const saved=(()=>{try{const value=JSON.parse(localStorage.getItem('factsim-ai-settings') || '{}');return value && typeof value==='object' ? value : {};}catch(_e){return {};}})();
    let generationSettings=AI.GenerationSettings.normalize(saved.generation);
    let selectedOllamaModel=String(saved.ollamaModel || '').trim();
    const registry=new AI.ToolRegistry({
      policy:tool=>tool.mode===AI.ToolModes.WRITE && $('aiConfirmationPolicy').value==='allow-safe' ? 'allow-safe' : 'ask',
      confirm:(tool,input)=>Promise.resolve(root.confirm(`AI wants to perform:\n\n${tool.name}\n${JSON.stringify(input,null,2)}\n\nExecute this model change?`))
    });
    AI.FactSimTools.register(registry);
    const agent=new AI.FactSimAgent({registry,maxToolIterations:16});AI.toolRegistry=registry;AI.agent=agent;
    const providerSelect=$('aiProviderSelect'),modelSelect=$('aiModelSelect');
    for(const model of AI.WebLLMModelRegistry.list())modelSelect.append(option(model.id,`${model.label} · ${model.category}`));
    providerSelect.value=saved.provider || 'webllm';modelSelect.value=saved.webllmModel || AI.WebLLMModelRegistry.defaultId;$('aiOllamaEndpoint').value=saved.ollamaEndpoint || 'http://localhost:11434';$('aiApiBaseUrl').value=saved.apiBaseUrl || '';$('aiApiModel').value=saved.apiModel || '';$('aiConfirmationPolicy').value=saved.confirmationPolicy || 'ask';
    $('aiOllamaThinking').value=saved.ollamaThinking ? 'on' : 'off';
    function persist(){try{localStorage.setItem('factsim-ai-settings',JSON.stringify({provider:providerSelect.value,webllmModel:modelSelect.value,ollamaEndpoint:$('aiOllamaEndpoint').value,ollamaModel:selectedOllamaModel,ollamaThinking:$('aiOllamaThinking').value==='on',apiBaseUrl:$('aiApiBaseUrl').value,apiModel:$('aiApiModel').value,confirmationPolicy:$('aiConfirmationPolicy').value,generation:generationSettings}));}catch(_e){}}
    function applyGenerationSettings(){
      agent.maxToolIterations=generationSettings.maxToolIterations;agent.generationOptions=AI.GenerationSettings.requestOptions(generationSettings);
      if(provider?.id==='ollama'){provider.requestTimeoutMs=agent.generationOptions.requestTimeoutMs;provider.generationOptions={...agent.generationOptions};}
    }
    function readGenerationSettings(){
      const values={},status=$('aiGenerationSettingsStatus');
      for(const field of AI.GenerationSettings.fields){
        const input=$(field.id);
        if(!input.checkValidity()){status.textContent=`${field.label}：${field.min}〜${field.max}${field.step===1 ? 'の整数' : 'の値'}を入力してください。${field.default===null ? '空欄も使用できます。' : ''}`;status.dataset.state='error';return false;}
        values[field.key]=input.value;
      }
      generationSettings=AI.GenerationSettings.normalize(values);applyGenerationSettings();persist();status.textContent='保存しました。次の送信から適用します。';status.dataset.state='ready';return true;
    }
    for(const field of AI.GenerationSettings.fields){
      const label=document.createElement('label'),input=document.createElement('input'),hint=document.createElement('small');
      label.append(document.createTextNode(field.label));input.id=field.id;input.type='number';input.min=field.min;input.max=field.max;input.step=field.step;input.required=field.default!==null;input.value=generationSettings[field.key] ?? '';input.placeholder=field.default===null ? '既定値を使用' : String(field.default);
      hint.id=`${field.id}Hint`;hint.textContent=field.hint;input.setAttribute('aria-describedby',hint.id);label.append(input,hint);$(field.provider ? 'aiOllamaGenerationFields' : 'aiCommonGenerationFields').append(label);input.addEventListener('change',readGenerationSettings);
    }
    $('aiResetGenerationSettings').addEventListener('click',()=>{generationSettings=AI.GenerationSettings.normalize();for(const field of AI.GenerationSettings.fields)$(field.id).value=generationSettings[field.key] ?? '';readGenerationSettings();});
    applyGenerationSettings();
    function syncProviderUi(){const id=providerSelect.value;panel.dataset.provider=id;document.querySelectorAll('[data-ai-provider-fields]').forEach(el=>el.hidden=el.dataset.aiProviderFields!==id);$('aiConnectBtn').textContent=id==='webllm' ? 'Load Model' : id==='ollama' ? 'Test & Use' : 'Use Provider';updateModelInfo();persist();if(id==='ollama')refreshOllamaModels();}
    function updateModelInfo(){if(providerSelect.value!=='webllm'){$('aiModelInfo').textContent=providerSelect.value==='ollama' ? 'Select an installed model, then click Test & Use.' : 'API key stays in this browser tab and is not saved.';return;}const model=AI.WebLLMModelRegistry.get(modelSelect.value);$('aiModelInfo').textContent=model ? `${model.category[0].toUpperCase()+model.category.slice(1)} · ${model.description} Recommended: ${model.recommendedFor.join(' / ')}. Approx. VRAM ${model.estimatedMemoryGB} GB.` : '';}
    async function connect(){
      if(agent.running){setStatus('AIの応答が完了するか、Stopで停止してから接続してください。','error');return;}
      if(!readGenerationSettings())return;
      if(providerSelect.value==='ollama' && ($('aiOllamaModels').disabled || !$('aiOllamaModels').value)){setStatus('Get Models and choose an installed Ollama model first.','error');return;}
      $('aiConnectBtn').disabled=true;setStatus('Connecting…','loading');persist();
      try{
        await provider?.dispose?.();const id=providerSelect.value;
        if(id==='webllm'){provider=new AI.WebLLMProvider();await provider.initialize({modelId:modelSelect.value,onProgress:progress=>{const percent=Math.round(progress.progress*100);$('aiLoadProgress').hidden=false;$('aiLoadProgress').value=percent;$('aiLoadProgressText').textContent=`${progress.text} ${percent}%`;setStatus(`Loading ${percent}%`,'loading');}});}
        else if(id==='ollama'){provider=new AI.OllamaProvider();await provider.initialize({endpoint:$('aiOllamaEndpoint').value,modelId:$('aiOllamaModels').value,think:$('aiOllamaThinking').value==='on',requestTimeoutMs:agent.generationOptions.requestTimeoutMs,generationOptions:{...agent.generationOptions}});}
        else{provider=new AI.OpenAICompatibleProvider();await provider.initialize({baseUrl:$('aiApiBaseUrl').value,apiKey:$('aiApiKey').value,modelId:$('aiApiModel').value});}
        agent.setProvider(provider);$('aiLoadProgress').hidden=true;$('aiLoadProgressText').textContent='';setStatus(`${provider.name} · ${provider.modelId}`,'ready');appendMessage('tool',`${provider.name} is ready with ${provider.modelId}. Layout inspection: ${provider.supportsVision ? 'graph images + geometry' : 'geometry only (no image input)'}.`);
      }catch(error){setStatus(String(error?.message || error),'error');appendMessage('error',error?.message || error);}finally{$('aiConnectBtn').disabled=false;}
    }
    function ollamaEndpoint(){return $('aiOllamaEndpoint').value.trim().replace(/\/+$/,'') || 'http://localhost:11434';}
    async function refreshOllamaModels(){
      const request=++ollamaModelsRequest,temp=new AI.OllamaProvider(),list=$('aiOllamaModels'),button=$('aiOllamaRefresh');temp.endpoint=ollamaEndpoint();
      list.replaceChildren(option('','Reading Ollama models…'));list.disabled=true;button.disabled=true;
      if(providerSelect.value==='ollama')setStatus('Reading Ollama models…','loading');
      try{
        const models=await temp.getModels();
        // Ignore an older response if another refresh or endpoint change overtook it.
        if(request!==ollamaModelsRequest || temp.endpoint!==ollamaEndpoint())return;
        list.replaceChildren();if(!models.length)list.append(option('','No installed models found'));
        for(const model of models)list.append(option(model.id,model.label));list.disabled=!models.length;
        list.value=models.some(model=>model.id===selectedOllamaModel) ? selectedOllamaModel : models[0]?.id || '';
        selectedOllamaModel=list.value;persist();
        if(providerSelect.value==='ollama')setStatus(`Found ${models.length} Ollama model(s)`,'idle');
      }catch(error){
        if(request!==ollamaModelsRequest || temp.endpoint!==ollamaEndpoint())return;
        list.replaceChildren(option('','Could not read models · Get Models to retry'));
        if(providerSelect.value==='ollama')setStatus(`Ollama unreachable: ${error.message}`,'error');
      }finally{if(request===ollamaModelsRequest)button.disabled=false;}
    }
    function renderAttachments(){
      const host=$('aiImagePreviews');host.replaceChildren();host.hidden=!pendingImages.length;
      pendingImages.forEach((image,index)=>{
        const tile=document.createElement('figure'),remove=document.createElement('button');tile.append(imageElement(image));
        remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`画像を削除: ${image.name}`);remove.disabled=agent.running || loadingImages>0;
        remove.addEventListener('click',()=>{pendingImages.splice(index,1);renderAttachments();});tile.append(remove);host.append(tile);
      });
      $('aiAttachBtn').disabled=agent.running || loadingImages>0 || pendingImages.length>=4;$('aiSendBtn').disabled=agent.running || loadingImages>0;
    }
    async function addImages(files){
      if(agent.running || loadingImages)return;
      const list=Array.from(files);if(!list.length)return;
      const epoch=attachmentEpoch;loadingImages++;renderAttachments();
      try{
        if(pendingImages.length+list.length>4)throw new Error('画像は一度に4枚まで添付できます。');
        const prepared=[];for(const file of list)prepared.push(await prepareChatImage(file));
        if(epoch!==attachmentEpoch)return;
        pendingImages.push(...prepared);setStatus(`画像を${pendingImages.length}枚添付しました。説明を入力して送信してください。`,'idle');
      }catch(error){setStatus(error.message,'error');appendMessage('error',error.message);}
      finally{loadingImages--;renderAttachments();}
    }
    async function send(){const input=$('aiChatInput'),text=input.value.trim();if((!text && !pendingImages.length) || agent.running || loadingImages)return;if(!readGenerationSettings()){$('aiAdvancedSettings').open=true;return;}$('aiSendBtn').disabled=true;$('aiStopBtn').disabled=false;try{await agent.send(text,{images:pendingImages});}catch(_e){}finally{renderAttachments();$('aiStopBtn').disabled=true;input.focus();}}
    agent.addEventListener('user',e=>{
      const body=appendMessage('user',e.detail.content);for(const image of e.detail.images || [])body.append(imageElement(image));
      $('aiChatInput').value='';pendingImages=[];renderAttachments();
    });
    agent.addEventListener('clear',()=>{attachmentEpoch++;pendingImages=[];renderAttachments();});
    agent.addEventListener('assistant-start',e=>{streamBody=null;setStatus(e.detail.finalTurn ? '調査上限：取得済みの結果を要約しています…' : `AI回答生成中…（ツール実行 ${e.detail.toolCalls || 0}回）`,'loading');});
    agent.addEventListener('provider-progress',e=>setStatus(`AI応答待ち・生成中… ${Number(e.detail.elapsedSeconds || 0).toFixed(0)}秒（読込・待ち行列・推論を含みます）`,'loading'));
    $('aiOllamaThinking').addEventListener('change',()=>{persist();if(provider?.id==='ollama')provider.think=$('aiOllamaThinking').value==='on';});
    agent.addEventListener('assistant-delta',e=>{if(!streamBody)streamBody=appendMessage('assistant','');streamBody.textContent+=e.detail.delta;$('aiChatMessages').scrollTop=$('aiChatMessages').scrollHeight;});
    agent.addEventListener('assistant-final',e=>{if(!streamBody && e.detail.content)streamBody=appendMessage('assistant',e.detail.content);streamBody=null;});
    agent.addEventListener('tool-start',e=>{appendMessage('tool',`Running ${e.detail.call.name}…`);setStatus(`ツール実行中: ${e.detail.call.name}`,'loading');});
    agent.addEventListener('tool-progress',e=>setStatus(`${e.detail.call.name}: ${Number(e.detail.progress.simTimeSeconds || 0).toFixed(1)} s`,'loading'));
    agent.addEventListener('tool-result',e=>{
      const result=e.detail.result,name=e.detail.call.name;
      if(['get_simulation_report','profile_simulation','get_nodes'].includes(name)){
        const info=result.report || result,summary=name==='profile_simulation' ? `${name}: ${Number(result.advancedSeconds || 0).toFixed(1)} s進行 / 実時間 ${(Number(result.performance?.wallMs || 0)/1000).toFixed(2)} s / 停止理由 ${result.stopReason || result.error}` : `${name}: ノード ${info.nodeCount ?? info.nodes?.length ?? '?'} / 候補 ${info.suspectCount ?? '?'} / エラー ${info.issues?.runtimeErrors?.length ?? 0}`;
        const body=appendMessage('tool',result.success===false ? `${name}: ${result.error || '失敗'}` : summary),details=document.createElement('details'),heading=document.createElement('summary'),pre=document.createElement('pre');heading.textContent='診断データの詳細';pre.textContent=JSON.stringify(result,null,2);details.append(heading,pre);body.append(details);
      }else appendMessage('tool',`${name}\n${JSON.stringify(result,null,2)}`);
    });
    agent.addEventListener('error',e=>{const message=e.detail.error?.message || String(e.detail.error);appendMessage('error',message);setStatus(message,'error');});
    agent.addEventListener('idle',e=>{const stats=e.detail.stats;if(stats?.toolCalls)appendMessage('tool',`処理時間 ${(stats.wallMs/1000).toFixed(1)}秒：AI生成 ${(stats.modelWallMs/1000).toFixed(1)}秒 / ツール ${(stats.toolWallMs/1000).toFixed(1)}秒（${stats.toolCalls}回）${stats.budgetReached ? ' / 調査上限・部分結果' : ''}`);if(provider?.status==='ready')setStatus(`${provider.name} · ${provider.modelId}`,'ready');});
    document.body.classList.add('ai-panel-open');
    initPanelResize(panel);
    $('aiPanelToggle').addEventListener('click',()=>{const closed=panel.classList.toggle('is-collapsed');document.body.classList.toggle('ai-panel-open',!closed);$('aiPanelToggle').setAttribute('aria-expanded',String(!closed));root.dispatchEvent(new Event('resize'));});
    $('aiPanelClose').addEventListener('click',()=>$('aiPanelToggle').click());providerSelect.addEventListener('change',syncProviderUi);modelSelect.addEventListener('change',()=>{updateModelInfo();persist();});$('aiConfirmationPolicy').addEventListener('change',persist);$('aiConnectBtn').addEventListener('click',connect);$('aiOllamaRefresh').addEventListener('click',refreshOllamaModels);$('aiSendBtn').addEventListener('click',send);$('aiStopBtn').addEventListener('click',()=>agent.stop());$('aiClearBtn').addEventListener('click',()=>{$('aiChatMessages').innerHTML='';agent.clear();pendingImages=[];renderAttachments();});$('aiChatInput').addEventListener('keydown',event=>{if(event.key==='Enter' && !event.shiftKey){event.preventDefault();send();}});
    $('aiOllamaModels').addEventListener('change',()=>{selectedOllamaModel=$('aiOllamaModels').value;persist();});
    $('aiOllamaEndpoint').addEventListener('change',()=>{persist();refreshOllamaModels();});
    $('aiAttachBtn').addEventListener('click',()=>$('aiImageFiles').click());
    $('aiImageFiles').addEventListener('change',event=>{addImages(event.target.files);event.target.value='';});
    $('aiChatInput').addEventListener('paste',event=>{
      const files=Array.from(event.clipboardData?.items || []).filter(item=>item.kind==='file' && item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
      if(files.length){event.preventDefault();const text=event.clipboardData.getData('text/plain');if(text)$('aiChatInput').setRangeText(text,$('aiChatInput').selectionStart,$('aiChatInput').selectionEnd,'end');addImages(files);}
    });
    const composer=$('aiChatInput').closest('.aiComposer');
    composer.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer?.types || []).includes('Files'))event.preventDefault();});
    composer.addEventListener('drop',event=>{if(event.dataTransfer?.files.length){event.preventDefault();addImages(event.dataTransfer.files);}});
    syncProviderUi();appendMessage('assistant','FactSim AI is off until you load or connect a provider. Existing simulation features remain independent.');
  }
  AI.initUI=init;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window==='undefined' ? globalThis : window);
