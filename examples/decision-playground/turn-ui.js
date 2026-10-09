import {ACTIONS,freshTurnRunner,stepTurn,turnContext,perfectTurnAction,turnMetrics} from './turn-runner.js';
import {drawTurn} from './turn-render.js';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const settings=['controller','input','images','instructions','speed','seed','sameSeeds','limit'];
let runOptions,g,playing=false,busy=false,generation=0,abort,history=[],last=null,animation=null,deathAt=null,recorded=false,calls=0;
const results=[];
function options(){return {input:$('input').value,instructions:$('instructions').checked,images:Number($('images').value)};}
const turnLimit=()=>Math.min(180,Math.max(1,Math.floor(Number($('limit').value)||60)));
function lock(){for(const id of [...settings,'play','step','reset','newSeed'])$(id).disabled=busy||playing;$('stop').disabled=!busy&&!playing;}
function draw(now=performance.now()){
 const progress=animation?Math.min(1,(now-animation.start)/animation.duration):0;
 drawTurn(ctx,g,{time:now,progress,target:animation?.target??g.lane,death:deathAt===null?0:Math.min(1,(now-deathAt)/500),last,status:busy?(animation?'MOVING':'THINKING'):g.over?'GAME OVER':'READY'});
 $('metrics').textContent=`Rows survived ${g.rowsSurvived} · Coins ${g.coins} · Trenches jumped ${g.trenchesJumped} · API calls ${calls}`;
}
function finish(reason){if(recorded)return;recorded=true;const entry={...turnMetrics(g),...runOptions,calls,stopReason:reason,censored:!g.over};results.push(entry);const tr=document.createElement('tr');for(const v of [`${g.seed} / ${entry.controller} / ${entry.input} / A${+entry.instructions}`,g.rowsSurvived,g.trenchesJumped,g.coins,g.causeOfDeath??reason]){const td=document.createElement('td');td.textContent=v;tr.append(td);}$('results').append(tr);}
function reset(forceSeed=false){generation++;playing=false;abort?.abort();if(g?.index&&!recorded)finish('reset');if(forceSeed||!$('sameSeeds').checked)$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];runOptions={controller:$('controller').value,...options()};g=freshTurnRunner(Number($('seed').value));busy=false;history=[];last=null;animation=null;deathAt=null;recorded=false;calls=0;$('last').textContent='No decision yet';$('scores').replaceChildren();$('notice').textContent='Ready';$('observation').hidden=true;$('request').textContent='';draw();lock();}
function showScores(){ $('last').textContent=`${last.action} · ${Math.round(last.latency)} ms`; $('scores').replaceChildren();for(const a of ACTIONS){const div=document.createElement('div');div.className='score';const bar=document.createElement('progress');bar.max=1;const p=last.probabilities?.[a.id];bar.value=p??0;const text=document.createElement('span');text.textContent=`Lane ${a.id.slice(-1)}: ${Number.isFinite(p)?(p*100).toFixed(1)+'%':'N/A'}`;div.append(bar,text);$('scores').append(div);}}
async function turn(){
 if(busy||g.over||g.index>=turnLimit()){playing=false;lock();return;}
 busy=true;lock();const token=generation,id=crypto.randomUUID(),o=options();let committed=false;
 try{
  draw();if(o.input!=='state'){history.push(canvas.toDataURL('image/png'));history=history.slice(-2);$('observation').src=history.at(-1);$('observation').hidden=false;}
  const body={id,context:turnContext(g,o,history),actions:ACTIONS};$('request').textContent=JSON.stringify(body,(k,v)=>k==='images'?v.map(()=> '[canvas PNG]'):v,2);
  const at=performance.now();let result;
  if($('controller').value==='perfect')result={restap:{id,action:perfectTurnAction(g)}};
  else{abort=new AbortController();calls++;result=await(await fetch('/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal})).json();}
  if(token!==generation)return;
  if(result.error||result.restap?.id!==id||!ACTIONS.some(a=>a.id===result.restap?.action))throw Error(result.error??(result.restap?.action===null?'Model refused':'Invalid response'));
  last={action:result.restap.action,probabilities:result.restap.probabilities,latency:performance.now()-at};showScores();
  animation={target:Number(last.action.slice(-1)),start:performance.now(),duration:Number($('speed').value)};
  await new Promise(resolve=>{function tick(now){if(token!==generation||now-animation.start>=animation.duration)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});
  if(token!==generation)return;
  stepTurn(g,last.action);committed=true;animation=null;
  if(g.over){deathAt=performance.now();playing=false;finish(g.causeOfDeath);$('notice').textContent=`Game over: ${g.causeOfDeath}`;}
  else if(g.index>=turnLimit()){playing=false;finish('turn limit');$('notice').textContent='Turn limit reached (survived; no death)';}
  else $('notice').textContent='Turn complete';
 }catch(error){if(token===generation){playing=false;$('notice').textContent=error.name==='AbortError'?'Paused; row unchanged':`Paused: ${error.message}. Row unchanged.`;}}
 finally{if(token===generation){busy=false;abort=null;lock();draw();if(playing&&committed)setTimeout(()=>{if(playing&&token===generation)void turn();},250);}}
}
$('play').onclick=()=>{if(recorded||g.over)reset();playing=true;void turn();};$('step').onclick=()=>{if(recorded||g.over)reset();void turn();};
// Pause cancels a waiting request. An already accepted move finishes its animation.
$('stop').onclick=()=>{playing=false;if(!animation)abort?.abort();$('notice').textContent='Paused';lock();};
$('reset').onclick=()=>reset();$('newSeed').onclick=()=>reset(true);for(const id of settings)$(id).onchange=()=>reset();
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(results,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='turn-runner-results.json';a.click();URL.revokeObjectURL(url);};
reset();function tick(now){draw(now);requestAnimationFrame(tick);}requestAnimationFrame(tick);
