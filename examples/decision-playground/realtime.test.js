import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect,vi} from 'vitest';
import * as physics from './breakout.js';

// Run the actual page controller with a deterministic clock and delayed transport.
// No browser or provider dependency; assertions cover the two concurrent loops.
function harness() {
 const nodes=new Map(),raf=new Map(),pending=[];let now=0,next=0,imageNumber=0;
 class Element {
  constructor(){this.children=[];this.value='';this.style={};this.classList={toggle(){},remove(){}};this.files=[];}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  prepend(item){item.parent=this;this.children.unshift(item);}
  replaceChildren(...items){this.children=[];this.append(...items);}
  get lastChild(){return this.children.at(-1);}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
  removeAttribute(){} setAttribute(name,value){this[name]=value;} scrollIntoView(){}
  getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true});}
  toDataURL(){return 'data:image/png;base64,'+String(++imageNumber);}
 }
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element()};
 const el=document.getElementById;
 for(const [id,value] of Object.entries({breakMode:'realtime',inputMode:'both',gameSpeed:'1',frameCount:'2',breakTurns:'3',maxAge:'750',decisionInterval:'0',frames:'20',seed:'1',gamesBudget:'10',preset:'grid'}))el(id).value=value;
 el('sameSeeds').checked=true;
 const context=vm.createContext({...physics,document,structuredClone,crypto:{getRandomValues:a=>{a[0]=123456;return a;},randomUUID:()=>`request-${++next}`},performance:{now:()=>now},setTimeout,clearTimeout,requestAnimationFrame:cb=>{const id=++next;raf.set(id,cb);return id;},cancelAnimationFrame:id=>raf.delete(id),fetch:(_url,options)=>new Promise(resolve=>pending.push({req:JSON.parse(options.body),resolve}))});
 const script=readFileSync(new URL('./index.html',import.meta.url),'utf8').split('<script type="module">')[1].split('</script>')[0].replace(/^\s*import .*?;\n/,'');
 vm.runInContext(script,context);
 const advance=ms=>{now+=ms;const callbacks=[...raf.values()];raf.clear();for(const cb of callbacks)cb(now);};
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 const reply=async(index,action='zone-8',scores={})=>{const {req,resolve}=pending[index];resolve({json:async()=>({restap:{id:req.id,action,...scores},latency_ms:100,openai_response:{usage:{input_tokens:100}}})});await flush();};
 const fail=async(index,error='decision_backend_unavailable')=>{pending[index].resolve({json:async()=>({restap:{error},error,latency_ms:0,openai_response:null})});await flush();};
 return {el,pending,advance,reply,fail,flush,eval:code=>vm.runInContext(code,context)};
}
describe('real-time page controller',()=>{
 it('keeps physics running during one outstanding call, then sends a fresh snapshot and reaches budget',async()=>{
  const h=harness();h.el('breakTurns').value='2';const done=h.el('breakPlay').onclick();
  expect(h.pending).toHaveLength(1);h.advance(0);for(let i=0;i<10;i++)h.advance(17);
  expect(h.el('gameStats').textContent).toContain('Frame 10');expect(h.pending).toHaveLength(1);
  expect(h.pending[0].req.context.images).toHaveLength(2);expect(h.pending[0].req.context.text).toContain('Image 2: frame 0 (current)');expect(h.pending[0].req.context.state.ball.vy).toBeLessThan(0);expect(h.pending[0].req.context.state.frame).toBe(0);await h.reply(0);
  expect(h.pending).toHaveLength(2);expect(h.pending[1].req.context.images[0]).toBe(h.pending[0].req.context.images[1]);expect(h.pending[1].req.context.images[1]).not.toBe(h.pending[1].req.context.images[0]);expect(h.pending[1].req.context.state.frame).toBe(10);expect(h.pending[1].req.context.text).toContain('Image 1: frame 0 (10 frames before Image 2); Image 2: frame 10 (current)');
  expect(h.el('realtimeStats').textContent).toContain('Target zone-8');
  for(let i=0;i<10;i++)h.advance(17);await h.reply(1);await done;
  expect(h.pending).toHaveLength(2);expect(h.el('breakPlay').disabled).toBe(false);expect(h.el('breakPause').disabled).toBe(true);
 });
 it('sends only the current snapshot in one-frame mode and reports it',async()=>{const h=harness();h.el('frameCount').value='1';h.el('breakTurns').value='1';const done=h.el('breakPlay').onclick();expect(h.pending[0].req.context.images).toHaveLength(1);expect(h.pending[0].req.context.text).toContain('Image 1: frame 0 (current)');await h.reply(0);await done;expect(h.el('realtimeStats').textContent).toContain('Last decision 1 frame(s)');expect(h.el('breakLog').lastChild.textContent).toContain('1 frame(s)');});
 it('discards old replies, counts their cost, and captures new state',async()=>{
  const h=harness();const done=h.el('breakPlay').onclick();h.advance(800);await h.reply(0);
  expect(h.el('realtimeStats').textContent).toContain('Target stay');expect(h.el('realtimeStats').textContent).toContain('Stale 1 / discarded 1');
  expect(h.el('realtimeStats').textContent).toContain('$0.00001000');expect(h.pending).toHaveLength(2);
  h.el('breakPause').onclick();await h.reply(1);await done;
 });
 it('Stop freezes immediately and pending answers cannot move or restart it',async()=>{
  const h=harness();const done=h.el('breakPlay').onclick();h.advance(0);h.advance(100);h.el('breakPause').onclick();
  const stopped=h.el('gameStats').textContent;h.advance(100);expect(h.el('gameStats').textContent).toBe(stopped);
  expect(h.el('breakPlay').disabled).toBe(true);await h.reply(0);await done;
  expect(h.pending).toHaveLength(1);expect(h.el('realtimeStats').textContent).toContain('Target stay');expect(h.el('breakLog').lastChild.textContent).toContain('stopped');
 });
 it('honors request intervals while rendering, and Stop cancels the wait',async()=>{
  vi.useFakeTimers();try{
   const h=harness();h.el('decisionInterval').value='500';const done=h.el('breakPlay').onclick();h.advance(0);h.advance(100);await h.reply(0);
   await vi.advanceTimersByTimeAsync(399);expect(h.pending).toHaveLength(1);h.advance(100);expect(h.el('gameStats').textContent).not.toContain('Frame 0');
   await vi.advanceTimersByTimeAsync(1);expect(h.pending).toHaveLength(2);await h.reply(1);
   h.el('breakPause').onclick();await done;await vi.advanceTimersByTimeAsync(1000);expect(h.pending).toHaveLength(2);
  }finally{vi.useRealTimers();}
 });
 it('refusal retains the last target while the next fresh decision starts',async()=>{
  const h=harness();const done=h.el('breakPlay').onclick();await h.reply(0,'zone-8');await h.reply(1,null);
  expect(h.el('realtimeStats').textContent).toContain('Target zone-8');expect(h.el('breakLog').lastChild.textContent).toContain('refused');expect(h.pending).toHaveLength(3);
  await h.reply(2);await done;
 });
 it('paused Step freezes during inference then advances exactly K frames at selected speed',async()=>{
  const h=harness();h.el('breakMode').value='paused';h.el('gameSpeed').value='0.5';h.el('breakMode').onchange();
  const done=h.el('breakStep').onclick();h.advance(100);expect(h.el('gameStats').textContent).toContain('Frame 0');
  expect(h.pending[0].req.actions.map(a=>a.id)).toEqual(['left','right','stay']);await h.reply(0,'right');
  for(let i=0;i<45;i++){h.advance(17);await h.flush();}await done;
  expect(h.el('gameStats').textContent).toContain('Frame 20');expect(h.pending).toHaveLength(1);
 });
});

