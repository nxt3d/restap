# **RESTAP: REST Agent Protocol**

**Author:** Prem Makeig @nxt3d
**Version:** 0.2.0-beta
**Date:** 2026-10-09

## **Abstract**

RESTAP is a protocol for AI agents to expose their capabilities via standard HTTP endpoints. Instead of building custom APIs for each agent, RESTAP provides a uniform interface that makes any AI agent discoverable and usable by other systems. Agents expose discovery, conversation, and a passive news channel, alongside advertised capability endpoints. An optional `/decision` capability selects one caller-supplied action.

## **Goals**

* Enable AI agents to expose their capabilities via simple HTTP endpoints.

* Provide a standard way for agents to advertise their capabilities for discovery.

* Enable other agents, applications, and humans to interact with AI agents reliably.

* Support optional selection among fully specified actions. The caller executes the choice.

* Support optional skill packages that help clients effectively use agent capabilities.

## **Non‑Goals**

* Defining a new transport. Use HTTP and HTTPS.

* Replacing existing auth methods. Use whatever works for your use case.

* **Defining tool invocation, long-running task orchestration, async job handling, or agent-to-agent delegation.** These belong to MCP, A2A, or other protocols an agent advertises. RESTAP standardizes discovery, a one-directional `/talk` entrypoint, and a passive `/news` channel. Selecting one caller-supplied, fully specified action is in scope through the optional `/decision` capability. Executing the selected action remains the caller's responsibility. RESTAP does not define tool invocation or execution orchestration. The optional streaming `tool.*` and `artifact` events (see below) are presentational hints for rendering progress, **not** a tool-invocation protocol.

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

5. **Decision (optional)**. An advertised `POST /decision` selects one supplied action. The caller validates and executes it.

### **Minimal Endpoint Set**

* `GET /.well-known/restap.json` - Discovery
* `POST /talk` - One-directional entrypoint (client → agent, triggers LLM response)
* `/news` - Single bidirectional endpoint:
  * `GET /news` - Read updates (read-only; no reply)
  * `POST /news` - Write messages/replies (the agent may act on them, but never replies)
  * `/news` MAY be **session-scoped**: a server whose updates are per-conversation (not global to the agent) MAY require a `session_id`. If it does, it MUST declare this in discovery and reject requests that omit it with `400 {"error":"missing_session_id"}` (see **Sessions (optional)**).

### **Optional standard capabilities**

* `POST /decision` — Choose one caller-supplied action from the given context.

This endpoint is outside the minimum compliance requirements. Agents without it remain compliant. Clients MUST find `id: "decision"` in the discovery catalog before using it.

### **Advertising a RESTAP Agent**

A RESTAP agent is identified by a single **base URL**, and the endpoints above are paths off that base (`{base}/.well-known/restap.json`, `{base}/talk`, `{base}/news`), as with any standard REST API. To advertise an agent (e.g. an ERC-8004 service entry, a directory, or a link), you give just two things: the **base URL** and the type **`RESTAP`** (or `restap`). The advertised endpoint MUST be the base URL itself, not the discovery document and not a `/talk` URL. Clients MUST reach `/talk`, `/news`, and `/.well-known/restap.json` by appending those fixed paths to it. For example, a base of `https://example.com/api/agent/42` means `/talk` is at `https://example.com/api/agent/42/talk`.

