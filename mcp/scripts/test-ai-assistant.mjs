import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const outputPath=path.join(root,'artifacts','ai-assistant',process.argv.includes('--real-webllm') ? 'browser-test-real.json' : 'browser-test.json');
const screenshotPath=path.join(root,'tmp','ai-assistant-panel.png');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const screenProtocolChecks=[];
const chatAttachmentRequests=[];
const server=createServer(async(req,res)=>{
  try{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(relative==='/mock-openai/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'mock-model'}]}));return;}
    if(relative==='/mock-openai/chat/completions'){
      let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw || '{}');
      if(body.stream){res.setHeader('Content-Type','text/event-stream');res.end('data: {"choices":[{"delta":{"content":"OpenAI "}}]}\n\ndata: {"choices":[{"delta":{"content":"stream"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');}
      else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'OpenAI reply'},finish_reason:'stop'}]}));}
      return;
    }
    if(relative==='/mock-ollama/api/tags'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({models:[{name:'mock-ollama',size:1,capabilities:['completion','tools','vision']},{name:'mock-text',size:1,capabilities:['completion','tools']}]}));return;}
    if(relative==='/mock-ollama/api/chat'){
      let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw || '{}');res.setHeader('Content-Type','application/json');
      if(body.messages.some(message=>message.role==='user' && message.content.includes('[test-uploaded-image]'))){
        const images=body.messages.flatMap(message=>message.images || []);
        chatAttachmentRequests.push({count:images.length,png:images.every(data=>typeof data==='string' && data.startsWith('iVBOR') && !data.startsWith('data:')),prompt:body.messages.filter(message=>message.role==='user').at(-1).content});
        res.end(JSON.stringify({message:{content:'画像付きの指示を受信しました。'},done:true,done_reason:'stop'})+'\n');return;
      }
      const screen=body.messages?.find(message=>message.role==='user' && message.content.startsWith('[test-individual-layout]'));
      if(screen){
        const input=JSON.parse(screen.content.slice('[test-individual-layout]'.length));
        const snapshots=body.messages.filter(message=>message.role==='tool' && message.tool_name==='get_layout_snapshot'),moved=body.messages.some(message=>message.role==='tool' && message.tool_name==='move_node');
        const images=body.messages.flatMap(message=>message.images || []);
        screenProtocolChecks.push({imageCount:images.length,base64:images.every(data=>typeof data==='string' && data.startsWith('iVBOR') && !data.startsWith('data:')),toolJSONClean:body.messages.filter(message=>message.role==='tool').every(message=>!message.content.includes('iVBOR')),model:body.model});
        const message=snapshots.length>1 ? {content:'重なっていたノードだけ移動し、再確認しました。'} : {content:'',tool_calls:[{function:{name:!snapshots.length || moved ? 'get_layout_snapshot' : 'move_node',arguments:!snapshots.length || moved ? {} : {...input,avoidOverlap:true,fit:false}}}]};
        res.end(JSON.stringify({message,done:true,done_reason:'stop'})+'\n');return;
      }
      const insertion=body.messages?.find(message=>message.role==='user' && message.content.startsWith('[test-buffer-insertion]'));
      if(insertion){
        const input=JSON.parse(insertion.content.slice('[test-buffer-insertion]'.length));
        const inspected=body.messages.some(message=>message.role==='tool' && message.tool_name==='get_node'),done=body.messages.find(message=>message.role==='tool' && message.tool_name==='insert_node_on_link');
        const message=done ? {content:JSON.parse(done.content).success ? '既存の接続の間にバッファを挿入しました。' : '挿入に失敗しました。'} : {content:'',tool_calls:[{function:{name:inspected ? 'insert_node_on_link' : 'get_node',arguments:inspected ? input : {nodeId:input.fromNodeId}}}]};
        res.end(JSON.stringify({message,done:true,done_reason:'stop'})+(body.stream ? '\n' : ''));return;
      }
      if(body.stream)res.end('{"message":{"role":"assistant","content":"Ollama "},"done":false}\n{"message":{"role":"assistant","content":"stream"},"done":true,"done_reason":"stop"}\n');
      else res.end(JSON.stringify({message:{role:'assistant',content:'Ollama reply'},done:true,done_reason:'stop'}));
      return;
    }
    const file=path.resolve(root,'.'+(relative==='/' ? '/index.html' : relative));
    if(file!==path.join(root,'index.html') && !file.startsWith(root+path.sep))throw new Error('Invalid path');
    res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});
const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));page.on('console',message=>{if(message.type()==='error')pageErrors.push(`console: ${message.text()}`);});
const report={generatedAt:new Date().toISOString(),checks:[],pageErrors};
function check(name,pass,details=null){report.checks.push({name,pass:!!pass,details});if(!pass)throw new Error(`${name}: ${JSON.stringify(details)}`);}