describe('input mode isolation and session comparison',()=>{
 it('sends complete state and objective only, retains results across Reset',async()=>{
  const h=harness();h.el('inputMode').value='state';h.el('inputMode').onchange();h.el('breakTurns').value='1';
  expect(h.el('frameCount').disabled).toBe(true);
  const done=h.el('breakPlay').onclick(),c=h.pending[0].req.context;
  expect(Object.keys(c).sort()).toEqual(['state','text']);expect(c.state).toMatchObject({width:480,height:360,ball:{x:240,y:323},paddle:{x:195,width:90},score:0,gameOver:false,frame:0});expect(c.state.bricks).toHaveLength(24);expect(c.text).not.toMatch(/Image|frame 0/);
  h.advance(100);await h.reply(0);await done;
  const row=()=>h.el('modeResults').children[0].children.map(c=>c.textContent);
  expect(row()).toEqual(['realtime · State only · 0 images · 1x · seed 1','0','—','—','—','100 ms','$0.00001000','0.0%','0']);
  h.el('breakReset').onclick();expect(row()[1]).toBe('0');
  h.el('inputMode').value='images';const second=h.el('breakPlay').onclick();await h.reply(1);await second;
  expect(h.el('modeResults').children).toHaveLength(2);expect(row()[1]).toBe('0');
 });
 it.each([1,2,3,4])('images-only %i has no hidden state/events and oldest-first snapshots',async count=>{
  const h=harness();h.el('inputMode').value='images';h.el('frameCount').value=String(count);h.el('breakTurns').value='4';const done=h.el('breakPlay').onclick();
  h.advance(0);
  for(let i=0;i<4;i++){
   const c=h.pending[i].req.context;expect(Object.keys(c).sort()).toEqual(['images','text']);expect(c.images).toHaveLength(count);expect(c.text).not.toMatch(/vx|vy|targetX|ball.x|Coordinates|speed/);
   const frames=[...c.text.matchAll(/Image \d: frame (\d+)/g)].map(m=>Number(m[1]));expect(frames).toEqual([...frames].sort((a,b)=>a-b));
   if(i===3&&count===4)expect(new Set(c.images).size).toBe(4);
   h.advance(100);await h.reply(i);
  }await done;
 });
});


