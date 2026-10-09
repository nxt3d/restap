// Opt-in live smoke comparison through the playground adapter. No credentials are
// read on import. Virtual 60 Hz time advances by measured request latency plus a
// fixed request-start interval; waiting between requests is simulated, not slept.
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {createApp} from './server.js';
import {freshBreakout,seededRandom,finished,advanceFrame,targetActions,targetFor,actionSpeed,observationState,breakoutObjective,perfectAction,acceptDecision} from './breakout.js';

export const configurations=[
 {name:'Baseline (all off)',options:{}},
 {name:'A+B',options:{instructions:true,facts:true}},
 {name:'A+B+C',options:{instructions:true,facts:true,dash:true}},
 {name:'A+B+C+D16',options:{instructions:true,facts:true,dash:true,precision:true,zones:16}},
 {name:'Perfect at every frame',options:{assist:true},perfect:true},
 {name:'E with model',options:{assist:true}},
 {name:'Perfect at model cadence',options:{assist:true},cadence:true},
];
export async function compareGame({seed,configuration,decide,maxCalls=20,intervalMs=0,maxAgeMs=750,maxFrames=3600,latencySamples=[],stopAtBudget=false}) {
 if(configuration.cadence&&(!latencySamples.length||latencySamples.some(ms=>!Number.isFinite(ms)||ms<=0)))throw Error('Cadence baseline requires positive measured latencies');
 const options=configuration.options,game=freshBreakout(seededRandom(seed));
 let target=game.paddle.x,action='stay',elapsed=0,calls=0,survived=0,dash=0,choices=0,stale=0,errors=0,latencies=[],trace=[];
 const seen=new Set();
 const advance=ms=>{elapsed+=ms;const until=Math.min(maxFrames,Math.floor(elapsed*60/1000));while(!finished(game)&&game.frame<until){
  if(configuration.perfect){action=perfectAction(game,options);target=targetFor(game,action,options);}
  advanceFrame(game,target,[],undefined,actionSpeed(action));
 }};
 while(!finished(game)&&game.frame<maxFrames&&(configuration.perfect||configuration.cadence||calls<maxCalls)){
  if(configuration.perfect){advance(1000/60+0.000001);continue;}
  const capturedAt=elapsed,req={id:`${seed}-${trace.length}`,context:{text:breakoutObjective(options),state:{...observationState(game,options),gameSpeed:1,currentTarget:action,targetX:target}},actions:targetActions(game,options)};
  const request={id:req.id,capturedAt,gameId:game.gameId,actions:req.actions};
  let result,latency;
  if(configuration.cadence){
   // Forecast the captured state, then hold the old target during inference.
   result={restap:{id:req.id,action:perfectAction(game,options)}};
   latency=latencySamples[trace.length%latencySamples.length];
  }else{calls++;const started=performance.now();result=await decide(req);latency=performance.now()-started;}
  latencies.push(latency);advance(latency);
  const verdict=acceptDecision({request,result,now:elapsed,maxAgeMs,active:true,game,seen});
  if(result.error)errors++;
  if(req.actions.some(a=>a.id===result.restap?.action)){choices++;if(result.restap.action.startsWith('dash-to-'))dash++;}
  if(verdict.status==='stale')stale++;
  if(verdict.status==='applied'){survived++;action=result.restap.action;target=targetFor(game,action,options);}
  trace.push({frame:req.context.state.frame,returnFrame:game.frame,action:result.restap?.action,status:verdict.status,latencyMs:latency,error:result.error??null});
  advance(Math.max(0,intervalMs-latency));
 }
 const budgetLimited=!configuration.perfect&&!configuration.cadence&&!finished(game)&&game.frame<maxFrames&&calls>=maxCalls;
 const frameAtBudget=budgetLimited?game.frame:null;
 // Complete the seeded episode on its final held action after the call budget.
 // Explicitly flag this tail; it must not be mistaken for continued model play.
 while(!stopAtBudget&&!finished(game)&&game.frame<maxFrames)advance(1000/60+0.000001);
 return {configuration:configuration.name,seed,calls,decisionsSurvived:survived,bricks:24-game.bricksLeft,timeAlive:game.frame/60,dash,choices,stale,errors,latencies,budgetLimited,frameAtBudget,censored:!finished(game),outcome:finished(game)?game.gameOver?'miss':'win':budgetLimited?'call limit':'time limit',trace};
}
export function summarize(games){return configurations.map(c=>{
 const rows=games.filter(g=>g.configuration===c.name),sum=k=>rows.reduce((n,g)=>n+g[k],0),latencies=rows.flatMap(g=>g.latencies);
 return {configuration:c.name,games:rows.length,calls:sum('calls'),averageDecisionsSurvived:c.perfect||c.cadence?null:sum('decisionsSurvived')/rows.length,averageBricks:sum('bricks')/rows.length,averageTimeAlive:sum('timeAlive')/rows.length,dash:sum('dash'),choices:sum('choices'),averageLatencyMs:latencies.length?latencies.reduce((a,b)=>a+b)/latencies.length:0,budgetLimited:rows.filter(g=>g.budgetLimited).length,censored:rows.filter(g=>g.censored).length,errors:sum('errors'),stale:sum('stale')};});}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.argv.includes('--live')||!process.env.OPENAI_API_KEY)throw Error('Opt in with --live and OPENAI_API_KEY.');
 const output=process.argv[process.argv.indexOf('--output')+1];
 if(!process.argv.includes('--output')||!output)throw Error('Supply --output path outside the repository.');
 const server=createApp({apiKey:process.env.OPENAI_API_KEY}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const url=`http://127.0.0.1:${server.address().port}/decide`,games=[],seeds=[1,2,3,4,5];
 const decide=async req=>(await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)})).json();
 try{
  const models=configurations.filter(c=>!c.perfect&&!c.cadence);
  const settings={seeds,totalLiveCallLimit:500,input:'state',intervalMs:0,maxAgeMs:750,speed:1,maxFrames:3600,tail:'Stop at call cap and mark censored; no held-action tail.',cadenceReplay:'Cycle each paired model game latency sequence; same options, seed, and stale-reply cutoff.'};
  const save=()=>writeFileSync(output,JSON.stringify({settings,games,summary:summarize(games)},null,2));
  let remaining=500,remainingGames=seeds.length*models.length;
  // Interleave by seed; redistribute unused allowances without exceeding 500.
  for(const seed of seeds)for(const configuration of models){
   const allowance=Math.floor(remaining/remainingGames);
   const game=await compareGame({seed,configuration,decide,maxCalls:allowance,stopAtBudget:true});
   remaining-=game.calls;remainingGames--;game.callAllowance=allowance;games.push(game);save();
   console.log(JSON.stringify({configuration:game.configuration,seed,calls:game.calls,bricks:game.bricks,timeAlive:game.timeAlive,budgetLimited:game.budgetLimited,censored:game.censored,errors:game.errors}));
  }
  for(const configuration of models)for(const seed of seeds){
   const paired=games.find(g=>g.configuration===configuration.name&&g.seed===seed);
   const game=await compareGame({seed,configuration:{...configurations.find(c=>c.cadence),options:configuration.options},latencySamples:paired.latencies});
   game.pairedConfiguration=configuration.name;games.push(game);save();
  }
  for(const seed of seeds){games.push(await compareGame({seed,configuration:configurations.find(c=>c.perfect)}));save();}
 }finally{await new Promise(resolve=>server.close(resolve));}
}
