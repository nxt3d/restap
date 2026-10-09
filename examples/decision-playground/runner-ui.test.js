import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {it,expect,vi} from 'vitest';
import * as physics from './runner.js';
function harness(){
 const nodes=new Map(),raf=new Map(),requests=[];let now=0,serial=0;
 class Element{constructor(){this.value='';this.checked=false;this.children=[];this.textContent='';}append(...x){this.children.push(...x);}prepend(x){this.children.unshift(x);}replaceChildren(...x){this.children=x;}getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true});}toDataURL(){return `image-${serial++}`;}}
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element()},el=document.getElementById;
 for(const [id,value] of Object.entries({controller:'model',mode:'realtime',input:'state',images:'2',speed:'1',k:'20',maxAge:'750',interval:'0',cadenceMs:'200',seed:'1',budget:'100',games:'3'}))el(id).value=value;
 el('sameSeeds').checked=true;
 const context=vm.createContext({...physics,document,crypto:{randomUUID:()=>`${++serial}`,getRandomValues:a=>{a[0]=123;return a;}},performance:{now:()=>now},setTimeout,Blob,URL,requestAnimationFrame:cb=>raf.set(++serial,cb),fetch:(_url,o)=>new Promise(resolve=>requests.push({body:JSON.parse(o.body),resolve}))});
 vm.runInContext(readFileSync(new URL('./runner-ui.js',import.meta.url),'utf8').replace(/^import .*\n/,''),context);
 const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
 const advance=async ms=>{now+=ms;const c=[...raf.values()];raf.clear();for(const cb of c)cb(now);await flush();};
 const reply=async(index,action='lane-4')=>{requests[index].resolve({json:async()=>({restap:{id:requests[index].body.id,action},openai_response:{usage:{input_tokens:100}}})});await flush();};
 return {el,requests,advance,reply,eval:s=>vm.runInContext(s,context)};
}
it('runs real-time physics during inference, rejects stopped reply, and locks until settled',async()=>{const h=harness();h.el('play').onclick();expect(h.requests).toHaveLength(1);await h.advance(0);await h.advance(100);expect(h.eval('g.frame')).toBe(6);h.el('stop').onclick();expect(h.el('play').disabled).toBe(true);await h.reply(0);expect(h.eval('g.target')).toBe(3);expect(h.eval('rows[0].trace[0].status')).toBe('stopped');expect(h.el('play').disabled).toBe(false);await h.advance(100);expect(h.eval('g.frame')).toBe(6);});
it('paused Step freezes then advances exactly K frames',async()=>{const h=harness();h.el('mode').value='paused';h.el('step').onclick();await h.advance(0);await h.advance(100);expect(h.eval('g.frame')).toBe(0);await h.reply(0);for(let i=0;i<5;i++)await h.advance(100);expect(h.eval('g.frame')).toBe(20);expect(h.requests).toHaveLength(1);expect(h.eval('active')).toBe(false);});
it('stale replies at the boundary do not steer and images remain isolated',async()=>{const h=harness();h.el('input').value='images';h.el('facts').checked=true;h.el('assist').checked=true;h.el('play').onclick();expect(Object.keys(h.requests[0].body.context).sort()).toEqual(['images','text']);expect(h.requests[0].body.context.images).toHaveLength(2);await h.advance(0);await h.advance(750);await h.reply(0);expect(h.eval('g.target')).toBe(3);expect(h.eval('current.stale')).toBe(1);});
it('restarts seeded games only after pending reply settles and preserves results',async()=>{const h=harness();h.el('auto').checked=true;h.el('play').onclick();h.eval("g.over=true;g.cause='wall'");await h.advance(100);expect(h.eval('episode')).toBe(0);await h.reply(0);expect(h.eval('episode')).toBe(1);expect(h.eval('g.seed')).toBe(2);expect(h.eval('rows.length')).toBe(1);expect(h.eval('rows[0].trace[0].status')).toBe('game over');h.el('stop').onclick();h.el('reset').onclick();expect(h.eval('g.seed')).toBe(1);expect(h.eval('rows.length')).toBeGreaterThanOrEqual(1);});
it('Perfect at cadence freezes forecast until delayed application and makes no calls',async()=>{vi.useFakeTimers();try{const h=harness();h.el('controller').value='cadence';h.el('play').onclick();expect(h.requests).toHaveLength(0);expect(h.eval('g.target')).toBe(3);await h.advance(0);await h.advance(100);await vi.advanceTimersByTimeAsync(200);expect(h.eval('current.trace[0].status')).toBe('applied');expect(h.eval('current.calls')).toBe(0);}finally{vi.useRealTimers();}});