describe('score display',()=>{
 it('shows unmodified scores in history and snapshot strip without selecting the highest probability',async()=>{
  const h=harness();h.el('breakTurns').value='1';const done=h.el('breakPlay').onclick();
  await h.reply(0,'zone-8',{confidence:0,probabilities:{'zone-8':0.1,stay:0.9}});await done;
  const snapshot=h.el('snapshotStrip').children[0].children[2];
  const history=h.el('history').children[0].children[1];
  for(const box of [snapshot,history,h.el('scores').children[0]]){
   expect(box.children[0].textContent).toBe('Confidence: 0');
   expect(box.children[1].children[0].textContent).toBe('zone-8');
   expect(box.children[1].children[1].value).toBe(0.1);
   expect(box.children[2].children[1].value).toBe(0.9);
  }
  expect(h.el('realtimeStats').textContent).toContain('Target zone-8');
  h.el('history').children[0].children[0].onclick();
  expect(h.el('scores').children[0].children[0].textContent).toBe('Confidence: 0');
 });
 it('labels absent scores and never renders scores for refusal',async()=>{
  const h=harness();h.el('breakTurns').value='2';const done=h.el('breakPlay').onclick();
  await h.reply(0);await h.reply(1,null,{confidence:1,probabilities:{stay:1}});await done;
  expect(h.el('history').children[1].children[1].children[0].textContent).toBe('Confidence not provided');
  expect(h.el('snapshotStrip').children[0].children[2].textContent).toBe('Scores not provided');
 });
});


