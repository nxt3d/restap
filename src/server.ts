import express from 'express';
import cors from 'cors';
import { RestapCatalog, TalkRequest, TalkResponse, NewsResponse, NewsPostRequest, NewsItem, Capability } from './types.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// REST-AP Catalog
const catalog: RestapCatalog = {
  restap_version: "1.0",
  agent: {
    name: "Simple REST-AP Demo Agent",
    description: "A demonstration AI agent implementing REST-AP",
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
      description: "Send messages to the agent (triggers LLM processing)"
    },
    {
      id: "news",
      title: "Poll for updates",
      method: "GET",
      endpoint: "/news",
      description: "Poll for task completion and updates (no LLM processing)"
    },
    {
      id: "news_receive",
      title: "Receive replies",
      method: "POST",
      endpoint: "/news",
      description: "Receive messages/replies from other agents (no LLM processing)"
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
  ]
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
app.post('/talk', (req, res) => {
  const { message, session_id }: TalkRequest = req.body;

  if (!message) {
    return res.status(400).json({
      reply: "Please provide a message to talk about.",
      error: "Missing message field"
    });
  }

  let response: TalkResponse;

  // Simple conversation logic
  if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
    response = {
      reply: "Hello! I'm a REST-AP demo agent. I can echo text, reverse text, and help you understand the protocol. Check /.well-known/restap.json for my capabilities and available packages.",
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
      reply: `I received your message: "${message}". I'm a REST-AP demo agent. Try asking about capabilities, packages, echo, or reverse operations.`,
      suggested_actions: ["What can you do?", "What packages do you offer?", "Tell me about echo"]
    };
  }

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

// POST /news - Receive replies/messages (passive storage, no processing)
app.post('/news', (req, res) => {
  const { type, from, in_reply_to, message, data }: NewsPostRequest = req.body;

  if (!type) {
    return res.status(400).json({
      error: "Missing 'type' field in request body"
    });
  }

  // Store the incoming message/reply
  const newsId = `news_${++jobCounter}`;
  const newsItem: NewsItem = {
    type,
    timestamp: Date.now(),
    from,
    in_reply_to,
    message,
    data
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

// Start agent
app.listen(PORT, () => {
  console.log(`🤖 REST-AP Demo Agent running on http://localhost:${PORT}`);
  console.log(`📋 Discovery endpoint: http://localhost:${PORT}/.well-known/restap.json`);
  console.log(`💬 Talk endpoint: http://localhost:${PORT}/talk`);
  console.log(`📰 News endpoint: http://localhost:${PORT}/news`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});

export default app;