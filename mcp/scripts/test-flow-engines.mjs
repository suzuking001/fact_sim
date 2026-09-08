import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const mcpRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const client=new Client({name:'flow-view-engine-regression',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(mcpRoot,'dist/index.js')],env:{...process.env,FACT_SIM_ROOT:path.resolve(mcpRoot,'..')}});
try{
  await client.connect(transport);
  // Pin quick's duration: the MCP adapter forwards omitted numeric options as
  // undefined, which otherwise selects the 30-second DEFAULTS rather than quick.
  const result=await client.callTool({name:'engine_test',arguments:{action:'run',suite:'quick',targetSimMs:10000,maxWallMs:1800,realStepMs:16,maxLoops:25000,seeds:[1],includeCurrentGraph:false,includeExamples:true,strictFinalParity:true,saveArtifacts:true,artifactLabel:'flow-view'}},undefined,{timeout:600000});
  for(const block of result.content || [])if(block.type==='text'){
    console.log(block.text);
    const report=JSON.parse(block.text);
    if(report.ok===false || report.summary?.failureCount>0)process.exitCode=1;
  }
  if(result.isError)process.exitCode=1;
}finally{await client.close();}
