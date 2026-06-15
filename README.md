# **REST‑AP: REST Agent Protocol**

**Author:** Prem Makeig @nxt3d
**Version:** 0.1.0-beta
**Date:** 11/8/2025

## **Abstract**

REST-AP is a protocol for AI agents to expose their capabilities via standard HTTP endpoints. Instead of building custom APIs for each agent, REST-AP provides a uniform interface that makes any AI agent discoverable and usable by other systems. Agents implement three core endpoints: discovery, conversation, and task execution.

## **Goals**

* Enable AI agents to expose their capabilities via simple HTTP endpoints.

* Provide a standard way for agents to advertise their capabilities for discovery.

* Enable other agents, applications, and humans to interact with AI agents reliably.

* Support optional skill packages that help clients effectively use agent capabilities.

## **Non‑Goals**

* Defining a new transport. Use HTTP and HTTPS.

* Replacing existing auth methods. Use whatever works for your use case.

* **Defining tool invocation, long-running task orchestration, async job handling, or agent-to-agent delegation.** These belong to MCP, A2A, or other protocols an agent advertises. REST-AP stays minimal and focused: it standardizes discovery, a one-directional `/talk` entrypoint, and a passive `/news` channel. The optional streaming `tool.*` and `artifact` events (see below) are presentational hints for rendering progress, **not** a tool-invocation protocol.

* **Defining session management.** The optional `session_id` (see **Sessions (optional)**) is just an opaque continuity token. REST-AP does not define session create/delete endpoints, a session-management API, mandatory persistence/TTL, or auth-bound sessions — those would make it stateful orchestration, which is out of scope.

## **Key Concepts and Terms**

**Capabilities as Endpoints**. In REST‑AP, a capability maps directly to a concrete HTTP endpoint. Each capability specifies the HTTP method, endpoint path, input/output schemas, and other metadata needed for proper API interaction.

* **AI Agent**. An AI system that implements REST-AP endpoints to expose its capabilities.

* **Client**. Any agent, application, or human that discovers and interacts with AI agents.  
    
* **Capability**. A declared operation with input/output description. For example, image.upscale.

* **Skill**. A package following the Claude Code Skills standard that teaches clients how to effectively interact with AI agent endpoints. Skills use the exact same `SKILL.md` format as Claude Code Skills.

* **Catalog**. A JSON document listing available capabilities and their endpoints.

## **High Level Architecture**

REST-AP defines how AI agents expose their capabilities through standard HTTP endpoints.

1. **Discovery**. Agents publish their capabilities via `/.well-known/restap.json` for clients to discover.

2. **Talk**. Agents implement `POST /talk` as a one-directional entrypoint where the agent receives queries and triggers an LLM response. The client sends a message, and the agent processes it and responds.

3. **Execute**. Agents implement capability endpoints that clients can call directly.

4. **News**. Agents implement `/news` as a single bidirectional endpoint for reading and writing updates. Unlike `/talk`, `/news` communications **never trigger agent processing** - it's purely passive storage and retrieval.

### **Minimal Endpoint Set**

* `GET /.well-known/restap.json` - Discovery
* `POST /talk` - One-directional entrypoint (client → agent, triggers LLM response)
* `/news` - Single bidirectional endpoint:
  * `GET /news` - Read updates (no processing)
  * `POST /news` - Write messages/replies (no processing)

### **Key Difference: /talk vs /news**

The critical distinctions between `/talk` and `/news`:

| Endpoint | Direction | Triggers Processing? | Use Case |
|----------|-----------|-------------------|----------|
| `POST /talk` | **One-directional** (client → agent) | ✅ **Yes** - Agent receives query and triggers LLM response | Send tasks/questions that need agent work |
| `GET /news` | **Bidirectional** (read) | ❌ **No** - Just retrieves stored data | Poll for updates, read what's already happened |
| `POST /news` | **Bidirectional** (write) | ❌ **No** - Just stores data, no processing | Send replies/messages without triggering work |

