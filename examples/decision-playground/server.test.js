import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp, validate, toOpenAI } from './server.js';

const payload = () => ({ id: 'test-1', context: { text: 'Move safely.' }, actions: [{ id: 'north', description: 'Move north.' }, { id: 'wait', description: 'Wait.' }] });
const response = answer => ({ ok: true, text: async () => JSON.stringify({ answers: [answer] }) });
const setup = answer => {
  const transport = vi.fn(async () => response(answer ?? { type: 'choice', name: 'action', choice: 'north' }));
  return { transport, app: createApp({ apiKey: 'test-secret-never-real', fetchImpl: transport }) };
};
const post = (app, body) => request(app).post('/decide').send(body);

describe('local decision playground', () => {
  it.each([
    ['too_few_actions', b => { b.actions.pop(); }],
    ['invalid_request', b => { b.actions[0].id = 'null'; }],
    ['invalid_request', b => { b.actions[0].id = null; }],
    ['invalid_request', b => { b.actions[0].id = '  '; }],
    ['invalid_request', b => { b.actions[0].description = '\t'; }],
    ['invalid_request', b => { b.id = ''; }],
    ['invalid_request', b => { b.context.state = []; }],
    ['duplicate_action_id', b => { b.actions[1].id = 'north'; }],
    ['empty_context', b => { b.context = { text: ' ', state: {}, events: [' '] }; }],
    ['invalid_image', b => { b.context.images = ['data:image/png;base64,YWJj']; }],
  ])('rejects %s before inference', async (code, mutate) => {
    const { app, transport } = setup(); const body = payload(); mutate(body);
    const result = await post(app, body);
    expect(result.status).toBe(400); expect(result.body.error).toBe(code);
    expect(result.body.restap).toEqual({ error: code }); expect(transport).not.toHaveBeenCalled();
  });
  it('preserves state, events, opaque IDs and actual image parts; truncates display only', async () => {
    const { app, transport } = setup(); const body = payload();
    body.context = { state: { health: 0, nested: [null, false] }, events: ['last move blocked'], images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='] };
    const result = await post(app, body); expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store'); expect(result.body.restap).toEqual({ id: body.id, action: 'north' });
    const sent = JSON.parse(transport.mock.calls[0][1].body);
    expect(sent.model).toBe('gpt-6-luna'); expect(sent.input[0].content[1].image_url).toBe(body.context.images[0]);
    expect(sent.input[0].content[0].text).toContain('"nested":[null,false]');
    expect(sent.questions[0].choices).toEqual(body.actions.map(a => ({ value: a.id, description: a.description })));
    expect(result.body.openai_request.input[0].content[1].image_url).toContain('truncated');
    expect(JSON.stringify(result.body)).not.toContain('test-secret-never-real');
  });
  it.each([{state:{value:1}}, {events:['event']}, {text:'text'}])('accepts individual context %j', async context => {
    const { app } = setup(); expect((await post(app, { ...payload(), context })).status).toBe(200);
  });
  it('only explicit refusal produces null; wait remains a chosen action', async () => {
    for (const [answer, action] of [[{ type:'refusal',name:'action' },null],[{type:'choice',name:'action',choice:'wait'},'wait']]) {
      const { app } = setup(answer); const result = await post(app,payload()); expect(result.status).toBe(200); expect(result.body.restap.action).toBe(action);
    }
  });
  it.each([{type:'choice',name:'action',choice:'unknown'}, {type:'choice',name:'action',choice:false}, {type:'choice',name:'wrong',choice:'north'}, {}])('rejects invalid backend answer %j', async answer => {
    const { app }=setup(answer); const result=await post(app,payload()); expect(result.status).toBe(502); expect(result.body.error).toBe('invalid_backend_response'); expect(result.body.restap).not.toHaveProperty('action');
  });
  it('redacts credentials even from provider errors and maps provider 429 to 503', async () => {
    const app=createApp({ apiKey:'private-test-key',fetchImpl:async()=>({ok:false,status:429,text:async()=>JSON.stringify({error:'private-test-key'})}) });
    const result=await post(app,payload());expect(result.status).toBe(503);expect(result.text).not.toContain('private-test-key');expect(result.body.openai_response.error).toBe('[REDACTED]');
  });
  it('returns a timeout error instead of null', async () => {
    const app=createApp({apiKey:'fake',timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
    const result=await post(app,payload());expect(result.status).toBe(504);expect(result.body.error).toBe('decision_timeout');
  });
  it('returns errors for malformed JSON and cross-origin calls', async () => {
    const {app,transport}=setup();
    const malformed=await request(app).post('/decide').type('json').send('{');expect(malformed.status).toBe(400);expect(malformed.body.error).toBe('invalid_request');
    expect((await request(app).post('/decide').set('Origin','https://evil.example').send(payload())).status).toBe(403);
    expect((await request(app).post('/decide').set('Host','evil.example').send(payload())).status).toBe(403);
    expect(transport).not.toHaveBeenCalled();
  });
});

 it('accepts four ordered images without state and rejects five',()=>{
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
 const body={id:'two',context:{images:[image,image,image,image]},actions:[{id:'a',description:'A'},{id:'b',description:'B'}]};
 expect(()=>validate(body)).not.toThrow();
 expect(toOpenAI(body).input[0].content.filter(c=>c.type==='input_image').map(c=>c.image_url)).toEqual(body.context.images);
 body.context.images.push(image);expect(()=>validate(body)).toThrow('too_many_images');
 });

describe('decision 8 backend scores', () => {
  const choice = scores => ({type:'choice',name:'action',choice:'north',...scores});
  it.each([
    [{}, {}],
    [{confidence:0}, {confidence:0}],
    [{confidence:1}, {confidence:1}],
    [{probabilities:[{value:'wait',probability:0.22},{value:'north',probability:0.71}]}, {probabilities:{wait:0.22,north:0.71}}],
    [{confidence:0.4,probabilities:[{value:'north',probability:0},{value:'wait',probability:1}]}, {confidence:0.4,probabilities:{north:0,wait:1}}],
  ])('preserves independent scores without normalization %j',async(scores,expected)=>{
    const {app}=setup(choice(scores));const result=await post(app,payload());
    expect(result.status).toBe(200);expect(result.body.restap).toEqual({id:'test-1',action:'north',...expected});
  });
  it.each([-0.1,1.1,null,'0.5',true,{},NaN,Infinity])('omits invalid confidence %j',async confidence=>{
    const {app}=setup(choice({confidence}));expect((await post(app,payload())).body.restap).toEqual({id:'test-1',action:'north'});
  });
  it.each([
    [], [{value:'north',probability:1}],
    [{value:'north',probability:0.5},{value:'north',probability:0.5}],
    [{value:'north',probability:0.5},{value:'unknown',probability:0.5}],
    [{value:'north',probability:0.5},{value:'wait',probability:0.5},{value:'extra',probability:0}],
    [{value:'north',probability:0.5},{value:'wait',probability:-0.1}],
    [{value:'north',probability:0.5},{value:'wait',probability:1.1}],
    [{value:'north',probability:0.5},{value:'wait',probability:'0.5'}],
    [{value:'north',probability:0.5},null],
    [{value:false,probability:0.5},{value:'wait',probability:0.5}],
    {north:0.5,wait:0.5}, null,
  ])('omits partial or invalid probability arrays %j',async probabilities=>{
    const {app}=setup(choice({confidence:0.25,probabilities}));
    expect((await post(app,payload())).body.restap).toEqual({id:'test-1',action:'north',confidence:0.25});
  });
  it('omits both scores for refusal even if supplied by backend',async()=>{
    const {app}=setup({type:'refusal',name:'action',confidence:1,probabilities:[{value:'north',probability:1},{value:'wait',probability:0}]});
    expect((await post(app,payload())).body.restap).toEqual({id:'test-1',action:null});
  });
  it('preserves opaque special object keys safely',async()=>{
    const body=payload();body.actions[0].id='__proto__';body.actions[1].id='constructor';
    const {app}=setup({type:'choice',name:'action',choice:'__proto__',confidence:0.8,probabilities:[{value:'__proto__',probability:0.8},{value:'constructor',probability:0.2}]});
    const result=await post(app,body);
    expect(Object.keys(result.body.restap.probabilities)).toEqual(['__proto__','constructor']);
    expect(result.body.restap.probabilities.__proto__).toBe(0.8);
  });
});
