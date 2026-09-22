import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from './server.js';
import { Capability, PaymentAdvert, RestapCatalog } from './types.js';

// Load a fresh server instance with a specific RESTAP_STREAMING value.
// The streaming flag is read once at module load, so toggling it requires
// resetting the module registry and re-importing.
async function loadAppWithStreaming(enabled: boolean) {
  vi.resetModules();
  const prev = process.env.RESTAP_STREAMING;
  process.env.RESTAP_STREAMING = enabled ? 'on' : 'off';
  const mod = await import('./server.js');
  process.env.RESTAP_STREAMING = prev;
  return mod.default;
}

describe('RESTAP Server', () => {
  let server: any;

  beforeEach(() => {
    // Start server for testing
    server = app.listen(0); // Use random port
  });

  afterEach(() => {
    server.close();
  });

  describe('Discovery Endpoint', () => {
    it('should return valid RESTAP catalog', async () => {
      const response = await request(app)
        .get('/.well-known/restap.json')
        .expect(200);

      const catalog: RestapCatalog = response.body;

      expect(catalog.restap_version).toBe('1.0');
      expect(catalog.agent).toBeDefined();
      expect(catalog.agent.name).toBe('Simple RESTAP Demo Agent');
      expect(catalog.capabilities).toBeDefined();
      expect(Array.isArray(catalog.capabilities)).toBe(true);
      expect(catalog.capabilities.length).toBeGreaterThan(0);
    });

    it('should include required capability fields', async () => {
      const response = await request(app)
        .get('/.well-known/restap.json')
        .expect(200);

      const catalog: RestapCatalog = response.body;

      catalog.capabilities.forEach(cap => {
        expect(cap.id).toBeDefined();
        expect(cap.title).toBeDefined();
        expect(cap.method).toBeDefined();
        expect(cap.endpoint).toBeDefined();
        expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(cap.method);
      });
    });
  });

  describe('Talk Endpoint', () => {
    it('should respond to hello message', async () => {
      const response = await request(app)
        .post('/talk')
        .send({ message: 'Hello!' })
        .expect(200);

      expect(response.body.reply).toContain('Hello');
      expect(response.body.suggested_actions).toBeDefined();
      expect(Array.isArray(response.body.suggested_actions)).toBe(true);
    });

    it('should handle capabilities query', async () => {
      const response = await request(app)
        .post('/talk')
        .send({ message: 'What capabilities do you have?' })
        .expect(200);

      expect(response.body.reply).toContain('I can help with');
      expect(response.body.suggested_actions).toBeDefined();
    });

    it('should return error for missing message', async () => {
      const response = await request(app)
        .post('/talk')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Missing message field');
    });
  });

  describe('Text Echo Capability', () => {
    it('should echo text back', async () => {
      const testText = 'Hello, RESTAP!';

      const response = await request(app)
        .post('/text/echo')
        .send({ text: testText })
        .expect(200);

      expect(response.body.original_text).toBe(testText);
      expect(response.body.echoed_text).toBe(testText);
      expect(response.body.job_id).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return error for missing text', async () => {
      const response = await request(app)
        .post('/text/echo')
        .send({})
        .expect(400);

      expect(response.body.error).toContain("Missing 'text' field");
    });
  });

  describe('Text Reverse Capability', () => {
    it('should reverse text', async () => {
      const testText = 'Hello, World!';
      const expectedReversed = '!dlroW ,olleH';

      const response = await request(app)
        .post('/text/reverse')
        .send({ text: testText })
        .expect(200);

      expect(response.body.original_text).toBe(testText);
      expect(response.body.reversed_text).toBe(expectedReversed);
      expect(response.body.job_id).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return error for missing text', async () => {
      const response = await request(app)
        .post('/text/reverse')
        .send({})
        .expect(400);

      expect(response.body.error).toContain("Missing 'text' field");
    });
  });

  describe('News Endpoint', () => {
    describe('GET /news', () => {
      it('should return news items', async () => {
        const response = await request(app)
          .get('/news')
          .expect(200);

        expect(response.body.items).toBeDefined();
        expect(Array.isArray(response.body.items)).toBe(true);
      });

      it('should support since parameter', async () => {
        const response = await request(app)
          .get('/news?since=0')
          .expect(200);

        expect(response.body.items).toBeDefined();
        expect(response.body.timestamp).toBeDefined();
      });
    });

    describe('POST /news', () => {
      it('should receive and store messages', async () => {
        const response = await request(app)
          .post('/news')
          .send({
            type: "reply",
            from: "agent-b",
            in_reply_to: "query_123",
            message: "Here's my response"
          })
          .expect(200);

        expect(response.body.status).toBe('received');
        expect(response.body.news_id).toBeDefined();
      });

      it('should return error for missing type', async () => {
        const response = await request(app)
          .post('/news')
          .send({
            from: "agent-b",
            message: "Test"
          })
          .expect(400);

        expect(response.body.error).toContain("Missing 'type' field");
      });

      it('should store received messages in news feed', async () => {
        // Send a message via POST /news
        await request(app)
          .post('/news')
          .send({
            type: "reply",
            from: "agent-b",
            in_reply_to: "query_123",
            message: "Test reply"
          })
          .expect(200);

        // Check it appears in GET /news
        const newsResponse = await request(app)
          .get('/news')
          .expect(200);

        const replyItem = newsResponse.body.items.find(
          (item: any) => item.type === 'reply' && item.in_reply_to === 'query_123'
        );
        expect(replyItem).toBeDefined();
        expect(replyItem.from).toBe('agent-b');
      });
    });
  });

  describe('Talk Streaming (SSE)', () => {
    it('(a) Accept: application/json returns a complete JSON response', async () => {
      const response = await request(app)
        .post('/talk')
        .set('Accept', 'application/json')
        .send({ message: 'Hello!' })
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body.reply).toContain('Hello');
      expect(Array.isArray(response.body.suggested_actions)).toBe(true);
    });

    it('(b) Accept: text/event-stream returns an SSE stream with the required event sequence', async () => {
      const response = await request(app)
        .post('/talk')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Hello!' })
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const body = response.text;
      expect(body).toContain('event: message.start');
      expect(body).toContain('event: message.delta');
      expect(body).toContain('event: message.end');
      expect(body).toContain('event: done');

      // Required order: start before delta before end before done.
      const iStart = body.indexOf('event: message.start');
      const iDelta = body.indexOf('event: message.delta');
      const iEnd = body.indexOf('event: message.end');
      const iDone = body.indexOf('event: done');
      expect(iStart).toBeLessThan(iDelta);
      expect(iDelta).toBeLessThan(iEnd);
      expect(iEnd).toBeLessThan(iDone);

      // Each frame carries a JSON data line that parses and matches its event type.
      const startData = body.match(/event: message\.start\ndata: (.*)\n/);
      expect(startData).not.toBeNull();
      const startPayload = JSON.parse(startData![1]);
      expect(startPayload.event).toBe('message.start');
      expect(startPayload.id).toBeDefined();
    });

    it('(c) Accept: text/event-stream alone with streaming disabled returns 406', async () => {
      const noStreamApp = await loadAppWithStreaming(false);
      const response = await request(noStreamApp)
        .post('/talk')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Hello!' })
        .expect(406);

      expect(response.body.error).toContain('Not Acceptable');
    });

    it('(d) Accept: text/event-stream, application/json with streaming disabled falls back to JSON', async () => {
      const noStreamApp = await loadAppWithStreaming(false);
      const response = await request(noStreamApp)
        .post('/talk')
        .set('Accept', 'text/event-stream, application/json')
        .send({ message: 'Hello!' })
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(response.body.reply).toContain('Hello');
    });

    it('catalog advertises talk streaming and output_formats', async () => {
      const response = await request(app)
        .get('/.well-known/restap.json')
        .expect(200);

      const catalog: RestapCatalog = response.body;
      const talk = catalog.capabilities.find(c => c.id === 'talk');
      expect(talk).toBeDefined();
      expect(talk!.output_formats).toEqual(['application/json', 'text/event-stream']);
      expect(talk!.streaming?.transport).toBe('sse');
      expect(talk!.streaming?.events).toContain('message.delta');
      expect(catalog.protocols).toBeDefined();
    });
  });

  describe('Talk Sessions', () => {
    it('(a) POST /talk with no session_id returns a minted session_id in the JSON response', async () => {
      const response = await request(app)
        .post('/talk')
        .set('Accept', 'application/json')
        .send({ message: 'Hello!' })
        .expect(200);

      expect(typeof response.body.session_id).toBe('string');
      expect(response.body.session_id.length).toBeGreaterThan(0);
    });

    it('(b) POST /talk echoes back a provided session_id', async () => {
      const provided = 'sess_client_supplied_123';
      const response = await request(app)
        .post('/talk')
        .set('Accept', 'application/json')
        .send({ message: 'Hello!', session_id: provided })
        .expect(200);

      expect(response.body.session_id).toBe(provided);
    });

    it('(c) SSE stream carries session_id on message.start and done', async () => {
      const provided = 'sess_stream_456789';
      const response = await request(app)
        .post('/talk')
        .set('Accept', 'text/event-stream')
        .send({ message: 'Hello!', session_id: provided })
        .expect(200)
        .expect('Content-Type', /text\/event-stream/);

      const body = response.text;

      const startData = body.match(/event: message\.start\ndata: (.*)\n/);
      expect(startData).not.toBeNull();
      expect(JSON.parse(startData![1]).session_id).toBe(provided);

      const doneData = body.match(/event: done\ndata: (.*)\n/);
      expect(doneData).not.toBeNull();
      expect(JSON.parse(doneData![1]).session_id).toBe(provided);
    });

    it('(e) POST /talk rejects an out-of-bounds session_id with 400 invalid_session_id', async () => {
      const response = await request(app)
        .post('/talk')
        .set('Accept', 'application/json')
        .send({ message: 'Hello!', session_id: 'too-short' })
        .expect(400);

      expect(response.body.error).toBe('invalid_session_id');
    });

    it('(d) catalog advertises talk.sessions.supported', async () => {
      const response = await request(app)
        .get('/.well-known/restap.json')
        .expect(200);

      const catalog: RestapCatalog = response.body;
      const talk = catalog.capabilities.find(c => c.id === 'talk');
      expect(talk).toBeDefined();
      expect(talk!.sessions?.supported).toBe(true);
    });
  });

  describe('Paid capabilities', () => {
    // RESTAP does not define payment, so this asserts the ADVERT is expressible
    // and survives the wire -- not that any payment is settled.
    it('a capability can advertise a payment protocol beside its human price', () => {
      const paid: Capability = {
        id: 'text.echo',
        title: 'Echo Text',
        method: 'POST',
        endpoint: '/text/echo',
        pricing: { free_calls: 100, cost_per_call: 0.01, currency: 'USD' },
        payment: {
          protocol: 'x402',
          amount: '10000',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          network: 'eip155:8453',
        },
      };

      const wire = JSON.parse(JSON.stringify(paid)) as Capability;
      expect(wire.payment?.protocol).toBe('x402');
      // A string, because a smallest-unit on-chain amount does not survive a
      // JSON number -- the reason `pricing.cost_per_call` cannot carry a quote.
      expect(typeof wire.payment?.amount).toBe('string');
      expect(wire.payment?.network).toBe('eip155:8453');
      // The two prices are independent and may both be present.
      expect(wire.pricing?.currency).toBe('USD');
    });

    it('carries protocol-specific fields RESTAP does not define', () => {
      const payment: PaymentAdvert = {
        protocol: 'x402',
        amount: '1',
        scheme: 'exact',
        payTo: '0x0000000000000000000000000000000000000001',
      };
      expect(payment.scheme).toBe('exact');
      expect(payment.payTo).toBeDefined();
    });

    it('is optional: the demo catalog stays valid without it', async () => {
      const response = await request(app)
        .get('/.well-known/restap.json')
        .expect(200);

      const catalog: RestapCatalog = response.body;
      expect(catalog.capabilities.length).toBeGreaterThan(0);
      expect(catalog.capabilities.every(c => c.payment === undefined)).toBe(true);
    });
  });

  describe('Health Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.version).toBe('0.1.0');
      expect(response.body.timestamp).toBeDefined();
    });
  });
});