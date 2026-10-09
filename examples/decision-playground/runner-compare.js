// Opt-in provider sanity check. Importing this file makes no network calls and
// reads no credentials. Inject renderImage for image observations in tests.
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {createApp} from './server.js';
import {freshRunner,advanceRunner,runnerActions,runnerTarget,perfectRunnerAction,runnerContext,runnerVerdict,runnerMetrics,drawRunner} from './runner.js';
export async function compareRunnerGame({seed,options,decide,renderImage,maxCalls=65,maxFrames=3600,latencySamples=[],onAttempt=()=>{}}){
 const g=freshRunner(seed,options.speed??1),perfect=options.controller==='perfect',cadence=options.controller==='cadence';
 if(cadence&&(!latencySamples.length||latencySamples.some(x=>!Number.isFinite(x)||x<=0)))throw Error('Positive measured latencies required');
 let elapsed=0,calls=0,cost=0,unknownUsage=0,errors=0,stale=0,consecutiveErrors=0;
 const history=[],seen=new Set(),trace=[];
 function advance(ms){elapsed+=ms;const end=Math.min(maxFrames,Math.floor(elapsed*60/1000));while(!g.over&&g.frame<end){if(perfect)g.target=runnerTarget(g,perfectRunnerAction(g,options.classic));advanceRunner(g);}}
 while(!g.over&&g.frame<maxFrames&&(perfect||cadence||calls<maxCalls)){
  if(perfect){advance(1000/60+.000001);continue;}
  const at=elapsed,frame=g.frame,id=`runner-${seed}-${trace.length}`;
  if(options.input!=='state'){if(!renderImage)throw Error('Renderer required for images');history.push({frame,image:await renderImage(g)});if(history.length>4)history.shift();}
  const req={id,context:runnerContext(g,options,history),actions:runnerActions(g,options.classic)};
  let result,latency;
  if(cadence){result={restap:{id,action:perfectRunnerAction(g,options.classic)}};latency=latencySamples[trace.length%latencySamples.length];}
  else{calls++;const start=performance.now();try{result=await decide(req);}catch{result={error:'transport error'};}latency=performance.now()-start;}
  if(options.mode!=='paused')advance(latency);
  const status=runnerVerdict({request:{id,at,gameId:seed,actions:req.actions},result,now:at+latency,maxAge:options.maxAge??750,active:true,gameId:seed,game:g,seen});
  if(status==='applied'){g.target=runnerTarget(g,result.restap.action);if(options.mode==='paused')for(let i=0;i<(options.k??20)&&!g.over&&g.frame<maxFrames;i++)advanceRunner(g);}
  if(status==='stale')stale++;
  if(result.error){errors++;consecutiveErrors++;}else consecutiveErrors=0;
  if(!cadence){const tokens=result.openai_response?.usage?.input_tokens;if(Number.isFinite(tokens)&&tokens>=0)cost+=tokens*.1/1e6;else unknownUsage++;}
  trace.push({frame,returnFrame:g.frame,action:result.restap?.action,status,latencyMs:latency,confidence:result.restap?.confidence,probabilities:result.restap?.probabilities,error:result.error??null});
  await onAttempt({seed,options,calls,trace});
  if(consecutiveErrors>=3)break;
  if(options.mode!=='paused')advance(Math.max(0,(options.interval??0)-latency,result.error?500*2**(consecutiveErrors-1):0));
 }
 return {...runnerMetrics(g),options,calls,cost,unknownUsage,errors,stale,trace,censored:!g.over,stopReason:g.cause??(consecutiveErrors>=3?'backend errors':g.frame>=maxFrames?'time limit':'call limit')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv.includes('--live')||!process.env.OPENAI_API_KEY)throw Error('Requires --live and OPENAI_API_KEY');
 const arg=name=>process.argv[process.argv.indexOf(name)+1];
 if(!process.argv.includes('--output')||!process.argv.includes('--canvas-module'))throw Error('Requires --output outside the repository and --canvas-module path to optional @napi-rs/canvas');
 const {createCanvas}=await import(pathToFileURL(arg('--canvas-module')).href),canvas=createCanvas(500,620),ctx=canvas.getContext('2d');
 const renderImage=g=>{drawRunner(ctx,g);return canvas.toDataURL('image/png');};
 const server=createApp({apiKey:process.env.OPENAI_API_KEY}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const endpoint=`http://127.0.0.1:${server.address().port}/decide`,games=[],baselines=[];
 const settings={seeds:[1,2,3],maxCallsPerGame:65,totalCallCap:390,speed:1,mode:'realtime',maxAge:750,interval:0,betweenGamesMs:2000,maxFrames:3600,images:2};
 const save=pending=>writeFileSync(arg('--output'),JSON.stringify({settings,games,baselines,pending},null,2));
 const decide=async req=>(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)})).json();
 try{
  for(const seed of settings.seeds)for(const input of ['state','images']){
   if(games.length)await new Promise(resolve=>setTimeout(resolve,2000));
   const options={input,images:2,instructions:true,facts:input==='state',assist:false,mode:'realtime',speed:1,maxAge:750,interval:0,controller:'model'};
   const game=await compareRunnerGame({seed,options,decide,renderImage,onAttempt:save});games.push(game);save();
   console.log(JSON.stringify({input,seed,calls:game.calls,distance:game.distance,trenchesJumped:game.trenchesJumped,cause:game.stopReason,censored:game.censored}));
   for(const controller of ['perfect','cadence'])baselines.push(await compareRunnerGame({seed,options:{...options,input:'state',controller},latencySamples:game.trace.map(t=>t.latencyMs)}));save();
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
}
