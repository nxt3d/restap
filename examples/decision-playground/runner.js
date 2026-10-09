// Shared deterministic Lane Runner simulation. Distances are forward-world units.
import {seededRandom} from './breakout.js';
export const LANES=5, LANE_FRAMES=10, RAMP_GAP=24, JUMP_DISTANCE=30;
export const START_BUFFER_FRAMES=120;
export const SPEEDS=[0.5,1,2];
export function freshRunner(seed=1,speed=1){
 if(!SPEEDS.includes(speed))throw Error('Unsupported speed');
 const g={seed:seed>>>0,speed,frame:0,distance:0,lane:3,target:3,jumpUntil:-1,rows:[],block:0,rng:seededRandom(seed>>>0),over:false,cause:null,rowsSurvived:0,trenchesJumped:0,wallsAvoided:0,coins:0};
 extend(g);return g;
}
function extend(g){while(g.rows.length<12){
 const base=START_BUFFER_FRAMES*g.speed+g.block++*360, pick=()=>1+Math.floor(g.rng()*LANES), safe=pick(),ramp=pick(),gap=pick();
 const wall=Array.from({length:5},(_,i)=>i+1===safe?'COIN':'WALL');
 const launch=Array.from({length:5},(_,i)=>i+1===ramp?'RAMP':'EMPTY');
 const partial=Array.from({length:5},(_,i)=>i+1===gap?'COIN':'TRENCH');
 g.rows.push({at:base+100,cells:wall},{at:base+200,cells:launch},{at:base+224,cells:Array(5).fill('TRENCH'),requiresRamp:true},{at:base+320,cells:partial});
}}
export const jumping=g=>g.jumpUntil>=g.distance;
export function advanceRunner(g,target=g.target){
 if(g.over)return;
 g.target=Math.max(1,Math.min(5,target));
 g.lane+=Math.sign(g.target-g.lane)*Math.min(1/LANE_FRAMES,Math.abs(g.target-g.lane));
 g.frame++;g.distance+=g.speed;
 while(g.rows.length&&g.rows[0].at<=g.distance){
  const row=g.rows.shift(),cell=row.cells[Math.round(g.lane)-1];
  if(cell==='WALL'||(cell==='TRENCH'&&g.jumpUntil<row.at)){
   g.over=true;g.cause=cell==='WALL'?'wall':row.requiresRamp?'missed ramp':'trench';
   g.death={frame:g.frame,row:g.rowsSurvived,currentLane:g.lane,currentLaneRounded:Math.round(g.lane),targetLane:g.target,cells:explicitCells(row),object:cell};return;
  }
  if(cell==='RAMP')g.jumpUntil=row.at+JUMP_DISTANCE;
  if(cell==='TRENCH')g.trenchesJumped++;
  if(cell==='COIN')g.coins++;
  if(row.cells.includes('WALL'))g.wallsAvoided+=row.cells.filter(x=>x==='WALL').length;
  g.rowsSurvived++;
 }
 extend(g);
}
// Exact row-boundary reachability search for the collision semantics above.
// A cell occupies [lane-.5,lane+.5); movement may stop at any integer target.
// Search uses complete target choices, simulates travel between rows, and carries
// position + jump expiry so it also handles partially completed lane changes.
export function lanePlan(g){
 const rows=g.rows.slice(0,8),memo=new Map();
 function search(i,pos,frame,jumpUntil){
  if(i===rows.length)return {cost:0,lanes:[]};
  const row=rows[i],crossFrame=Math.ceil((row.at-g.distance)/g.speed),steps=crossFrame-frame;
  const key=[i,pos.toFixed(6),jumpUntil].join('/');if(memo.has(key))return memo.get(key);
  let best=null;
  for(const target of [1,2,3,4,5].sort((a,b)=>Math.abs(a-pos)-Math.abs(b-pos))){
   const next=pos+Math.sign(target-pos)*Math.min(steps/LANE_FRAMES,Math.abs(target-pos));
   const cell=row.cells[Math.round(next)-1];
   if(cell==='WALL'||(cell==='TRENCH'&&jumpUntil<row.at))continue;
   const tail=search(i+1,next,crossFrame,cell==='RAMP'?row.at+JUMP_DISTANCE:jumpUntil);
   if(!tail)continue;
   const cost=Math.abs(target-pos)+tail.cost;
   if(!best||cost<best.cost-1e-9)best={cost,lanes:[target,...tail.lanes]};
  }
  memo.set(key,best);return best;
 }
 return search(0,g.lane,0,g.jumpUntil)?.lanes??[];
}
export function runnerActions(g,classic=false){
 if(classic)return ['left','right','stay'].map(id=>({id,description:id==='stay'?'Stay: stop lateral movement and hold current position.':`Move ${id} one lane from the nearest lane and hold; at most ${LANE_FRAMES*1.5} simulation frames to arrive, at ${LANE_FRAMES} frames per lane.`}));
 return Array.from({length:5},(_,i)=>({id:`lane-${i+1}`,description:`Go to lane ${i+1} and hold. Speed: one lane per ${LANE_FRAMES} simulation frames; at most ${4*LANE_FRAMES} frames across the track.`}));
}
export function runnerTarget(g,action){
 if(action==='stay')return g.lane;
 if(action==='left'||action==='right')return Math.max(1,Math.min(5,Math.round(g.lane)+(action==='left'?-1:1)));
 if(/^lane-[1-5]$/.test(action))return Number(action.slice(-1));
 return g.target;
}
export function perfectRunnerAction(g,classic=false){const lane=lanePlan(g)[0]??Math.round(g.lane);return classic?(lane<g.lane?'left':lane>g.lane?'right':'stay'):`lane-${lane}`;}
const explicitCells=row=>row.cells.map((object,i)=>({lane:i+1,object}));
export function runnerState(g,o={}){
 const rows=g.rows.slice(0,8).map(row=>({cells:explicitCells(row),framesAway:Math.ceil((row.at-g.distance)/g.speed)}));
 const state={frame:g.frame,currentLane:g.lane,currentLaneRounded:Math.round(g.lane),targetLane:g.target,speed:g.speed,laneChangeFrames:LANE_FRAMES,jumping:jumping(g),jumpFramesRemaining:Math.max(0,Math.floor((g.jumpUntil-g.distance)/g.speed)),rows};
 if(o.facts)state.derived=rows.map(row=>({framesUntil:row.framesAway,rampLanes:row.cells.filter(c=>c.object==='RAMP').map(c=>c.lane),groundSafeLanes:row.cells.filter(c=>c.object!=='WALL'&&c.object!=='TRENCH').map(c=>c.lane),jumpSafeLanes:row.cells.filter(c=>c.object!=='WALL').map(c=>c.lane)}));
 if(o.assist){state.recommendedLane=lanePlan(g)[0]??null;state.assist='Reachability planner recommendation at capture time';}
 return state;
}
export function runnerContext(g,o={},history=[]){
 let text='Survive the endless five-lane runner for as many rows as possible; collect optional coins.';
 if(o.instructions)text+=' Forward movement is automatic. Lanes 1–5 run left to right. WALL kills even while jumping. TRENCH kills unless jumping. Go ONTO a green RAMP before a full-width trench: merely avoiding obstacles will fail. A ramp automatically jumps across the next trench 24 distance units later; the jump lasts 30 distance units. Lane movement takes 10 simulation frames per lane. Red W = wall, dark T = trench, green R = ramp, gold C = coin; blue circle = runner. Upcoming rows move downward toward the runner. Plan ahead for travel time. '+(o.mode==='paused'?'Simulation freezes during inference, then holds your action for K frames.':'Simulation continues during inference; observations can age before your action applies.');
 if(o.instructions&&o.input!=='images')text+=' State row cells explicitly name their 1-based lane. currentLane is the continuous position during movement; currentLaneRounded is the lane used for collisions.';
 const context={text};
 if(o.input!=='images')context.state=runnerState(g,o);
 if(o.input!=='state'){
  if(!history.length)throw Error('Image observation requires a screenshot');
  const count=Math.max(1,Math.min(4,o.images??2)),frames=history.slice(-count),pad=count-frames.length;
  while(frames.length<count)frames.unshift(frames[0]);
  context.images=frames.map(f=>f.image);
  context.text+='\n'+frames.map((f,i)=>`Image ${i+1}: frame ${f.frame} (${g.frame-f.frame} frames old${i<pad?', padded first snapshot':''})`).join('; ');
 }
 return context;
}
export function runnerVerdict({request,result,now,maxAge,active,gameId,game,seen}){
 if(seen.has(request.id))return 'duplicate';seen.add(request.id);
 if(!active)return 'stopped';if(gameId!==request.gameId)return 'old game';if(game.over)return 'game over';
 if(result.error)return 'error';if(result.restap?.id!==request.id)return 'wrong id';
 if(now-request.at>=maxAge)return 'stale';if(result.restap.action===null)return 'refused';
 return request.actions.some(a=>a.id===result.restap.action)?'applied':'invalid action';
}
export function runnerMetrics(g){return {seed:g.seed,distance:g.rowsSurvived,trenchesJumped:g.trenchesJumped,wallsAvoided:g.wallsAvoided,coins:g.coins,causeOfDeath:g.cause,timeAlive:g.frame/60};}
export function drawRunner(ctx,g){
 const w=500,h=620,bottom=560,horizon=760;
 ctx.fillStyle='#101e2e';ctx.fillRect(0,0,w,h);
 ctx.font='15px system-ui';ctx.textAlign='center';
 for(let lane=0;lane<5;lane++){ctx.strokeStyle='#3d5266';ctx.strokeRect(lane*90+25,35,90,540);ctx.fillStyle='#c9d8e5';ctx.fillText(`LANE ${lane+1}`,lane*90+70,25);}
 for(const row of g.rows){const d=row.at-g.distance;if(d>horizon)continue;const y=bottom-d/horizon*505;
  for(let i=0;i<5;i++){const cell=row.cells[i];if(cell==='EMPTY')continue;ctx.fillStyle={WALL:'#e96966',TRENCH:'#020609',RAMP:'#4cdab0',COIN:'#f4c95e'}[cell];ctx.fillRect(i*90+30,y-6,80,12);ctx.fillStyle=cell==='TRENCH'?'#aabed0':'#101e2e';ctx.font='bold 11px system-ui';ctx.fillText(cell[0],i*90+70,y+4);}
 }
 const x=70+(g.lane-1)*90;ctx.beginPath();ctx.arc(x,bottom-(jumping(g)?14:0),jumping(g)?16:12,0,Math.PI*2);ctx.fillStyle='#71bcff';ctx.fill();ctx.strokeStyle='white';ctx.stroke();
 ctx.fillStyle='#d7e4ef';ctx.font='14px system-ui';ctx.fillText('W wall · T trench · R ramp · C coin',250,600);
 if(g.over){ctx.fillStyle='#101e2eeb';ctx.fillRect(40,260,420,85);ctx.fillStyle='#fff';ctx.font='24px system-ui';ctx.fillText(`Game over: ${g.cause}`,250,310);}
}
