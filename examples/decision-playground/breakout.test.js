import {describe,it,expect} from 'vitest';
import {seededRandom,freshBreakout,actionsFor,advanceFrame,finished,inputCost} from './breakout.js';
describe('Breakout simulation',()=>{
 it('offers exact movement and frame counts and clamps at walls',()=>{const s=freshBreakout();const a=actionsFor(s,20);expect(a.map(x=>x.id)).toEqual(['left','right','stay']);expect(a[0].description).toContain('80 px');expect(a.every(x=>x.description.includes('20 frames'))).toBe(true);s.paddle.x=1;for(let i=0;i<20;i++)advanceFrame(s,'left',[]);expect(s.frame).toBe(20);expect(s.paddle.x).toBe(0);});
 it('records paddle bounce, brick score, game over and terminal state',()=>{const s=freshBreakout(),events=[];Object.assign(s.ball,{x:240,y:322,vx:0,vy:3});advanceFrame(s,'stay',events);expect(s.ball.vy).toBeLessThan(0);expect(events).toContain('Ball bounced off paddle.');Object.assign(s.ball,{x:30,y:34,vx:0,vy:3});advanceFrame(s,'stay',events);expect(s.score).toBe(10);expect(s.bricksLeft).toBe(23);expect(events).toContain('Brick hit +10.');Object.assign(s.ball,{x:10,y:368,vy:3});advanceFrame(s,'stay',events);expect(events).toContain('Game over: missed the ball.');expect(finished(s)).toBe(true);const frame=s.frame;advanceFrame(s,'stay',events);expect(s.frame).toBe(frame);});
 it('holds the paddle still and preserves snapshots while advancing K frames',()=>{const s=freshBreakout(),snapshot=structuredClone(s);for(let i=0;i<12;i++)advanceFrame(s,'stay',[]);expect(s.paddle).toEqual(snapshot.paddle);expect(s.frame).toBe(12);expect(snapshot.frame).toBe(0);});
 it('distinguishes missing usage from zero and computes supplied input rate',()=>{expect(inputCost({usage:{input_tokens:1000}})).toBeCloseTo(0.0001);expect(inputCost({usage:{input_tokens:0}})).toBe(0);for(const v of [undefined,-1,'100',NaN])expect(inputCost({usage:{input_tokens:v}})).toBeNull();});
});

import {targetActions,targetFor,acceptDecision,frameClock} from './breakout.js';
describe('real-time snapshot reliability',()=>{
 const setup=()=>{const game=freshBreakout();return {game,request:{id:'one',capturedAt:100,gameId:game.gameId,actions:targetActions(game)},result:{restap:{id:'one',action:'zone-8'}},now:200,maxAgeMs:750,active:true,seen:new Set()};};
 it('offers eight complete targets plus stay and moves smoothly without overshoot',()=>{
  const s=freshBreakout();expect(targetActions(s)).toHaveLength(9);expect(targetFor(s,'zone-1')).toBe(0);expect(targetFor(s,'zone-8')).toBe(390);
  const target=targetFor(s,'zone-6');for(let i=0;i<50;i++){const old=s.paddle.x;advanceFrame(s,target,[]);expect(Math.abs(s.paddle.x-old)).toBeLessThanOrEqual(4);}
  expect(s.paddle.x).toBe(target);expect(targetFor(s,'stay')).toBe(target);expect(()=>targetFor(s,'zone-9')).toThrow();
 });
 it('accepts a fresh reply against advancing frames only once',()=>{const x=setup();x.game.frame=30;expect(acceptDecision(x)).toEqual({status:'applied',ageMs:100});expect(acceptDecision(x).status).toBe('duplicate');});
 it.each(['stale','stopped','wrong ID','obsolete state','invalid action','refused','error'])('rejects %s replies without substitution',status=>{
  const x=setup();if(status==='stale')x.now=850;if(status==='stopped')x.active=false;if(status==='wrong ID')x.result.restap.id='unknown';if(status==='obsolete state')x.game.gameId++;if(status==='invalid action')x.result.restap.action='left';if(status==='refused')x.result.restap.action=null;if(status==='error')x.result.error='timeout';
  expect(acceptDecision(x).status).toBe(status);expect(acceptDecision(x).status).toBe('duplicate');
 });
 it('uses elapsed time rather than display refresh count and respects speed',()=>{
  for(const hz of [60,120,144])for(const speed of [.5,1]){const tick=frameClock();let frames=0;for(let i=0;i<=hz;i++)tick(i*1000/hz,speed,()=>frames++);expect(Math.abs(frames-60*speed)).toBeLessThanOrEqual(1);}
 });
 it('bounds catch-up after background suspension',()=>{const tick=frameClock();let frames=0;tick(0,1,()=>frames++);tick(10000,1,()=>frames++);expect(frames).toBeLessThanOrEqual(6);});
});

 it('counts each paddle-height crossing once, including misses before game over',()=>{
 const s=freshBreakout(),stats={contacts:0,misses:0};s.ball={x:240,y:322,vx:0,vy:3,radius:6};advanceFrame(s,'stay',[],stats);expect(stats).toEqual({contacts:1,misses:0});
 s.ball={x:10,y:322,vx:0,vy:3,radius:6};advanceFrame(s,'stay',[],stats);advanceFrame(s,'stay',[],stats);expect(stats).toEqual({contacts:1,misses:1});expect(s.gameOver).toBe(false);
 });

