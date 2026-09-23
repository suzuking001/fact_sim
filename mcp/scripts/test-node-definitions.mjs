import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const server=createServer(async(req,res)=>{
  try{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(repoRoot,'.'+(relative==='/' ? '/index.html' : relative));
    if(!file.startsWith(repoRoot+path.sep))throw new Error('Invalid path');
    const data=await fs.readFile(file);
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try{
  await page.goto(`http://127.0.0.1:${server.address().port}?skipLanding=1`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>App.graph?._nodes?.length>0);
  await page.evaluate(()=>window.stopSimulation?.());
  let graphBefore=await page.evaluate(()=>JSON.stringify(App.serializeGraphData()));

  await page.locator('#addNodePanel .panelHeader').click();
  await page.locator('.nodeDefinitionDetails > summary').click();
  await page.evaluate(()=>{const select=document.getElementById('nodeKindSelect');select.value='source';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.getByRole('button',{name:'Edit Definition',exact:true}).click();
  await page.locator('.nodeDefinitionEditor').waitFor({state:'visible'});
  assert.equal(await page.locator('.nodeDefinitionEditor .flowNode[data-kind="sourceSequence"]').count(),1);
  assert.deepEqual(await page.evaluate(()=>{const node=document.querySelector('.nodeDefinitionEditor .flowNode[data-kind="sourceSequence"]');const draft=App.getNodeCreationItem('source');return {visible:!!node,kind:draft.kind};}),{visible:true,kind:'source'});
  await page.getByRole('button',{name:'Add Entity',exact:true}).click();
  assert.equal(await page.getByLabel('Source Entity 1',{exact:true}).count(),1);
  await page.getByLabel('Source quantity 1',{exact:true}).fill('2');
  await page.getByLabel('Source quantity 1',{exact:true}).press('Tab');
  assert.equal(await page.evaluate(()=>JSON.stringify(App.serializeGraphData())),graphBefore);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();

  await page.evaluate(()=>{const source=App.graph._nodes.find(node=>node.properties?.role==='source');App.selectionInspector.openNode(source,true,false,{tab:'Flow'});const panel=document.getElementById('selectionInspectorPanel');document.body.append(panel);panel.style.cssText='display:block;position:fixed;inset:0;overflow:auto;z-index:99999;background:white';});
  await page.locator('#selectionInspectorPanel .flowNode[data-kind="sourceSequence"]').waitFor({state:'visible'});
  assert.match(await page.locator('#selectionInspectorPanel').innerText(),/Source Sequence/);
  assert.equal(await page.locator('#selectionInspectorPanel').getByLabel('Source interval seconds',{exact:true}).count(),1);
  await page.evaluate(()=>{document.getElementById('selectionInspectorPanel').style.display='none';});
  graphBefore=await page.evaluate(()=>JSON.stringify(App.serializeGraphData()));

  await page.evaluate(()=>{const select=document.getElementById('nodeKindSelect');select.value='machine';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.getByRole('button',{name:'Edit Definition',exact:true}).click();
  await page.locator('.nodeDefinitionEditor').waitFor({state:'visible'});
  assert.equal(await page.getByLabel('Definition ID',{exact:true}).inputValue(),'machine');
  assert.equal(await page.getByLabel('Definition ID',{exact:true}).getAttribute('readonly'),'');
  assert.equal(await page.getByLabel('process1 seconds',{exact:true}).inputValue(),'2');
  await page.getByLabel('process1 seconds',{exact:true}).fill('4');
  await page.getByLabel('process1 seconds',{exact:true}).press('Tab');
  assert.equal(await page.evaluate(()=>JSON.stringify(App.serializeGraphData())),graphBefore);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();

  await page.getByRole('button',{name:'Edit Definition',exact:true}).click();
  assert.equal(await page.getByLabel('process1 seconds',{exact:true}).inputValue(),'2');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Duplicate as New',exact:true}).click();
  assert.equal(await page.getByLabel('Definition ID',{exact:true}).inputValue(),'machine-copy');
  await page.getByLabel('Definition ID',{exact:true}).fill('qa-machine');
  await page.getByLabel('Menu label',{exact:true}).fill('QA Machine');
  await page.getByLabel('Default node title',{exact:true}).fill('QA Machine Default');
  await page.getByLabel('process1 seconds',{exact:true}).fill('4');
  await page.getByLabel('process1 seconds',{exact:true}).press('Tab');
  await page.evaluate(()=>{
    window.__nodeDefinitionWrites={};
    const config={
      name:'config',
      async getFileHandle(name){
        return {async createWritable(){let text='';return {async write(value){text+=String(value);},async close(){window.__nodeDefinitionWrites[name]=text;},async abort(){}};}};
      }
    };
    window.showDirectoryPicker=async()=>({name:'fact_sim',async getDirectoryHandle(name){if(name!=='config')throw new Error('Unexpected directory');return config;}});
  });
  await page.getByRole('button',{name:'Save Definition',exact:true}).click();
  await page.locator('.nodeDefinitionEditor').waitFor({state:'detached'});
  const saved=await page.evaluate(()=>{
    const item=App.getNodeCreationItem('qa-machine'),node=App.createNodeFromCatalog('qa-machine');
    return {
      item:{kind:item?.kind,label:item?.label},
      selected:document.getElementById('nodeKindSelect').value,
      title:node?.title,
      seconds:node?.properties?.flow?.nodes?.find(entry=>entry.kind==='process')?.config?.seconds,
      files:Object.keys(window.__nodeDefinitionWrites).sort(),
      json:JSON.parse(window.__nodeDefinitionWrites['node-definitions.json'])
    };
  });
  assert.deepEqual(saved.item,{kind:'qa-machine',label:'QA Machine'});
  assert.equal(saved.selected,'qa-machine');
  assert.equal(saved.title,'QA Machine Default');
  assert.equal(saved.seconds,4);
  assert.deepEqual(saved.files,['node-definitions.js','node-definitions.json']);
  assert.equal(saved.json.items.at(-1).kind,'qa-machine');
  assert.equal(await page.evaluate(()=>JSON.stringify(App.serializeGraphData())),graphBefore);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({sourceEditor:true,draftIsolation:true,cancel:true,duplicate:true,save:true,reloadFiles:saved.files,errors}));
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