Only `POST /talk` may stream its response (optional, via SSE). `/news` never triggers the agent and never streams. See **Streaming /talk responses (optional)** below.

**Key Points:**
- **`POST /talk`**: One-directional - client sends query, agent processes it and responds with LLM output
- **`/news`**: Bidirectional - can read (GET) and write (POST), but never triggers processing
- **Why this matters:** `POST /news` prevents infinite loops. When Agent A sends a reply to Agent B via `POST /news`, Agent B doesn't process it - it's just stored. This allows agents to communicate without triggering endless processing cycles.

## **Streaming /talk responses (optional)**

`POST /talk` TRIGGERS agent processing, and agent processing can take time. A server MAY stream its response incrementally using [Server-Sent Events (SSE)](https://html.spec.whatwg.org/multipage/server-sent-events.html) instead of waiting to return one complete JSON body.

**Streaming is OPTIONAL.** A server that does not implement it remains fully compliant by always returning `application/json`. **Streaming applies to `/talk` only.** `/news` is always passive, never triggers the agent, and never streams.

### **Content negotiation**

The client signals its preference with the HTTP `Accept` request header; the server signals what it actually sent with the `Content-Type` response header.

| Request `Accept` | Meaning | Server behavior |
|------------------|---------|-----------------|
| `application/json` | Client wants a complete JSON response (the default, unchanged) | Return a normal complete JSON body |
| `text/event-stream` | Client wants a streaming SSE response | Stream SSE if supported; otherwise `406 Not Acceptable` |
| `text/event-stream, application/json` | Client prefers streaming but accepts JSON fallback | Stream SSE if supported, else return `application/json` |

Rules:

* The default (no `Accept` header, `*/*`, or `application/json`) is a complete JSON response. **Streaming must be requested explicitly** by listing `text/event-stream` in `Accept`.
* The response `Content-Type` determines what the client actually receives (`application/json` or `text/event-stream`). Clients MUST inspect it rather than assuming.
* If streaming is requested but unsupported, the server MAY return `application/json` when the client also accepts it; otherwise it MUST return `406 Not Acceptable`.
* Streaming `/talk` is purely a delivery-format choice. The default JSON behavior is unchanged, so existing clients keep working with no changes.

### **SSE event vocabulary for `/talk`**

A streaming `/talk` response is a sequence of SSE frames. Each frame has an `event:` name and a `data:` line carrying a JSON object.

**REQUIRED for basic compatibility** (every streaming server MUST emit these, and every streaming client MUST understand them):

| Event | Meaning | Payload |
|-------|---------|---------|
| `message.start` | Begins an assistant message | `{ "id": "<message id>" }` |
| `message.delta` | A partial text chunk to append | `{ "id": "<message id>", "text": "<chunk>" }` |
| `message.end` | The assistant message is complete | `{ "id": "<message id>" }` |
| `error` | An in-stream error occurred | `{ "message": "<error text>" }` |
| `done` | The stream is finished (terminal) | `{}` |

A minimal exchange emits `message.start` → one or more `message.delta` → `message.end` → `done`.

**OPTIONAL** (a server MAY emit these; clients MUST NOT require them for basic compatibility, and MUST safely ignore any they do not recognize):

| Event | Meaning |
|-------|---------|
| `status` | A human-readable progress note |
| `tool.start` / `tool.delta` / `tool.end` | Presentational hints that the agent is using a tool |
| `artifact` | A non-text result the client may render |

> **The optional `tool.*` and `artifact` events are presentational hints only — they are NOT a tool-invocation protocol.** REST-AP does not define how tools are invoked; that belongs to MCP, A2A, or other advertised integrations.

### **SSE wire format**

Each frame is an `event:` line, a `data:` line containing the JSON payload, and a blank line:

```
event: message.start
data: {"event":"message.start","id":"msg_1"}

event: message.delta
data: {"event":"message.delta","id":"msg_1","text":"Hello "}

event: message.delta
data: {"event":"message.delta","id":"msg_1","text":"world."}

event: message.end
data: {"event":"message.end","id":"msg_1"}

event: done
data: {"event":"done"}

```

Concrete example exchange:

**Request**

```
POST /talk
Accept: text/event-stream
Content-Type: application/json

{"message": "Say hello"}
```

**Response**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: message.start
data: {"event":"message.start","id":"msg_42","session_id":"sess_7"}

event: message.delta
data: {"event":"message.delta","id":"msg_42","text":"Hello "}

event: message.delta
data: {"event":"message.delta","id":"msg_42","text":"there!"}

event: message.end
data: {"event":"message.end","id":"msg_42"}

event: done
data: {"event":"done","session_id":"sess_7"}

```

The client concatenates the `text` fields from each `message.delta` to assemble the full reply (`"Hello there!"`), then stops on `done`. The `session_id` on `message.start`/`done` lets the client continue the thread on its next turn (see **Sessions (optional)**).

## **Sessions (optional)**

`session_id` is an **opaque** string that provides conversation continuity on `/talk`. It is the minimal mechanism for multi-turn threads, and nothing more.

**How it works:**

* A client MAY include `session_id` in `POST /talk` to continue an existing thread.
* If the client omits it, the server MAY mint one. When it does, it MUST return the `session_id` so the client can continue:
  * in the JSON `TalkResponse` body (`{"reply": "...", "session_id": "..."}`), and
  * in the SSE `message.start` event and the `done` event when streaming.
* The client echoes the returned `session_id` back on its next `POST /talk` turn.

**Servers MAY be stateless.** A server that ignores `session_id` and treats every `/talk` as a fresh exchange remains **fully compliant** — continuity simply isn't guaranteed. REST-AP mandates no server-side store, no lifecycle, no expiry, and no session API.

**`session_id` is NOT authentication.** It is a correlation token, not access control. If a server uses it to gate conversation history, the token MUST be unguessable. Authentication and authorization remain a separate concern (see **Security**).

**Relation to `/news`:** sessions are a `/talk` concept. A `/news` item MAY carry an optional `session_id` purely to correlate it with a thread, but `/news` semantics are **unchanged** — it stays passive and never triggers processing. Streaming and processing are never added to `/news`.

### **What REST-AP does NOT define (sessions)**

To stay minimal, REST-AP deliberately leaves these out of scope (they would turn sessions into stateful orchestration — see **Non‑Goals**):

* No session create/delete endpoints and no session-management API.
* No required persistence, store, or TTL/expiry.
* No auth-bound sessions; `session_id` is not a credential.

## **The Catalog Document**

```json
{
  "restap_version": "1.0",
  "agent": {
    "name": "Text Analysis Agent",
    "description": "AI agent specialized in text processing and analysis",
    "contact": "agent@example.com"
  },
  "capabilities": [
    {
      "id": "talk",
      "title": "Talk to agent",
      "method": "POST",
      "endpoint": "/talk",
      "description": "Send messages to the agent (triggers LLM processing)",
      "output_formats": ["application/json", "text/event-stream"],
      "streaming": {
        "supported": true,
        "transport": "sse",
        "events": ["message.start", "message.delta", "message.end", "error", "done"]
      },
      "sessions": {
        "supported": true
      }
    },
    {
      "id": "news",
      "title": "Poll for updates",
      "method": "GET",
      "endpoint": "/news",
      "description": "Poll for task completion and updates (no LLM processing)"
    },
    {
      "id": "news_receive",
      "title": "Receive replies",
      "method": "POST",
      "endpoint": "/news",
      "description": "Receive messages/replies from other agents (no LLM processing)"
    },
    {
      "id": "text.echo",
      "title": "Echo text back",
      "method": "POST",
      "endpoint": "/text/echo",
      "description": "Returns the input text unchanged",
      "input_schema": {
        "type": "object",
        "properties": {
          "text": {"type": "string", "description": "The text to echo back"}
        },
        "required": ["text"]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "job_id": {"type": "string"},
          "original_text": {"type": "string"},
          "echoed_text": {"type": "string"},
          "timestamp": {"type": "string", "format": "date-time"}
        }
      },
      "content_types": ["application/json"]
    },
    {
      "id": "text.reverse",
      "title": "Reverse text",
      "method": "POST",
      "endpoint": "/text/reverse",
      "description": "Returns the input text in reverse order",
      "input_schema": {
        "type": "object",
        "properties": {
          "text": {"type": "string", "description": "The text to reverse"}
        },
        "required": ["text"]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "job_id": {"type": "string"},
          "original_text": {"type": "string"},
          "reversed_text": {"type": "string"},
          "timestamp": {"type": "string", "format": "date-time"}
        }
      },
      "content_types": ["application/json"]
    }
  ],
  "packages": [
    {
      "name": "Text Processing Plugin",
      "type": "claude-plugin",
      "description": "Claude plugin with text processing skills and enhanced client libraries",
      "language": "typescript",
      "registry": "npm",
      "package": "@example/text-tools",
      "version": "^1.0.0",
      "skill_file": "SKILL.md",
      "homepage": "https://github.com/example/text-tools"
    },
    {
      "name": "Text Processing SDK",
      "type": "npm-package",
      "description": "TypeScript SDK for programmatic text processing",
      "language": "typescript",
      "registry": "npm",
      "package": "@example/text-sdk",
      "version": "^1.0.0",
      "homepage": "https://github.com/example/text-sdk"
    }
  ],
  "protocols": {
    "mcp": { "available": true, "endpoint": "/mcp" },
    "a2a": { "available": false }
  }
}
```

**Note**: Use the recommended format for advertising your package. Name and type are required fields, plus any additional metadata that helps clients understand and use your package effectively. Include download/installation information so clients know how to obtain the package.

## **Capability Fields**

Each capability in the catalog can include the following standard REST API fields:

* **id**: Unique identifier for the capability
* **title**: Human-readable name
* **method**: HTTP method (GET, POST, PUT, DELETE)
* **endpoint**: API endpoint path
* **description**: Human-readable description of what the capability does
* **input_schema**: JSON Schema describing the expected request body structure
* **output_schema**: JSON Schema describing the response body structure
* **content_types**: Array of accepted content types (e.g., ["application/json"])
* **output_formats**: Array of response formats the capability can produce (e.g., `["application/json", "text/event-stream"]`). On `talk`, listing `text/event-stream` signals that streaming is available via content negotiation.
* **streaming**: For `talk`, an object advertising optional SSE streaming: `{ "supported": true, "transport": "sse", "events": ["message.start", "message.delta", "message.end", "error", "done"] }`. When `supported` is `false`, the server always returns `application/json`. The `events` array lists the SSE events the server emits.
* **sessions**: For `talk`, an object advertising optional session continuity: `{ "supported": true }`. When `supported` is `true`, the server mints and returns a `session_id` that clients echo back to continue a thread (see **Sessions (optional)**). When `false`, the server is stateless and ignores `session_id`.

The input/output schemas use standard JSON Schema format to provide precise API contracts for clients.

### **Top-Level `protocols` Field**

Alongside `capabilities` and `packages`, the catalog MAY include a top-level **`protocols`** object advertising whether related protocol endpoints are available:

```json
"protocols": {
  "mcp": { "available": true, "endpoint": "/mcp" },
  "a2a": { "available": false }
}
```

Each entry is `{ "available": boolean, "endpoint"?: string }`. REST-AP does **not** define these protocols (MCP, A2A, etc.); the `protocols` object only tells clients which integrations the agent exposes and where to reach them. This keeps REST-AP minimal while letting agents point to richer protocols for tool invocation, task orchestration, or agent-to-agent delegation.

## **Optional Packages**

Agents can advertise optional packages that provide enhanced functionality for clients. The packages section is **intentionally flexible** to accommodate different integration approaches and standards. Package metadata should align with existing standards where they exist while remaining flexible for future agent integration patterns.

### **Package Types & Standards:**

The packages section is **not strictly defined** - agents can use any package metadata that makes sense for their integration approach. However, aligning with existing standards is encouraged:

* **`claude-plugin`**: Claude Code plugins containing skills, libraries, and tools (recommended for Claude integration)
* **`npm-package`**: Traditional npm packages with libraries and CLI tools
* **`pip-package`**: Python packages for agent integration
* **`sdk`**: Language-specific SDKs with type safety and enhanced features

**Package metadata should align with existing standards where they exist** while remaining flexible for future agent integration patterns.

### **What Packages Provide:**

* **🤖 Behavioral Guidance** (`claude-plugin`): SKILL.md files teaching AI agents proper interaction patterns
* **📚 Code Libraries**: Enhanced client libraries with helpers for agent communication
* **🛠️ CLI Tools**: Command-line utilities for testing and automation
* **📖 Documentation**: Guides, examples, and integration tutorials
* **🔧 Enhanced SDKs**: Language-specific SDKs with type safety
* **📊 Monitoring Tools**: Logging, metrics, and debugging utilities

## **End to End Example Flow**

**Scenario**. A text analysis AI agent that implements REST-AP endpoints.

1. **Discovery**

   `GET /.well-known/restap.json`

   Returns the catalog showing available capabilities.

2. **Talk**

   `POST /talk`

   ```json
   {"message": "What can you do?"}
   ```

   Response:

   ```json
   {"reply": "I can echo text and reverse text. Check the catalog for details."}
   ```

   *Optional:* send `Accept: text/event-stream` to receive the reply as an SSE stream instead. See **Streaming /talk responses (optional)** and the `examples/talk-stream.js` client.

3. **Use a capability**

   `POST /text/echo`

   ```json
   {"text": "Hello World"}
   ```

   Response:

   ```json
   {"job_id": "job_1", "original_text": "Hello World", "echoed_text": "Hello World"}
   ```

4. **Agent-to-Agent Communication Flow**

   **Step 1: Agent 1 sends task to Agent 2**
   
   `POST /talk` (Agent 1 → Agent 2) - **One-directional entrypoint**
   
   ```json
   {"message": "What are best practices for buttons?"}
   ```
   
   Response (Agent 2 receives query, triggers LLM processing, responds):
   
   ```json
   {
     "query_id": "query_123",
     "status": "processing"
   }
   ```
   
   Note: `/talk` is one-directional - the client sends a query, and the agent processes it and responds with LLM output.

   **Step 2: Agent 2 sends reply to Agent 1**
   
   `POST /news` (Agent 2 → Agent 1)
   
   ```json
   {
     "type": "reply",
     "from": "agent-b",
     "in_reply_to": "query_123",
     "message": "Best practices: Use clear labels, proper contrast, adequate spacing."
   }
   ```
   
   Response (Agent 1 receives this, **no processing triggered**):
   
   ```json
   {
     "status": "received",
     "news_id": "news_1",
     "message": "Message stored successfully"
   }
   ```

   **Step 3: Agent 3 checks what Agent 2 has been working on**
   
   `GET /news` (Agent 3 → Agent 2)
   
   Returns any completed jobs or status updates:
   
   ```json
   {
     "items": [
       {
         "type": "job.completed",
         "timestamp": 1703012345000,
         "job_id": "job_1",
         "query_id": "job_1",
         "data": {
           "query_id": "job_1",
           "result": {"original_text": "Hello World", "echoed_text": "Hello World"}
         }
       },
       {
         "type": "reply",
         "timestamp": 1703012400000,
         "from": "agent-b",
         "in_reply_to": "query_123",
         "message": "Best practices: Use clear labels..."
       }
     ],
     "timestamp": 1703012350000
   }
   ```

   **Key Points:**
   - `POST /talk` is **one-directional** - client sends query, agent receives it and triggers LLM response
   - `POST /news` does NOT trigger processing (Agent 1 just stores the reply)
   - `GET /news` does NOT trigger processing (Agent 3 just reads what's stored)
   - `/news` is a **bidirectional** endpoint (can read and write), but never triggers work

7. **Client local function or CLI command acme news-updated()** The client may expose:

## **Security**

* Use HTTPS for all requests
* Implement appropriate rate limiting
* Validate input data on both client and server
* `session_id` is a correlation token, not authentication. It is not access control; if it gates conversation history it MUST be unguessable, and auth/authorization remains a separate concern (see **Sessions (optional)**).

## **Why REST-AP?**

REST-AP provides a standard way for AI agents to expose their capabilities:

* **Publish** capabilities automatically via `/.well-known/restap.json`
* **Enable conversations** through the `/talk` endpoint (one-directional: client sends query, agent responds with LLM output)
* **Handle task execution** via capability-specific endpoints
* **Report progress** on operations via the `/news` endpoint (bidirectional: can read and write, but never triggers processing)

Unlike plain REST APIs, REST-AP standardizes how AI agents present themselves to the world.

## **The /news Endpoint: Single Entrypoint for Reading and Writing**

The `/news` endpoint is a **single bidirectional entrypoint** that handles both reading and writing, with the critical property that **it never triggers agent processing**.

### **Reading from /news (GET)**

**GET /news** - Poll for updates (no processing)
- Read what's already happened - completed tasks, replies, notifications
- Supports `since` parameter: `GET /news?since=1703012345000` to get only new items
- Free to poll frequently (no LLM inference costs)
- Example: Agent 3 wants to know what Agent 2 has been working on → `GET /news` Agent 2

### **Writing to /news (POST)**

**POST /news** - Write messages/replies (no processing)
- Store messages/replies without triggering any agent work
- Used for sending replies back to the original sender
- Prevents infinite loops (unlike `/talk` which triggers processing)
- Example: Agent 2 sends reply to Agent 1 → `POST /news` Agent 1

### **Complete Agent Communication Flow**

```
Agent 1 → POST /talk → Agent 2
          (Agent 2 processes the request)

