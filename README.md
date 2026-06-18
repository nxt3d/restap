# **RESTAP: REST Agent Protocol**

**Author:** Prem Makeig @nxt3d
**Version:** 0.1.2-beta
**Date:** 11/8/2025

## **Abstract**

RESTAP is a protocol for AI agents to expose their capabilities via standard HTTP endpoints. Instead of building custom APIs for each agent, RESTAP provides a uniform interface that makes any AI agent discoverable and usable by other systems. Agents implement three core endpoints: discovery, conversation, and task execution.

## **Goals**

* Enable AI agents to expose their capabilities via simple HTTP endpoints.

* Provide a standard way for agents to advertise their capabilities for discovery.

* Enable other agents, applications, and humans to interact with AI agents reliably.

* Support optional skill packages that help clients effectively use agent capabilities.

## **Non‑Goals**

* Defining a new transport. Use HTTP and HTTPS.

* Replacing existing auth methods. Use whatever works for your use case.

* **Defining tool invocation, long-running task orchestration, async job handling, or agent-to-agent delegation.** These belong to MCP, A2A, or other protocols an agent advertises. RESTAP stays minimal and focused: it standardizes discovery, a one-directional `/talk` entrypoint, and a passive `/news` channel. The optional streaming `tool.*` and `artifact` events (see below) are presentational hints for rendering progress, **not** a tool-invocation protocol.

* **Defining session management.** The optional `session_id` (see **Sessions (optional)**) is just an opaque continuity token. RESTAP does not define session create/delete endpoints, a session-management API, mandatory persistence/TTL, or auth-bound sessions — those would make it stateful orchestration, which is out of scope.

## **Key Concepts and Terms**

**Capabilities as Endpoints**. In RESTAP, a capability maps directly to a concrete HTTP endpoint. Each capability specifies the HTTP method, endpoint path, input/output schemas, and other metadata needed for proper API interaction.

* **AI Agent**. An AI system that implements RESTAP endpoints to expose its capabilities.

* **Client**. Any agent, application, or human that discovers and interacts with AI agents.  
  
* **Capability**. A declared operation with input/output description. For example, image.upscale.

* **Skill**. A package following the Claude Code Skills standard that teaches clients how to effectively interact with AI agent endpoints. Skills use the exact same `SKILL.md` format as Claude Code Skills.

* **Catalog**. A JSON document listing available capabilities and their endpoints.

## **High Level Architecture**

RESTAP defines how AI agents expose their capabilities through standard HTTP endpoints.

1. **Discovery**. Agents publish their capabilities via `/.well-known/restap.json` for clients to discover.

2. **Talk**. Agents implement `POST /talk` as a one-directional entrypoint where the agent receives queries and triggers an LLM response. The client sends a message, and the agent processes it and responds.

3. **Execute**. Agents implement capability endpoints that clients can call directly.

4. **News**. Agents implement `/news` as a single bidirectional endpoint for reading and writing updates. Unlike `/talk`, `/news` **never triggers a reply** — the agent may read, store, or even act on the content internally, but it never sends a response back, which is what keeps agents from looping.

### **Minimal Endpoint Set**

* `GET /.well-known/restap.json` - Discovery
* `POST /talk` - One-directional entrypoint (client → agent, triggers LLM response)
* `/news` - Single bidirectional endpoint:
  * `GET /news` - Read updates (read-only; no reply)
  * `POST /news` - Write messages/replies (the agent may act on them, but never replies)
  * `/news` MAY be **session-scoped**: a server whose updates are per-conversation (not global to the agent) MAY require a `session_id`. If it does, it MUST declare this in discovery and reject requests that omit it with `400 {"error":"missing_session_id"}` (see **Sessions (optional)**).

### **Key Difference: /talk vs /news**

The critical distinctions between `/talk` and `/news`:

| Endpoint | Direction | Sends a Reply? | Reaches the LLM? | Use Case |
|----------|-----------|----------------|------------------|----------|
| `POST /talk` | **One-directional** (client → agent) | ✅ **Yes** - the agent replies with LLM output (optionally streamed via SSE; supports `session_id` continuity) | **Yes** - it *is* the prompt the agent answers | Send tasks/questions that need an answer; hold a conversation |
| `GET /news` | **Bidirectional** (read) | ❌ **No** - read-only retrieval | N/A | Poll for updates, read what's already happened |
| `POST /news` | **Bidirectional** (write) | ❌ **No - must not reply** | **Yes, as memory** - the item MAY be read by the model, and the agent MAY act on it internally (remember it, update state/a database) — it just **never sends a reply** | Deliver replies/facts the agent should absorb or act on, without triggering a reply back |

Only `POST /talk` may stream its response (optional, via SSE). `/news` never triggers a reply and never streams. See **Streaming /talk responses (optional)** below.

