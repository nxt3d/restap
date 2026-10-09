import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {createApp} from './server.js';
import {ACTIONS,freshTurnRunner,stepTurn,turnContext,perfectTurnAction,turnMetrics} from './turn-runner.js';
import {drawTurn} from './turn-render.js';
export async function compareTurnGame({seed,input='state',instructions=true,images=1,controller='model',decide,renderImage,maxTurns=60,paceMs=1000,onAttempt=()=>{}}){
 const g=freshTurnRunner(seed),history=[],trace=[];let calls=0,stopReason='turn limit',last=null;
 for(let turn=0;turn<Math.min(180,maxTurns)&&!g.over;turn++){
  if(input!=='state'){history.push(await renderImage(g,last));if(history.length>2)history.shift();}
  const id=`turn-${seed}-${turn}`,body={id,context:turnContext(g,{input,instructions,images},history),actions:ACTIONS},at=performance.now();let result;
  if(controller==='perfect')result={restap:{id,action:perfectTurnAction(g)}};
  else{calls++;try{result=await decide(body);}catch{result={error:'transport error'};}}
  const latency=performance.now()-at,action=result.restap?.action;
  const observation={...turnMetrics(g),index:g.index,lane:g.lane,jump:g.jump};
  if(result.error||result.restap?.id!==id||!ACTIONS.some(a=>a.id===action)){stopReason=result.error??'invalid response or refusal';trace.push({turn:turn+1,error:stopReason,latencyMs:latency});await onAttempt({seed,input,calls,trace});break;}
  last={action,probabilities:result.restap.probabilities,latency};stepTurn(g,action);
  trace.push({turn:turn+1,observation,action,latencyMs:latency,probabilities:last.probabilities,metrics:turnMetrics(g)});
  await onAttempt({seed,input,calls,trace});
  if(controller!=='perfect'&&!g.over&&turn+1<maxTurns&&paceMs)await new Promise(r=>setTimeout(r,paceMs));
 }
 return {...turnMetrics(g),input,instructions,images,controller,calls,trace,censored:!g.over,stopReason:g.causeOfDeath??stopReason};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv.includes('--live')||!process.env.OPENAI_API_KEY)throw Error('Requires --live and OPENAI_API_KEY');
 const arg=name=>process.argv[process.argv.indexOf(name)+1];
 if(!process.argv.includes('--output')||!process.argv.includes('--canvas-module'))throw Error('Requires --output outside repository and --canvas-module');
 const {createCanvas}=await import(pathToFileURL(arg('--canvas-module')).href),canvas=createCanvas(900,700),ctx=canvas.getContext('2d');
 const renderImage=(g,last)=>{drawTurn(ctx,g,{last,status:'THINKING'});return canvas.toDataURL('image/png');};
 const server=createApp({apiKey:process.env.OPENAI_API_KEY}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const endpoint=`http://127.0.0.1:${server.address().port}/decide`,games=[],baselines=[],settings={seeds:[1,2,3,4,5],maxTurns:60,totalCallCap:600,paceMs:1000,betweenGamesMs:2000,images:1,instructions:true};let totalCalls=0;
 const save=pending=>writeFileSync(arg('--output'),JSON.stringify({settings,totalCalls,games,baselines,pending},null,2));
 const decide=async body=>{if(totalCalls>=600)throw Error('Call cap');totalCalls++;return(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();};
 try{
  for(const seed of settings.seeds)baselines.push(await compareTurnGame({seed,controller:'perfect',paceMs:0}));
  save();
  for(const input of ['state','images'])for(const seed of settings.seeds){
   if(games.length)await new Promise(r=>setTimeout(r,settings.betweenGamesMs));
   const game=await compareTurnGame({seed,input,decide,renderImage,onAttempt:save});games.push(game);save();
   console.log(JSON.stringify({input,seed,calls:game.calls,rows:game.rowsSurvived,trenches:game.trenchesJumped,coins:game.coins,cause:game.stopReason}));
  }
 }finally{await new Promise(r=>server.close(r));}
}
