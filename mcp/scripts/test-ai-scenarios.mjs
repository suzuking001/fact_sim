import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'artifacts/ai-assistant/scenarios-real.json');
const model=process.env.FACT_SIM_AI_SCENARIO_MODEL || 'qwen3.8:27b';
const only=Number(process.argv.find(arg=>arg.startsWith('--case='))?.split('=')[1] || 0);
const timeoutMs=Number(process.env.FACT_SIM_AI_SCENARIO_TIMEOUT || 120000);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));if(!file.startsWith(root+path.sep))throw new Error('Invalid path');res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
let saved;try{saved=JSON.parse(await fs.readFile(output,'utf8'));}catch{saved={model,attempts:[]};}
const page=await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
await page.exposeFunction('scenarioProgress',text=>console.log(text));
try{
  for(let id=1;id<=10;id++){
    if(only && id!==only)continue;
    await page.goto(`http://127.0.0.1:${server.address().port}/?skipLanding=1`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>App?.AI?.agent && window.EXAMPLES?.simple);
    const result=await page.evaluate(async({id,model,timeoutMs})=>{
      applyExampleData(EXAMPLES.simple,'simple');
      const AI=App.AI,registry=new AI.ToolRegistry({policy:()=> 'allow-safe'});AI.FactSimTools.register(registry);
      const provider=new AI.OllamaProvider();await provider.initialize({endpoint:'http://localhost:11434',modelId:model});
      const agent=new AI.FactSimAgent({provider,registry});AI.agent=agent;
      const source=App.graph._nodes.find(n=>n.properties.role==='source'),sink=App.graph._nodes.find(n=>n.properties.role==='sink'),equipment=App.graph._nodes.filter(n=>n.properties.role==='equipment');
      const first=equipment[0],second=equipment[1],timing=Object.entries(AI.FactSimTools.editableParameters(first)).find(([key])=>key.endsWith('.seconds') && AI.FactSimTools.editableParameters(first)[key].kind==='process');
      if(id===7){second.pos=[first.pos[0]+40,first.pos[1]+20];App.canvas.setDirty(true,true);}
      if(id===10)await registry.execute('profile_simulation',{durationSeconds:120,resetBeforeRun:true});
      const prompts=[
        'こんにちは。日本語で話してください。',
        '何ができる？シミュレーションのグラフを一緒に作りたいです。',
        'このモデルはどんな流れになっていますか？現在のノードと接続を確認して説明してください。',
        '加工工程が2つあるラインを考えています。まず相談だけで、まだノードは作らないでください。何を決めればよいですか？',
        `Source（ID ${source.id}）とEquipment（ID ${first.id}）の既存の接続の間に、名前が「確認用バッファ」のバッファを1個挿入してください。`,
        `Equipment（ID ${first.id}）の加工時間を5秒に変更してください。ほかの設定は変えないでください。`,
        '画面でノードが重なっています。画面を確認し、重なっているノードだけ位置を調整してください。自動配置は使わず、ほかのノードと設定を保ってください。',
        '現在のモデルをリセットして120秒シミュレーションを実行し、生産数と経過秒数を教えてください。',
        'このモデルについて1000秒くらいでシミュレーションが動かなくなり固まってしまいます。原因を調査してください。調査だけで設定は変更しないでください。',
        'このモデルのボトルネックはどこですか？実測した生産数と現在の設定から改善案を教えてください。まだ変更しないでください。'
      ];
      const prompt=prompts[id-1],before=JSON.stringify(App.graph.serialize()),positions=App.graph._nodes.map(n=>({id:n.id,pos:Array.from(n.pos)}));
      const settingsBefore=JSON.stringify(App.graph._nodes.map(n=>({id:n.id,title:n.title,properties:n.properties}))),linksBefore=JSON.stringify(Object.values(App.graph.links));
      const calls=[],generation=[];let error=null,answer=null,timedOut=false;
      agent.addEventListener('tool-result',e=>{calls.push({name:e.detail.call.name,arguments:e.detail.call.arguments,result:e.detail.result});scenarioProgress(`Q${id} tool ${e.detail.call.name}: ${e.detail.result.success}`);});
      agent.addEventListener('assistant-final',e=>generation.push(e.detail.content));
      const started=performance.now(),timer=setTimeout(()=>{timedOut=true;agent.stop();},timeoutMs);
      scenarioProgress(`Q${id} start: ${prompt}`);
      try{answer=await agent.send(prompt);}catch(e){error=String(e.message || e);}finally{clearTimeout(timer);}
      const after=JSON.stringify(App.graph.serialize()),nodes=App.graph._nodes,links=Object.values(App.graph.links),buffer=nodes.find(n=>n.title==='確認用バッファ');
      const snapshot=await registry.execute('get_layout_snapshot',{}, {supportsVision:false});
      const finalParameters=AI.FactSimTools.editableParameters(App.graph.getNodeById(first.id));
      const facts={nodeCount:nodes.length,edgeCount:links.length,unchanged:before===after,inserted:!!buffer && !links.some(l=>l.origin_id===source.id && l.target_id===first.id) && links.some(l=>l.origin_id===source.id && l.target_id===buffer.id) && links.some(l=>l.origin_id===buffer.id && l.target_id===first.id),processingSeconds:finalParameters[timing[0]]?.value,overlapCount:snapshot.overlapPairCount,unaffectedPositions:positions.filter(p=>p.id!==first.id && p.id!==second.id).every(p=>JSON.stringify(Array.from(App.graph.getNodeById(p.id).pos))===JSON.stringify(p.pos)),kpis:AI.FactSimTools.getKpis()};
      const text=answer?.content || '',readOnly=calls.every(c=>!['set_node_parameter','add_node','connect_nodes','insert_node_on_link','move_node','auto_layout'].includes(c.name));
      facts.visualOnly=settingsBefore===JSON.stringify(nodes.map(n=>({id:n.id,title:n.title,properties:n.properties}))) && linksBefore===JSON.stringify(links);
      const normalized=JSON.parse(JSON.stringify(nodes.map(n=>({id:n.id,title:n.title,properties:n.properties}))));
      const changedProcess=normalized.find(n=>n.id===first.id).properties.flow.nodes.find(n=>n.id===timing[0].split('.')[0]);changedProcess.config.seconds=timing[1].value;
      facts.onlyRequestedParameterChanged=settingsBefore===JSON.stringify(normalized) && linksBefore===JSON.stringify(links);
      let expected=false;
      if(id===1)expected=/こんにちは|よろしく/.test(text) && calls.length===0 && text.length<=350 && !/稼働率|待ち時間.*測定/.test(text);
      if(id===2)expected=/ノード|グラフ/.test(text) && /シミュレーション/.test(text) && calls.length===0 && !/バッチサイズ|確率.*調整|稼働率.*測定/.test(text);
      if(id===3)expected=calls.some(c=>['get_model_summary','get_simulation_report'].includes(c.name)) && /Source|ソース|供給/.test(text) && /Sink|シンク|排出|完成/.test(text) && readOnly;
      if(id===4)expected=/時間|サイクル/.test(text) && /供給|投入|製品|数量/.test(text) && readOnly && facts.unchanged;
      if(id===5)expected=facts.inserted && facts.nodeCount===5 && facts.edgeCount===4 && text.length>3;
      if(id===6)expected=facts.processingSeconds===5 && facts.onlyRequestedParameterChanged && calls.some(c=>c.name==='get_node') && calls.some(c=>c.name==='set_node_parameter') && text.includes('5');
      if(id===7)expected=facts.overlapCount===0 && facts.unaffectedPositions && facts.visualOnly && calls.some(c=>c.name==='get_layout_snapshot') && calls.some(c=>c.name==='move_node') && !calls.some(c=>c.name==='auto_layout');
      if(id===8)expected=calls.some(c=>['run_simulation','profile_simulation'].includes(c.name) && c.result.advancedSeconds===120 && c.arguments.resetBeforeRun===true) && text.includes(String(facts.kpis.totalCompleted)) && /120/.test(text);
      if(id===9)expected=calls[0]?.name==='get_simulation_report' && calls.some(c=>c.name==='profile_simulation' && c.result.advancedSeconds>=1000) && readOnly && /再現|未確定|特定でき|確認でき|断定|観測/.test(text) && calls.length<=4;
      if(id===10)expected=readOnly && calls.some(c=>['get_simulation_report','get_nodes','get_node','get_kpis'].includes(c.name)) && /ボトルネック|律速|制約/.test(text) && /秒|サイクル|加工時間/.test(text) && text.includes(String(facts.kpis.totalCompleted));
      await provider.dispose();
      return {id,prompt,model,answer:text,error,timedOut,wallSeconds:(performance.now()-started)/1000,expected,pass:expected && !error && !timedOut && performance.now()-started<60000,stats:agent.lastRunStats,calls,generation,facts};
    },{id,model,timeoutMs});
    saved.attempts.push({...result,at:new Date().toISOString(),browserErrors:[...errors]});saved.updatedAt=new Date().toISOString();
    await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(saved,null,2));
    console.log(JSON.stringify({id,expected:result.expected,pass:result.pass,wallSeconds:result.wallSeconds,answer:result.answer,error:result.error,tools:result.calls.map(c=>c.name)}));
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
