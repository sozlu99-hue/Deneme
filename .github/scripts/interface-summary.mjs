import fs from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2];if(!directory)throw Error('Summary output directory is required.');
await fs.mkdir(directory,{recursive:true});
const source=path.resolve('platform/evidence'),rows=[];
for(const file of await fs.readdir(source)){
 if(!/^[a-z0-9-]+-results\.json$/.test(file))continue;
 try{const value=JSON.parse(await fs.readFile(path.join(source,file),'utf8'));rows.push({file,status:value.status==='passed'?'passed':'unverified',checks:Number.isSafeInteger(value.checksCount)?value.checksCount:Array.isArray(value.checks)?value.checks.length:0,scriptErrorCount:Array.isArray(value.pageErrors)?value.pageErrors.length:null});}catch{rows.push({file,status:'unreadable'});}
}
await fs.writeFile(path.join(directory,'browser-summary.json'),JSON.stringify({syntheticBrowserTests:true,physicalAndroid:false,results:rows},null,2)+'\n');