> **The constraint on `/news` is narrow: the agent must not *reply*.** A `/news` item MAY still reach the agent's LLM (as memory) and the agent MAY act on it internally — read it, remember it, update state or a database. The one thing it must never do is **send a reply**, because a reply could re-trigger another agent and create an endless loop. Throughout this spec, "passive" / "no processing" is shorthand for **"never sends a reply"** — it does *not* mean the model never sees the content, nor that the agent can't act on it.

**Key Points:**
- **`POST /talk`**: One-directional - client sends a query, the agent replies with LLM output
- **`/news`**: Bidirectional - can read (GET) and write (POST), but **never sends a reply**
- **Why this matters:** `POST /news` prevents infinite reply loops. When Agent A sends a reply to Agent B via `POST /news`, Agent B does not reply to it - it may read or act on the content, but it sends nothing back, so there is no loop.

## **Streaming /talk responses (optional)**

`POST /talk` TRIGGERS agent processing, and agent processing can take time. A server MAY stream its response incrementally using [Server-Sent Events (SSE)](https://html.spec.whatwg.org/multipage/server-sent-events.html) instead of waiting to return one complete JSON body.

**Streaming is OPTIONAL.** A server that does not implement it remains fully compliant by always returning `application/json`. **Streaming applies to `/talk` only.** `/news` never triggers a reply and never streams (the agent may still consume what it receives).

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

> **The optional `tool.*` and `artifact` events are presentational hints only — they are NOT a tool-invocation protocol.** RESTAP does not define how tools are invoked; that belongs to MCP, A2A, or other advertised integrations.

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

**Servers MAY be stateless.** A server that ignores `session_id` and treats every `/talk` as a fresh exchange remains **fully compliant** — continuity simply isn't guaranteed. RESTAP mandates no server-side store, no lifecycle, no expiry, and no session API.

**`session_id` is NOT authentication.** It is a correlation token, not access control. If a server uses it to gate conversation history, the token MUST be unguessable. Authentication and authorization remain a separate concern (see **Security**).

**Relation to `/news`:** sessions originate as a `/talk` concept, but a server MAY also use `session_id` to **scope `/news`** when its updates are per-conversation rather than global to the agent. A `/news` item MAY carry an optional `session_id` purely to correlate it with a thread; additionally, a server MAY **require** `session_id` on `GET /news` and/or `POST /news`. A server that requires it MUST (a) declare the requirement in its discovery document (see **Discovery**), and (b) respond `400 {"error":"missing_session_id"}` when it is omitted. Servers whose news is global to the agent SHOULD accept `/news` without a `session_id`. Either way, `/news` semantics are **unchanged** — it stays passive (the agent may act on it, but never replies), and streaming is never added to `/news`.

### **What RESTAP does NOT define (sessions)**

To stay minimal, RESTAP deliberately leaves these out of scope (they would turn sessions into stateful orchestration — see **Non‑Goals**):

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
      "description": "Poll for task completion and updates (read-only; no reply)",
      "sessions": {
        "supported": true,
        "required": true
      }
    },
    {
      "id": "news_receive",
      "title": "Receive replies",
      "method": "POST",
      "endpoint": "/news",
      "description": "Receive messages/replies from other agents (agent may act on them, but never replies)",
      "sessions": {
        "supported": true,
        "required": true
      }
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

Each entry is `{ "available": boolean, "endpoint"?: string }`. RESTAP does **not** define these protocols (MCP, A2A, etc.); the `protocols` object only tells clients which integrations the agent exposes and where to reach them. This keeps RESTAP minimal while letting agents point to richer protocols for tool invocation, task orchestration, or agent-to-agent delegation.

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

**Scenario**. A text analysis AI agent that implements RESTAP endpoints.

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
   
   Response (Agent 1 receives this; it may act on it, but **sends no reply**):
   
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
   - `POST /talk` is **one-directional** - client sends query, agent receives it and triggers an LLM reply
   - `POST /news` does NOT trigger a reply (Agent 1 may store or act on it, but sends nothing back)
   - `GET /news` is read-only (Agent 3 just reads what's stored; no reply)
   - `/news` is a **bidirectional** endpoint (can read and write), but never triggers a reply

7. **Client local function or CLI command acme news-updated()** The client may expose:

## **Security**

* Use HTTPS for all requests
* Implement appropriate rate limiting
* Validate input data on both client and server
* `session_id` is a correlation token, not authentication. It is not access control; if it gates conversation history it MUST be unguessable, and auth/authorization remains a separate concern (see **Sessions (optional)**).

## **Why RESTAP?**

RESTAP provides a standard way for AI agents to expose their capabilities:

* **Publish** capabilities automatically via `/.well-known/restap.json`
* **Enable conversations** through the `/talk` endpoint (one-directional: client sends query, agent responds with LLM output)
* **Handle task execution** via capability-specific endpoints
* **Report progress** on operations via the `/news` endpoint (bidirectional: can read and write, but never triggers a reply)

Unlike plain REST APIs, RESTAP standardizes how AI agents present themselves to the world.

## **The /news Endpoint: Single Entrypoint for Reading and Writing**

The `/news` endpoint is a **single bidirectional entrypoint** that handles both reading and writing, with the critical property that **it never triggers a reply**. The agent may read, store, or act on what arrives — it simply never sends a response back.

### **Reading from /news (GET)**

**GET /news** - Poll for updates (read-only; no reply)
- Read what's already happened - completed tasks, replies, notifications
- Supports `since` parameter: `GET /news?since=1703012345000` to get only new items
- Free to poll frequently (no LLM inference costs)
- Example: Agent 3 wants to know what Agent 2 has been working on → `GET /news` Agent 2

### **Writing to /news (POST)**

**POST /news** - Write messages/replies (never triggers a reply)
- Store messages/replies; the agent may read or act on them (remember a fact, update state), but it never replies
- Used for sending replies back to the original sender
- Prevents infinite reply loops (unlike `/talk`, which does reply)
- Example: Agent 2 sends reply to Agent 1 → `POST /news` Agent 1

### **Surfacing /news to the agent (anti-loop guidance)**

The "no reply" guarantee starts at the **protocol layer**: `POST /news` stores an item and does not synchronously invoke the agent's LLM or generate a response. But stored news is usually **surfaced to the agent later** — injected into its conversation context so the agent is aware of what other agents reported. When that content reaches the model, the anti-loop property must be preserved on the **consumption side** too: a model shown raw news can mistake it for a prompt that requires an answer, re-introducing exactly the reply loops `/news` exists to prevent.

Therefore, when an implementation surfaces a `/news` item into the agent's context, it **SHOULD** wrap the item with an automated, system-level instruction that marks it as informational-only and tells the model not to reply. For example:

> `[NEWS — informational only. Do NOT reply to this. This is context for you to consume and remember, not a message to answer.]`

**Example.** A fact is delivered to the agent via `POST /news` — say the value `"blue"` in answer to an earlier "What is your favorite color?". Storing it needs no reply. But because the item is later surfaced into the agent's context wrapped with the guard above, a subsequent `POST /talk` — "tell me my favorite color" — is answered correctly: **"blue"**. The agent consumed the news as memory without ever replying to it. This is the point of the guard: `/news` content must be able to reach the model so it informs future `/talk` answers, *without* the model treating the news item itself as a message to respond to.

This is guidance for the **consumption side** and an implementation detail — it is **not** part of the `/news` wire format and does **not** make `/news` send a reply. The HTTP contract is unchanged; the guard simply ensures the no-reply guarantee holds end-to-end, all the way to the model.

### **Complete Agent Communication Flow**

```
Agent 1 → POST /talk → Agent 2
          (Agent 2 processes the request)

Agent 2 → POST /news → Agent 1  
          (Agent 1 receives it; may act on it, sends no reply)

Agent 3 → GET /news → Agent 2
          (Agent 3 reads what Agent 2 has been working on)
```

**The Flow:**
1. **Agent 1 sends task**: `POST /talk` to Agent 2 → Agent 2 receives query, triggers LLM response (one-directional)
2. **Agent 2 sends reply**: `POST /news` to Agent 1 → Stored; Agent 1 may act on it but sends no reply (bidirectional write)
3. **Agent 3 checks status**: `GET /news` from Agent 2 → Reads updates; read-only, no reply (bidirectional read)

This design ensures that:
- `/talk` is **one-directional** - client sends query, agent responds with LLM output
- `/news` is **bidirectional** - can read (GET) and write (POST), but never triggers a reply
- `/news` never replies - the agent may consume or act on what it receives, but it never sends a response back, making it safe for bidirectional communication without infinite reply loops

## **For AI Agents**

RESTAP enables AI agents to expose their capabilities in a standardized way:

1. **Publish capabilities** via `/.well-known/restap.json` for easy discovery
2. **Handle conversations** through the `/talk` endpoint (one-directional: receive queries, trigger LLM responses)
3. **Execute tasks** via capability-specific endpoints
4. **Report progress** on long-running operations via `/news` (bidirectional: can read and write, never triggers a reply)

Any RESTAP compliant agent can be immediately discovered and used by other systems.

## **RESTAP + Packages = Complete AI Agent Ecosystem**

RESTAP enables AI agents to expose their capabilities, while packages provide different integration approaches:

1. **Agent Implementation**: RESTAP defines how agents expose capabilities via HTTP endpoints
2. **Package Types**: Different package types (`claude-plugin`, `npm-package`, etc.) for various integration needs
3. **Enhanced Tooling**: Full SDKs, CLI tools, and monitoring for agent developers

This combination creates a complete ecosystem where AI agents can easily expose their capabilities and clients can choose the most appropriate integration method.  