Agent 2 → POST /news → Agent 1  
          (Agent 1 receives reply, no processing triggered)

Agent 3 → GET /news → Agent 2
          (Agent 3 reads what Agent 2 has been working on)
```

**The Flow:**
1. **Agent 1 sends task**: `POST /talk` to Agent 2 → Agent 2 receives query, triggers LLM response (one-directional)
2. **Agent 2 sends reply**: `POST /news` to Agent 1 → Just stored, no processing (bidirectional write)
3. **Agent 3 checks status**: `GET /news` from Agent 2 → Reads updates, no processing (bidirectional read)

This design ensures that:
- `/talk` is **one-directional** - client sends query, agent responds with LLM output
- `/news` is **bidirectional** - can read (GET) and write (POST), but never triggers agent work
- `/news` is purely passive - it's a communication channel that doesn't trigger any agent processing, making it safe for bidirectional communication without infinite loops

## **For AI Agents**

REST-AP enables AI agents to expose their capabilities in a standardized way:

1. **Publish capabilities** via `/.well-known/restap.json` for easy discovery
2. **Handle conversations** through the `/talk` endpoint (one-directional: receive queries, trigger LLM responses)
3. **Execute tasks** via capability-specific endpoints
4. **Report progress** on long-running operations via `/news` (bidirectional: can read and write, never triggers processing)

Any REST-AP compliant agent can be immediately discovered and used by other systems.

## **REST-AP + Packages = Complete AI Agent Ecosystem**

REST-AP enables AI agents to expose their capabilities, while packages provide different integration approaches:

1. **Agent Implementation**: REST-AP defines how agents expose capabilities via HTTP endpoints
2. **Package Types**: Different package types (`claude-plugin`, `npm-package`, etc.) for various integration needs
3. **Enhanced Tooling**: Full SDKs, CLI tools, and monitoring for agent developers

This combination creates a complete ecosystem where AI agents can easily expose their capabilities and clients can choose the most appropriate integration method.  