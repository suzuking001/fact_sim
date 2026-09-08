import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FactSimRuntime} from '../dist/fact-sim-runtime.js';
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=new FactSimRuntime({repoRoot,preferredPort:0});
try{
  const page=await runtime.ensureReady(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{App.selectionInspector.setNode(App.graph.getNodeById(45));const panel=document.getElementById('selectionInspectorPanel');document.body.append(panel);panel.style.cssText='display:block;position:fixed;inset:0;overflow:auto;z-index:99999;background:white';});
  await page.getByRole('button',{name:'全体表示',exact:true}).click();
  await page.locator('.flowViewCanvas').scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const before=await page.evaluate(()=>JSON.stringify(App.graph.serialize()));
  const ports=await page.evaluate(()=>{
    const v=document.querySelector('.flowView').flowView.view,a=v.graph._nodes.find(n=>n._flow.kind==='input'),b=v.graph._nodes.find(n=>n._flow.key==='process');
    v.ds.scale=.5;v.ds.offset.set([50,80]);v.draw(true,true);
    const output=a.outputs.findIndex(s=>s.type==='work'),input=b.inputs.findIndex(s=>s.type==='work' && s.link==null),rect=v.canvas.getBoundingClientRect();
    const p=point=>({x:rect.left+(point[0]+v.ds.offset[0])*v.ds.scale,y:rect.top+(point[1]+v.ds.offset[1])*v.ds.scale});
    return {from:a._flow.key,start:p(a.getConnectionPos(false,output)),end:p(b.getConnectionPos(true,input))};
  });
  console.log(ports);
  await page.mouse.move(ports.start.x,ports.start.y);await page.mouse.down();console.log(await page.evaluate(()=>{const v=document.querySelector('.flowView').flowView.view;return {connecting:v.connecting_node?._flow?.key,slot:v.connecting_slot,scale:v.ds.scale,mouse:v.graph_mouse};}));await page.mouse.move(ports.end.x,ports.end.y,{steps:20});await page.mouse.up();
  assert(await page.evaluate(from=>document.querySelector('.flowView').flowView.model.edges.some(e=>e.from===from && e.to==='process' && e.type==='work'),ports.from));
  await page.getByRole('button',{name:'詳細表示',exact:true}).click();
  await page.getByRole('button',{name:'通常表示',exact:true}).click();
  assert(await page.evaluate(from=>document.querySelector('.flowView').flowView.model.edges.some(e=>e.from===from && e.to==='process' && e.type==='work'),ports.from));
  await page.evaluate(()=>{App.selectionInspector.setNode(App.graph.getNodeById(17));App.selectionInspector.setNode(App.graph.getNodeById(45));});
  assert(await page.evaluate(from=>document.querySelector('.flowView').flowView.model.edges.some(e=>e.from===from && e.to==='process' && e.type==='work'),ports.from));
  assert.equal(await page.evaluate(()=>JSON.stringify(App.graph.serialize())),before);
  assert.deepEqual(errors,[]);console.log('Native port drag, equipment-specific draft persistence, and unchanged execution settings: PASS');
}finally{await runtime.close();}