try{
  await page.goto(`http://127.0.0.1:${server.address().port}/?skipLanding=1`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.App?.AI?.agent && window.App?.graph?._nodes?.length,{timeout:20000});
  await page.evaluate(()=>applyExampleData(EXAMPLES.simple,'simple'));
  await page.waitForTimeout(300);
  const initial=await page.evaluate(()=>({
    panelVisible:!!document.getElementById('aiPanel')?.offsetWidth,
    panelOpen:document.body.classList.contains('ai-panel-open'),
    providers:Array.from(document.getElementById('aiProviderSelect').options).map(option=>option.value),
    models:Array.from(document.getElementById('aiModelSelect').options).map(option=>option.value),
    tools:App.AI.toolRegistry.list().map(tool=>({name:tool.name,mode:tool.mode,risk:tool.risk})),
    summary:App.AI.FactSimTools.modelSummary()
  }));
  check('panel loads independently',initial.panelVisible && initial.panelOpen,initial);
  check('all providers are selectable',initial.providers.join(',')==='webllm,ollama,openai-compatible',initial.providers);
  check('webllm model registry has profiles',initial.models.length>=3,initial.models);
  check('MVP and graph-building tools registered',initial.tools.map(tool=>tool.name).join(',')==='get_model_summary,get_node,set_node_parameter,run_simulation,get_kpis,add_node,connect_nodes,insert_node_on_link,move_node,auto_layout,get_layout_snapshot,get_simulation_report,get_nodes,profile_simulation',initial.tools);
  check('tool metadata includes classification',initial.tools.every(tool=>tool.mode && tool.risk),initial.tools);
  check('summary uses live graph',initial.summary.nodeCount===4 && initial.summary.edgeCount===3,initial.summary);

  const toolResults=await page.evaluate(async()=>{
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);
    const equipment=App.graph._nodes.find(node=>node.properties?.role==='equipment');
    const parameters=App.AI.FactSimTools.editableParameters(equipment);
    const parameter=parameters.cycleTime ? 'cycleTime' : Object.keys(parameters).find(key=>key.endsWith('.seconds') && parameters[key].kind==='process');
    const previous=parameters[parameter].value;
    const missing=await registry.execute('get_node',{nodeId:'Process999'});
    const invalid=await registry.execute('set_node_parameter',{nodeId:String(equipment.id),parameter,value:0});
    const changed=await registry.execute('set_node_parameter',{nodeId:String(equipment.id),parameter,value:previous+0.5});
    const node=await registry.execute('get_node',{nodeId:String(equipment.id)});
    const historyDepth=App.history.undo.length;
    window.undo();
    const restored=App.AI.FactSimTools.editableParameters(App.graph.getNodeById(equipment.id))[parameter].value;
    const simulated=await registry.execute('run_simulation',{durationSeconds:5,resetBeforeRun:true});
    const measured=await registry.execute('get_kpis',{});
    return {parameter,previous,missing,invalid,changed,node,historyDepth,restored,simulated,measured};
  });
  check('missing nodes are rejected',toolResults.missing.success===false && /does not exist/.test(toolResults.missing.error),toolResults.missing);
  check('invalid cycle time is rejected',toolResults.invalid.success===false,toolResults.invalid);
  check('safe write returns before and after values',toolResults.changed.success && toolResults.changed.previousValue===toolResults.previous && toolResults.changed.newValue===toolResults.previous+0.5,toolResults.changed);
  check('AI writes enter undo history',toolResults.historyDepth>=2 && toolResults.restored===toolResults.previous,{historyDepth:toolResults.historyDepth,restored:toolResults.restored,previous:toolResults.previous});
  check('bounded simulation uses FactSim engine',toolResults.simulated.success && toolResults.simulated.durationSeconds===5 && toolResults.simulated.endTimeSeconds>=5,toolResults.simulated);
  check('KPI tool returns structured runtime facts',toolResults.measured.success && toolResults.measured.source==='FactSim runtime state' && Array.isArray(toolResults.measured.sinks),toolResults.measured);

  const diagnostics=await page.evaluate(async()=>{
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);
    const original=App.graph;
    const nodes=Array.from({length:132},(_,id)=>({id:id+1,title:'Equipment',properties:{role:id===0?'source':id===131?'sink':'equipment'},_state:'WAIT',_sent:0}));
    const links=Object.fromEntries(Array.from({length:178},(_,id)=>[id+1,{id:id+1,origin_id:id%131+1,target_id:id%131+2,origin_slot:0,target_slot:0}]));
    nodes[1]._flowRuntime={cells:[],signals:[],offers:[{pending:[3]}],error:'test-only runtime error'};
    nodes[2]._flowRuntime={cells:[],signals:[],offers:[{pending:[2]}]};
    let snapshot,readOnly;
    try{App.graph={_nodes:nodes,links};const before=JSON.stringify(App.graph);snapshot=await registry.execute('get_simulation_report',{});readOnly=before===JSON.stringify(App.graph);}finally{App.graph=original;}
    const batch=await registry.execute('get_nodes',{nodeIds:original._nodes.slice(0,3).map(node=>String(node.id))});
    const invalid=await registry.execute('get_nodes',{nodeIds:['1',4]});
    const simulated=await registry.execute('profile_simulation',{durationSeconds:1200,maxWallSeconds:15,resetBeforeRun:true});
    const timeLimited=await registry.execute('profile_simulation',{durationSeconds:86400,maxWallSeconds:0.1});
    const factory=App.createSimEngine;let stopped,error,cancelled;
    try{
      App.createSimEngine=()=>({reset(){},update(){},stop(){}});
      stopped=await registry.execute('profile_simulation',{durationSeconds:20});
      App.createSimEngine=()=>({reset(){},update(){throw new Error('test-only engine failure');},stop(){}});
      error=await registry.execute('profile_simulation',{durationSeconds:20});
      const controller=new AbortController();controller.abort();cancelled=await registry.execute('profile_simulation',{}, {signal:controller.signal});
    }finally{App.createSimEngine=factory;}
    const provider={status:'ready',supportsTools:true,supportsStreaming:false,calls:0,requests:[],async chat(messages,options){this.calls++;this.requests.push({messages,toolCount:options.tools.length});return {message:{content:options.tools.length?'':'取得済みの全体状態を確認しました。原因は未確定です。',toolCalls:options.tools.length?[{id:String(this.calls),name:'get_simulation_report',arguments:{includeGraph:false}}]:[]}};}};
    const agent=new App.AI.FactSimAgent({provider,registry,maxToolIterations:2}),partial=await agent.send('1000秒で固まる原因を調査してください');
    return {bulk:{nodes:snapshot.nodeCount,edges:snapshot.edgeCount,allNodes:snapshot.graph.nodes.length,allEdges:snapshot.graph.edges.length,readOnly,cycles:snapshot.issues.pendingTransferCycles,errors:snapshot.issues.runtimeErrors,duplicateCount:snapshot.issues.duplicateNames[0].nodeIds.length},batchCount:batch.nodes.length,invalidRejected:!invalid.success,simulated,timeLimited:{partial:timeLimited.partial,reason:timeLimited.stopReason,advancedSeconds:timeLimited.advancedSeconds,performance:timeLimited.performance},stopped:stopped.stopReason,error:{success:error.success,stopReason:error.stopReason,error:error.error},cancelled:cancelled.stopReason,running:isSimRunning(),partial:{partial:partial.partial,content:partial.content,calls:provider.calls,lastTools:provider.requests.at(-1).toolCount,hasQuestion:provider.requests.at(-1).messages[0].content.includes('1000秒'),hasEvidence:provider.requests.at(-1).messages[1].content.includes('nodeCount'),stats:agent.lastRunStats}};
  });
  check('one read retrieves 132 nodes / 178 edges with real pending dependencies and no runtime mutation',diagnostics.bulk.nodes===132 && diagnostics.bulk.edges===178 && diagnostics.bulk.allNodes===132 && diagnostics.bulk.allEdges===178 && diagnostics.bulk.readOnly && diagnostics.bulk.cycles.length===1 && diagnostics.bulk.errors.length===1 && diagnostics.bulk.duplicateCount===132,diagnostics.bulk);
  check('focused batch node reads validate every array item',diagnostics.batchCount===3 && diagnostics.invalidRejected,{count:diagnostics.batchCount,invalidRejected:diagnostics.invalidRejected});
  check('actual selected engine advances 1200 seconds with measured performance and bounded sampling',diagnostics.simulated.success && !diagnostics.simulated.partial && diagnostics.simulated.advancedSeconds===1200 && diagnostics.simulated.performance.wallMs>0 && diagnostics.simulated.performance.updateWallMs>0 && diagnostics.simulated.samples.length<=32,{stopReason:diagnostics.simulated.stopReason,advancedSeconds:diagnostics.simulated.advancedSeconds,performance:diagnostics.simulated.performance});
  check('real-engine wall budget returns partial measurements rather than looping indefinitely',diagnostics.timeLimited.partial && diagnostics.timeLimited.reason==='wall_time_budget' && diagnostics.timeLimited.advancedSeconds<86400 && diagnostics.timeLimited.performance.wallMs>=100,diagnostics.timeLimited);
  check('profiling reports non-advancing clock, engine failure and cancellation without leaving simulation running',diagnostics.stopped==='simulation_clock_not_advancing' && diagnostics.error.success===false && diagnostics.error.stopReason==='engine_error' && diagnostics.cancelled==='cancelled' && !diagnostics.running,{stopped:diagnostics.stopped,error:diagnostics.error,cancelled:diagnostics.cancelled,running:diagnostics.running});
  check('tool budget ends with provider-generated partial evidence summary and measured timing, not iteration error',diagnostics.partial.partial && diagnostics.partial.calls===3 && diagnostics.partial.lastTools===0 && diagnostics.partial.hasQuestion && diagnostics.partial.hasEvidence && diagnostics.partial.stats.toolCalls===2 && diagnostics.partial.stats.modelCalls===3 && diagnostics.partial.stats.budgetReached && diagnostics.partial.stats.wallMs>=diagnostics.partial.stats.toolWallMs,diagnostics.partial);
  await page.evaluate(()=>applyExampleData(EXAMPLES.simple,'simple'));

  const agentResult=await page.evaluate(async()=>{
    class MockProvider extends App.AI.AIProvider{
      constructor(){super({id:'mock',name:'Mock',supportsTools:true,supportsStreaming:true});this.status='ready';this.modelId='mock';this.calls=0;}
      async *streamChat(){this.calls++;if(this.calls===1)yield {type:'done',response:{message:{role:'assistant',content:'',toolCalls:[{id:'one',name:'get_model_summary',arguments:{}}]}}};else{yield {type:'delta',delta:'Verified from FactSim.'};yield {type:'done',response:{message:{role:'assistant',content:'Verified from FactSim.',toolCalls:[]}}};}}
    }
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);const provider=new MockProvider(),agent=new App.AI.FactSimAgent({provider,registry,maxToolIterations:3});const result=await agent.send('Describe the model');return {content:result.content,calls:provider.calls,roles:agent.messages.map(message=>message.role)};
  });
  check('agent completes multi-step tool loop',agentResult.calls===2 && agentResult.roles.includes('tool') && agentResult.content==='Verified from FactSim.',agentResult);

  const welcomeResult=await page.evaluate(async()=>{
    let providerCalls=0,toolCalls=0;const registry=new App.AI.ToolRegistry();App.AI.FactSimTools.register(registry);
    const execute=registry.execute.bind(registry);registry.execute=(...args)=>{toolCalls++;return execute(...args);};
    const requests=[];
    const provider={status:'ready',supportsStreaming:false,chat:async messages=>{providerCalls++;requests.push(messages);return {message:{role:'assistant',content:`LLM response ${providerCalls}: ${messages.at(-1).content}`,toolCalls:[]}};}};
    const agent=new App.AI.FactSimAgent({registry,provider});
    const greeting=await agent.send('こんにちは！'),help=await agent.send('何ができる？'),alternate=await agent.send('なにができますか？');
    const beforeModel={providerCalls,toolCalls};await agent.send('こんにちは、このモデルを説明して');
    const offline=new App.AI.FactSimAgent({registry});let offlineError='';try{await offline.send('こんにちは');}catch(error){offlineError=error.message;}
    return {greeting:greeting.content,help:help.content,alternate:alternate.content,beforeModel,providerCalls,offlineError,historyPreserved:requests[2].some(message=>message.content==='こんにちは！'),roles:agent.messages.map(message=>message.role)};
  });
  check('every greeting and capability question receives provider-generated text',welcomeResult.greeting==='LLM response 1: こんにちは！' && welcomeResult.help==='LLM response 2: 何ができる？' && welcomeResult.alternate==='LLM response 3: なにができますか？' && welcomeResult.beforeModel.providerCalls===3 && welcomeResult.beforeModel.toolCalls===0,welcomeResult);
  check('conversation history is preserved and offline chat does not fake an AI answer',welcomeResult.providerCalls===4 && welcomeResult.historyPreserved && /Load or connect/.test(welcomeResult.offlineError),welcomeResult);

  await page.evaluate(()=>{App.AI.agent.setProvider({status:'ready',supportsStreaming:false,chat:async messages=>({message:{role:'assistant',content:`Generated UI reply: ${messages.at(-1).content}`,toolCalls:[]}})});});

  await page.locator('#aiChatInput').fill('こんにちは');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('aiChatMessages').textContent.includes('Generated UI reply: こんにちは'));
  await page.locator('#aiChatInput').fill('何ができる？');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('aiChatMessages').textContent.includes('Generated UI reply: 何ができる？'));
  check('chat UI displays provider answers rather than canned greetings',await page.locator('.aiMessage-error').count()===0);

  const hermesResult=await page.evaluate(async()=>{
    const provider=new App.AI.WebLLMProvider();provider.modelId='Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC';provider.status='ready';
    const requests=[];
    provider.engine={chat:{completions:{create:async request=>{
      if(request.tools && request.messages.some(message=>message.role==='system'))throw new Error('Cannot specify customized system prompt');
      requests.push(JSON.parse(JSON.stringify(request)));
      // Reproduce WebLLM's request mutation to ensure agent history stays intact.
      request.messages.unshift({role:'system',content:'WebLLM Hermes tool prompt'});
      const content=JSON.stringify({reply:'こんにちは',tool_calls:[]});
      if(request.stream)return (async function*(){yield {choices:[{delta:{content:content.slice(0,15)}}]};yield {choices:[{delta:{content:content.slice(15)},finish_reason:'stop'}]};})();
      return {choices:[{message:{role:'assistant',content},finish_reason:'stop'}]};
    }}}};
    const messages=[{role:'system',content:'Never invent FactSim KPIs.'},{role:'user',content:'こんにちは'}],original=JSON.stringify(messages),tools=App.AI.toolRegistry.list();
    const chat=await provider.chat(messages,{tools});let streamed='';for await(const item of provider.streamChat(messages,{tools}))if(item.type==='delta')streamed+=item.delta;
    const continuation=provider._request([...messages,{role:'assistant',content:'',tool_calls:[{id:'one',type:'function',function:{name:'get_kpis',arguments:'{}'}}]},{role:'tool',tool_call_id:'one',name:'get_kpis',content:'{"success":true}'}],{tools},true);
    const normal=provider._request(messages,{},false);
    return {chat:chat.message.content,streamed,preserved:JSON.stringify(messages)===original,adapted:requests.every(request=>!request.tools && request.messages[0].role==='system' && request.messages[0].content.includes('Never invent FactSim KPIs.') && JSON.parse(request.response_format.schema).properties.reply.type==='string'),toolResultPreserved:continuation.messages.at(-1).content.includes('FactSim tool result (get_kpis, one)') && continuation.messages.at(-1).content.includes('"success":true'),normalSystemPreserved:normal.messages[0].role==='system'};
  });
  check('Hermes chat and streaming accept tools while preserving FactSim instructions and history',hermesResult.chat==='こんにちは' && hermesResult.streamed==='こんにちは' && hermesResult.preserved && hermesResult.adapted && hermesResult.toolResultPreserved && hermesResult.normalSystemPreserved,hermesResult);

  const contextResult=await page.evaluate(async()=>{
    const provider=new App.AI.WebLLMProvider();provider.modelId='Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC';provider.status='ready';
    let resets=0,attempts=0;const captured=[];
    provider.engine={resetChat:async()=>{resets++;},chat:{completions:{create:async request=>{
      captured.push(JSON.parse(JSON.stringify(request)));attempts++;
      return (async function*(){if(attempts===1)throw new Error('Prompt tokens exceed context window size');yield {choices:[{delta:{content:'{"reply":"Recovered","tool_calls":[]}'},finish_reason:'stop'}]};})();
    }}}};
    const messages=[{role:'system',content:'Use measured facts.'},{role:'user',content:'old turn'},{role:'assistant',content:'x'.repeat(20000)},{role:'user',content:'結果を教えて'},
      {role:'assistant',content:'',tool_calls:[{id:'kpi',type:'function',function:{name:'get_kpis',arguments:'{}'}}]},
      {role:'tool',tool_call_id:'kpi',content:JSON.stringify({success:true,totalCompleted:42,sinks:Array.from({length:100},(_,i)=>({nodeId:i,name:'設備'.repeat(100),completedCount:i}))})}];
    const before=JSON.stringify(messages);let text='';for await(const item of provider.streamChat(messages,{tools:App.AI.toolRegistry.list()}))if(item.type==='delta')text+=item.delta;
    return {text,resets,attempts,preserved:JSON.stringify(messages)===before,oldTurnRemoved:captured.every(request=>!JSON.stringify(request).includes('old turn')),boundedResult:captured.every(request=>request.messages.at(-1).content.length<=1900),measuredTotal:JSON.parse(captured.at(-1).messages.at(-1).content.split('\n').slice(1).join('\n')).totalCompleted,outputLimit:captured.every(request=>request.max_tokens===512)};
  });
  check('WebLLM bounds large tool history and recovers from streaming prefill overflow',contextResult.text==='Recovered' && contextResult.resets===2 && contextResult.attempts===2 && contextResult.preserved && contextResult.oldTurnRemoved && contextResult.boundedResult && contextResult.measuredTotal===42 && contextResult.outputLimit,contextResult);

  const lengthResult=await page.evaluate(async()=>{
    const provider=new App.AI.WebLLMProvider();provider.status='ready';const requests=[];
    provider.engine={resetChat:async()=>{},chat:{completions:{create:async request=>{
      requests.push(request);const cut=requests.length%2===1,content=cut ? '{"reply":"unfinished' : '{"reply":"Generated recovery","tool_calls":[]}';
      if(!request.stream)return {choices:[{message:{content},finish_reason:cut ? 'length' : 'stop'}]};
      return (async function*(){yield {choices:[{delta:{content},finish_reason:cut ? 'length' : 'stop'}]};})();
    }}}};
    const messages=[{role:'user',content:'ライン構成を相談したい'}],options={tools:App.AI.toolRegistry.list()};
    const chat=await provider.chat(messages,options);let text='',done=0;
    for await(const item of provider.streamChat(messages,options)){if(item.type==='delta')text+=item.delta;if(item.type==='done')done++;}
    return {chat:chat.message.content,text,done,attempts:requests.length,largerBudget:requests[1].max_tokens===768 && requests[3].max_tokens===768};
  });
  check('truncated model replies are regenerated without exposing partial JSON or tool calls',lengthResult.chat==='Generated recovery' && lengthResult.text==='Generated recovery' && lengthResult.done===1 && lengthResult.attempts===4 && lengthResult.largerBudget,lengthResult);

  const validationResult=await page.evaluate(async()=>{
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);
    const before=App.graph._nodes.length,requests=[];const replies=[
      {content:'',toolCalls:[{name:'add_node',id:'invalid',arguments:{kind:'source'}}]},
      {content:'名前が必要なので、入口という名前で追加します。',toolCalls:[{name:'add_node',id:'fixed',arguments:{kind:'source',name:'検証後の入口'}}]},
      {content:'入口を追加しました。',toolCalls:[]}
    ];
    const provider={status:'ready',supportsTools:true,supportsStreaming:false,chat:async messages=>{requests.push(messages);return {message:replies.shift()};}};
    const agent=new App.AI.FactSimAgent({provider,registry});const reply=await agent.send('入口を追加して');
    const malformed=await registry.execute('invented_tool',{});
    const result={reply:reply.content,createdOnce:App.graph._nodes.length===before+1,errorDelivered:requests[1].some(message=>message.role==='tool' && JSON.parse(message.content).errorType==='ToolValidationError'),unknownRejected:malformed.success===false};
    applyExampleData(EXAMPLES.simple,'simple');return result;
  });
  check('agent can correct invalid tool arguments without bypassing validation',validationResult.createdOnce && validationResult.errorDelivered && validationResult.unknownRejected,validationResult);

  const buildResult=await page.evaluate(async()=>{
    applyExampleData(EXAMPLES.simple,'simple');
    const beforeNodes=App.graph._nodes.length,beforeEdges=Object.keys(App.graph.links).length;
    const provider=new App.AI.WebLLMProvider();provider.modelId='Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC';provider.status='ready';
    let stage=0;const requests=[];
    const replies=[
      {reply:'入口と出口を追加する案です。この構成で作成しますか？',tool_calls:[]},
      {reply:'入口を追加します。',tool_calls:[{name:'add_node',arguments:{kind:'source',name:'会話で追加した入口'}}]},
      {reply:'出口を追加します。',tool_calls:[{name:'add_node',arguments:{kind:'sink',name:'会話で追加した出口'}}]},
      {reply:'追加した入口と出口を接続します。',tool_calls:[{name:'connect_nodes',arguments:{fromNodeId:'会話で追加した入口',toNodeId:'会話で追加した出口'}}]},
      {reply:'入口と出口を追加して接続しました。',tool_calls:[]}
    ];
    provider.engine={resetChat:async()=>{},chat:{completions:{create:async request=>{
      requests.push(JSON.parse(JSON.stringify(request)));const content=JSON.stringify(replies[stage++]);
      return (async function*(){yield {choices:[{delta:{content},finish_reason:'stop'}]};})();
    }}}};
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);
    const agent=new App.AI.FactSimAgent({registry,provider});let errors=0;agent.addEventListener('tool-result',event=>{if(!event.detail.result.success)errors++;});
    await agent.send('入口と出口を追加する構成を相談したい');const discussedWithoutWrites=App.graph._nodes.length===beforeNodes;
    const answer=await agent.send('その構成で作って');
    const created=App.graph._nodes.length===beforeNodes+2 && Object.keys(App.graph.links).length===beforeEdges+1;
    const duplicate=await registry.execute('connect_nodes',{fromNodeId:'会話で追加した入口',toNodeId:'会話で追加した出口'});
    const invalidKind=await registry.execute('add_node',{kind:'invented-type',name:'invalid'});
    const missing=await registry.execute('connect_nodes',{fromNodeId:'unknown',toNodeId:'会話で追加した出口'});
    const invalidPort=await registry.execute('connect_nodes',{fromNodeId:'会話で追加した入口',toNodeId:'会話で追加した出口',fromPort:0.5});
    undo();const undoRemovedEdge=Object.keys(App.graph.links).length===beforeEdges;redo();
    const refused=new App.AI.ToolRegistry({confirm:async()=>false});App.AI.FactSimTools.register(refused);const cancelled=await refused.execute('add_node',{kind:'sink',name:'cancelled'});
    const result={answer:answer.content,discussedWithoutWrites,created,errors,duplicateRejected:duplicate.success===false,invalidKindRejected:invalidKind.success===false,missingRejected:missing.success===false,invalidPortRejected:invalidPort.success===false,undoRemovedEdge,redoRestoredEdge:Object.keys(App.graph.links).length===beforeEdges+1,confirmationCancelled:cancelled.cancelled===true && !App.graph._nodes.some(node=>node.title==='cancelled'),previousTurnPreserved:requests[1].messages.some(message=>message.content==='入口と出口を追加する構成を相談したい'),toolResultsDelivered:requests.slice(2).every(request=>request.messages.some(message=>message.content.startsWith('FactSim tool result')))};
    applyExampleData(EXAMPLES.simple,'simple');return result;
  });
  check('conversation can discuss a design then build and connect real nodes through WebLLM adapter',buildResult.discussedWithoutWrites && buildResult.created && buildResult.errors===0 && buildResult.previousTurnPreserved && buildResult.toolResultsDelivered && buildResult.answer.includes('接続しました'),buildResult);
  check('graph tools validate targets, duplicate edges, kinds and port indices and support undo and confirmation',buildResult.duplicateRejected && buildResult.invalidKindRejected && buildResult.missingRejected && buildResult.invalidPortRejected && buildResult.undoRemovedEdge && buildResult.redoRestoredEdge && buildResult.confirmationCancelled,buildResult);

  const insertionResult=await page.evaluate(async()=>{
    applyExampleData(EXAMPLES.simple,'simple');
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);
    const original=Object.values(App.graph.links)[0],beforeNodes=App.graph._nodes.length,beforeEdges=Object.keys(App.graph.links).length;
    const input={fromNodeId:String(original.origin_id),toNodeId:String(original.target_id),kind:'buffer',name:'AI挿入バッファ'};
    const inspected=await registry.execute('get_node',{nodeId:input.fromNodeId});
    const snapshot=()=>JSON.stringify({nodes:App.graph.serialize().nodes,links:App.graph.serialize().links});
    const before=snapshot();
    const refused=new App.AI.ToolRegistry({confirm:async()=>false});App.AI.FactSimTools.register(refused);
    const cancelled=await refused.execute('insert_node_on_link',input),cancelUnchanged=snapshot()===before;
    const invalid=await registry.execute('insert_node_on_link',{...input,kind:'sink'}),invalidUnchanged=snapshot()===before;
    const factory=App.createNodeFromCatalog;let failed;
    try{App.createNodeFromCatalog=(...args)=>{const node=factory(...args);node.connect=()=>null;return node;};failed=await registry.execute('insert_node_on_link',input);}
    finally{App.createNodeFromCatalog=factory;}
    const rolledBack=!failed.success && /original graph restored/.test(failed.error) && snapshot()===before;
    const result=await registry.execute('insert_node_on_link',input);
    const inserted=App.graph.getNodeById(result.nodeId);
    const bufferFlow=inserted?.properties?.flow?.nodes || [];
    const replaced=result.success && !App.graph.links[original.id] && App.graph._nodes.length===beforeNodes+1 && Object.keys(App.graph.links).length===beforeEdges+1 && result.links.length===2 && bufferFlow.some(item=>item.kind==='process' && item.config.seconds===0) && bufferFlow.some(item=>item.kind==='recovery' && item.config.seconds===0);
    const untouched=Object.values(App.graph.links).filter(link=>!result.links.some(item=>item.linkId===link.id)).length===beforeEdges-1;
    undo();const undoRestored=App.graph._nodes.length===beforeNodes && !!App.graph.links[original.id] && Object.keys(App.graph.links).length===beforeEdges;
    redo();const redoRestored=App.graph._nodes.length===beforeNodes+1 && !App.graph.links[original.id] && Object.keys(App.graph.links).length===beforeEdges+1;
    const sim=await registry.execute('run_simulation',{durationSeconds:5,resetBeforeRun:true});
    applyExampleData(EXAMPLES.simple,'simple');
    return {result,replaced,untouched,undoRestored,redoRestored,rolledBack,failed,cancelled:cancelled.cancelled && cancelUnchanged,invalidRejected:!invalid.success && invalidUnchanged,connectionDTO:inspected.node.connections.outputs.some(link=>link.linkId===original.id && Number.isInteger(link.fromPortIndex) && Number.isInteger(link.toPortIndex)),simulationSucceeded:sim.success};
  });
  check('buffer insertion atomically replaces one real link, preserves other links and runs simulation',insertionResult.replaced && insertionResult.untouched && insertionResult.simulationSucceeded && insertionResult.connectionDTO,insertionResult);
  check('buffer insertion supports single undo/redo, confirmation, validation and rollback after failed reconnect',insertionResult.undoRestored && insertionResult.redoRestored && insertionResult.rolledBack && insertionResult.cancelled && insertionResult.invalidRejected,insertionResult);

  const ollamaInsertion=await page.evaluate(async origin=>{
    applyExampleData(EXAMPLES.simple,'simple');const original=Object.values(App.graph.links)[0],before=App.graph._nodes.length;
    const provider=new App.AI.OllamaProvider();await provider.initialize({endpoint:origin+'/mock-ollama',modelId:'mock-ollama'});
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);
    const agent=new App.AI.FactSimAgent({provider,registry});const executed=[];agent.addEventListener('tool-result',event=>executed.push({name:event.detail.call.name,success:event.detail.result.success}));
    const reply=await agent.send('[test-buffer-insertion]'+JSON.stringify({fromNodeId:String(original.origin_id),toNodeId:String(original.target_id),kind:'buffer',name:'Ollama経由のバッファ'}));
    const result={reply:reply.content,executed,inserted:App.graph._nodes.length===before+1 && !App.graph.links[original.id]};
    await provider.dispose();applyExampleData(EXAMPLES.simple,'simple');return result;
  },`http://127.0.0.1:${server.address().port}`);
  check('Ollama tool-call streaming can inspect then insert a buffer into the live graph',ollamaInsertion.inserted && ollamaInsertion.reply.includes('挿入しました') && ollamaInsertion.executed.length===2 && ollamaInsertion.executed.every(tool=>tool.success),ollamaInsertion);

  const layoutResult=await page.evaluate(async()=>{
    applyExampleData(EXAMPLES.simple,'simple');
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);
    await registry.execute('run_simulation',{durationSeconds:5,resetBeforeRun:true});
    App.graph._nodes.forEach((node,index)=>{node.pos[0]=200;node.pos[1]=200;node.size[0]+=index*40;});resetHistory();
    const snapshot=()=>JSON.stringify(App.graph.serialize()),before=snapshot();
    const positions=()=>JSON.stringify(App.graph._nodes.map(node=>[node.id,...node.pos]));
    const unchanged=()=>JSON.stringify({nodes:App.graph.serialize().nodes.map(({pos,...node})=>node),links:App.graph.serialize().links,kpis:App.AI.FactSimTools.getKpis()});
    const beforePositions=positions(),beforeData=unchanged();
    const refused=new App.AI.ToolRegistry({confirm:async()=>false});App.AI.FactSimTools.register(refused);
    const cancelled=await refused.execute('auto_layout',{}),cancelUnchanged=snapshot()===before;
    const result=await registry.execute('auto_layout',{}),afterPositions=positions(),preserved=unchanged()===beforeData;
    undo();const undoRestored=positions()===beforePositions;redo();const redoRestored=positions()===afterPositions;
    const node=App.graph._nodes[0],prior={x:node.pos[0],y:node.pos[1]};
    const moved=await registry.execute('move_node',{nodeId:String(node.id),x:100,y:700});
    const dto=await registry.execute('get_node',{nodeId:String(node.id)});
    undo();const moveUndone=App.graph.getNodeById(node.id).pos[0]===prior.x && App.graph.getNodeById(node.id).pos[1]===prior.y;
    const invalid=await registry.execute('move_node',{nodeId:String(node.id),x:Infinity,y:0});
    const missing=await registry.execute('move_node',{nodeId:'does-not-exist',x:0,y:0});
    applyExampleData(EXAMPLES.simple,'simple');
    const calls=[];let step=0;
    const provider={status:'ready',supportsTools:true,supportsStreaming:false,chat:async messages=>{calls.push(messages);return {message:step++===0 ? {content:'',toolCalls:[{id:'layout',name:'auto_layout',arguments:{}}]} : {content:'配置を整えました。',toolCalls:[]}};}};
    const agent=new App.AI.FactSimAgent({registry,provider}),answer=await agent.send('ノードが重なって見づらいです。見た目を整えてください');
    const toolDelivered=calls[1].some(message=>message.role==='tool' && message.name==='auto_layout' && JSON.parse(message.content).success);
    applyExampleData(EXAMPLES.simple,'simple');
    return {result,preserved,undoRestored,redoRestored,cancelled:cancelled.cancelled && cancelUnchanged,moved:moved.success && dto.node.position.x===100 && dto.node.position.y===700 && dto.node.size.width>0,moveUndone,invalidRejected:!invalid.success && !missing.success,toolDelivered,answer:answer.content};
  });
  check('AI layout removes overlaps while preserving node settings, links and measured KPIs',layoutResult.result.success && layoutResult.result.overlapPairsBefore>0 && layoutResult.result.overlapPairsAfter===0 && layoutResult.preserved,layoutResult);
  check('layout and coordinate movement support confirmation, validation and single undo/redo',layoutResult.undoRestored && layoutResult.redoRestored && layoutResult.cancelled && layoutResult.moved && layoutResult.moveUndone && layoutResult.invalidRejected,layoutResult);
  check('agent can fulfill a natural language graph appearance request with the layout tool',layoutResult.toolDelivered && layoutResult.answer.includes('整えました'),layoutResult);

  const individualLayout=await page.evaluate(async origin=>{
    applyExampleData(EXAMPLES.simple,'simple');
    const registry=new App.AI.ToolRegistry({policy:()=> 'allow-safe'});App.AI.FactSimTools.register(registry);
    await registry.execute('run_simulation',{durationSeconds:5,resetBeforeRun:true});
    const all=App.graph._nodes;all.forEach((node,index)=>{node.pos[0]=index<2 ? 100 : 100+index*450;node.pos[1]=180;});fitToScreen({silent:true});resetHistory();
    const fixed=JSON.stringify(all.filter((_,index)=>index!==1).map(node=>[node.id,...node.pos]));
    const invariant=()=>JSON.stringify({nodes:App.graph.serialize().nodes.map(({pos,...node})=>node),links:App.graph.serialize().links,kpis:App.AI.FactSimTools.getKpis()});
    const original=invariant(),viewportBefore=JSON.stringify({scale:App.canvas.ds.scale,offset:[...App.canvas.ds.offset]});
    const before=await registry.execute('get_layout_snapshot',{scope:'all'},{supportsVision:false});
    const image=await registry.execute('get_layout_snapshot',{}, {supportsVision:true});
    const blocked=await registry.execute('move_node',{nodeId:String(all[1].id),x:all[2].pos[0],y:all[2].pos[1],avoidOverlap:true});
    const provider=new App.AI.OllamaProvider();await provider.initialize({endpoint:origin+'/mock-ollama',modelId:'mock-ollama'});
    const agent=new App.AI.FactSimAgent({provider,registry});const toolResults=[];agent.addEventListener('tool-result',event=>toolResults.push({name:event.detail.call.name,result:event.detail.result}));
    const answer=await agent.send('[test-individual-layout]'+JSON.stringify({nodeId:String(all[1].id),x:100,y:600}));
    const after=await registry.execute('get_layout_snapshot',{scope:'all'}, {supportsVision:false});
    const unchangedNodes=JSON.stringify(App.graph._nodes.filter((_,index)=>index!==1).map(node=>[node.id,...node.pos]))===fixed;
    const result={visionDetected:provider.supportsVision,hadOverlap:before.overlapPairCount>0,geometryOnly:!before.image && !before.imageStatus.attached,actualImage:!!image.image?.data?.startsWith('iVBOR') && image.imageStatus.attached,hasTransform:before.viewport.scale>0 && before.nodes.every(node=>node.bounds.width>0 && Number.isFinite(node.screenBounds.x)),blocked:!blocked.success,overlapAfter:after.overlapPairCount,unchangedNodes,preserved:invariant()===original,viewportPreserved:JSON.stringify({scale:App.canvas.ds.scale,offset:[...App.canvas.ds.offset]})===viewportBefore,steps:toolResults.map(tool=>tool.name),toolJSONClean:toolResults.every(tool=>!tool.result.image && !JSON.stringify(tool.result).includes('iVBOR')),answer:answer.content,attachmentCleared:!agent._layoutImage,image:image.image?.data};
    await provider.dispose();
    const textProvider=new App.AI.OllamaProvider();await textProvider.initialize({endpoint:origin+'/mock-ollama',modelId:'mock-text'});result.textModelDetected=!textProvider.supportsVision;await textProvider.dispose();
    applyExampleData(EXAMPLES.simple,'simple');return result;
  },`http://127.0.0.1:${server.address().port}`);
  await fs.writeFile(path.join(root,'tmp','ai-layout-observation.png'),Buffer.from(individualLayout.image,'base64'));delete individualLayout.image;
  check('screen observation captures actual graph pixels and accurate bounds while distinguishing text-only models',individualLayout.visionDetected && individualLayout.textModelDetected && individualLayout.hadOverlap && individualLayout.geometryOnly && individualLayout.actualImage && individualLayout.hasTransform,individualLayout);
  check('AI can inspect, move one overlapping node, and reinspect without automatic layout or changing unaffected nodes',individualLayout.steps.join(',')==='get_layout_snapshot,move_node,get_layout_snapshot' && individualLayout.overlapAfter===0 && individualLayout.unchangedNodes && individualLayout.preserved && individualLayout.viewportPreserved && individualLayout.blocked,individualLayout);
  check('Ollama receives PNG as an image attachment, never in tool JSON or retained chat history',screenProtocolChecks.some(check=>check.imageCount===1) && screenProtocolChecks.every(check=>check.base64 && check.toolJSONClean && check.imageCount<=1) && individualLayout.toolJSONClean && individualLayout.attachmentCleared,{...individualLayout,protocol:screenProtocolChecks});

  const geometryBudget=await page.evaluate(()=>{
    const provider=new App.AI.WebLLMProvider();provider.engine={};provider.status='ready';
    const content=JSON.stringify({success:true,viewport:{scale:1,offset:{x:0,y:0},graphBounds:{x:0,y:0,width:1000,height:800}},nodeCount:300,overlapPairCount:1,overlaps:[{nodeIds:[299,300]}],nodes:Array.from({length:300},(_,index)=>({id:index+1,name:'Node '+(index+1),position:{x:index,y:100},bounds:{x:index,y:70,width:230,height:140}}))});
    const request=provider._request([{role:'user',content:'重なりを確認して'},{role:'tool',name:'get_layout_snapshot',content}],{},false),summary=JSON.parse(request.messages.at(-1).content);
    return {bounded:request.messages.at(-1).content.length<1900,hasOverlappingGeometry:summary.nodes.some(node=>node.id===299 && node.bounds.width===230) && summary.nodes.some(node=>node.id===300),count:summary.overlapPairCount,truncated:summary.contextTruncated};
  });
  check('text-only bounded context preserves geometry for overlapping nodes instead of dropping all positions',geometryBudget.bounded && geometryBudget.hasOverlappingGeometry && geometryBudget.count===1 && geometryBudget.truncated,geometryBudget);

  const diagnosticBudget=await page.evaluate(()=>{
    const provider=new App.AI.WebLLMProvider();provider.engine={};provider.status='ready';
    const measured=App.AI.SimulationDiagnostics.report();measured.graph.padding='x'.repeat(20000);
    const messages=[{role:'user',content:'停滞の原因を調査して'},{role:'tool',name:'get_simulation_report',content:JSON.stringify(measured)}];
    return [false,true].map(contextRetry=>{const content=provider._request(messages,{contextRetry},false).messages.at(-1).content,summary=JSON.parse(content);return {bounded:content.length<=(contextRetry ? 800 : 1800),factsPreserved:summary.nodeCount===measured.nodeCount && summary.edgeCount===measured.edgeCount && summary.totalCompleted===measured.kpis.totalCompleted,truncated:summary.contextTruncated};});
  });
  check('Browser AI diagnostic compression retains measured counts/KPIs at normal and retry context limits',diagnosticBudget.every(result=>result.bounded && result.factsPreserved && result.truncated),diagnosticBudget);

  await page.getByRole('button',{name:'Clear',exact:true}).click();
  const attachmentBytes=await fs.readFile(path.join(root,'tmp','ai-layout-observation.png'));
  await page.locator('#aiImageFiles').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:attachmentBytes});
  await page.locator('#aiImagePreviews img').waitFor({state:'visible'});
  await page.getByRole('button',{name:'画像を削除: reference.png',exact:true}).click();
  check('image file selection previews attachments and supports removal',await page.locator('#aiImagePreviews img').count()===0);
  await page.locator('#aiChatInput').fill('この画像のここがおかしいです [test-uploaded-image]');
  await page.evaluate(data=>{
    const bytes=Uint8Array.from(atob(data),char=>char.charCodeAt(0)),clipboard=new DataTransfer();
    clipboard.items.add(new File([bytes],'pasted.png',{type:'image/png'}));
    document.getElementById('aiChatInput').dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));
  },attachmentBytes.toString('base64'));
  await page.locator('#aiImagePreviews img').waitFor({state:'visible'});
  await page.evaluate(()=>App.AI.agent.setProvider({status:'ready',supportsVision:false,supportsStreaming:false,chat:async()=>{throw new Error('Image should not be sent to a text-only model.');}}));
  await page.getByRole('button',{name:'Send',exact:true}).click();
  check('unsupported image models show guidance while retaining pasted image and text',await page.locator('.aiMessage-error').last().innerText().then(text=>text.includes('画像非対応')) && await page.locator('#aiImagePreviews img').count()===1 && (await page.locator('#aiChatInput').inputValue()).includes('ここがおかしい'));
  await page.evaluate(async origin=>{const provider=new App.AI.OllamaProvider();await provider.initialize({endpoint:origin+'/mock-ollama',modelId:'mock-ollama'});App.AI.agent.setProvider(provider);},`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.waitForFunction(()=>!App.AI.agent.running && App.AI.agent.messages.at(-1)?.role==='assistant');
  check('pasted image and accompanying instruction reach Ollama and appear in the chat',chatAttachmentRequests.length===1 && chatAttachmentRequests[0].count===1 && chatAttachmentRequests[0].png && chatAttachmentRequests[0].prompt.includes('ここがおかしい') && await page.locator('.aiMessage-user img').count()===1 && await page.locator('#aiImagePreviews img').count()===0,chatAttachmentRequests);
  await page.locator('#aiChatInput').fill('その画像の問題について、もう少し説明して');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.waitForFunction(()=>!App.AI.agent.running && App.AI.agent.messages.filter(message=>message.role==='assistant').length>=2);
  check('follow-up conversation retains the user image as a proper image attachment',chatAttachmentRequests.at(-1).count===1 && chatAttachmentRequests.at(-1).png && chatAttachmentRequests.at(-1).prompt.includes('もう少し'),chatAttachmentRequests.at(-1));
  await page.locator('#aiImageFiles').setInputFiles({name:'only-image.png',mimeType:'image/png',buffer:attachmentBytes});
  await page.locator('#aiImagePreviews img').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.waitForFunction(()=>!App.AI.agent.running && App.AI.agent.messages.filter(message=>message.role==='assistant').length>=3);
  check('image-only messages receive a default inspection request instead of being silently ignored',chatAttachmentRequests.at(-1).prompt==='添付画像を確認してください。' && chatAttachmentRequests.at(-1).count===2,chatAttachmentRequests.at(-1));
  const dropAndPaste=await page.evaluate(data=>{
    const clipboard=new DataTransfer();clipboard.setData('text/plain','通常のテキスト');
    const event=new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true});document.getElementById('aiChatInput').dispatchEvent(event);
    const drop=new DataTransfer();drop.items.add(new File([Uint8Array.from(atob(data),char=>char.charCodeAt(0))],'dropped.png',{type:'image/png'}));
    const dropped=new DragEvent('drop',{dataTransfer:drop,bubbles:true,cancelable:true});document.querySelector('.aiComposer').dispatchEvent(dropped);
    return {textPasteNotIntercepted:!event.defaultPrevented,dropHandled:dropped.defaultPrevented};
  },attachmentBytes.toString('base64'));
  await page.locator('#aiImagePreviews img').waitFor({state:'visible'});
  check('dragged images preview correctly without intercepting ordinary text paste',dropAndPaste.textPasteNotIntercepted && dropAndPaste.dropHandled && await page.locator('#aiImagePreviews img').count()===1,dropAndPaste);
  await page.screenshot({path:path.join(root,'tmp','ai-image-chat.png'),fullPage:true});

  const attachmentSafety=await page.evaluate(async data=>{
    const image={mimeType:'image/png',data,name:'image.png'},requests=[];
    const provider={status:'ready',supportsVision:true,supportsStreaming:false,chat:async messages=>{requests.push(messages);return {message:{content:'Generated response',toolCalls:[]}};}};
    const agent=new App.AI.FactSimAgent({provider,registry:new App.AI.ToolRegistry()});
    for(let i=0;i<6;i++)await agent.send('画像 '+i,{images:[image]});
    const bounded=requests.every(messages=>messages.flatMap(message=>message.images || []).length<=4);
    agent.setProvider({...provider,supportsVision:false});await agent.send('続けて説明して');
    const noImageForText=requests.at(-1).every(message=>!message.images);
    const failures=[];for(const file of [{type:'image/svg+xml',size:1},{type:'image/png',size:11*1024*1024}]){try{await App.AI.prepareChatImage(file);failures.push(false);}catch(_e){failures.push(true);}}
    let tooMany=false;try{await new App.AI.FactSimAgent({provider,registry:new App.AI.ToolRegistry()}).send('画像',{images:Array(5).fill(image)});}catch(_e){tooMany=true;}
    const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=100;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const reduced=await App.AI.prepareChatImage(new File([blob],'wide.png',{type:'image/png'}));
    agent.clear();return {bounded,noImageForText,invalidFilesRejected:failures.every(Boolean),tooMany,clearRemoved:agent.messages.length===0,resized:reduced.width===1600 && reduced.height===80 && reduced.mimeType==='image/png'};
  },attachmentBytes.toString('base64'));
  check('image attachments are bounded, validated, cleared, and never sent to text-only models',Object.values(attachmentSafety).every(Boolean),attachmentSafety);

  const providerResults=await page.evaluate(async origin=>{
    async function collect(provider){let text='',done=null;for await(const item of provider.streamChat([{role:'user',content:'hello'}],{})){if(item.type==='delta')text+=item.delta;if(item.type==='done')done=item.response;}return {text,content:done?.message?.content};}
    const openai=new App.AI.OpenAICompatibleProvider();await openai.initialize({baseUrl:`${origin}/mock-openai`,modelId:'mock-model',apiKey:'temporary-test-key'});const openaiModels=await openai.getModels(),openaiChat=await openai.chat([{role:'user',content:'hello'}]),openaiStream=await collect(openai);await openai.dispose();
    const ollama=new App.AI.OllamaProvider();ollama.endpoint=`${origin}/mock-ollama`;const ollamaModels=await ollama.getModels();await ollama.initialize({endpoint:`${origin}/mock-ollama`,modelId:'mock-ollama'});const ollamaChat=await ollama.chat([{role:'user',content:'hello'}]),ollamaStream=await collect(ollama);
    return {openaiModels,openaiChat,openaiStream,openaiKeyCleared:openai.apiKey==='',ollamaModels,ollamaChat,ollamaStream};
  },`http://127.0.0.1:${server.address().port}`);
  check('OpenAI-compatible adapter supports models, chat, and SSE streaming',providerResults.openaiModels[0].id==='mock-model' && providerResults.openaiChat.message.content==='OpenAI reply' && providerResults.openaiStream.text==='OpenAI stream' && providerResults.openaiKeyCleared,providerResults);
  check('Ollama adapter supports discovery, chat, and NDJSON streaming',providerResults.ollamaModels[0].id==='mock-ollama' && providerResults.ollamaChat.message.content==='Ollama reply' && providerResults.ollamaStream.text==='Ollama stream',providerResults);

  if(process.argv.includes('--real-webllm')){
    const gpu=await page.evaluate(async()=>({available:!!navigator.gpu,adapter:!!(await navigator.gpu?.requestAdapter())}));
    if(!gpu.adapter)report.realWebLLM={attempted:false,reason:'No WebGPU adapter available in the test browser.',gpu};
    else{
      console.log('Loading real WebLLM model for conversational acceptance checks…');
      await page.exposeFunction('reportAIProgress',message=>console.log(message));
      const modelId=process.env.FACT_SIM_AI_TEST_MODEL || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
      const result=await page.evaluate(async modelId=>{
        const provider=new App.AI.WebLLMProvider();let lastProgress=-1;
        await provider.initialize({modelId,onProgress:report=>{const step=Math.floor(report.progress*10);if(step>lastProgress){lastProgress=step;window.reportAIProgress(`${modelId}: ${Math.round(report.progress*100)}% ${report.text}`);}}});
        const generated=[];const create=provider.engine.chat.completions.create.bind(provider.engine.chat.completions);
        provider.engine.chat.completions.create=async request=>{const response=await create(request);if(!request.stream)return response;return (async function*(){let raw='',finish=null;try{for await(const chunk of response){raw+=chunk.choices?.[0]?.delta?.content || '';finish=chunk.choices?.[0]?.finish_reason || finish;yield chunk;}}finally{generated.push({raw,finish});}})();};
        const registry=new App.AI.ToolRegistry({confirm:async()=>false});App.AI.FactSimTools.register(registry);
        const agent=new App.AI.FactSimAgent({provider,registry});
        try{
          const greeting=await agent.send('こんにちは。日本語で話してください。');
          await window.reportAIProgress('Real model: greeting generated.');
          const help=await agent.send('何ができる？');
          await window.reportAIProgress('Real model: capability reply generated.');
          const discussion=await agent.send('加工工程が2つあるラインを考えています。まず相談だけで、まだノードは作らないでください。何を決めればよいですか？');
          return {greeting:greeting.content,help:help.content,discussion:discussion.content};
        }catch(error){throw new Error(`${error.message}\nGenerated test responses: ${JSON.stringify(generated)}`);
        }finally{await provider.dispose();}
      },modelId);
      report.realWebLLM={attempted:true,modelId,...result};
      check('real WebLLM generates conversational replies',Object.values(result).every(reply=>typeof reply==='string' && reply.trim().length>2),result);
    }
  }

  await page.screenshot({path:screenshotPath,fullPage:true});
  await page.getByRole('button',{name:'Toggle AI Assistant'}).click();
  check('panel collapses without stopping FactSim',await page.evaluate(()=>!document.body.classList.contains('ai-panel-open') && !isSimRunning()),null);
  check('no uncaught browser errors',pageErrors.length===0,pageErrors);
}catch(error){report.error=String(error?.stack || error);process.exitCode=1;}
finally{
  report.passed=!report.error && report.checks.every(item=>item.pass);await fs.mkdir(path.dirname(outputPath),{recursive:true});await fs.mkdir(path.dirname(screenshotPath),{recursive:true});await fs.writeFile(outputPath,JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,error:report.error || null,outputPath,screenshotPath},null,2));
}
