import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const extended=process.argv.includes('--suite=extended');
const editing=process.argv.includes('--suite=editing');
const legacyNoUndo=process.argv.includes('--legacy-no-undo');
const output=path.join(root,'artifacts/ai-assistant',editing?'scenarios-editing-real.json':extended?'scenarios-extended-real.json':'scenarios-real.json');
const model=process.env.FACT_SIM_AI_SCENARIO_MODEL || 'qwen3.8:27b';
const only=Number(process.argv.find(arg=>arg.startsWith('--case='))?.split('=')[1] || 0);
const timeoutMs=Number(process.env.FACT_SIM_AI_SCENARIO_TIMEOUT || 120000);
if(only && (only<(editing?21:extended?11:1) || only>(editing?30:extended?20:10)))throw new Error('--case is outside the selected suite.');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));if(!file.startsWith(root+path.sep))throw new Error('Invalid path');res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
let saved;try{saved=JSON.parse(await fs.readFile(output,'utf8'));}catch{saved={model,attempts:[]};}
const page=await browser.newPage({viewport:{width:1440,height:960}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
await page.exposeFunction('scenarioProgress',text=>console.log(text));
try{
  for(let id=editing?21:extended?11:1;id<=(editing?30:extended?20:10);id++){
    if(only && id!==only)continue;
    await page.goto(`http://127.0.0.1:${server.address().port}/?skipLanding=1`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>App?.AI?.agent && window.EXAMPLES?.simple);
    const result=await page.evaluate(async({id,model,timeoutMs,legacyNoUndo})=>{
      applyExampleData(EXAMPLES.simple,'simple');
      let confirmations=0;const AI=App.AI,registry=new AI.ToolRegistry({policy:()=> 'allow-safe',confirm:async()=>{confirmations++;return id!==29;}});AI.FactSimTools.register(registry);
      if(legacyNoUndo)registry.tools.delete('undo_last_ai_edit');
      const provider=new AI.OllamaProvider();await provider.initialize({endpoint:'http://localhost:11434',modelId:model});
      const agent=new AI.FactSimAgent({provider,registry});AI.agent=agent;
      const source=App.graph._nodes.find(n=>n.properties.role==='source'),sink=App.graph._nodes.find(n=>n.properties.role==='sink'),equipment=App.graph._nodes.filter(n=>n.properties.role==='equipment');
      const first=equipment[0],second=equipment[1],timing=Object.entries(AI.FactSimTools.editableParameters(first)).find(([key])=>key.endsWith('.seconds') && AI.FactSimTools.editableParameters(first)[key].kind==='process');
      let editFixture;
      if(id===27)editFixture=await registry.execute('insert_node_on_link',{fromNodeId:String(source.id),toNodeId:String(first.id),kind:'buffer',name:'削除対象バッファ'});
      if(id===28)editFixture=await registry.execute('add_node',{kind:'buffer',name:'未接続の予備バッファ'});
      if(id===7 || id===20){second.pos=[first.pos[0]+40,first.pos[1]+20];App.canvas.setDirty(true,true);}
      if(id===10)await registry.execute('profile_simulation',{durationSeconds:120,resetBeforeRun:true});
      if(id===19)await registry.execute('profile_simulation',{durationSeconds:60,resetBeforeRun:true});
      if(id===20){fitToScreen({silent:true});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));App.canvas.draw(true,true);}
      // example startup schedules its initial fit; do not measure viewport before
      // that unrelated initialization and blame it on the later AI edit.
      if(id===30){await new Promise(resolve=>setTimeout(resolve,300));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
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
        'このモデルのボトルネックはどこですか？実測した生産数と現在の設定から改善案を教えてください。まだ変更しないでください。',
        `Equipment（ID ${first.id}）の名前だけ「加工A」に変更してください。他のノード、接続、設定は変えないでください。`,
        `Source（ID ${source.id}）の投入間隔を2秒に変更してください。他の設定は変えないでください。`,
        'Equipmentの加工時間を2秒にしてください。',
        'ノード99999の加工時間を3秒に変更してください。',
        `Equipment（ID ${first.id}）の加工時間をマイナス2秒にしてください。`,
        'さっき変更した工程の加工時間を8秒にしてください。他の工程は変えないでください。',
        '今のバッファ追加を取り消して、追加前のノードと接続に戻してください。他は変えないでください。',
        '既存のモデルはそのまま残し、別の新しいライン Source（名前:新投入）→Machine（名前:新加工A、加工2秒）→Machine（名前:新加工B、加工3秒）→Sink（名前:新完成）を追加して接続してください。',
        '現在の60秒の実測生産数を確認したうえで、両Equipmentの回復時間を1秒に変更し、リセットして60秒実行して、変更前後の生産数を比較してください。',
        '添付画像の赤枠のノードが重なっています。このノードだけを重ならない位置に移動してください。ほかのノードや設定は変えず、自動配置もしないでください。',
        `ノード${first.id}の名前を「加工A」、ノード${second.id}の名前を「加工B」に一括変更してください。時間と接続は変えないでください。`,
        'すべてのEquipmentのすべてのProcess時間を現在値から20%短縮してください。RecoveryやSourceや接続は変えないでください。一括で適用してください。',
        'すべてのEquipmentのRecovery時間だけ0秒に一括変更してください。Processや投入間隔は変えないでください。',
        `ノード${first.id}の加工時間を5秒、Source（ID ${source.id}）の投入間隔を2秒に、一括で変更してください。ほかは変更しないでください。`,
        `Source（ID ${source.id}）からEquipment（ID ${first.id}）への接続だけ解除してください。ノードは削除せず、ほかの接続を残してください。`,
        `Equipment（ID ${first.id}）を現在のカスタム設定ごと「加工Aの予備」という名前で1個複製してください。既存ラインは変えず、複製したノードは接続しないでください。`,
        '「削除対象バッファ」だけを削除し、その上流と下流を直接つなぎ直してください。ほかのノードは変更しないでください。',
        '未接続の「未接続の予備バッファ」だけを削除してください。他のノードと接続は変更しないでください。',
        `Equipment（ID ${first.id}）とそれに付く接続を削除してください。ただし削除確認でキャンセルしたら操作を中止して、別の方法で削除しないでください。`,
        `Equipment（ID ${first.id}と${second.id}）だけを、それぞれ現在位置から右へ200、下へ100のグラフ座標分だけ一緒に移動してください。相対位置・他のノード・接続・設定・表示範囲は変えず、自動配置しないでください。`
      ];
      const prompt=prompts[id-1],before=JSON.stringify(App.graph.serialize()),positions=App.graph._nodes.map(n=>({id:n.id,pos:Array.from(n.pos)})),viewBefore=JSON.stringify({scale:App.canvas.ds.scale,offset:Array.from(App.canvas.ds.offset)});
      function nodeSettings(){return App.graph._nodes.map(n=>{const properties=JSON.parse(JSON.stringify(n.properties));if(properties.flow){delete properties.flow.__signalCache;delete properties.flow.__feedbackCache;}return {id:n.id,title:n.title,properties};});}
      // Compare semantic settings/topology, not lazy Flow/drawing caches.
      const settingsBefore=JSON.stringify(nodeSettings()),linksBefore=JSON.stringify(App.graph.serialize().links);
      const initialCompleted=AI.FactSimTools.getKpis().totalCompleted;
      let images;
      if(id===20){
        const screen=await registry.execute('get_layout_snapshot',{}, {supportsVision:true});
        const img=new Image();img.src='data:image/png;base64,'+screen.image.data;await img.decode();
        const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
        const box=screen.nodes.find(n=>n.id===second.id).screenBounds,ratio=screen.imageStatus.width/screen.viewport.pixelWidth;
        ctx.strokeStyle='#f00';ctx.lineWidth=5;ctx.strokeRect(box.x*ratio,box.y*ratio,box.width*ratio,box.height*ratio);ctx.fillStyle='#f00';ctx.font='bold 18px sans-serif';ctx.fillText(`TARGET ID ${second.id}`,box.x*ratio,Math.max(20,box.y*ratio-6));
        images=[{mimeType:'image/png',data:canvas.toDataURL('image/png').split(',')[1]}];
      }
      const calls=[],generation=[];let error=null,answer=null,timedOut=false;
      agent.addEventListener('tool-result',e=>{calls.push({name:e.detail.call.name,arguments:e.detail.call.arguments,result:e.detail.result});scenarioProgress(`Q${id} tool ${e.detail.call.name}: ${e.detail.result.success}`);});
      agent.addEventListener('assistant-final',e=>generation.push(e.detail.content));
      const started=performance.now(),timer=setTimeout(()=>{timedOut=true;agent.stop();},timeoutMs);
      scenarioProgress(`Q${id} start: ${prompt}`);
      try{
        if(id===16)await agent.send(`Equipment（ID ${first.id}）の加工時間を5秒に変更してください。`);
        if(id===17)await agent.send(`Source（ID ${source.id}）とEquipment（ID ${first.id}）の接続の間に「確認用バッファ」というバッファを1個挿入してください。`);
        answer=await agent.send(prompt,{images});
        if(id===18 && /複数|2つ|2個|合計|配分|各Process|各工程|各スロット/.test(answer.content)){
          const alreadyCreated=App.graph._nodes.some(n=>n.title==='新投入');
          answer=await agent.send(`加工時間は各Machineの内部Processの合計です。新加工Aは合計2秒、新加工Bは合計3秒にし、複数Processの場合は等分してください。回復時間は変えないでください。${alreadyCreated?'新しい4ノードは既にあるので重複追加せず、作成済みの新加工Aと新加工Bの時間設定を完了してください。':'既存モデルを残して新ラインの追加と接続を実行してください。'}`);
        }
      }catch(e){error=String(e.message || e);}finally{clearTimeout(timer);}
      const after=JSON.stringify(App.graph.serialize()),nodes=App.graph._nodes,links=Object.values(App.graph.links),buffer=nodes.find(n=>n.title==='確認用バッファ');
      const snapshot=await registry.execute('get_layout_snapshot',{}, {supportsVision:false});
      const finalParameters=AI.FactSimTools.editableParameters(App.graph.getNodeById(first.id));
      const facts={nodeCount:nodes.length,edgeCount:links.length,unchanged:before===after,inserted:!!buffer && !links.some(l=>l.origin_id===source.id && l.target_id===first.id) && links.some(l=>l.origin_id===source.id && l.target_id===buffer.id) && links.some(l=>l.origin_id===buffer.id && l.target_id===first.id),processingSeconds:finalParameters[timing[0]]?.value,overlapCount:snapshot.overlapPairCount,unaffectedPositions:positions.filter(p=>p.id!==first.id && p.id!==second.id).every(p=>{const node=App.graph.getNodeById(p.id);return node ? JSON.stringify(Array.from(node.pos))===JSON.stringify(p.pos) : [27,28].includes(id) && p.id===editFixture?.nodeId;}),kpis:AI.FactSimTools.getKpis()};
      const text=answer?.content || '',readOnly=calls.every(c=>!['set_node_parameter','add_node','connect_nodes','insert_node_on_link','move_node','auto_layout'].includes(c.name));
      facts.settingsUnchanged=settingsBefore===JSON.stringify(nodeSettings());
      facts.linksPreserved=linksBefore===JSON.stringify(App.graph.serialize().links);
      facts.visualOnly=facts.settingsUnchanged && facts.linksPreserved;
      const normalized=nodeSettings();
      const changedProcess=normalized.find(n=>n.id===first.id).properties.flow.nodes.find(n=>n.id===timing[0].split('.')[0]);changedProcess.config.seconds=timing[1].value;
      facts.onlyRequestedParameterChanged=settingsBefore===JSON.stringify(normalized) && facts.linksPreserved;
      if(id===6 && !facts.onlyRequestedParameterChanged)facts.settingDiff={before:JSON.parse(settingsBefore),normalized};
      let expected=false;
      if(id===1)expected=/こんにちは|よろしく/.test(text) && calls.length===0 && text.length<=350 && !/稼働率|待ち時間.*測定/.test(text);
      if(id===2)expected=/ノード|グラフ/.test(text) && /シミュレーション/.test(text) && calls.length===0 && !/バッチサイズ|確率.*調整|稼働率.*測定/.test(text);
      if(id===3)expected=calls.some(c=>['get_model_summary','get_simulation_report'].includes(c.name)) && /Source|ソース|供給/.test(text) && /Sink|シンク|排出|完成/.test(text) && readOnly;
      if(id===4)expected=/時間|サイクル/.test(text) && /供給|投入|製品|数量/.test(text) && readOnly && facts.unchanged;
      if(id===5)expected=facts.inserted && facts.nodeCount===5 && facts.edgeCount===4 && text.length>3;
      if(id===6)expected=facts.processingSeconds===5 && facts.onlyRequestedParameterChanged && calls.some(c=>c.name==='get_node') && calls.some(c=>c.name==='set_node_parameter') && text.includes('5');
      if(id===7)expected=facts.overlapCount===0 && facts.unaffectedPositions && facts.visualOnly && calls.some(c=>c.name==='get_layout_snapshot') && calls.some(c=>c.name==='move_node') && !calls.some(c=>c.name==='auto_layout');
      if(id===8)expected=calls.some(c=>['run_simulation','profile_simulation'].includes(c.name) && c.result.advancedSeconds===120 && c.arguments.resetBeforeRun===true) && text.includes(String(facts.kpis.totalCompleted)) && /120/.test(text);
      if(id===9)expected=calls[0]?.name==='get_simulation_report' && calls.some(c=>c.name==='profile_simulation' && c.result.advancedSeconds>=1000) && readOnly && /再現|未確定|特定でき|確認でき|断定|観測/.test(text) && !/エンジン自体は固まっていません|UI[^。\n]*可能性が高/.test(text) && calls.length<=4;
      if(id===10)expected=readOnly && calls.some(c=>['get_simulation_report','get_nodes','get_node','get_kpis'].includes(c.name)) && /ボトルネック|律速|制約/.test(text) && /秒|サイクル|加工時間/.test(text) && text.includes(String(facts.kpis.totalCompleted)) && /理論|仮説|予測|候補/.test(text) && !/直列2工程を並列|2工程を並列/.test(text) && !text.split('\n').some(line=>line.includes('0.25') && /14400|14,400/.test(line) && !/回復|recovery/.test(line)) && calls.length<=4;
      if(id===11){const restored=nodeSettings();restored.find(n=>n.id===first.id).title=JSON.parse(settingsBefore).find(n=>n.id===first.id).title;expected=App.graph.getNodeById(first.id).title==='加工A' && facts.linksPreserved && settingsBefore===JSON.stringify(restored);}
      if(id===12){const restored=nodeSettings();restored.find(n=>n.id===source.id).properties.source.intervalSec=JSON.parse(settingsBefore).find(n=>n.id===source.id).properties.source.intervalSec;expected=source.properties.source.intervalSec===2 && facts.linksPreserved && settingsBefore===JSON.stringify(restored);}
      if(id===13)expected=readOnly && facts.visualOnly && /どちら|ID|指定|2|3/.test(text) && /確認|教え|どちら|指定/.test(text);
      if(id===14)expected=readOnly && facts.visualOnly && facts.nodeCount===4 && /存在|見つか|ありません|見当た/.test(text);
      if(id===15)expected=!calls.some(c=>c.result.success && c.name==='set_node_parameter') && facts.visualOnly && /負|マイナス|正|0\.001|できません|不正/.test(text) && !/−1|マイナス2秒を引く|引くと/.test(text);
      if(id===16)expected=facts.processingSeconds===8 && AI.FactSimTools.editableParameters(second)[timing[0]].value===1 && facts.onlyRequestedParameterChanged && text.includes('8');
      if(id===17)expected=facts.nodeCount===4 && facts.edgeCount===3 && !buffer && facts.linksPreserved && facts.settingsUnchanged && /戻|取り消/.test(text);
      if(id===18){const added=['新投入','新加工A','新加工B','新完成'].map(name=>nodes.find(n=>n.title===name));facts.newLine=added.map(n=>n?.id);const totalProcess=node=>node.properties.flow.nodes.filter(n=>n.kind==='process').reduce((sum,n)=>sum+Number(n.config.seconds),0);facts.originalNodesPreserved=JSON.parse(settingsBefore).every(old=>JSON.stringify(nodeSettings().find(n=>n.id===old.id))===JSON.stringify(old));expected=added.every(Boolean) && facts.nodeCount===8 && facts.edgeCount===6 && facts.originalNodesPreserved && added.slice(0,-1).every((n,i)=>links.some(l=>l.origin_id===n.id && l.target_id===added[i+1].id)) && totalProcess(added[1])===2 && totalProcess(added[2])===3 && generation.every(reply=>!/既存の8ノード/.test(reply));}
      if(id===19){facts.initialCompleted=initialCompleted;expected=equipment.every(n=>AI.FactSimTools.editableParameters(n)['recovery1.seconds'].value===1) && facts.kpis.simTimeSeconds===60 && facts.kpis.totalCompleted>initialCompleted && text.includes(String(initialCompleted)) && text.includes(String(facts.kpis.totalCompleted)) && calls.some(c=>['run_simulation','profile_simulation'].includes(c.name) && c.arguments.resetBeforeRun===true);}
      if(id===20)expected=facts.overlapCount===0 && facts.visualOnly && positions.filter(p=>p.id!==second.id).every(p=>JSON.stringify(Array.from(App.graph.getNodeById(p.id).pos))===JSON.stringify(p.pos)) && calls.some(c=>c.name==='move_node' && String(c.arguments.nodeId)===String(second.id)) && !calls.some(c=>c.name==='auto_layout');
      if(id>=21){
        const original=JSON.parse(settingsBefore),current=nodeSettings(),resetFields=copy=>{for(const old of original){const item=copy.find(n=>n.id===old.id);if(!item)continue;if(id===21)item.title=old.title;if(id===22 || id===23){for(const phase of item.properties.flow.nodes){const beforePhase=old.properties.flow.nodes.find(p=>p.id===phase.id);if(phase.kind===(id===22?'process':'recovery'))phase.config.seconds=beforePhase.config.seconds;}}if(id===24){if(item.id===first.id)item.properties.flow.nodes.find(p=>p.id===timing[0].split('.')[0]).config.seconds=timing[1].value;if(item.id===source.id)item.properties.source.intervalSec=old.properties.source.intervalSec;}}return copy;};
        const bulk=calls.filter(c=>c.name==='batch_set_node_parameters' && c.result.success).length===1;
        if(id===21)expected=first.title==='加工A' && second.title==='加工B' && facts.linksPreserved && JSON.stringify(resetFields(current))===settingsBefore && bulk;
        if(id===22 || id===23)expected=equipment.every(n=>n.properties.flow.nodes.filter(p=>p.kind===(id===22?'process':'recovery')).every(p=>Number(p.config.seconds)===(id===22?Number(original.find(o=>o.id===n.id).properties.flow.nodes.find(o=>o.id===p.id).config.seconds)*0.8:0))) && facts.linksPreserved && JSON.stringify(resetFields(current))===settingsBefore && bulk;
        if(id===24)expected=facts.processingSeconds===5 && source.properties.source.intervalSec===2 && facts.linksPreserved && JSON.stringify(resetFields(current))===settingsBefore && bulk;
        if(id===25)expected=facts.nodeCount===4 && facts.edgeCount===2 && facts.settingsUnchanged && !links.some(l=>l.origin_id===source.id && l.target_id===first.id) && confirmations===1 && calls.some(c=>c.name==='disconnect_nodes' && c.result.success) && !/残り1本|残りの接続は1|残る接続.*1本/.test(text);
        if(id===26){const duplicate=nodes.find(n=>n.title==='加工Aの予備'),properties=duplicate && current.find(n=>n.id===duplicate.id).properties;expected=facts.nodeCount===5 && facts.edgeCount===3 && facts.linksPreserved && !!duplicate && JSON.stringify(properties)===JSON.stringify(original.find(n=>n.id===first.id).properties) && !links.some(l=>l.origin_id===duplicate.id || l.target_id===duplicate.id) && original.every(old=>JSON.stringify(current.find(n=>n.id===old.id))===JSON.stringify(old));}
        if(id===27)expected=facts.nodeCount===4 && facts.edgeCount===3 && !nodes.some(n=>n.title==='削除対象バッファ') && links.some(l=>l.origin_id===source.id && l.target_id===first.id) && original.filter(n=>n.id!==editFixture.nodeId).every(old=>JSON.stringify(current.find(n=>n.id===old.id))===JSON.stringify(old)) && confirmations===1;
        if(id===28)expected=facts.nodeCount===4 && facts.edgeCount===3 && facts.linksPreserved && !nodes.some(n=>n.title==='未接続の予備バッファ') && original.filter(n=>n.id!==editFixture.nodeId).every(old=>JSON.stringify(current.find(n=>n.id===old.id))===JSON.stringify(old)) && confirmations===1;
        if(id===29)expected=facts.settingsUnchanged && facts.linksPreserved && facts.nodeCount===4 && confirmations===1 && calls.some(c=>c.name==='remove_node' && c.result.cancelled) && /キャンセル|中止|取り消|実行していません/.test(text) && !calls.some(c=>['disconnect_nodes','remove_node'].includes(c.name) && c.result.success);
        if(id===30){facts.viewBefore=JSON.parse(viewBefore);facts.viewAfter={scale:App.canvas.ds.scale,offset:Array.from(App.canvas.ds.offset)};facts.translated=positions.every(p=>{const pos=Array.from(App.graph.getNodeById(p.id).pos),moved=[first.id,second.id].includes(p.id);return pos[0]===p.pos[0]+(moved?200:0) && pos[1]===p.pos[1]+(moved?100:0);});expected=facts.visualOnly && facts.translated && viewBefore===JSON.stringify(facts.viewAfter) && calls.some(c=>c.name==='move_nodes' && c.result.success);}
      }
      await provider.dispose();
      return {id,prompt,model,legacyNoUndo,answer:text,error,timedOut,wallSeconds:(performance.now()-started)/1000,expected,pass:expected && !error && !timedOut && performance.now()-started<60000,stats:agent.lastRunStats,calls,generation,facts,confirmations};
    },{id,model,timeoutMs,legacyNoUndo});
    try{saved=JSON.parse(await fs.readFile(output,'utf8'));}catch{}
    saved.attempts.push({...result,at:new Date().toISOString(),browserErrors:[...errors]});saved.updatedAt=new Date().toISOString();
    await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(saved,null,2));
    console.log(JSON.stringify({id,expected:result.expected,pass:result.pass,wallSeconds:result.wallSeconds,answer:result.answer,error:result.error,tools:result.calls.map(c=>c.name)}));
    if(!result.pass || errors.length)process.exitCode=1;
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
