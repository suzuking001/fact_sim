import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const server=createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(relative==='/' ? '/index.html' : relative));if(!file.startsWith(root+path.sep))throw new Error('Invalid path');const data=await fs.readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1360,height:900}});const errors=[];page.on('pageerror',error=>{errors.push(String(error));console.log('PAGE ERROR',String(error));});page.on('console',message=>{if(message.type()==='error')console.log('CONSOLE',message.text());});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded',timeout:20000});
 await page.waitForTimeout(1500);
 await page.getByRole('button',{name:/Open the live sample/}).click();
 await page.waitForFunction(()=>App.graph?._nodes.length>100);
 await page.evaluate(async()=>{stopSimulation();App.applyGraphData(await (await fetch('sample/simple.json')).json());App.selectionInspector.setNode(App.graph.getNodeById(2));document.getElementById('timelineTabInspector').click();});
 await page.waitForTimeout(300);
 console.log(await page.evaluate(()=>({nodes:App.graph._nodes.length,toolbar:document.querySelector('.flowToolbar')?.textContent,inputs:Array.from(document.querySelectorAll('.flowTime input')).map(e=>({value:e.value,width:e.getBoundingClientRect().width})),details:App.selectionInspector.root.className})));
 await page.screenshot({path:'../tmp/flow-v2-ui-first.png'});
 await fs.writeFile('../tmp/flow-v2-ui-errors.json',JSON.stringify(errors,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