describe('backend error throttling',()=>{
 it('backs off immediate failures, separates errors from decisions, and pauses after three errors',async()=>{
  vi.useFakeTimers();try{
   const h=harness();h.el('breakTurns').value='50';const done=h.el('breakPlay').onclick();
   await h.fail(0);
   expect(h.el('realtimeStats').textContent).toContain('0.00 decisions/s · Errors 1');
   await vi.advanceTimersByTimeAsync(499);expect(h.pending).toHaveLength(1);
   await vi.advanceTimersByTimeAsync(1);expect(h.pending).toHaveLength(2);
   await h.fail(1,'decision_timeout');
   await vi.advanceTimersByTimeAsync(999);expect(h.pending).toHaveLength(2);
   await vi.advanceTimersByTimeAsync(1);expect(h.pending).toHaveLength(3);
   await h.fail(2);await done;
   expect(h.el('status').textContent).toContain('Backend unavailable: check the API key');
   expect(h.el('breakPause').disabled).toBe(true);expect(h.el('breakPlay').disabled).toBe(false);
   expect(h.el('realtimeStats').textContent).toContain('0.00 decisions/s · Errors 3 · Average latency 0 ms');
   const row=()=>h.el('modeResults').children[0].children.map(c=>c.textContent);
   expect(row().slice(1)).toEqual(['0','—','—','—','0 ms','unknown (0)','0%','3']);
   await vi.advanceTimersByTimeAsync(10000);expect(h.pending).toHaveLength(3);
   const stopped=h.el('gameStats').textContent;h.advance(100);expect(h.el('gameStats').textContent).toBe(stopped);
   h.el('breakReset').onclick();expect(h.el('realtimeStats').textContent).toContain('Errors 0');expect(row()[8]).toBe('3');
  }finally{vi.useRealTimers();}
 });
 it('resets consecutive errors and backoff on success; Stop cancels an error wait',async()=>{
  vi.useFakeTimers();try{
   const h=harness();h.el('breakTurns').value='50';const done=h.el('breakPlay').onclick();
   await h.fail(0);await vi.advanceTimersByTimeAsync(500);
   h.advance(100);await h.reply(1);expect(h.pending).toHaveLength(3);
   await h.fail(2);await vi.advanceTimersByTimeAsync(499);expect(h.pending).toHaveLength(3);
   await vi.advanceTimersByTimeAsync(1);expect(h.pending).toHaveLength(4);
   await h.fail(3);expect(h.el('status').textContent).toContain('Retrying in 1000 ms (2/3)');
   const row=h.el('modeResults').children[0].children.map(c=>c.textContent);
   expect(row.slice(5)).toEqual(['100 ms','$0.00001000','0.0%','3']);
   h.el('breakPause').onclick();await done;
   await vi.advanceTimersByTimeAsync(10000);expect(h.pending).toHaveLength(4);
   expect(h.el('status').textContent).toBe('Stopped; pending replies will be discarded.');
  }finally{vi.useRealTimers();}
 });
});

describe('seeded game lifecycle',()=>{
 const miss=h=>{h.eval('Object.assign(game.ball,{x:10,y:368,vx:0,vy:3})');h.advance(0);h.advance(17);};
 it('ends at first miss, logs once, discards pending reply and never requests again',async()=>{
  const h=harness();const done=h.el('breakPlay').onclick();miss(h);
  expect(h.el('gameStats').textContent).toContain('Game over: missed the ball');
  expect(h.el('breakLog').children.filter(x=>x.textContent.includes('ENDED'))).toHaveLength(1);
  await h.reply(0);await done;h.advance(1000);
  expect(h.pending).toHaveLength(1);expect(h.eval('gameDecisions')).toBe(0);
  expect(h.el('modeResults').children[0].children[1].textContent).toBe('1');
 });
 it('restarts only after settling the old request, clears targets/history and spends games budget',async()=>{
  const h=harness();h.el('autoRestart').checked=true;h.el('gamesBudget').value='2';h.el('breakTurns').value='100';
  const done=h.el('breakPlay').onclick();const launch=h.pending[0].req.context.state.ball;miss(h);
  expect(h.pending).toHaveLength(1);await h.reply(0);
  expect(h.pending).toHaveLength(2);const second=h.pending[1].req.context;
  expect(second.state.gameId).toBe(2);expect(second.state.paddle.x).toBe(195);expect(second.state.ball).not.toEqual(launch);
  expect(second.images[0]).toBe(second.images[1]);expect(h.eval('targetZone')).toBe('stay');
  miss(h);await h.reply(1);await done;
  expect(h.pending).toHaveLength(2);expect(h.el('modeResults').children[0].children[1].textContent).toBe('2');
 });
 it('Stop at game end prevents automatic restart and total calls cap stops the series',async()=>{
  const h=harness();h.el('autoRestart').checked=true;const done=h.el('breakPlay').onclick();miss(h);h.el('breakPause').onclick();await h.reply(0);await done;expect(h.pending).toHaveLength(1);
  h.el('breakReset').onclick();h.el('breakTurns').value='1';const capped=h.el('breakPlay').onclick();miss(h);await h.reply(1);await capped;expect(h.pending).toHaveLength(2);
 });
 it('replays identical seeds across modes, changes seed explicitly, and excludes unfinished games',async()=>{
  const h=harness(),initial=h.eval('structuredClone(game.ball)');
  h.el('inputMode').value='state';h.el('inputMode').onchange();expect(h.eval('game.ball')).toEqual(initial);
  h.el('breakMode').value='paused';h.el('breakMode').onchange();expect(h.eval('game.ball')).toEqual(initial);
  h.el('newSeed').onclick();expect(h.el('seed').value).toBe('123456');expect(h.eval('game.ball')).not.toEqual(initial);
  const done=h.el('breakStep').onclick();expect(h.pending[0].req.context.images).toBeUndefined();h.el('breakPause').onclick();await h.reply(0,'stay');await done;
  expect(h.el('modeResults').children[0].children[1].textContent).toBe('0');
 });
 it('paused miss ends K early, records per-game metrics and automatically starts the next game',async()=>{
  const h=harness();h.el('breakMode').value='paused';h.el('breakMode').onchange();h.el('autoRestart').checked=true;h.el('gamesBudget').value='2';
  const done=h.el('breakPlay').onclick();h.eval('Object.assign(game.ball,{x:10,y:368,vx:0,vy:3})');await h.reply(0,'stay');
  for(let i=0;i<5;i++){h.advance(17);await h.flush();}
  expect(h.pending).toHaveLength(2);expect(h.eval('gameNumber')).toBe(2);
  h.eval('Object.assign(game.ball,{x:10,y:368,vx:0,vy:3})');await h.reply(1,'stay');
  for(let i=0;i<5;i++){h.advance(17);await h.flush();}await done;
  const row=h.el('modeResults').children[0].children.map(x=>x.textContent);
  expect(row.slice(1,5)).toEqual(['2','0.00','0.00','0.02 s']);expect(h.pending).toHaveLength(2);
 });
});

