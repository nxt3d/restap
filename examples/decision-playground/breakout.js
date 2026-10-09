// Mulberry32: a fixed uint32 seed reproduces the launch sequence across modes.
export function seededRandom(seed) {
 let state=seed>>>0;
 return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function freshBreakout(random=seededRandom(1),gameId=1) {
 const angle=(30+120*random())*Math.PI/180,speed=Math.hypot(2.4,3);
 return {gameId,width:480,height:360,ball:{x:240,y:323,vx:speed*Math.cos(angle),vy:-speed*Math.sin(angle),radius:6},paddle:{x:195,y:330,width:90,height:10},bricks:Array.from({length:24},(_,i)=>({x:15+(i%8)*57,y:42+Math.floor(i/8)*25,width:51,height:17})),bricksLeft:24,score:0,gameOver:false,frame:0};
}
export const finished = s => s.gameOver || s.bricksLeft===0;
export function actionsFor(s,k){
 const n=4*k;
 return [{id:'left',description:`Move the paddle left ${n} px over the next ${k} frames (4 px/frame, clamped at the left wall).`},{id:'right',description:`Move the paddle right ${n} px over the next ${k} frames (4 px/frame, clamped at the right wall).`},{id:'stay',description:`Hold the paddle in place (0 px movement) for the next ${k} frames.`}];
}
export function advanceFrame(s,action,events,tracking,paddleSpeed=4){
 if(finished(s))return;
 if(typeof action!=='number'&&!['left','right','stay'].includes(action))throw Error('Invalid Breakout action');
 const p=s.paddle,b=s.ball,r=b.radius,oldY=b.y;
 p.x=Math.max(0,Math.min(s.width-p.width,p.x+(typeof action==='number'?Math.max(-paddleSpeed,Math.min(paddleSpeed,action-p.x)):action==='left'?-4:action==='right'?4:0)));
 b.x+=b.vx;b.y+=b.vy;s.frame++;
 if(b.x<r||b.x>s.width-r){b.x=Math.max(r,Math.min(s.width-r,b.x));b.vx=-b.vx;events.push('Ball bounced off side wall.');}
 if(b.y<r){b.y=r;b.vy=Math.abs(b.vy);events.push('Ball bounced off ceiling.');}
 if(tracking&&b.vy>0&&oldY+r<=p.y&&b.y+r>=p.y){
  if(b.x+r>=p.x&&b.x-r<=p.x+p.width)tracking.contacts++;else tracking.misses++;
 }
 if(b.vy>0&&oldY+r<=p.y&&b.y+r>=p.y&&b.x+r>=p.x&&b.x-r<=p.x+p.width){
  b.y=p.y-r;b.vy=-Math.abs(b.vy);b.vx=3.5*((b.x-(p.x+p.width/2))/(p.width/2));events.push('Ball bounced off paddle.');
 }
 const hit=s.bricks.findIndex(t=>b.x+r>=t.x&&b.x-r<=t.x+t.width&&b.y+r>=t.y&&b.y-r<=t.y+t.height);
 if(hit>=0){const t=s.bricks[hit];if(oldY+r<=t.y||oldY-r>=t.y+t.height)b.vy=-b.vy;else b.vx=-b.vx;s.bricks.splice(hit,1);s.bricksLeft=s.bricks.length;s.score+=10;events.push('Brick hit +10.');if(!s.bricksLeft)events.push('All bricks cleared. You won!');}
 if(b.y-r>s.height){s.gameOver=true;events.push('Game over: missed the ball.');}
}
export function inputCost(response){const n=response?.usage?.input_tokens;return Number.isFinite(n)&&n>=0?n*0.10/1e6:null;}

// Zones describe paddle CENTER positions; physics takes a clamped left edge.
export function tuningOptions(o={}) {
 return {instructions:!!o.instructions,facts:!!o.facts,dash:!!o.dash,precision:!!o.precision,assist:!!o.assist,zones:[8,12,16].includes(Number(o.zones))?Number(o.zones):8};
}
export const zoneCount = o => o?.precision ? tuningOptions(o).zones : 8;
export function targetActions(s,o={}) {
 const count=zoneCount(o), actions=[];
 for(const dash of o.dash?[false,true]:[false])for(let i=1;i<=count;i++)actions.push({id:`${dash?'dash-to-':''}zone-${i}`,description:`Move the paddle center to zone ${i} of ${count} (x=${(i-1)*s.width/count}–${i*s.width/count} px), targeting x=${(i-.5)*s.width/count} px, clamped at walls. Move at up to ${dash?12:4} px per simulation frame and hold there until a new decision.`});
 return [...actions,{id:'stay',description:'Stop moving the paddle at its current position when this answer arrives and hold there until a new decision.'}];
}
export function targetFor(s,action,o={}) {
 if(action==='stay')return s.paddle.x;
 const match=/^(dash-to-)?zone-([1-9][0-9]*)$/.exec(action), count=zoneCount(o);
 if(!match||Number(match[2])>count||(match[1]&&!o.dash))throw Error('Invalid target action');
 return Math.max(0,Math.min(s.width-s.paddle.width,(Number(match[2])-.5)*s.width/count-s.paddle.width/2));
}
export const actionSpeed = action => action?.startsWith('dash-to-') ? 12 : 4;
// Wall-only projection: brick collisions can change this estimate. Contact is at
// ball-center y = paddle.y - radius, not the paddle's center or bottom.
export function framesToPaddle(s) {
 const b=s.ball,contact=s.paddle.y-b.radius;
 if(!b.vy)return null;
 if(b.y>contact&&b.vy>0)return null; // already missed this crossing
 return Math.max(0,(b.vy>0?contact-b.y:b.y-b.radius+contact-b.radius)/Math.abs(b.vy));
}
export function landingPrediction(s,o={}) {
 const frames=framesToPaddle(s);if(frames===null)return {predictedLandingX:null,predictedLandingZone:null};
 const span=s.width-2*s.ball.radius,period=2*span;
 const raw=s.ball.x-s.ball.radius+s.ball.vx*frames,wrapped=((raw%period)+period)%period;
 const x=s.ball.radius+(wrapped<=span?wrapped:period-wrapped);
 return {predictedLandingX:x,predictedLandingZone:Math.min(zoneCount(o),Math.floor(x/s.width*zoneCount(o))+1)};
}
export function observationState(s,o={}) {
 const state=structuredClone(s);
 if(o.facts)state.derivedFacts={ballDirection:{vertical:s.ball.vy<0?'up':s.ball.vy>0?'down':'stationary',horizontal:s.ball.vx<0?'left':s.ball.vx>0?'right':'stationary'},framesUntilPaddleHeight:framesToPaddle(s),projectionAssumption:'Current velocity with top/side wall bounces, ignoring future brick collisions; null if no future crossing.',zoneTravelFrames:Array.from({length:zoneCount(o)},(_,i)=>{const distance=Math.abs(targetFor(s,`zone-${i+1}`,o)-s.paddle.x);return {zone:i+1,normal:Math.ceil(distance/4),dash:Math.ceil(distance/12)};})};
 if(o.assist)Object.assign(state,landingPrediction(s,o),{assistLabel:'ASSIST baseline: wall-only landing prediction; future brick collisions can change it.'});
 return state;
}
export function breakoutObjective(o={},mode='realtime',k=20) {
 const baseline=mode==='realtime'?'Play continuously running Breakout. Clear the bricks and avoid missing the ball by keeping the paddle under the predicted ball intercept at paddle height, accounting for wall bounces and observation delay. Choose a target zone and hold until replaced.':'Play Breakout: clear all bricks and avoid missing the ball. Simulation is paused during inference. Each action advances exactly '+k+' frames unless the game ends.';
 if(!o.instructions)return baseline;
 return `Clear the bricks and keep the ball alive. The board is 480 by 360 px: x grows rightward and y grows downward. The paddle top is y=330; its width is 90 px and its maximum normal speed is 4 px/frame${o.dash?', with dash at 12 px/frame (3x)':''}. The ball radius is 6 px, so paddle contact is at ball-center y=324. Launch ball speed is about 3.84 px/frame; paddle bounces change horizontal velocity, so use the current velocity when available. Physics runs at 60 simulation frames/second, scaled by game speed. Side walls reflect horizontal velocity at x=6 and x=474; the top reflects vertical velocity at y=6. Bricks also bounce the ball. ${mode==='realtime'?'Decision latency is about 150–500 ms while the game keeps moving: aim for where the ball will be when your action arrives and allow time for paddle travel.':'Simulation pauses during decision latency (about 150–500 ms); then the action runs for '+k+' frames.'} When the ball is moving up, start moving NOW to where it will come down after bouncing off the top and side walls; don't just follow the ball's current x. Pre-position early and update after brick bounces. ${mode==='paused'&&!o.dash&&!o.precision?'Choose left, right, or stay for the next '+k+' frames.':'Choose a target and hold until replaced; stay stops at the current position.'}${o.dash?' Choose urgency yourself: dash when normal movement cannot arrive in time.':''}`;
}
// Re-evaluated every physics frame; an ideal-information controller, not a model.
export function perfectAction(s,o={}) {
 const {predictedLandingZone:zone}=landingPrediction(s,o);
 return zone===null?'stay':`${o.dash?'dash-to-':''}zone-${zone}`;
}
// Consume every request once, including discarded replies. Age uses monotonic real
// time, not simulation frames (which vary with game speed). A game ID is a revision.
export function acceptDecision({request,result,now,maxAgeMs,active,game,seen}) {
 const ageMs=now-request.capturedAt;
 if(seen.has(request.id))return {status:'duplicate',ageMs};
 seen.add(request.id);
 let status='applied';
 if(!active)status='stopped';
 else if(result.error)status='error';
 else if(result.restap?.id!==request.id)status='wrong ID';
 else if(game.gameId!==request.gameId||finished(game))status='obsolete state';
 else if(ageMs>=maxAgeMs)status='stale';
 else if(result.restap?.action===null)status='refused';
 else if(!request.actions.some(a=>a.id===result.restap?.action))status='invalid action';
 return {status,ageMs};
}
// Fixed 60 Hz simulation driven by rAF, independent of display refresh rate.
// Drop excessive catch-up after suspension rather than teleporting through play.
export function frameClock() {
 let previous=null,accumulator=0;
 return (now,speed,step)=>{
  if(previous===null){previous=now;return;}
  accumulator+=Math.min(100,Math.max(0,now-previous))*speed;previous=now;
  while(accumulator>=1000/60){step();accumulator-=1000/60;}
 };
}
