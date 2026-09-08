// Isolated application regression test; does not attach to a user's browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FactSimRuntime} from '../dist/fact-sim-runtime.js';
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=new FactSimRuntime({repoRoot,preferredPort:0});
const errors=[];
try{
  const page=await runtime.ensureReady();
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>window.App?.FlowViewModel && window.App?.graph?._nodes?.length===121);
  const result=await page.evaluate(()=>{
    const a=window.App;
    const before=JSON.stringify(a.graph.serialize());
    const counts={},models=[];
    for(const node of a.graph._nodes){
      const model=a.FlowViewModel.build(node);
      counts[model.behavior]=(counts[model.behavior] || 0)+1;
      if(model.nodes.some(item=>item.kind==='opaque')) throw new Error(`Unexpected opaque node ${node.id}: ${JSON.stringify({behavior:model.behavior,runtime:model.runtime,script:node.properties.script,disabled:node.properties.scriptDisabled,plan:node._executionPlan?.behavior,ctor:node._runtimePrototype?.constructor?.name})}`);
      if(model.edges.some(edge=>!model.nodes.find(item=>item.key===edge.from) || !model.nodes.find(item=>item.key===edge.to)))throw new Error(`Unresolved edge ${node.id}`);
      models.push({id:node.id,behavior:model.behavior,runtime:model.runtime});
    }
    if(JSON.stringify(a.graph.serialize())!==before)throw new Error('Model construction changed graph JSON');
    a.selectionInspector.setNode(a.graph.getNodeById(45));
    const shown=document.querySelector('.flowView').flowView.view.graph._nodes;
    if(!shown.some(n=>n._flow?.key==='match'))throw new Error('Merge Details shows a generic template instead of ID matching');
    if(document.querySelector('.flowProgram'))throw new Error('Unconfigured equipment opened an executable template');
    if(JSON.stringify(a.graph.serialize())!==before)throw new Error('Opening Details changed graph JSON');
    return {counts,models,merge:a.FlowViewModel.build(a.graph.getNodeById(45)),join:a.FlowViewModel.build(a.graph.getNodeById(17))};
  });
  console.log('Sample Line 2 coverage:',JSON.stringify(result.counts));
  assert.equal(result.models.length,121);
  assert.equal(result.merge.behavior,'merge');assert.equal(result.join.behavior,'join');
  assert(result.merge.edges.some(edge=>edge.from==='match' && edge.to==='process'));
  assert(result.merge.edges.some(edge=>edge.from==='match' && edge.to==='receive'));
  assert(!result.join.nodes.some(item=>item.key==='match'));
  // Give the independent viewer a visible host without opening a user window.
  await page.evaluate(()=>{
    const panel=document.getElementById('selectionInspectorPanel');
    window.__flowTestDockParent=panel.parentNode;
    document.body.append(panel);panel.style.cssText='display:block;position:fixed;inset:0;z-index:99999;overflow:auto;background:white';
  });
  await page.locator('.flowViewCanvas').waitFor({state:'visible'});
  await page.locator('.flowViewLive').filter({hasText:'搬入済み'}).waitFor();
  await fs.mkdir(path.join(repoRoot,'tmp'),{recursive:true});
  await page.screenshot({path:path.join(repoRoot,'tmp','flow-merge.png'),fullPage:true});
  const allViews=await page.evaluate(()=>{
    const a=window.App,before=JSON.stringify(a.graph.serialize());
    for(const node of a.graph._nodes){
      const saved=new Map();
      for(const method of ['canAcceptWorkInput','canAcceptEntityInput','_runtimePortReady','_runtimeEvaluateCondition','_runtimeSelectInputRule','_runtimeSelectOutputRule','onExecute']){
        saved.set(method,{own:Object.hasOwn(node,method),value:node[method]});
        node[method]=()=>{throw new Error(`Display invoked ${method} on ${node.id}`);};
      }
      try{
        a.selectionInspector.setNode(node);
        const flow=document.querySelector('.flowView').flowView;
        flow.refresh();flow.view.draw(true,true);
        if(flow.view.graph.status!==LGraph.STATUS_STOPPED)throw new Error('Display graph is executing');
      }finally{
        for(const [method,entry] of saved){if(entry.own)node[method]=entry.value;else delete node[method];}
      }
    }
    if(JSON.stringify(a.graph.serialize())!==before)throw new Error('Opening all Details changed JSON');
    a.selectionInspector.setNode(a.graph.getNodeById(45));
    return a.graph._nodes.length;
  });
  assert.equal(allViews,121);
  const edit=await page.evaluate(()=>{
    const a=window.App,node=a.graph.getNodeById(45),model=a.FlowViewModel.build(node);
    const stage=model.nodes.find(item=>item.kind==='timing' && item.ref.direction==='input');
    const initial=a.FlowViewModel.resolve(node,stage.ref).durationSec;
    a.FlowViewModel.commit(a.graph,45,stage.ref,initial+0.7);
    const saved=a.FlowViewModel.resolve(a.graph.getNodeById(45),stage.ref).durationSec;
    window.undo();const undone=a.FlowViewModel.resolve(a.graph.getNodeById(45),stage.ref).durationSec;
    window.redo();const redone=a.FlowViewModel.resolve(a.graph.getNodeById(45),stage.ref).durationSec;
    const serialized=a.graph.serialize();window.applySnapshot(JSON.stringify(serialized));
    const loaded=a.FlowViewModel.resolve(a.graph.getNodeById(45),stage.ref).durationSec;
    return {initial,saved,undone,redone,loaded};
  });
  assert.equal(edit.saved,edit.initial+0.7);assert.equal(edit.undone,edit.initial);assert.equal(edit.redone,edit.saved);assert.equal(edit.loaded,edit.saved);
  console.log('Edit / undo / redo / JSON:',JSON.stringify(edit));
  // Exercise the actual editor events, not only the commit helper.
  await page.evaluate(()=>window.App.selectionInspector.refresh());
  const stageKey=await page.evaluate(()=>document.querySelector('.flowView').flowView.model.nodes.find(item=>item.kind==='timing' && item.ref.direction==='input').key);
  await page.locator('.flowViewPicker').selectOption(stageKey);
  await page.getByLabel('時間（秒）',{exact:true}).fill('3.4');
  await page.getByLabel('時間（秒）',{exact:true}).press('Tab');
  assert.equal(await page.getByLabel('時間（秒）',{exact:true}).inputValue(),'3.4');
  const camera=await page.evaluate(()=>{const flow=document.querySelector('.flowView').flowView;return {scale:flow.view.ds.scale,offset:Array.from(flow.view.ds.offset)};});
  await page.evaluate(()=>window.undo());
  await page.waitForFunction(()=>document.querySelector('.flowViewEditor input')?.value==='2.7');
  assert.equal(await page.locator('.flowViewPicker').inputValue(),stageKey);
  assert.deepEqual(await page.evaluate(()=>{const flow=document.querySelector('.flowView').flowView;return {scale:flow.view.ds.scale,offset:Array.from(flow.view.ds.offset)};}),camera);
  const conditionalKey=await page.evaluate(()=>{
    const a=window.App,node=a.graph.getNodeById(45),model=a.FlowViewModel.build(node);
    const condition=model.nodes.find(item=>item.kind==='condition' && item.ref);
    const next={kind:'all',conditions:[{kind:'any',conditions:[{kind:'down-complete'},{kind:'not',condition:{kind:'full'}}]},{kind:'attribute-condition',path:'temperature',operator:'gte',value:12}]};
    const updated=a.FlowViewModel.commit(a.graph,45,condition.ref,next);
    document.querySelector('.flowView').flowView.refresh();
    if(!['AND','OR','NOT'].every(title=>updated.nodes.some(item=>item.title===title)))throw new Error('Logical tree missing');
    return updated.nodes.find(item=>item.title==='属性の比較').key;
  });
  await page.getByRole('button',{name:'詳細表示',exact:true}).click();
  await page.locator('.flowViewPicker').selectOption(conditionalKey);
  await page.getByLabel('比較値',{exact:true}).fill('24');
  await page.getByLabel('比較値',{exact:true}).press('Tab');
  assert.equal(await page.getByLabel('比較値',{exact:true}).inputValue(),'24');
  const conditions=await page.evaluate(()=>{
    const a=window.App,node=a.graph.getNodeById(45),model=a.FlowViewModel.build(node);
    const attr=model.nodes.find(item=>item.title==='属性の比較');
    const condition=a.FlowViewModel.resolve(node,attr.ref);
    if(condition.value!==24)throw new Error('Comparison lost number type');
    // Unknown / downstream conditions are never guessed or evaluated by the viewer.
    const leaves=model.nodes.filter(item=>item.kind==='condition' && item.ref);
    if(leaves.some(item=>item.detail!=='未評価'))throw new Error('Unrecorded condition was evaluated');
    const original=window.isSimRunning;window.isSimRunning=()=>true;
    let locked=false;try{a.FlowViewModel.commit(a.graph,45,attr.ref,{kind:'always'});}catch(_e){locked=true;}finally{window.isSimRunning=original;}
    if(!locked)throw new Error('Running guard missing');
    return {logicalTree:true,comparison:condition.value,locked};
  });
  const ruleKey=await page.evaluate(()=>document.querySelector('.flowView').flowView.model.nodes.find(item=>item.kind==='rule' && item.ref.direction==='input').key);
  await page.locator('.flowViewPicker').selectOption(ruleKey);
  await page.getByLabel('対象 1',{exact:true}).selectOption('type');
  const typeId=await page.getByLabel('対象 1 のワークの種類',{exact:true}).inputValue();
  assert(typeId);
  const target=await page.evaluate(()=>window.App.graph.getNodeById(45).properties.inputRules[0].targets[0]);
  assert.equal(target.mode,'type');assert.equal(target.typeId,typeId);
  await page.locator('.flowViewPicker').selectOption(conditionalKey);
  await page.evaluate(()=>window.startSimulation());
  await page.waitForFunction(()=>document.querySelector('.flowViewEditor input')?.disabled===true);
  await page.evaluate(()=>window.stopSimulation());
  await page.waitForFunction(()=>document.querySelector('.flowViewEditor input')?.disabled===false);
  // Popup adoption must rebind the same canvas and preserve its camera.
  const popupPromise=page.waitForEvent('popup');
  await page.evaluate(()=>{const panel=document.getElementById('selectionInspectorPanel');window.__flowTestDockParent.append(panel);panel.style.cssText='';window.App.setTimelineDockView('inspector');window.App.openWorkspacePopout('inspector');});
  const popup=await popupPromise;
  await popup.locator('.flowViewCanvas').waitFor({state:'visible'});
  await popup.waitForFunction(()=>document.querySelector('.flowView')?.flowView?.view?.canvas?.ownerDocument===document);
  await popup.screenshot({path:path.join(repoRoot,'tmp','flow-popup-before.png'),fullPage:true});
  console.log('Popup controls:',await popup.locator('.flowViewControls').innerText());
  await popup.locator('.flowViewControls button').nth(1).click();
  await popup.getByLabel('比較値',{exact:true}).fill('36');
  await popup.getByLabel('比較値',{exact:true}).press('Tab');
  assert.equal(await popup.getByLabel('比較値',{exact:true}).inputValue(),'36');
  await popup.locator('.flowViewPicker').selectOption('receive');
  await popup.locator('.flowViewCanvas').scrollIntoViewIfNeeded();
  const dragStart=await popup.evaluate(()=>{
    const flow=document.querySelector('.flowView').flowView,v=flow.view,n=v.graph._nodes.find(n=>n._flow.key==='receive');
    const rect=v.canvas.getBoundingClientRect();
    return {x:rect.left+(n.pos[0]+v.ds.offset[0]+90)*v.ds.scale,y:rect.top+(n.pos[1]+v.ds.offset[1]+40)*v.ds.scale,pos:Array.from(n.pos),frame:v.frame,scale:v.ds.scale};
  });
  await popup.mouse.move(dragStart.x,dragStart.y);await popup.mouse.down();
  await popup.mouse.move(dragStart.x+100,dragStart.y+35,{steps:24});await popup.mouse.up();
  const drag=await popup.evaluate(()=>{
    const v=document.querySelector('.flowView').flowView.view,n=v.graph._nodes.find(n=>n._flow.key==='receive');
    v.draw(true,true);
    const data=v.bgctx.getImageData(0,0,v.bgcanvas.width,v.bgcanvas.height).data;
    let linePixels=0;
    for(let i=0;i<data.length;i+=4)if(data[i]===82 && data[i+1]===97 && data[i+2]===113)linePixels++;
    return {pos:Array.from(n.pos),frame:v.frame,backgroundMatches:v.bgctx.canvas===v.bgcanvas,linePixels};
  });
  assert(Math.abs(drag.pos[0]-dragStart.pos[0]-100/dragStart.scale)<4);
  assert(drag.frame-dragStart.frame>=12,'Drag did not render at animation-frame speed');
  assert(drag.backgroundMatches);assert(drag.linePixels>10,'Execution lines missing after popup adoption');
  console.log('Popup connections and drag:',JSON.stringify({...drag,framesDuringDrag:drag.frame-dragStart.frame}));
  await popup.locator('.flowViewPicker').selectOption(conditionalKey);
  await popup.screenshot({path:path.join(repoRoot,'tmp','flow-popup.png'),fullPage:true});
  await page.evaluate(()=>window.App.closeWorkspacePopout('inspector'));
  await page.locator('.flowViewEditor').scrollIntoViewIfNeeded();
  await page.getByLabel('比較値',{exact:true}).fill('48');
  await page.getByLabel('比較値',{exact:true}).press('Tab');
  assert.equal(await page.getByLabel('比較値',{exact:true}).inputValue(),'48');
  await page.screenshot({path:path.join(repoRoot,'tmp','flow-dock.png'),fullPage:true});
  await page.evaluate(()=>{const panel=document.getElementById('selectionInspectorPanel');document.body.append(panel);panel.style.cssText='display:block;position:fixed;inset:0;z-index:99999;overflow:auto;background:white';});
  await page.setViewportSize({width:390,height:844});
  await page.locator('.flowViewCanvas').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(repoRoot,'tmp','flow-narrow.png'),fullPage:true});
  const narrow=await page.evaluate(()=>{
    const panel=document.getElementById('selectionInspectorPanel'),editor=document.querySelector('.flowViewEditor');
    return {width:panel.clientWidth,scrollWidth:panel.scrollWidth,editorReachable:editor.offsetTop<panel.scrollHeight};
  });
  assert(narrow.scrollWidth<=narrow.width+2);assert(narrow.editorReachable);
  console.log('Conditions, popup editing, narrow layout:',JSON.stringify({conditions,narrow}));
  // Compare deterministic dt runs while repeatedly opening/closing Details.
  const parity=await page.evaluate(async()=>{
    const a=window.App;
    await window.makeExample('sample_line2');
    const original=a.graph,payload=original.serialize();a.injectEntityModel(payload,original);
    const originalCanvas=a.canvas,originalTimeline=a.timelineChart,suspend=a._suspendTimeline,random=Math.random;
    a._suspendTimeline=true;a.canvas={setDirty(){},draw(){}};
    const run=async(show)=>{
      let seed=1;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      const g=new LGraph();g.configure(JSON.parse(JSON.stringify(payload)));a.restoreEntityModel(g,payload,true);a.repairGraphLinks(g);window.configureGraphClock(g);
      a.graph=g;window.setSimTime(0);const engine=a.createSimEngine('dt',g);engine.reset();g.status=LGraph.STATUS_RUNNING;
      let hash=2166136261,activeLinks=0,transitions=0,prev='';
      for(let i=0;i<2400;i++){
        if(show && i%100===0)a.selectionInspector.setNode(g.getNodeById(i%200===0 ? 45 : 17));
        if(show && i%100===50)a.selectionInspector.clear(true);
        engine.update(100);
        const states=g._nodes.map(n=>[n.id,n._state,n._stateName,n._until,n._nextSlotCursor,n._queue?.length,n._recv?.length]);
        const links=Object.values(g.links).filter(link=>link.data || link._data).map(link=>{const value=link.data || link._data;return [link.id,value?.id,value?.type];});
        activeLinks+=links.length;
        const text=JSON.stringify([window.simNow(),states,links]);
        const stateText=JSON.stringify(states);if(stateText!==prev)transitions++;prev=stateText;
        for(let j=0;j<text.length;j++)hash=Math.imul(hash^text.charCodeAt(j),16777619)>>>0;
        if(i%100===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      engine.stop();g.status=LGraph.STATUS_STOPPED;
      const completed=g._nodes.filter(n=>a.FlowViewModel.runtime(n)==='sink').reduce((sum,n)=>sum+(n._recv?.length || 0),0);
      a.selectionInspector.clear(true);
      return {hash,activeLinks,transitions,completed,simMs:window.simNow()};
    };
    try{return {closed:await run(false),opened:await run(true)};}
    finally{Math.random=random;a.graph=original;a.canvas=originalCanvas;a.timelineChart=originalTimeline;a._suspendTimeline=suspend;window.setSimTime(0);}
  });
  console.log('Sample Line 2 display parity:',JSON.stringify(parity));
  assert.deepEqual(parity.opened,parity.closed);assert(parity.opened.activeLinks>0);
  assert.deepEqual(errors,[]);
  await fs.mkdir(path.join(repoRoot,'artifacts','flow-view'),{recursive:true});
  await fs.writeFile(path.join(repoRoot,'artifacts','flow-view','validation.json'),JSON.stringify({counts:result.counts,nodes:result.models,allViews,edit,conditions,target,narrow,drag:{...drag,framesDuringDrag:drag.frame-dragStart.frame},parity,errors},null,2));
}finally{await runtime.close();}
