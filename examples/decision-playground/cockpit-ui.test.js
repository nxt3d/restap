import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {it,expect,vi,afterEach} from 'vitest';
import * as cockpit from './cockpit.js';
function harness(){
 vi.useFakeTimers();const nodes=new Map(),requests=[],clipboard=[];
 class Element{
  constructor(){this.value='';this.textContent='';this.children=[];this.className='';this.classList={add:name=>{this.className+=' '+name;}};}
  append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;this.textContent='';}
  setAttribute(){}getContext(){return {};}toDataURL(){return 'data:image/png;base64,'+'A'.repeat(100);} }
 const el=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 for(const [id,value]of Object.entries({seed:'42',input:'both',order:'fixed',hold:'1.5'}))el(id).value=value;
 el('role').checked=true;
 const context=vm.createContext({...cockpit,document:{getElementById:el,createElement:()=>new Element()},drawCockpit:()=>{},structuredClone,performance:{now:()=>Date.now()},setTimeout,requestAnimationFrame:cb=>setTimeout(()=>cb(Date.now()),16),AbortSignal,Blob,URL,navigator:{clipboard:{writeText:async text=>clipboard.push(text)}},fetch:(url,options)=>new Promise(resolve=>requests.push({url,body:JSON.parse(options.body),resolve}))});
 vm.runInContext(readFileSync(new URL('./cockpit-ui.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export function displayJSON','function displayJSON'),context);
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 const reply=async(action='unload',status=200)=>{const req=requests.at(-1);req.resolve({status,ok:status===200,text:async()=>JSON.stringify({restap:status===200?{id:req.body.id,action,confidence:.9}:{error:'unavailable'},openai_request:{model:'mock'},openai_response:{answers:[{choice:action}]},error:status===200?null:'unavailable'})});await flush();};
 return {el,requests,clipboard,reply,flush,eval:s=>vm.runInContext(s,context),advance:ms=>vi.advanceTimersByTimeAsync(ms)};
}
afterEach(()=>vi.useRealTimers());
it('shows RESTAP first, preserves full copy payloads and reopens earlier exchanges',async()=>{
 const h=harness();h.el('step').onclick();await h.flush();await h.reply();await h.advance(1100);
 expect(h.requests[0].url).toBe('/decision');expect(h.el('http-line').textContent).toContain('POST /decision · 200');expect(h.el('feedback').className).toBe('pass');expect(h.el('feedback').children[0].textContent).toBe('✓ STEP PASSED');expect(h.el('scenario-summary').textContent).toContain('RESOLVED');expect(h.el('backend').open).toBe(false);
 expect(h.el('restap-request').textContent).toContain('shortened for display');await h.el('copy-request').onclick();expect(JSON.parse(h.clipboard[0])).toEqual(h.requests[0].body);
 h.el('step').onclick();await h.flush();await h.reply('fire2');await h.advance(1100);expect(h.el('scenario-summary').textContent).toBe('');expect(h.el('tracker').children).toHaveLength(3);
 h.el('exchange-history').value='0';h.el('exchange-history').onchange();expect(JSON.parse(h.el('restap-response').textContent).action).toBe('unload');await h.el('copy-response').onclick();expect(JSON.parse(h.clipboard[1]).action).toBe('unload');
});
it.each([['continue','fail','✗ FAIL'],['shutdown','danger','⚠ DANGER']])('grades %s visibly and names the correct action',async(action,kind,title)=>{
 const h=harness();h.el('step').onclick();await h.flush();await h.reply(action);await h.advance(1100);expect(h.el('feedback').className).toBe(kind);expect(h.el('feedback').children[0].textContent).toBe(title);expect(h.el('feedback').children[3].textContent).toContain('Correct action: unload');expect(h.el('scenario-summary').textContent).toContain('FAILED');expect(h.el('instrument').className).toContain('flash-fail');
});
it('retains an HTTP error without advancing or grading the scenario',async()=>{
 const h=harness();h.el('step').onclick();await h.flush();await h.reply(null,503);expect(h.el('http-line').textContent).toContain('503');expect(JSON.parse(h.el('restap-response').textContent)).toEqual({error:'unavailable'});expect(h.eval('g.done')).toBe(false);expect(h.el('feedback').textContent).toContain('No step was graded');expect(h.el('step').disabled).toBe(true);await h.advance(500);expect(h.el('step').disabled).toBe(false);
});
it('holds the result and pausing during the hold prevents the next decision',async()=>{
 const h=harness();h.el('play').onclick();await h.flush();await h.reply();await h.advance(2000);expect(h.requests).toHaveLength(1);h.el('pause').onclick();await h.advance(2000);expect(h.requests).toHaveLength(1);h.el('step').onclick();await h.flush();expect(h.requests).toHaveLength(2);
});

it('shows PASS for an acceptable abstention in a normal scenario',async()=>{
 const h=harness();h.eval('g=freshCockpit(15,42)');h.el('step').onclick();await h.flush();await h.reply(null);await h.advance(1100);expect(h.el('feedback').className).toBe('pass');expect(h.el('feedback').children[1].textContent).toContain('Abstain');expect(h.el('feedback').children.at(-1).textContent).toContain('acceptable');
});

it('backs off consecutive failures and resets the cooldown after success',async()=>{
 const h=harness();
 h.el('step').onclick();await h.flush();await h.reply(null,503);await h.advance(500);
 h.el('step').onclick();await h.flush();await h.reply(null,503);await h.advance(999);expect(h.el('step').disabled).toBe(true);await h.advance(1);
 h.el('step').onclick();await h.flush();await h.reply();await h.advance(1100);
 h.el('step').onclick();await h.flush();await h.reply(null,503);await h.advance(500);expect(h.el('step').disabled).toBe(false);
});
