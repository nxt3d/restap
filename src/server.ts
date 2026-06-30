import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { RestapCatalog, TalkRequest, TalkResponse, NewsResponse, NewsPostRequest, NewsItem, Capability, TalkStreamEvent } from './types.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Streaming is OPTIONAL. Servers that leave this false stay fully compliant by
// always returning application/json. Set RESTAP_STREAMING=off to disable.
const STREAMING_ENABLED = process.env.RESTAP_STREAMING !== 'off';

// Events this server emits when streaming POST /talk.
const TALK_STREAM_EVENTS = ['message.start', 'message.delta', 'message.end', 'error', 'done'];

// session_id format per the RESTAP spec: 16 to 128 url-safe characters drawn
// from [A-Za-z0-9._-]. A UUIDv4 satisfies this.
const SESSION_ID_RE = /^[A-Za-z0-9._-]{16,128}$/;

// session_id is optional. This returns true when it is absent (the common case)
// or well-formed, and false only when present but outside the allowed shape, so
// the caller can reject it per the spec.
function sessionIdValid(value: unknown): boolean {
  return value === undefined || value === null
    || (typeof value === 'string' && SESSION_ID_RE.test(value));
}

// Mint a fresh session_id with at least 122 bits of entropy, as the spec
// requires for server-minted ids. A UUIDv4 carries 122 bits.
function mintSessionId(): string {
  return randomUUID();
}

// Parse an Accept header into an ordered list of media types (q-value aware,
// preserving stable order for equal q). Returns lowercased type names.
function parseAccept(header: string | undefined): string[] {
  if (!header) return ['*/*'];
  return header
    .split(',')
    .map((part, index) => {
      const [type, ...params] = part.trim().split(';');
      let q = 1;
      for (const p of params) {
        const m = p.trim().match(/^q=([0-9.]+)$/);
        if (m) q = parseFloat(m[1]);
      }
      return { type: type.trim().toLowerCase(), q, index };
    })
    .filter(e => e.type.length > 0)
    .sort((a, b) => (b.q - a.q) || (a.index - b.index))
    .map(e => e.type);
}

// Does the Accept list permit `target`, treating */* as a wildcard match?
function accepts(types: string[], target: string): boolean {
  return types.includes(target) || types.includes('*/*');
}

// Streaming must be explicitly requested: a bare Accept (absent, or */*) defaults
// to JSON. Only an explicit text/event-stream entry opts into SSE.
function explicitlyAccepts(types: string[], target: string): boolean {
  return types.includes(target);
}

// Write a single SSE frame: `event: <type>` + `data: <json>` + blank line.
function sendSseEvent(res: express.Response, event: TalkStreamEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// Middleware
app.use(cors());
app.use(express.json());

// RESTAP Catalog
const catalog: RestapCatalog = {
  restap_version: "1.0",
  agent: {
    name: "Simple RESTAP Demo Agent",
    description: "A demonstration AI agent implementing RESTAP",
    contact: "demo@restap.example.com"
  },
  packages: [
    {
      name: "text-processing-plugin",
      description: "Claude plugin with text processing skills and enhanced client libraries",
      type: "claude-plugin",
      language: "typescript",
      registry: "npm",
      package: "@example/text-skill",
      version: "^1.0.0",
      skill_file: "SKILL.md"
    },
    {
      name: "text-processing-sdk",
      description: "TypeScript SDK for programmatic text processing",
      type: "npm-package",
      language: "typescript",
      registry: "npm",
      package: "@example/text-sdk",
      version: "^1.0.0"
    }
  ],
  capabilities: [
    {
      id: "talk",
      title: "Talk to agent",
      method: "POST",
      endpoint: "/talk",
      description: "Send messages to the agent (triggers LLM processing)",
      output_formats: ["application/json", "text/event-stream"],
      streaming: {
        supported: STREAMING_ENABLED,
        transport: "sse",
        events: TALK_STREAM_EVENTS
      },
      sessions: {
        supported: true
      }
    },
    {
      id: "news",
      title: "Poll for updates",
      method: "GET",
      endpoint: "/news",
      description: "Poll for task completion and updates (read-only; never sends a reply)"
    },
    {
      id: "news_receive",
      title: "Receive replies",
      method: "POST",
      endpoint: "/news",
      description: "Receive messages/replies from other agents (the agent may act on them, but never replies)"
    },
    {
      id: "text.echo",
      title: "Echo text back",
      method: "POST",
      endpoint: "/text/echo",
      description: "Returns the input text unchanged",
      input_schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to echo back" }
        },
        required: ["text"]
      },
      output_schema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          original_text: { type: "string" },
          echoed_text: { type: "string" },
          timestamp: { type: "string", format: "date-time" }
        }
      },
      content_types: ["application/json"],
      pricing: {
        free_calls: 100,
        cost_per_call: 0.001,
        currency: "USD"
      }
    },
    {
      id: "text.reverse",
      title: "Reverse text",
      method: "POST",
      endpoint: "/text/reverse",
      description: "Returns the input text in reverse order",
      input_schema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to reverse" }
        },
        required: ["text"]
      },
      output_schema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          original_text: { type: "string" },
          reversed_text: { type: "string" },
          timestamp: { type: "string", format: "date-time" }
        }
      },
      content_types: ["application/json"]
    }
  ],
  // Advertise availability of related protocol endpoints. RESTAP does not
  // define these protocols; this only tells clients where to find them.
  protocols: {
    mcp: { available: false },
    a2a: { available: false }
  }
};

