import {describe,it,expect} from 'vitest';
import {ACTIONS,course,freshTurnRunner,stepTurn,turnState,turnContext,perfectTurnAction} from './turn-runner.js';
import {compareTurnGame} from './turn-compare.js';
describe('Turn-based Lane Runner',()=>{
 it('repeats seeds, includes required obstacles, and every course is solvable',()=>{
  expect(course(1)).toEqual(course(1));expect(course(1)).not.toEqual(course(2));
  for(let seed=0;seed<100;seed++){
   const g=freshTurnRunner(seed);expect(g.rows.some(r=>r.every(c=>c==='TRENCH'))).toBe(true);expect(g.rows.some(r=>r.filter(c=>c==='WALL').length===4)).toBe(true);
   while(g.index<g.rows.length&&!g.over)stepTurn(g,perfectTurnAction(g));expect(g.over,`seed ${seed}`).toBe(false);expect(g.rowsSurvived).toBe(180);expect(g.trenchesJumped).toBeGreaterThanOrEqual(30);
  }
 },15000);
 it('offers all five lanes even when four kill; arbitrary lane changes have no timing',()=>{const g=freshTurnRunner();g.lane=1;g.rows=[['WALL','WALL','WALL','WALL','COIN']];expect(ACTIONS.map(a=>a.id)).toEqual(['lane-1','lane-2','lane-3','lane-4','lane-5']);stepTurn(g,'lane-5');expect(g.coins).toBe(1);expect(g.over).toBe(false);});
 it('ramp jumps exactly the next row, even across four lanes',()=>{const g=freshTurnRunner();g.rows=[['RAMP','EMPTY','EMPTY','EMPTY','EMPTY'],Array(5).fill('TRENCH'),Array(5).fill('TRENCH')];stepTurn(g,'lane-1');expect(g.jump).toBe(true);stepTurn(g,'lane-5');expect(g.trenchesJumped).toBe(1);expect(g.jump).toBe(false);stepTurn(g,'lane-5');expect(g.causeOfDeath).toBe('missed ramp');expect(g.rowsSurvived).toBe(2);});
 it.each([['WALL',true,'wall'],['TRENCH',false,'trench']])('kills on %s with jumping %s',(object,jump,cause)=>{const g=freshTurnRunner();g.rows=[['EMPTY','EMPTY',object,'EMPTY','EMPTY']];g.jump=jump;stepTurn(g,'lane-3');expect(g.causeOfDeath).toBe(cause);expect(g.rowsSurvived).toBe(0);});
 it('does not chain ramps touched while airborne',()=>{const g=freshTurnRunner();g.jump=true;g.rows=[Array(5).fill('RAMP')];stepTurn(g,'lane-2');expect(g.jump).toBe(false);});
 it('reports exactly six explicit rows, current lane, and jump state',()=>{const g=freshTurnRunner(),s=turnState(g);expect(s.rows.map(r=>r.row)).toEqual([1,2,3,4,5,6]);expect(s.rows[0].cells.map(c=>c.lane)).toEqual([1,2,3,4,5]);expect(s.currentLane).toBe(3);expect(s.jumpingNextRow).toBe(false);});
 it('keeps image-only observations free of structured state and A independent',()=>{const g=freshTurnRunner();const c=turnContext(g,{input:'images',instructions:true,images:2},['old','current']);expect(Object.keys(c).sort()).toEqual(['images','text']);expect(c.images).toEqual(['old','current']);expect(c.text).toContain('Go ONTO');expect(turnContext(g,{input:'state',instructions:false}).text).not.toContain('Go ONTO');expect(turnContext(g,{input:'both'},['x']).state).toBeDefined();expect(turnContext(g,{input:'images',images:2},['first']).images).toEqual(['first']);});
 it('rejects invalid actions without mutating state',()=>{const g=freshTurnRunner(),before=structuredClone(g);expect(()=>stepTurn(g,'stay')).toThrow();expect(g).toEqual(before);});
 it('waits for the answer, preserves all choices, and counts fatal turns',async()=>{let calls=0;const r=await compareTurnGame({seed:1,maxTurns:60,paceMs:0,decide:async body=>{calls++;expect(body.actions).toHaveLength(5);expect(body.context.state.rows[0].row).toBe(1);await new Promise(r=>setTimeout(r,5));return {restap:{id:body.id,action:`lane-${body.context.state.rows[0].cells.find(c=>c.object==='WALL').lane}`}};}});expect(calls).toBe(1);expect(r.rowsSurvived).toBe(0);expect(r.causeOfDeath).toBe('wall');});
 it('perfect baseline uses zero API calls and is censored at turn limit',async()=>{const r=await compareTurnGame({seed:5,controller:'perfect',decide:()=>{throw Error('API called');},maxTurns:60});expect(r.calls).toBe(0);expect(r.rowsSurvived).toBe(60);expect(r.censored).toBe(true);expect(r.causeOfDeath).toBe(null);});
 it('stops on refusal or errors without inventing a move',async()=>{const r=await compareTurnGame({seed:1,paceMs:0,decide:async body=>({restap:{id:body.id,action:null}})});expect(r.calls).toBe(1);expect(r.rowsSurvived).toBe(0);expect(r.censored).toBe(true);});
});
