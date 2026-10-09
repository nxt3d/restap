import {it,expect,vi} from 'vitest';
import {compareGame,configurations,summarize} from './compare.js';

it('never invokes a provider for Perfect and labels a finite observation horizon',async()=>{
 const decide=vi.fn(()=>{throw Error('Unexpected API call');});
 const game=await compareGame({seed:1,configuration:configurations[4],decide,maxFrames:120});
 expect(decide).not.toHaveBeenCalled();expect(game.calls).toBe(0);expect(game.censored).toBe(true);expect(game.timeAlive).toBe(2);
 expect(summarize([game]).at(-1).averageDecisionsSurvived).toBeNull();
});
it('bounds live attempts per episode and explicitly marks held-action tails',async()=>{
 const decide=vi.fn(async req=>({restap:{id:req.id,action:'stay'}}));
 const game=await compareGame({seed:1,configuration:configurations[0],decide,maxCalls:1,maxFrames:180,intervalMs:0});
 expect(decide).toHaveBeenCalledTimes(1);expect(game.calls).toBe(1);expect(game.budgetLimited).toBe(true);expect(game.frameAtBudget).not.toBeNull();expect(game.trace).toHaveLength(1);
 expect(decide.mock.calls[0][0].context).not.toHaveProperty('images');
});