// In-memory storage for demo purposes
const jobs = new Map<string, any>();
let jobCounter = 0;

// Routes

// 1. Discovery endpoint
app.get('/.well-known/restap.json', (req, res) => {
  res.json(catalog);
});

// 2. Talk endpoint
//
// Content negotiation:
//   Accept: application/json                       -> complete JSON (default, unchanged)
//   Accept: text/event-stream                      -> SSE stream (if supported)
//   Accept: text/event-stream, application/json    -> prefer SSE, fall back to JSON
//
// /talk TRIGGERS agent processing. Streaming applies to /talk ONLY; /news is
// always passive and never streams.
app.post('/talk', (req, res) => {
  const { message, session_id }: TalkRequest = req.body;

  if (!message) {
    return res.status(400).json({
      reply: "Please provide a message to talk about.",
      error: "Missing message field"
    });
  }

  // session_id is optional, but if the client supplies one it MUST match the
  // spec format. Reject an out-of-bounds value the same way for JSON and SSE
  // clients (the rejection is a plain 400 before any stream begins).
  if (!sessionIdValid(session_id)) {
    return res.status(400).json({ error: "invalid_session_id" });
  }

  const acceptedTypes = parseAccept(req.headers.accept);
  const wantsStream = explicitlyAccepts(acceptedTypes, 'text/event-stream');
  const wantsJson = accepts(acceptedTypes, 'application/json');

  // Sessions (optional): continue the thread when the client supplies an opaque
  // session_id, otherwise mint one and return it so the client can continue.
  // This demo is stateless beyond echoing the token. session_id is NOT auth.
  const sessionId = session_id || mintSessionId();

  let response: TalkResponse;

  // Simple conversation logic
  if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
    response = {
      reply: "Hello! I'm a RESTAP demo agent. I can echo text, reverse text, and help you understand the protocol. Check /.well-known/restap.json for my capabilities and available packages.",
      suggested_actions: ["Try the echo capability", "Try the reverse capability", "Ask about packages"]
    };
  } else if (message.toLowerCase().includes('echo')) {
    response = {
      reply: "I can echo text back to you. Try calling the /text/echo endpoint with a POST request containing a 'text' field.",
      suggested_actions: ["POST /text/echo with {'text': 'hello world'}"]
    };
  } else if (message.toLowerCase().includes('reverse')) {
    response = {
      reply: "I can reverse text for you. Try calling the /text/reverse endpoint with a POST request containing a 'text' field.",
      suggested_actions: ["POST /text/reverse with {'text': 'hello world'}"]
    };
  } else if (message.toLowerCase().includes('capabilities') || message.toLowerCase().includes('what can you do')) {
    const caps = catalog.capabilities.map(c => c.title).join(', ');
    response = {
      reply: `I can help with: ${caps}. Check out /.well-known/restap.json for the full catalog and available packages.`,
      suggested_actions: catalog.capabilities.map(c => `${c.method} ${c.endpoint}`)
    };
  } else if (message.toLowerCase().includes('package')) {
    const packages = catalog.packages?.map(p => p.name).join(', ') || 'none';
    response = {
      reply: `I offer these packages: ${packages}. Check /.well-known/restap.json for package details and installation instructions.`,
      suggested_actions: ["Check /.well-known/restap.json for package details"]
    };
  } else {
    response = {
      reply: `I received your message: "${message}". I'm a RESTAP demo agent. Try asking about capabilities, packages, echo, or reverse operations.`,
      suggested_actions: ["What can you do?", "What packages do you offer?", "Tell me about echo"]
    };
  }

  // Stream via SSE when requested and supported.
  if (wantsStream && STREAMING_ENABLED) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const messageId = `msg_${++jobCounter}`;
    sendSseEvent(res, { event: 'message.start', id: messageId, session_id: sessionId });

    // Emit the reply as word-level deltas to demonstrate incremental delivery.
    const chunks = response.reply.match(/\S+\s*/g) || [response.reply];
    for (const chunk of chunks) {
      sendSseEvent(res, { event: 'message.delta', id: messageId, text: chunk });
    }

    sendSseEvent(res, { event: 'message.end', id: messageId });
    sendSseEvent(res, { event: 'done', session_id: sessionId });
    return res.end();
  }

  // Client asked for streaming only, but this server can't stream.
  // Fall back to JSON if acceptable, else 406.
  if (wantsStream && !STREAMING_ENABLED && !wantsJson) {
    return res.status(406).json({
      error: "Not Acceptable",
      message: "Streaming (text/event-stream) is not supported by this server. Retry with Accept: application/json."
    });
  }

  // Return the session_id so the client can continue the thread next turn.
  response.session_id = sessionId;
  res.json(response);
});

