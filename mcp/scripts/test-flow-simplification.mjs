// Full saved graphs vs. compact canvases; exercise real inspector controls and runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FactSimRuntime} from '../dist/fact-sim-runtime.js';
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=new FactSimRuntime({repoRoot,preferredPort:0}),errors=[];
const artifact=path.join(repoRoot,'artifacts','flow-simplification');
try{
  await fs.mkdir(artifact,{recursive:true});await fs.mkdir(path.join(repoRoot,'tmp'),{recursive:true});
  const page=await runtime.ensureReady();page.on('pageerror',e=>errors.push(e.message));
  const modelTests=await page.evaluate(()=>{
    const C=App.FlowConditions,F=App.FlowProgram,eq=(a,b,msg)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(msg);};
    const nodes=[['start',{}],['branch',{}],['destroy',{}],['end',{}],['end',{}],['test',{test:'count',value:2}],['test',{test:'type',typeId:'type-a'}],['and',{}],['test',{test:'empty'}],['not',{}],['or',{}]];
    const p={version:1,enabled:true,nodes:nodes.map(([kind,config],i)=>({id:i+1,kind,config,pos:[80+i*510.25,80.5]})),links:[[1,0,2,0],[2,0,3,0],[3,0,4,0],[2,1,5,0],[6,0,8,0],[7,0,8,1],[9,0,10,0],[8,0,11,0],[10,0,11,1],[11,0,2,1]].map(([from,output,to,input])=>({from,output,to,input}))};
    const before=JSON.stringify(p);C.summary(C.programTree(p,C.programRoot(p,2)));eq(JSON.stringify(p),before,'Reading mutated program');
    const g=new LGraph(),n=LiteGraph.createNode('factory/basic');g.add(n);n.applyTemplate('machine');
    function outcome(program,works){n.properties.flowProgram=program;const run=F.reset(n);run.works=works;F.execute(n);return {works:run.works.length,error:run.error};}
    const a={id:1,typeId:'type-a',attributes:{temperature:22}},b={id:2,typeId:'type-b',attributes:{temperature:2}};
    for(const works of [[],[a],[b],[a,a]]){
      const old=outcome(p,works.slice());
      const wrapped=C.editProgram(p,{id:11,to:2,input:1},'wrap','not');
      const double=C.editProgram(wrapped,C.programRoot(wrapped,2),'wrap','not');
      eq(outcome(double,works.slice()),old,'Double NOT changed execution');
      const restored=C.editProgram(wrapped,C.programRoot(wrapped,2),'unwrap');eq(outcome(restored,works.slice()),old,'Unwrap changed execution');
    }
    const shared=structuredClone(p);shared.nodes.push({id:12,kind:'wait',config:{},pos:[700,400]});shared.links.push({from:11,output:0,to:12,input:1});
    if(!C.programTree(shared,C.programRoot(shared,2)).shared.some(s=>s.includes('#12')))throw new Error('Shared consumer missing');
    const updated=C.editProgram(shared,{id:6,to:8,input:0},'patch',{value:3});
    if(!C.summary(C.programTree(updated,C.programRoot(updated,12))).includes('3 個以上'))throw new Error('Shared subtree edit lost');
    const detached=C.editProgram(shared,C.programRoot(shared,2),'remove');
    if(!detached.nodes.some(n=>n.id===11) || !detached.links.some(l=>l.from===11 && l.to===12))throw new Error('Shared condition removed from another consumer');
    const removed=C.editProgram(p,{id:6,to:8,input:0},'remove');if(removed.nodes.some(n=>n.id===8 || n.id===6))throw new Error('Single AND was not collapsed');
    const orphan=structuredClone(p);orphan.nodes.push({id:99,kind:'test',config:{test:'always'},pos:[500,900]});
    if(C.attachedPredicates(orphan).has(99))throw new Error('Orphan hidden');
    const cyclic=structuredClone(p);cyclic.links.push({from:11,output:0,to:8,input:2});
    if(!C.issues(C.programTree(cyclic,C.programRoot(cyclic,2))).some(s=>s.includes('循環')))throw new Error('Cycle not reported');
    const invalid=structuredClone(p);invalid.links.find(l=>l.to===2 && l.input===1).output=3;
    if(!C.issues(C.programTree(invalid,C.programRoot(invalid,2))).length)throw new Error('Invalid root slot not reported');
    const conjunction=structuredClone(p);conjunction.nodes=conjunction.nodes.filter(n=>n.id<9);conjunction.links=conjunction.links.filter(l=>l.from<9 && l.to<9);conjunction.links.push({from:8,output:0,to:2,input:1});
    const stricter=C.editProgram(conjunction,{id:6,to:8,input:0},'patch',{value:3});
    const two=[{...a},{...a}];
    if(outcome(conjunction,two.slice()).works>=outcome(stricter,two.slice()).works)throw new Error('Edited AND count did not change real branch');
    const waiting=structuredClone(conjunction);waiting.nodes.find(n=>n.id===2).kind='wait';waiting.links=waiting.links.filter(l=>!(l.from===2 && l.output===1));waiting.nodes=waiting.nodes.filter(n=>n.id!==5);
    n.properties.flowProgram=waiting;const waitRun=F.reset(n);F.execute(n);
    if(!waitRun.tasks.some(t=>t.id===2))throw new Error('False condition did not wait');
    waitRun.works=[{...a},{...a}];F.execute(n);if(waitRun.tasks.some(t=>t.id===2))throw new Error('True condition did not release wait');
    const legacy={kind:'all',children:[{kind:'count-reached',count:2},{kind:'not',child:{kind:'full'}}],keep:'metadata'};
    const legacyBefore=JSON.stringify(legacy),tree=C.legacyTree(legacy);
    eq(C.editLegacy(legacy,tree.children[0].ref,'patch',{count:3}),{...legacy,children:[{kind:'count-reached',count:3},legacy.children[1]]},'Legacy alias/metadata lost');eq(JSON.stringify(legacy),legacyBefore,'Legacy tree mutated');
    window.__compactFixture={p,shared};
    return {nestedRuntime:true,sharedConditions:true,pruning:true,cycles:true,legacyAliases:true};
  });
  const initial=await page.evaluate(()=>{
    const g=new LGraph(),n=LiteGraph.createNode('factory/basic');g.add(n);n.applyTemplate('machine');
    const registry=App.entityModelForGraph(g);registry.upsert({typeId:'type-a',name:'ワーク A'});
    n.properties.flowProgram=structuredClone(window.__compactFixture.p);
    const host=App.createFlowProgramEditor(n),mount=document.createElement('div');mount.id='compactFixture';mount.style.cssText='position:fixed;inset:0;background:white;z-index:99999;overflow:auto;padding:12px;box-sizing:border-box';mount.append(host);document.body.append(mount);
    window.__compactFixture.g=g;window.__compactFixture.n=n;
    const flow=host.flowView;flow.view.selectNode(flow.view.graph.getNodeById(2));
    return {saved:JSON.stringify(n.properties.flowProgram),draft:JSON.stringify(flow.program),visible:flow.view.graph._nodes.length,total:flow.program.nodes.length};
  });
  assert.equal(initial.saved,initial.draft);assert.equal(initial.visible,5);assert.equal(initial.total,11);
  const host=page.locator('#compactFixture .flowProgram'),conditions=host.locator('.flowConditionEditor');
  const draft=()=>page.evaluate(()=>document.querySelector('#compactFixture .flowProgram').flowView.program);
  const locked=await page.evaluate(()=>{
    const original=window.isSimRunning,host=document.querySelector('#compactFixture .flowProgram'),before=JSON.stringify(host.flowView.program);
    window.isSimRunning=()=>true;
    try{const input=host.querySelector('[aria-label="個数"]');input.value='77';input.dispatchEvent(new Event('change',{bubbles:true}));return JSON.stringify(host.flowView.program)===before;}finally{window.isSimRunning=original;host.flowView.view.selectNode(host.flowView.view.graph.getNodeById(2));}
  });assert(locked);
  for(let i=0;i<2;i++){
    await host.getByRole('button',{name:'詳細表示',exact:true}).click();assert.equal(await host.locator('canvas').evaluate(e=>e.closest('.flowProgram').flowView.view.graph._nodes.length),11);
    await host.getByRole('button',{name:'通常表示',exact:true}).click();assert.equal(JSON.stringify(await draft()),initial.draft);
  }
  await page.evaluate(()=>{const f=document.querySelector('#compactFixture .flowProgram').flowView;f.view.selectNode(f.view.graph.getNodeById(2));});
  await conditions.getByLabel('個数',{exact:true}).fill('3');await conditions.getByLabel('個数',{exact:true}).press('Tab');
  assert.equal((await draft()).nodes.find(n=>n.id===6).config.value,3);
  await host.getByRole('button',{name:'詳細表示',exact:true}).click();await host.getByRole('button',{name:'通常表示',exact:true}).click();
  assert.equal((await draft()).nodes.find(n=>n.id===6).config.value,3);
  await host.getByRole('button',{name:'元に戻す',exact:true}).click();assert.equal(JSON.stringify(await draft()),initial.draft);
  await host.getByRole('button',{name:'やり直す',exact:true}).click();assert.equal((await draft()).nodes.find(n=>n.id===6).config.value,3);
  await host.getByRole('button',{name:'Flow を適用',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__compactFixture.n.properties.flowProgram.nodes.find(n=>n.id===6).config.value),3);
  const jsonRoundtrip=await page.evaluate(()=>{const {g,n}=window.__compactFixture,data=g.serialize(),loaded=new LGraph();loaded.configure(data);return JSON.stringify(loaded.getNodeById(n.id).properties.flowProgram)===JSON.stringify(n.properties.flowProgram);});assert(jsonRoundtrip);
  // Removing a visible consumer keeps now-unattached predicates discoverable.
  await page.evaluate(()=>{const f=document.querySelector('#compactFixture .flowProgram').flowView;f.view.graph.remove(f.view.graph.getNodeById(2));});
  await page.waitForFunction(()=>document.querySelector('#compactFixture .flowProgram').flowView.view.graph._nodes.some(n=>n.title.includes('未接続の条件')));
  assert.equal((await draft()).nodes.filter(n=>['test','and','or','not'].includes(n.kind)).length,6);
  await host.getByRole('button',{name:'元に戻す',exact:true}).click();assert.equal((await draft()).nodes.length,11);
  await page.evaluate(()=>{const f=document.querySelector('#compactFixture .flowProgram').flowView;f.view.selectNode(f.view.graph.getNodeById(2));});
  // A missing root is repairable directly in the normal inspector.
  await conditions.getByRole('button',{name:'条件を外す',exact:true}).click();assert.equal((await draft()).nodes.length,5);
  assert.match(await conditions.textContent(),/未接続/);
  await conditions.getByRole('button',{name:'条件を追加',exact:true}).click();assert.equal((await draft()).nodes.length,6);
  await conditions.locator('.flowConditionMore > summary').click();
  await conditions.getByRole('button',{name:'すべて満たすグループで包む',exact:true}).click();assert.equal((await draft()).nodes.length,8);
  assert.equal(await conditions.getByLabel('条件',{exact:true}).count(),2);
  await host.getByRole('button',{name:'元に戻す',exact:true}).click();await host.getByRole('button',{name:'元に戻す',exact:true}).click();await host.getByRole('button',{name:'元に戻す',exact:true}).click();
  assert.equal((await draft()).nodes.length,11);
  await page.setViewportSize({width:390,height:844});await conditions.scrollIntoViewIfNeeded();
  assert(await page.locator('#compactFixture').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
  await conditions.screenshot({path:path.join(repoRoot,'tmp','flow-compact-conditions.png')});
  await page.setViewportSize({width:1280,height:900});
  await host.locator('.flowViewViewport').scrollIntoViewIfNeeded();await host.getByRole('button',{name:'全体表示',exact:true}).click();
  await host.locator('.flowViewViewport').screenshot({path:path.join(repoRoot,'tmp','flow-compact-program.png')});
  // Legacy settings: root-tree guards, immediate editing, and both view modes.
  const legacy=await page.evaluate(()=>{
    document.querySelector('#compactFixture .flowProgram').flowView.dispose();document.querySelector('#compactFixture').remove();
    const A=App,M=A.FlowViewModel,n=A.graph._nodes.find(n=>M.runtime(n)==='machine');
    const s=M.build(n).nodes.find(s=>s.kind==='condition' && s.ref?.path.length===1);
    M.commit(A.graph,n.id,s.ref,{kind:'all',conditions:[{kind:'count-reached',count:2},{kind:'not',condition:{kind:'full'}}]});
    A.selectionInspector.setNode(n);const panel=document.getElementById('selectionInspectorPanel');document.body.append(panel);panel.style.cssText='display:block;position:fixed;inset:0;overflow:auto;z-index:99999;background:white';
    window.__legacyCompactNode=n.id;
    const f=document.querySelector('.flowView').flowView;
    const rule=f.model.nodes.find(s=>s.kind==='rule' && s.ref.direction==='input');
    return {before:JSON.stringify(A.graph.serialize()),rule:rule.key,visible:f.view.graph._nodes.length,total:f.model.nodes.length};
  });
  assert(legacy.visible<legacy.total);
  await page.locator('.flowViewPicker').selectOption(legacy.rule);
  assert.equal(await page.locator('.flowConditionEditor [aria-label="条件"]').count(),2);
  await page.getByRole('button',{name:'詳細表示',exact:true}).click();await page.getByRole('button',{name:'通常表示',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(App.graph.serialize())),legacy.before);
  await page.locator('.flowConditionEditor').getByLabel('個数',{exact:true}).fill('4');await page.locator('.flowConditionEditor').getByLabel('個数',{exact:true}).press('Tab');
  assert.equal(await page.evaluate(()=>App.graph.getNodeById(window.__legacyCompactNode).properties.inputRules[0].acceptWhen.conditions[0].count),4);
  await page.evaluate(()=>undo());await page.waitForFunction(()=>document.querySelector('.flowConditionEditor [aria-label="個数"]')?.value==='2');
  assert.equal(await page.evaluate(()=>JSON.stringify(App.graph.serialize())),legacy.before);
  await page.setViewportSize({width:390,height:844});await page.locator('.flowConditionEditor').scrollIntoViewIfNeeded();
  assert(await page.locator('#selectionInspectorPanel').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
  await page.locator('.flowConditionEditor').screenshot({path:path.join(repoRoot,'tmp','flow-compact-legacy.png')});
  assert.deepEqual(errors,[]);
  const result={...modelTests,projection:{before:initial.total,after:initial.visible},toggleRoundtrip:true,undoRedo:true,jsonRoundtrip,orphanRecovery:true,inlineComposition:true,legacyEditing:true,narrow:true,errors};
  await fs.writeFile(path.join(artifact,'validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await runtime.close();}