it('replays seed sequences, varies launches and preserves normal speed and upward range',()=>{
 const a=seededRandom(42),b=seededRandom(42),c=seededRandom(43),launches=[];
 for(let i=0;i<100;i++){
  const s=freshBreakout(a,i);expect(s).toEqual(freshBreakout(b,i));expect(s.ball).not.toEqual(freshBreakout(c,i).ball);
  expect(s.paddle.x+s.paddle.width/2).toBe(s.ball.x);expect(s.ball.y+s.ball.radius).toBeLessThan(s.paddle.y);
  const angle=Math.atan2(-s.ball.vy,s.ball.vx)*180/Math.PI;expect(angle).toBeGreaterThanOrEqual(30);expect(angle).toBeLessThanOrEqual(150);expect(Math.hypot(s.ball.vx,s.ball.vy)).toBeCloseTo(Math.hypot(2.4,3));launches.push(s.ball.vx);
 }
 expect(new Set(launches).size).toBe(100);
});

import {observationState,framesToPaddle,landingPrediction,actionSpeed,perfectAction,breakoutObjective} from './breakout.js';
describe('tuning physics and observations',()=>{
 it('counts the top-wall round trip and reflects across multiple side walls',()=>{
  const s=freshBreakout();Object.assign(s.ball,{x:470,y:100,vx:20,vy:-2});
  expect(framesToPaddle(s)).toBe(206);
  // Unfolded x=4590; mirror into [6,474] gives x=102.
  expect(landingPrediction(s).predictedLandingX).toBe(102);
  s.ball.vy=2;expect(framesToPaddle(s)).toBe(112);
  s.ball.vy=0;expect(framesToPaddle(s)).toBeNull();expect(perfectAction(s)).toBe('stay');
 });
 it('provides travel facts without the assisted answer and does not mutate snapshots',()=>{
  const s=freshBreakout(),copy=structuredClone(s),state=observationState(s,{facts:true});
  expect(state).not.toHaveProperty('predictedLandingX');expect(state.derivedFacts.ballDirection.vertical).toBe('up');
  expect(state.derivedFacts.zoneTravelFrames[0]).toEqual({zone:1,normal:49,dash:17});
  expect(s).toEqual(copy);expect(observationState(s)).toEqual(s);
  const assist=observationState(s,{assist:true});expect(assist).toHaveProperty('predictedLandingX');expect(assist).not.toHaveProperty('derivedFacts');
 });
 it.each([8,12,16])('offers %i normal and dash targets, clamps, and holds without overshoot',zones=>{
  const s=freshBreakout(),o={precision:true,zones,dash:true};expect(targetActions(s,o)).toHaveLength(2*zones+1);
  const id=`dash-to-zone-${zones}`,target=targetFor(s,id,o);expect(actionSpeed(id)).toBe(12);
  for(let i=0;i<40;i++){const before=s.paddle.x;advanceFrame(s,target,[],undefined,actionSpeed(id));expect(Math.abs(s.paddle.x-before)).toBeLessThanOrEqual(12);}
  expect(s.paddle.x).toBe(target);expect(targetFor(s,'stay',o)).toBe(target);
  expect(()=>targetFor(s,id,{precision:true,zones})).toThrow();
 });
 it('defines physical strategy without injecting a current predicted answer into text',()=>{
  const text=breakoutObjective({instructions:true,dash:true});for(const term of ['150–500','y grows downward','y=330','3.84','12 px/frame','start moving NOW'])expect(text).toContain(term);
  expect(text).not.toContain('predictedLandingX');
 });
});
