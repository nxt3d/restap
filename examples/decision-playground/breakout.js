export const freshBreakout = () => ({width:480,height:360,ball:{x:240,y:270,vx:2.4,vy:-3,radius:6},paddle:{x:195,y:330,width:90,height:10},bricks:Array.from({length:24},(_,i)=>({x:15+(i%8)*57,y:42+Math.floor(i/8)*25,width:51,height:17})),bricksLeft:24,score:0,lives:3,frame:0});
export const finished = s => s.lives===0 || s.bricksLeft===0;
export function actionsFor(s,k){
 const n=4*k;
 return [{id:'left',description:`Move the paddle left ${n} px over the next ${k} frames (4 px/frame, clamped at the left wall).`},{id:'right',description:`Move the paddle right ${n} px over the next ${k} frames (4 px/frame, clamped at the right wall).`},{id:'stay',description:`Hold the paddle in place (0 px movement) for the next ${k} frames.`}];
}
export function advanceFrame(s,action,events){
 if(finished(s))return;
 if(typeof action!=='number'&&!['left','right','stay'].includes(action))throw Error('Invalid Breakout action');
 const p=s.paddle,b=s.ball,r=b.radius,oldY=b.y;
 p.x=Math.max(0,Math.min(s.width-p.width,p.x+(typeof action==='number'?Math.max(-4,Math.min(4,action-p.x)):action==='left'?-4:action==='right'?4:0)));
 b.x+=b.vx;b.y+=b.vy;s.frame++;
 if(b.x<r||b.x>s.width-r){b.x=Math.max(r,Math.min(s.width-r,b.x));b.vx=-b.vx;events.push('Ball bounced off side wall.');}
 if(b.y<r){b.y=r;b.vy=Math.abs(b.vy);events.push('Ball bounced off ceiling.');}
 if(b.vy>0&&oldY+r<=p.y&&b.y+r>=p.y&&b.x+r>=p.x&&b.x-r<=p.x+p.width){
  b.y=p.y-r;b.vy=-Math.abs(b.vy);b.vx=3.5*((b.x-(p.x+p.width/2))/(p.width/2));events.push('Ball bounced off paddle.');
 }
 const hit=s.bricks.findIndex(t=>b.x+r>=t.x&&b.x-r<=t.x+t.width&&b.y+r>=t.y&&b.y-r<=t.y+t.height);
 if(hit>=0){const t=s.bricks[hit];if(oldY+r<=t.y||oldY-r>=t.y+t.height)b.vy=-b.vy;else b.vx=-b.vx;s.bricks.splice(hit,1);s.bricksLeft=s.bricks.length;s.score+=10;events.push('Brick hit +10.');if(!s.bricksLeft)events.push('All bricks cleared. You won!');}
 if(b.y-r>s.height){s.lives--;events.push('Missed the ball, lost a life.');if(s.lives){Object.assign(b,{x:p.x+p.width/2,y:270,vx:2.4,vy:-3});}else events.push('Game over.');}
}
export function inputCost(response){const n=response?.usage?.input_tokens;return Number.isFinite(n)&&n>=0?n*0.10/1e6:null;}

// Zones describe paddle CENTER positions; physics takes a clamped left edge.
export function targetActions(s) {
 return [...Array.from({length:8},(_,i)=>({id:`zone-${i+1}`,description:`Move the paddle center to zone ${i+1} of 8 (x=${i*s.width/8}–${(i+1)*s.width/8} px), targeting x=${(i+.5)*s.width/8} px, clamped at walls. Move at up to 4 px per simulation frame and hold there until a new decision.`})),{id:'stay',description:'Stop moving the paddle at its current position when this answer arrives and hold there until a new decision.'}];
}
export function targetFor(s,action) {
 if(action==='stay')return s.paddle.x;
 if(!/^zone-[1-8]$/.test(action))throw Error('Invalid target action');
 return Math.max(0,Math.min(s.width-s.paddle.width,(Number(action.slice(5))-.5)*s.width/8-s.paddle.width/2));
}
// Consume every request once, including discarded replies. Age uses monotonic real
// time, not simulation frames (which vary with game speed). A life is a revision.
export function acceptDecision({request,result,now,maxAgeMs,active,game,seen}) {
 const ageMs=now-request.capturedAt;
 if(seen.has(request.id))return {status:'duplicate',ageMs};
 seen.add(request.id);
 let status='applied';
 if(!active)status='stopped';
 else if(result.error)status='error';
 else if(result.restap?.id!==request.id)status='wrong ID';
 else if(game.lives!==request.lives||finished(game))status='obsolete state';
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
