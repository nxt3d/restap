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
  removeAttribute(){} scrollIntoView(){}
  getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true});}
  toDataURL(){return 'data:image/png;base64,'+String(++imageNumber);}
 }
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element()};
 const el=document.getElementById;
 for(const [id,value] of Object.entries({breakMode:'realtime',gameSpeed:'1',frameCount:'2',breakTurns:'3',maxAge:'750',decisionInterval:'0',frames:'20',preset:'grid'}))el(id).value=value;
 const context=vm.createContext({...physics,document,structuredClone,crypto:{randomUUID:()=>`request-${++next}`},performance:{now:()=>now},setTimeout,clearTimeout,requestAnimationFrame:cb=>{const id=++next;raf.set(id,cb);return id;},cancelAnimationFrame:id=>raf.delete(id),fetch:(_url,options)=>new Promise(resolve=>pending.push({req:JSON.parse(options.body),resolve}))});
 const script=readFileSync(new URL('./index.html',import.meta.url),'utf8').split('<script type="module">')[1].split('</script>')[0].replace(/^\s*import .*?;\n/,'');
 vm.runInContext(script,context);
 const advance=ms=>{now+=ms;const callbacks=[...raf.values()];raf.clear();for(const cb of callbacks)cb(now);};
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 const reply=async(index,action='zone-8')=>{const {req,resolve}=pending[index];resolve({json:async()=>({restap:{id:req.id,action},latency_ms:100,openai_response:{usage:{input_tokens:100}}})});await flush();};
 return {el,pending,advance,reply,flush};
}
describe('real-time page controller',()=>{
 it('keeps physics running during one outstanding call, then sends a fresh snapshot and reaches budget',async()=>{
  const h=harness();h.el('breakTurns').value='2';const done=h.el('breakPlay').onclick();
  expect(h.pending).toHaveLength(1);h.advance(0);for(let i=0;i<10;i++)h.advance(17);
  expect(h.el('gameStats').textContent).toContain('Frame 10');expect(h.pending).toHaveLength(1);
  expect(h.pending[0].req.context.images).toHaveLength(2);expect(h.pending[0].req.context.text).toContain('Image 2: frame 0 (current)');expect(h.pending[0].req.context.state.ball.vy).toBe(-3);expect(h.pending[0].req.context.state.frame).toBe(0);await h.reply(0);
  expect(h.pending).toHaveLength(2);expect(h.pending[1].req.context.images[0]).toBe(h.pending[0].req.context.images[1]);expect(h.pending[1].req.context.images[1]).not.toBe(h.pending[1].req.context.images[0]);expect(h.pending[1].req.context.state.frame).toBe(10);expect(h.pending[1].req.context.text).toContain('Image 1: frame 0; Image 2: frame 10 (current)');
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
