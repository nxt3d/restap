import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createApp} from './server.js';
import {SCENARIOS,freshCockpit,decideCockpit,summarize} from './cockpit.js';
import {drawCockpit,WIDTH,HEIGHT} from './cockpit-render.js';
export async function compareCockpit({decide,render,seed=42,paceMs=2000,onRow=()=>{}}){const rows=[];let calls=0;for(const input of ['images','state','both'])for(let index=0;index<SCENARIOS.length;index++){const g=freshCockpit(index,seed);while(!g.done){if(calls>=399)throw Error('Call budget exhausted');if(calls&&paceMs)await new Promise(r=>setTimeout(r,paceMs));calls++;try{rows.push(await decideCockpit(g,{input,role:true,render,decide}));}catch(error){rows.push({input,index,step:g.step,error:error.message});g.done=true;}await onRow({calls,rows,summary:summarize(rows)});}}return {seed,role:true,paceMs,calls,rows,summary:summarize(rows)};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv.includes('--live')||!process.env.OPENAI_API_KEY)throw Error('Requires opt-in --live and OPENAI_API_KEY');
 const arg=name=>process.argv[process.argv.indexOf(name)+1];
 if(!process.argv.includes('--output')||!process.argv.includes('--canvas-module'))throw Error('Requires --output and --canvas-module');
 const {createCanvas}=await import(pathToFileURL(arg('--canvas-module')).href),canvas=createCanvas(WIDTH,HEIGHT),ctx=canvas.getContext('2d');
 const render=g=>{drawCockpit(ctx,g);return canvas.toDataURL('image/png');};
 const server=createApp({apiKey:process.env.OPENAI_API_KEY}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const endpoint=`http://127.0.0.1:${server.address().port}/decision`;
 try{const result=await compareCockpit({render,decide:async body=>(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json(),onRow:data=>{writeFileSync(arg('--output'),JSON.stringify(data,null,2));console.log(`Completed ${data.calls} calls`);}});writeFileSync(arg('--output'),JSON.stringify(result,null,2));console.log(JSON.stringify(result.summary));}finally{await new Promise(r=>server.close(r));}
}