**ERC-8004 service example.** In an [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent registration file (the JSON that an agent's `agentURI` resolves to), RESTAP is one entry in the `services` array, alongside services such as `MCP` and `A2A`. Set the service `name` to `RESTAP` (or `restap`) and the `endpoint` to the agent's **base URL** — not the `/talk` path, and not the discovery document:

```jsonc
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "myAgentName",
  "description": "A natural language description of the agent.",
  "image": "https://example.com/agentimage.png",
  "services": [
    {
      "name": "RESTAP",
      "endpoint": "https://example.com/api/agent/42",
      "version": "0.2.0-beta"
    },
    {
      "name": "MCP",
      "endpoint": "https://mcp.agent.example/",
      "version": "2025-06-18"
    },
    {
      "name": "A2A",
      "endpoint": "https://agent.example/.well-known/agent-card.json",
      "version": "0.3.0"
    }
  ]
}
```

A client that resolves this registration reads the `RESTAP` service's `endpoint` as the agent's base URL, then reaches the protocol by appending the fixed paths: `{endpoint}/.well-known/restap.json`, `{endpoint}/talk`, and `{endpoint}/news`. The `version` field on a service entry is a SHOULD in ERC-8004; set it to the RESTAP version the agent implements.

An agent advertising `decision` also exposes `{base}/decision`. For example, the base `https://example.com/api/agent/42` gives `https://example.com/api/agent/42/decision`. Keep the base URL itself as the advertised service endpoint.

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

## **Decision selection (optional)**

`POST {base}/decision` asks an agent to choose from complete actions supplied by the caller. The agent selects, and the caller executes. Discover `decision` in `/.well-known/restap.json` before calling it.

Send `Content-Type: application/json` with an uncompressed body. `/decision` always responds with complete JSON and does not stream. Requests without an `Accept` header, or whose `Accept` allows JSON (including `*/*`), are fine. If `Accept` excludes JSON (for example, streaming only), the agent returns 406. All decision responses, including errors, MUST set `Cache-Control: no-store`.

### **Request**

```http
POST /decision
Content-Type: application/json
Accept: application/json

{
  "id": "decision42",
  "context": {
    "text": "Reach the exit. Each move takes one turn.",
    "state": {"position": {"x": 4, "y": 7}, "revision": 12},
    "events": ["The north door opened."]
  },
  "actions": [
    {"id": "north", "description": "Move one tile north."},
    {"id": "wait", "description": "Stay in place for one turn."},
    {"id": "south", "description": "Move one tile south."}
  ]
}
```

| Field | Requirement |
| --- | --- |
| `id` | Required nonempty string identifying this exact observation and set of choices. |
| `context` | Required object. At least one of the four fields below must carry content, or the request is rejected with `empty_context`. |
| `context.text` | Optional string with the objective, rules or a description of the situation. Text that isn't blank is enough on its own, so a text-only request is allowed. |
| `context.images` | Optional list of screenshots as inline base64 data URLs. At least one valid image is enough on its own, so an image-only request is allowed. An empty list doesn't count. |
| `context.state` | Optional JSON object of structured observations (positions, readings, inventory). At least one property is enough on its own, so a state-only request is allowed. An empty `{}` doesn't count. Any nested JSON is passed through unchanged. `state` itself must be an object, not an array or null. |
| `context.events` | Optional list of recent events and previous outcomes, as strings. At least one event that isn't blank is enough on its own, so an events-only request is allowed. |
| `actions` | Required array of at least two complete choices. |
| `actions[].id` | Required nonblank string, unique within the request by exact, case-sensitive equality. The literal `"null"` is forbidden. |
| `actions[].description` | Required nonblank string explaining the action's parameters, duration, units, and effects. |

Every decision agent MUST support text, state, and events, individually and together. Only image support is optional. Empty optional fields may accompany another field with content, but malformed defined fields MUST still be rejected. Unknown optional properties MUST be ignored and cannot satisfy the content requirement. Agents MUST preserve all defined supplied context. Put application-specific observations in `state`.

IDs are opaque, so do not trim or normalize them. The request ID is only for correlation. It provides no session, authentication, entropy, deduplication, or determinism guarantee. Each request SHOULD contain enough context to stand alone, including relevant earlier outcomes.

### **Images**

* Put each image inside the request as a base64 data URL, such as `data:image/png;base64,iVBORw0KGgo...` (shortened here, so send the full image). Don't send links, because agents MUST NOT download images.
* An agent that accepts images MUST accept PNG. JPEG and WebP work only if the agent lists them in its discovery file.
* Before sending screenshots, check the agent's discovery file for the formats it accepts and how many images it allows.
* The agent MUST check that each image is valid and really is the format it claims to be.
* The agent MUST pass images to its model as real images, never as text.
* The agent MUST NOT quietly drop, cut short, or replace anything you send. If it can't use an image, or a limit is exceeded, it returns an error instead.

### **Actions**

* Each action is a complete choice with an ID and a description, for example `north` with "Move one tile north."
* Only the ID and the description go to the agent. What the action actually does, such as a game command, a tool call or an API request, stays with the caller. So do tool names, credentials, code and permissions.
* There is no shared list of action names. Each caller makes up its own IDs, and the agent never adds details to an action. It only picks one.

### **Response**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"id":"decision42","action":"north","confidence":0.71,"probabilities":{"north":0.71,"wait":0.22,"south":0.07}}
```

An explicit backend refusal instead returns `null`, as in this example.

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{"id":"decision42","action":null}
```

| Field | Requirement |
| --- | --- |
| `id` | MUST echo the request ID unchanged. |
| `action` | MUST be an exact offered action ID or JSON `null`. Empty or blank strings and the string `"null"` are invalid. |
| `confidence` | OPTIONAL backend-provided number in [0,1] for the selected action. MUST be absent when `action` is null. |
| `probabilities` | OPTIONAL object whose keys are exactly the offered action IDs, each with a backend-provided number in [0,1]. MUST be absent when `action` is null. |

Agents providing these fields MUST advertise `"confidence": true` and/or `"probabilities": true` in their capability's `decision` metadata. Absent score metadata means the field is not provided. Values MUST come from the backend. Agents MUST NOT fabricate or estimate them. If the backend supplies probabilities for only some actions, omit `probabilities` rather than inventing missing values. Values SHOULD approximately sum to 1 when the backend provides a full distribution, but an exact sum of 1 is not required. Values are agent- and backend-specific and are not comparable across agents.

These are the only standard success fields. There are no explanations, provider metadata, reasoning traces, batches, callbacks, tool calls, or new session fields.

Only an explicit provider refusal produces `null`. Agents MUST NOT add a hidden abstention choice or boolean sentinel, reserve a choice slot, or turn low confidence, timeouts, or failures into `null`. A selected `wait` is a real action, while `null` selects nothing. The caller applies its fallback policy, such as pausing or obtaining fresh context, without treating null as a selected wait.

Agents MUST validate backend output before returning it, including exact action membership. The two-action minimum is a protocol rule, not a deployment setting. Maximum counts are deployment limits. RESTAP does not impose the reference deployment's 32-action limit on other agents.

### **Errors**

Errors use a small JSON body, as in this example.

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{"error":"too_few_actions"}
```

| HTTP | Condition | `error` code |
| --- | --- | --- |
| 400 | Invalid JSON/types, missing required fields, blank action strings, or action ID `"null"` | `invalid_request` |
| 400 | No known context field carries content | `empty_context` |
| 400 | Fewer than two actions | `too_few_actions` |
| 400 | Duplicate action IDs | `duplicate_action_id` |
| 400 | Malformed data URL, base64, or image | `invalid_image` |
| 401 / 403 | Deployment authentication / authorization failure | Existing deployment codes |
| 404 | Decision endpoint disabled | `not_found` |
| 406 | Accept excludes JSON, including SSE-only | `not_acceptable` |
| 413 | Encoded JSON body exceeds byte limit | `request_too_large` |
| 413 | A decoded image exceeds its byte limit | `image_too_large` |
| 415 | Unsupported request Content-Type | `unsupported_media_type` |
| 415 | A Content-Encoding header is supplied | `unsupported_content_encoding` |
| 422 | Image input unsupported / image MIME unsupported | `unsupported_context_input` / `unsupported_image_format` |
| 422 | Too many images / actions | `too_many_images` / `too_many_actions` |
| 429 | Agent's own rate limit reached | `rate_limited` |
| 502 | Missing, malformed, wrong-type, or unknown backend choice | `invalid_backend_response` |
| 503 | Backend unavailable, including transport, service, configuration, authentication, or provider quota/rate failure | `decision_backend_unavailable` |
| 504 | Agent's backend deadline expires | `decision_timeout` |

Errors MUST NOT contain a success-shaped action or expose provider bodies or credentials. A provider authentication failure is 503, not caller 401. Text, state, and events cannot be rejected as unsupported capabilities. Deployments SHOULD use a deterministic validation order. A request with several problems need not report them all.

### **Caller reliability rules**

1. Keep an immutable snapshot of each request's context and choices. A changed observation or action set MUST get a new ID.
2. Accept responses only for outstanding, unexpired, unconsumed IDs. Reject late, stale, unknown-ID, and already-consumed responses.
3. Before execution, the caller MUST check the echoed ID, action membership, current environment state, and current action legality. Discard stale choices and request a new decision with fresh context.
4. The caller MUST accept at most one execution per ID. Atomically consume the ID before executing a selected control. A null response consumes the decision without executing a control.
5. Retries of the same request may repeat inference and return different choices. Decision IDs do not guarantee exactly-once execution. If execution times out with an unknown outcome, the caller MUST reconcile with the environment or its idempotency facility before retrying the control.
6. `action` remains THE decision, and the scores are informational. Executing anything other than `action` is the caller's own policy. The RECOMMENDED path is to request a fresh decision instead of choosing an alternative from the scores.
7. Capture the action's outcome in the next observation, for example `events: ["Moved one tile north."]` with a new state revision and ID.

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

**Identifier format and entropy.** `session_id` is opaque, but for safe and interoperable handling its shape and randomness are constrained:

* It MUST match `^[A-Za-z0-9._-]{16,128}$` — URL‑safe characters, 16 to 128 bytes. A server that receives a `session_id` outside these bounds MUST reject the request with `400 {"error":"invalid_session_id"}`, and MUST return that same error regardless of transport (JSON and SSE alike). Servers MUST NOT impose a stricter shape (for example, requiring a specific UUID layout) — any value within these bounds is valid.
* Because holding a `session_id` can grant access to a conversation's history (via `/news`), it is a **bearer capability**. A client‑generated `session_id` SHOULD carry at least **122 bits of entropy**; one that a server mints MUST. Length alone is not sufficient — the value must be unguessable, not merely long.
* RECOMMENDED encodings (either satisfies the entropy requirement):
  * a **UUIDv4** — e.g. `f3bb16ab-295c-4f32-9856-4280fd541b93`, or
  * **base64url of 16 or more random bytes** — e.g. `9Yx2pK7m-Qd0Rb3nVt1aZw`.
  * A human‑readable prefix (e.g. `sess_…`) is permitted, provided the remainder meets the entropy requirement.
* A `session_id` MUST be treated as a secret: servers MUST NOT write it to shared logs, and it SHOULD NOT be placed in request URLs where intermediaries can capture it. A server that scopes `/news` by session SHOULD also accept the `session_id` from a request header — the RECOMMENDED header name is `Restap-Session-Id` — so clients can keep it out of the query string. (Request headers apply to every method, including `GET`; only the request *body* is method‑specific.) When a server accepts both, the header takes precedence over a query parameter.

**Relation to `/news`:** sessions originate as a `/talk` concept, but a server MAY also use `session_id` to **scope `/news`** when its updates are per-conversation rather than global to the agent. A `/news` item MAY carry an optional `session_id` purely to correlate it with a thread; additionally, a server MAY **require** `session_id` on `GET /news` and/or `POST /news`. A server that requires it MUST (a) declare the requirement in its discovery document (see **Discovery**), and (b) respond `400 {"error":"missing_session_id"}` when it is omitted. Servers whose news is global to the agent SHOULD accept `/news` without a `session_id`. Either way, `/news` semantics are **unchanged** — it stays passive (the agent may act on it, but never replies), and streaming is never added to `/news`.

### **What RESTAP does NOT define (sessions)**

To stay minimal, RESTAP deliberately leaves these out of scope (they would turn sessions into stateful orchestration — see **Non‑Goals**):

* No session create/delete endpoints and no session-management API.
* No required persistence, store, or TTL/expiry.
* No auth-bound sessions; `session_id` is not a credential.

## **The Catalog Document**

This example does not advertise decision support and remains compliant.

```json
{
  "restap_version": "0.2.0-beta",
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

### **Optional decision catalog entry**

An agent supporting decisions adds this entry to `capabilities`. This example uses the planned reference deployment limits. It is not an announcement that the current reference server implements `/decision`.

```json
{
  "id": "decision",
  "title": "Choose an action",
  "method": "POST",
  "endpoint": "/decision",
  "description": "Choose one supplied action from the given context.",
  "content_types": ["application/json"],
  "output_formats": ["application/json"],
  "input_schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["id", "context", "actions"],
    "properties": {
      "id": {"type": "string", "minLength": 1},
      "context": {
        "type": "object",
        "properties": {
          "text": {"type": "string"},
          "images": {
            "type": "array",
            "maxItems": 1,
            "items": {"type": "string", "pattern": "^data:image/[A-Za-z0-9.+-]+;base64,"}
          },
          "state": {"type": "object"},
          "events": {"type": "array", "items": {"type": "string"}}
        },
        "anyOf": [
          {"required": ["text"], "properties": {"text": {"type": "string", "minLength": 1, "pattern": "\\S"}}},
          {"required": ["images"], "properties": {"images": {"minItems": 1}}},
          {"required": ["state"], "properties": {"state": {"minProperties": 1}}},
          {
            "required": ["events"],
            "properties": {"events": {"contains": {"type": "string", "minLength": 1, "pattern": "\\S"}}}
          }
        ],
        "additionalProperties": true
      },
      "actions": {
        "type": "array",
        "minItems": 2,
        "maxItems": 32,
        "items": {
          "type": "object",
          "required": ["id", "description"],
          "properties": {
            "id": {"type": "string", "minLength": 1, "pattern": "\\S", "not": {"const": "null"}},
            "description": {"type": "string", "minLength": 1, "pattern": "\\S"}
          },
          "additionalProperties": true
        }
      }
    },
    "additionalProperties": true
  },
  "output_schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["id", "action"],
    "properties": {
      "id": {"type": "string", "minLength": 1},
      "action": {
        "anyOf": [{"type": "string", "minLength": 1, "pattern": "\\S", "not": {"const": "null"}}, {"type": "null"}]
      },
      "confidence": {"type": "number", "minimum": 0, "maximum": 1},
      "probabilities": {
        "type": "object",
        "additionalProperties": {"type": "number", "minimum": 0, "maximum": 1}
      }
    },
    "if": {"properties": {"action": {"type": "null"}}, "required": ["action"]},
    "then": {"not": {"anyOf": [{"required": ["confidence"]}, {"required": ["probabilities"]}]}},
    "additionalProperties": true
  },
  "decision": {
    "image_mime_types": ["image/png"],
    "max_images": 2,
    "max_image_bytes": 5242880,
    "max_request_bytes": 8388608,
    "max_actions": 32,
    "confidence": true,
    "probabilities": true
  }
}
```

These draft-07 schemas describe structural validation. Servers MUST also check unique action IDs, valid image content/MIME and decoded byte counts, full request byte size, exact response ID, membership in the request's offered choices, and exact equality between probability keys and offered action IDs. Static schemas cannot express all of these checks. Adjust schema count limits to the deployment's actual limits.

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
* **decision**: Optional capability-local metadata (`decision?: DecisionAdvert`) for `decision`, described below. It is not a top-level `protocols` entry.

The input/output schemas use standard JSON Schema format to provide precise API contracts for clients.

### **Decision metadata (optional)**

The entire `decision` object and each of its seven fields are OPTIONAL, independently of one another. `DecisionAdvert` has no required fields. An omitted field means **not stated**. It supplies no fallback default, unlimited capacity, or support promise. For `confidence` and `probabilities`, absence means the score field is not provided. Do not infer missing metadata from another field.

| Field | Meaning and allowed value |
| --- | --- |
| `image_mime_types` | Array of supported image MIME types. Agents SHOULD publish it. Omitting it neither promises nor denies image support. |
| `max_images` | Maximum image count, as a nonnegative integer. |
| `max_image_bytes` | Maximum bytes per decoded image, as a nonnegative integer, positive when images are supported. |
| `max_request_bytes` | Maximum encoded JSON HTTP body bytes, including base64 overhead and excluding headers, as a positive integer. |
| `max_actions` | Maximum offered action count, as an integer of at least 2. It does not change the two-action minimum. |
| `confidence` | Optional boolean. `true` advertises backend confidence for the selected action. Absent or false means not provided. |
| `probabilities` | Optional boolean. `true` advertises backend probabilities for all offered actions when a complete distribution is available. Absent or false means not provided. |

Published values MUST be accurate and enforced consistently with backend support. Unpublished limits may still apply, and agents MUST reject over-limit requests with 413 or 422. A no-image agent can explicitly publish `image_mime_types: []`, `max_images: 0`, and `max_image_bytes: 0`, but none is mandatory.

The reference deployment values shown above are PNG, 2 images, 5242880 decoded bytes per image, 8388608 encoded body bytes, and 32 actions. They are deployment defaults, not protocol constants or provider limits. Text, state, and events need no support flags because every decision agent MUST accept them.

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

### **Optional decision loop**

Observe → offer complete actions → call `/decision` → validate the response and current state → execute locally → observe again. See [Decision selection](#decision-selection-optional) for the exchange and retry rules. The runnable grid harness is planned for a later implementation stage.

## **Security**

* For decisions, the caller retains execution permissions and MUST offer only permitted controls. Treat observations as untrusted input, enforce body/image limits, and share only state the agent is allowed to see. Observations cannot grant execution authority.
* Use HTTPS for all requests
* Implement appropriate rate limiting
* Validate input data on both client and server
* `session_id` is a correlation token, not authentication. It is not access control; if it gates conversation history it MUST be unguessable, and auth/authorization remains a separate concern (see **Sessions (optional)**).

## **Why RESTAP?**

RESTAP provides a standard way for AI agents to expose their capabilities:

* **Publish** capabilities automatically via `/.well-known/restap.json`
* **Enable conversations** through the `/talk` endpoint (one-directional: client sends query, agent responds with LLM output)
* **Select actions optionally** through `/decision`, with validation and execution owned by the caller
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

RESTAP enables AI agents to expose their capabilities in a standardized way. Agents MAY also advertise `/decision` to select among complete caller-supplied actions, while the caller retains execution control.

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

## **Release notes**

### **0.2.0-beta — specification stage**

Adds the optional `/decision` contract. Reference server support follows in later stages. Aligns current RESTAP version strings to `0.2.0-beta`, including discovery `restap_version`, previously `1.0`. This observable discovery change may affect strict clients, so detect capabilities by ID rather than requiring version equality.
