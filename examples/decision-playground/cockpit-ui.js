import {SCENARIOS,ACTIONS,freshCockpit,scenarioOrder,decideCockpit,summarize} from './cockpit.js';
import {drawCockpit} from './cockpit-render.js';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d'),rows=[];
let order=[],position=0,g,busy=false,playing=false,calls=0,playToken=0,run=0,stepResults=[];
const exchanges=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const fmt=(n,suffix='')=>n===null||n===undefined?'—':n.toFixed(1)+suffix;
function table(){ $('results').replaceChildren();for(const s of summarize(rows)){const tr=document.createElement('tr');for(const value of [s.input,`${fmt(s.accuracy,'%')} (${s.firstActions})`,s.resolved,s.dangerous,s.falseAlarms,fmt(s.latencyMs===null?null:s.latencyMs/1000,' s'),s.costUSD===null?'Unavailable':`$${s.costUSD.toFixed(5)}`,`${fmt(s.confidenceRight===null?null:s.confidenceRight*100,'%')} / ${fmt(s.confidenceWrong===null?null:s.confidenceWrong*100,'%')}`,`${s.calls} / ${s.errors}`]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('results').append(tr);}}
function locks(){for(const id of ['step','play','reset','seed','input','role','order'])$(id).disabled=busy||playing;}
const actionLabel=id=>id===null?'Abstain (null)':`${id} · ${ACTIONS.find(a=>a.id===id)?.description??id}`;
export function displayJSON(value){return JSON.stringify(value,(_key,v)=>typeof v==='string'&&v.startsWith('data:image/')?`${v.slice(0,65)}… [${v.length} characters; image shortened for display]`:v,2);}
function showExchange(index){
 const e=exchanges[index];if(!e)return;
 $('exchange-history').value=String(index);
 $('http-line').textContent=`POST /decide (RESTAP /decision) · ${e.status??'No HTTP response'} · ${e.latencyMs===null?'Pending':Math.round(e.latencyMs)+' ms'}`;
 $('restap-request').textContent=displayJSON(e.request);
 $('restap-response').textContent=e.response===undefined?'Waiting for response…':displayJSON(e.response);
 $('response-heading').textContent=`RESPONSE JSON${e.status?' · HTTP '+e.status:''}`;
 $('backend-request').textContent=e.backendRequest==null?'Unavailable':displayJSON(e.backendRequest);
 $('backend-response').textContent=e.backendResponse==null?'Unavailable':displayJSON(e.backendResponse);
 $('copy-request').disabled=false;$('copy-response').disabled=e.response===undefined;$('copy-status').textContent='';
}
function history(){
 $('exchange-history').replaceChildren(...exchanges.map((e,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`Run ${e.run} · panel ${e.panel} · step ${e.step+1} · ${e.status??'pending / network'}${e.grade?' · '+e.grade:''}`;return option;}));
 $('exchange-history').disabled=false;showExchange(exchanges.length-1);
}
async function exchange(body){
 const e={run,panel:position+1,step:g.step,request:structuredClone(body),status:null,latencyMs:null};exchanges.push(e);$('backend').open=false;history();const start=performance.now();
 try{
  const response=await fetch('/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
  e.status=response.status;const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{e.response=raw;throw Error(`HTTP ${response.status}: non-JSON response`);}
  e.response=data?.restap??data;e.backendRequest=data?.openai_request;e.backendResponse=data?.openai_response;
  if(!response.ok)throw Error(`HTTP ${response.status}: ${data?.error??data?.restap?.error??'decision request failed'}`);
  return data;
 }catch(error){if(e.response===undefined)e.response={error:error.message};throw error;}
 finally{e.latencyMs=performance.now()-start;history();}
}
function tracker(){
 const total=SCENARIOS[g.index].follow?2:1;$('tracker').replaceChildren();
 const label=document.createElement('span');label.textContent=`Scenario steps (${total})`;$('tracker').append(label);
 for(let i=0;i<total;i++){const dot=document.createElement('span'),grade=stepResults[i],kind=['correct','acceptable'].includes(grade)?'pass':grade==='dangerous'?'danger':grade?'fail':'';dot.className=`step-dot ${kind}`;dot.textContent=grade?'●':'○';dot.title=`Step ${i+1}: ${grade??'not completed'}`;dot.setAttribute('aria-label',dot.title);$('tracker').append(dot);}
 $('scenario-summary').textContent=g.done?(g.resolved?'✓ SCENARIO RESOLVED':'✗ SCENARIO FAILED'):'';
}
function clearResult(){stepResults=[];$('feedback').className='';$('feedback').textContent='Scenario hidden until the first decision.';$('instrument').className='instrument';tracker();}
function resultBanner(row){
 const good=['correct','acceptable'].includes(row.grade),kind=good?'pass':row.grade==='dangerous'?'danger':'fail';
 $('feedback').className=kind;$('feedback').replaceChildren();
 const title=document.createElement('strong');title.textContent=good?'✓ STEP PASSED':kind==='danger'?'⚠ DANGER':'✗ FAIL';
 const action=document.createElement('span');action.className='action';action.textContent=`Chosen: ${actionLabel(row.action)}`;
 const explanation=document.createElement('div');explanation.textContent=row.explanation;
 $('feedback').append(title,action,explanation);
 if(!good){const correct=document.createElement('div');correct.textContent=`Correct action: ${actionLabel(row.correct)}`;$('feedback').append(correct);}
 const caption=document.createElement('small');caption.textContent=`${SCENARIOS[g.index].name} · step ${row.step+1} · ${row.grade}`;$('feedback').append(caption);
 stepResults[row.step]=row.grade;tracker();
 $('instrument').className='instrument';void $('instrument').offsetWidth;$('instrument').classList.add(good?'flash-pass':'flash-fail');
 exchanges.at(-1).grade=row.grade;history();
}
function reset(){playToken++;run++;order=scenarioOrder(Number($('seed').value),$('order').value==='random');position=0;calls=0;g=freshCockpit(order[0],Number($('seed').value));clearResult();$('choice').textContent='No decision yet';$('scores').replaceChildren();$('status').textContent='Ready · panel 1 of 18';drawCockpit(ctx,g);}
async function animate(row){const start=performance.now();await new Promise(resolve=>{function frame(now){const t=Math.min(1,(now-start)/950),gauges=structuredClone(row.after);for(const k of Object.keys(gauges))if(typeof gauges[k]==='number')gauges[k]=row.before[k]+(row.after[k]-row.before[k])*t;drawCockpit(ctx,{gauges});if(t<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});}
async function step(){if(busy)return;if(g.done){if(position>=order.length-1){playing=false;$('status').textContent='Run complete · start a new run to repeat';locks();return false;}position++;g=freshCockpit(order[position],Number($('seed').value));clearResult();drawCockpit(ctx,g);}busy=true;locks();$('status').textContent='Reading panel… simulation paused';try{if(calls>=21)throw Error('Run call cap reached');calls++;const row=await decideCockpit(g,{input:$('input').value,role:$('role').checked,render:()=>{drawCockpit(ctx,g);return canvas.toDataURL('image/png');},decide:exchange});rows.push(row);$('choice').textContent=`${ACTIONS.find(a=>a.id===row.action)?.description??'null / abstain'} · confidence ${fmt(row.confidence===null?null:row.confidence*100,'%')}`;resultBanner(row);$('scores').replaceChildren();if(row.probabilities)for(const [id,p]of Object.entries(row.probabilities)){const el=document.createElement('p');el.textContent=`${ACTIONS.find(a=>a.id===id)?.description??id} (${(p*100).toFixed(1)}%)`;const bar=document.createElement('progress');bar.max=1;bar.value=p;el.append(bar);$('scores').append(el);}else $('scores').textContent='Probability bars unavailable from provider.';await animate(row);$('status').textContent=`Panel ${position+1}/18 · +5 simulated seconds · ${g.done?(g.resolved?'Resolved':'Failed'):'Stabilized · next checklist step'} · score ${g.score}`;table();return true;}catch(error){rows.push({input:$('input').value,error:error.message});$('feedback').className='fail';$('feedback').textContent=`Decision unavailable: ${error.message}. No step was graded.`;$('status').textContent=`Stopped: ${error.message}`;playing=false;table();return false;}finally{busy=false;locks();}}
$('step').onclick=()=>step();$('play').onclick=async()=>{if(busy||playing)return;playing=true;const token=++playToken;locks();while(playing&&token===playToken){if(!await step()||token!==playToken)break;if(position===order.length-1&&g.done){playing=false;$('status').textContent+=' · Run complete';break;}await wait(Math.max(500,Math.min(30000,(Number($('hold').value)||1.5)*1000)));}locks();};$('pause').onclick=()=>{playToken++;playing=false;$('status').textContent=busy?'Pausing after current decision':'Paused';locks();};$('reset').onclick=reset;for(const id of ['seed','order','input','role'])$(id).onchange=reset;
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({rows,exchanges,summary:summarize(rows)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cockpit-results.json';a.click();URL.revokeObjectURL(url);};reset();table();

$('exchange-history').onchange=()=>{$('backend').open=false;showExchange(Number($('exchange-history').value));};
for(const [id,key] of [['copy-request','request'],['copy-response','response']])$(id).onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(exchanges[Number($('exchange-history').value)][key],null,2));$('copy-status').textContent=`${key==='request'?'Request':'Response'} JSON copied (full payload).`;}catch{$('copy-status').textContent='Clipboard unavailable. Use Export JSON to save full exchanges.';}};
