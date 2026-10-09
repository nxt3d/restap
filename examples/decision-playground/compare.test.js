import {it,expect,vi} from 'vitest';
import {compareGame,configurations,summarize} from './compare.js';

it('never invokes a provider for Perfect and labels a finite observation horizon',async()=>{
 const decide=vi.fn(()=>{throw Error('Unexpected API call');});
 const game=await compareGame({seed:1,configuration:configurations[4],decide,maxFrames:120});
 expect(decide).not.toHaveBeenCalled();expect(game.calls).toBe(0);expect(game.censored).toBe(true);expect(game.timeAlive).toBe(2);
 expect(summarize([game]).find(row=>row.configuration===game.configuration).averageDecisionsSurvived).toBeNull();
});
it('bounds live attempts per episode and explicitly marks held-action tails',async()=>{
 const decide=vi.fn(async req=>({restap:{id:req.id,action:'stay'}}));
 const game=await compareGame({seed:1,configuration:configurations[0],decide,maxCalls:1,maxFrames:180,intervalMs:0});
 expect(decide).toHaveBeenCalledTimes(1);expect(game.calls).toBe(1);expect(game.budgetLimited).toBe(true);expect(game.frameAtBudget).not.toBeNull();expect(game.trace).toHaveLength(1);
 expect(decide.mock.calls[0][0].context).not.toHaveProperty('images');
});

it('delays captured Perfect targets and never calls the model at replay cadence',async()=>{
 const decide=vi.fn(()=>{throw Error('Unexpected API call');});
 const game=await compareGame({seed:1,configuration:configurations.find(c=>c.cadence),decide,latencySamples:[170,220],maxFrames:60});
 expect(decide).not.toHaveBeenCalled();expect(game.calls).toBe(0);
 expect(game.trace[0]).toMatchObject({frame:0,returnFrame:10,latencyMs:170,status:'applied'});
 expect(game.trace[1]).toMatchObject({frame:10,returnFrame:23,latencyMs:220,status:'applied'});
 expect(game.latencies.slice(0,4)).toEqual([170,220,170,220]);
});
it('censors budget exhaustion without a held-action tail and sends E assist',async()=>{
 const decide=vi.fn(async req=>({restap:{id:req.id,action:'stay'}}));
 const game=await compareGame({seed:1,configuration:configurations.find(c=>c.name==='E with model'),decide,maxCalls:1,stopAtBudget:true});
 expect(game.budgetLimited).toBe(true);expect(game.censored).toBe(true);
 expect(game.timeAlive).toBe(game.frameAtBudget/60);
 expect(decide.mock.calls[0][0].context.state.predictedLandingX).toEqual(expect.any(Number));
});

it('discards delayed Perfect replies at the same stale threshold',async()=>{
 const game=await compareGame({seed:1,configuration:configurations.find(c=>c.cadence),latencySamples:[800],maxFrames:60});
 expect(game.trace[0]).toMatchObject({frame:0,returnFrame:48,status:'stale'});
 expect(game.decisionsSurvived).toBe(0);
});
