// Rewrite bundled examples with the same migration used for saved Flow v2 files.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),context={};
vm.runInNewContext(fs.readFileSync(path.join(root,'js/app/flow-model.js'),'utf8'),context);
for(const name of ['simple','branch','shuttle_line5','carrier','pallet_station_demo','sample_line1','sample_line2','parallel_benchmark']){
 const file=path.join(root,'sample',name+'.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));let count=0;
 for(const n of data.nodes)if(n.properties?.flow && context.App.FlowModel.addRecoveryCycle(n.properties.flow))count++;
 if(count){const json=JSON.stringify(data,null,2);fs.writeFileSync(file,json+'\n');fs.writeFileSync(file.replace(/\.json$/,'.js'),`(function(root){root.EXAMPLES=root.EXAMPLES || {};root.EXAMPLES[${JSON.stringify(name)}]=${json};})(window);\n`);}
 console.log(`${name}: ${count} recovery cycles migrated`);
}
