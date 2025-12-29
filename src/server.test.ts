import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from './server.js';
import { RestapCatalog } from './types.js';

describe('REST-AP Server', () => {
  let server: any;

  beforeEach(() => {
    // Start server for testing
    server = app.listen(0); // Use random port
  });

  afterEach(() => {
    server.close();
  });

  describe('Discovery Endpoint', () => {
    it('should return valid REST-AP catalog', async () => {
      const response = await request(app)
        .get('/.well-known/restap.json')
        .expect(200);

      const catalog: RestapCatalog = response.body;

      expect(catalog.restap_version).toBe('1.0');
      expect(catalog.provider).toBeDefined();
      expect(catalog.provider.name).toBe('Simple REST-AP Demo Server');
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

      expect(response.body.reply).toContain('capabilities');
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
      const testText = 'Hello, REST-AP!';

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
    it('should return news items', async () => {
      const response = await request(app)
        .get('/news')
        .expect(200);

      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
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