it('averages only completed games and preserves nonzero game-end metrics across Reset',async()=>{
 const h=harness();h.el('autoRestart').checked=true;h.el('gamesBudget').value='2';h.el('breakTurns').value='10';
 const done=h.el('breakPlay').onclick();await h.reply(0);await h.reply(1);
 h.eval('game.frame=119;game.bricksLeft=21;Object.assign(game.ball,{x:10,y:368,vx:0,vy:3})');h.advance(0);h.advance(17);await h.reply(2);
 h.eval('game.frame=59;game.bricksLeft=23;Object.assign(game.ball,{x:10,y:368,vx:0,vy:3})');h.advance(0);h.advance(17);await h.reply(3);await done;
 const row=()=>h.el('modeResults').children[0].children.map(x=>x.textContent);
 expect(row().slice(1,5)).toEqual(['2','1.00','2.00','1.50 s']);
 const ends=h.el('breakLog').children.filter(x=>x.textContent.includes('ENDED')).map(x=>x.textContent);
 expect(ends).toHaveLength(2);expect(ends[0]).toContain('decisions survived 2 · bricks 3 · time alive 2.00 s');
 h.el('breakReset').onclick();expect(row().slice(1,5)).toEqual(['2','1.00','2.00','1.50 s']);expect(h.el('breakLog').children.filter(x=>x.textContent.includes('ENDED'))).toHaveLength(2);
});
it('ending during the request interval wakes the loop without making another request',async()=>{
 vi.useFakeTimers();try{
  const h=harness();h.el('decisionInterval').value='1000';const done=h.el('breakPlay').onclick();await h.reply(0);
  h.eval('Object.assign(game.ball,{x:10,y:368,vx:0,vy:3})');h.advance(0);h.advance(17);await h.flush();await done;
  await vi.advanceTimersByTimeAsync(2000);expect(h.pending).toHaveLength(1);expect(h.el('gameStats').textContent).toContain('Game over: missed the ball');
 }finally{vi.useRealTimers();}
});

it('synchronizes an edited seed at Play even before a change event is dispatched',async()=>{
 const h=harness();h.el('seed').value='42';h.el('breakTurns').value='1';const done=h.el('breakPlay').onclick();
 expect(h.pending[0].req.context.state.ball).toEqual(physics.freshBreakout(physics.seededRandom(42)).ball);
 expect(h.el('breakLog').lastChild.textContent).toContain('STARTED · seed 42');await h.reply(0);await done;
});