// 3. News endpoints (bidirectional)
// GET /news - Poll for updates
app.get('/news', (req, res) => {
  const since = parseInt(req.query.since as string) || 0;
  const now = Date.now();
  
  const news: NewsResponse = {
    items: Array.from(jobs.entries())
      .map(([jobId, job]) => {
        // Handle news items received via POST /news
        if (job.type === 'news.received' && job.result) {
          return job.result as NewsItem;
        }
        // Handle regular job updates
        return {
          type: job.status === 'completed' ? 'job.completed' : 'job.updated',
          timestamp: job.timestamp || now,
          job_id: jobId,
          query_id: jobId,
          message: `Job ${jobId} is ${job.status}`,
          data: job.result ? {
            query_id: jobId,
            result: job.result
          } : undefined
        } as NewsItem;
      })
      .filter(item => (item.timestamp || 0) > since),
    timestamp: now
  };

  res.json(news);
});

// POST /news - Receive replies/messages (stored; the agent may act on them, but never replies)
app.post('/news', (req, res) => {
  const { type, from, in_reply_to, message, data, session_id }: NewsPostRequest = req.body;

  if (!type) {
    return res.status(400).json({
      error: "Missing 'type' field in request body"
    });
  }

  // session_id is optional on /news too, but a supplied value MUST be well-formed.
  if (!sessionIdValid(session_id)) {
    return res.status(400).json({ error: "invalid_session_id" });
  }

  // Store the incoming message/reply. session_id (if present) is kept purely as
  // a correlation hint; storing it never sends a reply.
  const newsId = `news_${++jobCounter}`;
  const newsItem: NewsItem = {
    type,
    timestamp: Date.now(),
    from,
    in_reply_to,
    message,
    data,
    session_id
  };

  // Store in jobs map for retrieval via GET /news
  jobs.set(newsId, {
    status: 'completed',
    result: newsItem,
    type: 'news.received',
    timestamp: Date.now()
  });

  res.status(200).json({
    status: 'received',
    news_id: newsId,
    message: 'Message stored successfully'
  });
});

// 4. Capability endpoints

// Echo capability
app.post('/text/echo', (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      error: "Missing 'text' field in request body"
    });
  }

  const jobId = `job_${++jobCounter}`;
  const result = {
    job_id: jobId,
    original_text: text,
    echoed_text: text,
    timestamp: new Date().toISOString()
  };

  jobs.set(jobId, {
    status: 'completed',
    result,
    type: 'text.echo'
  });

  res.json(result);
});

// Reverse capability
app.post('/text/reverse', (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({
      error: "Missing 'text' field in request body"
    });
  }

  const jobId = `job_${++jobCounter}`;
  const result = {
    job_id: jobId,
    original_text: text,
    reversed_text: text.split('').reverse().join(''),
    timestamp: new Date().toISOString()
  };

  jobs.set(jobId, {
    status: 'completed',
    result,
    type: 'text.reverse'
  });

  res.json(result);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  });
});

// Start agent only when run directly (not when imported by tests, which start
// their own listeners on ephemeral ports).
if (process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined) {
  app.listen(PORT, () => {
    console.log(`🤖 RESTAP Demo Agent running on http://localhost:${PORT}`);
    console.log(`📋 Discovery endpoint: http://localhost:${PORT}/.well-known/restap.json`);
    console.log(`💬 Talk endpoint: http://localhost:${PORT}/talk`);
    console.log(`📰 News endpoint: http://localhost:${PORT}/news`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  });
}

export default app;