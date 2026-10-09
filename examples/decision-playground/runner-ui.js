import {freshRunner,advanceRunner,runnerActions,runnerTarget,perfectRunnerAction,runnerContext,runnerVerdict,runnerMetrics,drawRunner} from './runner.js';
const $=id=>document.getElementById(id), ctx=$('canvas').getContext('2d');
const controls=['controller','mode','input','images','speed','k','classic','instructions','facts','assist','maxAge','interval','cadenceMs','seed','sameSeeds','budget','games','auto'];
let g,gameId=0,episode=0,active=false,pending=false,stepOnly=false,remaining=0,calls=0,attempts=0,lastRAF=null,accumulator=0,nextAt=0,errorsInRow=0,recorded=false,history=[],seen=new Set(),current,rows=[],totalCost=0,runToken=0;
const num=(id,min,max=Infinity)=>Math.min(max,Math.max(min,Number($(id).value)||min));
function options(){return {controller:$('controller').value,mode:$('mode').value,input:$('input').value,images:num('images',1,4),speed:num('speed',.5,2),k:num('k',1,120),classic:$('classic').checked,instructions:$('instructions').checked,facts:$('facts').checked,assist:$('assist').checked,maxAge:num('maxAge',1),interval:num('interval',0),cadenceMs:num('cadenceMs',1),seed:num('seed',0,4294967295)>>>0};}
function log(text){const li=document.createElement('li');li.textContent=text;$('log').prepend(li);}
function lock(){for(const id of [...controls,'newSeed','reset','play','step'])$(id).disabled=active||pending;$('stop').disabled=!active;if(options().controller==='perfect')$('step').disabled=true;}
function newGame(){const o=options();g=freshRunner((o.seed+episode)>>>0,o.speed);gameId++;history=[];seen=new Set();remaining=0;recorded=false;current={...runnerMetrics(g),configuration:o,calls:0,latencies:[],cost:0,unknownUsage:0,stale:0,errors:0,trace:[]};render();}
function reset(){active=false;runToken++;if(!recorded&&g?.frame)finish('reset');if(!$('sameSeeds').checked)$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];episode=0;calls=attempts=errorsInRow=0;newGame();lock();}
function finish(reason){if(recorded)return;recorded=true;Object.assign(current,runnerMetrics(g),{censored:!g.over,stopReason:reason});rows.push(current);log(`Game ${episode+1}, seed ${g.seed}: ${g.rowsSurvived} rows; ${g.trenchesJumped} trenches; ${g.cause??reason} (${g.frame/60}s).`);table();}
function table(){
 const groups=new Map();for(const r of rows){const key=JSON.stringify({...r.configuration,seed:r.seed});if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 $('results').replaceChildren();for(const group of groups.values()){
 const c=group[0].configuration,sum=k=>group.reduce((n,r)=>n+r[k],0),lat=group.flatMap(r=>r.latencies),tr=document.createElement('tr');
 const label=`${c.controller} / ${c.mode} / ${c.input} (${c.images}) / A${+c.instructions} B${+c.facts} E${+c.assist} / ${c.classic?'classic':'targets'} / speed ${c.speed} / seed ${group[0].seed} / K${c.k} / age ${c.maxAge} / interval ${c.interval} / cadence ${c.cadenceMs}`;
 for(const value of [label,`${group.length} / ${group.filter(r=>r.censored).length}`,(sum('distance')/group.length).toFixed(1),sum('trenchesJumped'),sum('wallsAvoided'),sum('coins'),(sum('timeAlive')/group.length).toFixed(2),group.map(r=>r.causeOfDeath??r.stopReason).join(', '),lat.length?`${(lat.reduce((a,b)=>a+b,0)/lat.length).toFixed(0)} ms`:'N/A',`$${sum('cost').toFixed(7)}; ${sum('unknownUsage')} unknown`,`${sum('stale')} / ${sum('errors')}`]){const td=document.createElement('td');td.textContent=value;tr.append(td);} $('results').append(tr);
 }
}
function render(){drawRunner(ctx,g);$('metrics').textContent=`Rows ${g.rowsSurvived} · Trenches jumped ${g.trenchesJumped} · Walls avoided ${g.wallsAvoided} · Coins ${g.coins} · Alive ${(g.frame/60).toFixed(2)}s · ${g.cause??'running'}`;$('stats').textContent=`Frame ${g.frame} · Lane ${g.lane.toFixed(1)} → ${g.target.toFixed(1)} · API calls ${calls} · Cadence decisions ${attempts} · Session input cost $${totalCost.toFixed(7)} · Stale ${current?.stale??0} · Errors ${current?.errors??0}`;}
function stop(reason='stopped'){active=false;remaining=0;runToken++;$('notice').textContent=reason;if(!pending)finish(reason);lock();}
function ended(){if(!g.over||pending)return;if(!recorded)finish(g.cause);if(active&&!stepOnly&&$('auto').checked&&episode+1<num('games',1,100)&&(options().controller==='perfect'||attempts<num('budget',1,500))){episode++;newGame();nextAt=performance.now()+2000;}else stop(g.cause);}
function score(result,status,latency){$('scores').replaceChildren();const heading=document.createElement('p');heading.textContent=`${result.restap?.action??result.error??'refusal'} · ${status} · ${latency.toFixed(0)} ms · confidence ${result.restap?.confidence??'N/A'} · input ${options().controller==='cadence'?'$0 (no API)':Number.isFinite(result.openai_response?.usage?.input_tokens)?'$'+(result.openai_response.usage.input_tokens*.1/1e6).toFixed(7):'cost unknown'}`;$('scores').append(heading);for(const [action,p] of Object.entries(result.restap?.probabilities??{})){const div=document.createElement('div'),bar=document.createElement('progress'),label=document.createElement('span');bar.max=1;bar.value=p;label.textContent=`${action}: ${(p*100).toFixed(1)}%`;div.append(bar,label);$('scores').append(div);}}
async function decide(){
 if(!active||pending||g.over)return;
 const o=options();if(attempts>=num('budget',1,500)){stop('decision budget (censored)');return;}
 const token=runToken,at=performance.now(),id=crypto.randomUUID();render();
 if(o.input!=='state'){history.push({frame:g.frame,image:$('canvas').toDataURL('image/png')});history=history.slice(-4);$('observation').src=history.at(-1).image;$('observation').hidden=false;}else $('observation').hidden=true;
 const body={id,context:runnerContext(g,o,history),actions:runnerActions(g,o.classic)},request={id,at,gameId,actions:body.actions};
 $('request').textContent=JSON.stringify(body,(k,v)=>k==='images'?v.map(x=>x.slice(0,50)+'…'):v,2);
 const frame=g.frame;pending=true;attempts++;lock();let result;
 try{if(o.controller==='cadence'){const action=perfectRunnerAction(g,o.classic);await new Promise(resolve=>setTimeout(resolve,o.cadenceMs));result={restap:{id,action}};}else{calls++;current.calls++;result=await(await fetch('/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();}}catch{result={error:'transport error'};}
 const now=performance.now(),latency=now-at;current.latencies.push(latency);
 if(o.controller==='model'){const usage=result.openai_response?.usage?.input_tokens;if(Number.isFinite(usage)&&usage>=0){const cost=usage*.1/1e6;current.cost+=cost;totalCost+=cost;}else current.unknownUsage++;}
 const status=runnerVerdict({request,result,now,maxAge:o.maxAge,active:active&&token===runToken,gameId,game:g,seen});
 if(status==='applied'){g.target=runnerTarget(g,result.restap.action);if(o.mode==='paused')remaining=o.k;}
 if(status==='stale')current.stale++;
 if(result.error){current.errors++;errorsInRow++;}else errorsInRow=0;
 current.trace.push({frame,returnFrame:g.frame,status,action:result.restap?.action,latencyMs:latency,error:result.error??null});
 score(result,status,latency);log(`Frame ${frame} → ${g.frame}: ${result.restap?.action??result.error??'refusal'}, ${status}, age ${latency.toFixed(0)} ms.`);
 pending=false;nextAt=Math.max(at+o.interval,now+(result.error?500*2**(errorsInRow-1):0));
 if(!active)finish('stopped');else if(errorsInRow>=3)stop('Paused after three backend errors');else if(stepOnly&&remaining===0)stop('step complete');
 ended();render();lock();
}
function tick(now){
 const delta=lastRAF===null?0:Math.min(100,now-lastRAF);lastRAF=now;
 if(active){const o=options(),canAdvance=now>=nextAt||episode===0||g.frame>0;
 if(canAdvance&&(o.controller==='perfect'||o.mode==='realtime'||remaining>0)){
  accumulator+=delta*60/1000;
  while(accumulator>=1&&!g.over&&active){accumulator--;if(o.controller==='perfect')g.target=runnerTarget(g,perfectRunnerAction(g,o.classic));advanceRunner(g);
   if(o.controller!=='perfect'&&o.mode==='paused'&&--remaining<=0){remaining=0;accumulator=0;if(stepOnly)stop('step complete');break;}
  }
 }else accumulator=0;
 ended();if(active&&!pending&&!g.over&&o.controller!=='perfect'&&remaining===0&&now>=nextAt)void decide();
 }
 render();requestAnimationFrame(tick);
}
function start(single){if(active||pending)return;if(recorded||g.over)newGame();active=true;stepOnly=single;runToken++;nextAt=performance.now();lastRAF=null;accumulator=0;$('notice').textContent='Running';lock();if(options().controller!=='perfect')void decide();}
$('play').onclick=()=>start(false);$('step').onclick=()=>start(true);$('stop').onclick=()=>stop();$('reset').onclick=reset;$('newSeed').onclick=()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];reset();};
for(const id of controls)$(id).onchange=reset;
$('export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'}));a.download='lane-runner-results.json';a.click();URL.revokeObjectURL(a.href);};
newGame();lock();requestAnimationFrame(tick);
