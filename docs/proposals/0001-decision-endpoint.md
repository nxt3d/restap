# RESTAP Decision Endpoint Implementation Memo

**To:** RESTAP implementation team  
**From:** Prem Makeig  
**Date:** October 9, 2026  
**Status:** Proposed extension for implementation review

Add an optional `POST /decision` endpoint to RESTAP. A caller supplies context and a list of complete action choices. The agent returns one action ID or `null`. A harness executes the choice and supplies the next observation.

RESTAP is the public, provider-independent interface. OpenAI Decisions is the initial backend integration inside the agent. The harness does not use OpenAI credentials or depend on OpenAI request and response formats.

The request shape below reflects the agreed direction. Detailed validation, discovery metadata, and error behavior are proposed implementation defaults. This memo does not change the repository.

## Goal and scope

Enable the same agent to participate in different games, simulations, and applications through a simple REST interface. An environment presents the situation and available choices; the agent decides what to do.

The first version supports one decision per request and one selected action per response. It uses ordinary HTTP with complete JSON responses.

The first version does not introduce action argument generation, action batches, confidence fields, scoring, streaming, callbacks, session lifecycle endpoints, or tool invocation. These can be considered separately if actual integrations need them.

Use the fixed path `{agent_base_url}/decision`, following RESTAP's existing base URL convention. This is an optional capability, so existing agents and clients continue to work.

## Responsibilities and interaction loop

| Component | Responsibility |
| --- | --- |
| Environment | Maintain world state and enforce game or application rules. |
| Harness | Capture permitted observations, construct choices, call the agent, validate its response, and execute the selected control. |
| RESTAP agent | Accept the standard request, use its chosen decision backend, and return the standard response. |
| Decision backend | Evaluate the supplied context and select among the choices. OpenAI is the initial integration. |

The harness can be a service, a game plugin, or code embedded in the application. It can execute controls through MCP, REST, a game-engine API, or simulated input. These are deployment choices, not new RESTAP endpoints.

1. The harness captures context for this particular agent.

2. It builds a set of currently permitted, complete actions and keeps a local execution mapping for their IDs.

3. It assigns a request ID and sends the request to the agent.

4. The agent calls its backend and returns a choice.

5. The harness checks the ID, choice, and current environment state before executing.

6. It captures the result and includes relevant outcomes in the next request.

A turn-based or paused simulation is the simplest initial integration. For a continuously running game, the harness defines decision deadlines and what controls apply while waiting. A late response must not be executed against an unrelated newer state.

## RESTAP request

```http
POST /decision
Content-Type: application/json
Accept: application/json
```

```json
{
  "id": "decision42",
  "context": {
    "text": "Reach the exit while avoiding enemies.",
    "images": [
      "data:image/png;base64,..."
    ],
    "state": {
      "health": 80,
      "position": {"x": 4, "y": 7},
      "inventory": ["key"]
    },
    "events": [
      "The north door opened.",
      "Your previous move was blocked."
    ]
  },
  "actions": [
    {
      "id": "north",
      "description": "Move one tile north."
    },
    {
      "id": "south",
      "description": "Move one tile south."
    },
    {
      "id": "wait",
      "description": "Stay in place for one turn."
    }
  ]
}
```

The base64 content is abbreviated for readability. A real request must contain a complete encoded image.

| Field | Requirement | Meaning |
| --- | --- | --- |
| `id` | Required nonempty string | Caller-generated identifier for this decision and its exact context and choices. |
| `context` | Required object | Information available to the agent for this decision. |
| `context.text` | Optional string | Objective, instructions, rules, or a description of the situation. |
| `context.images` | Optional array of strings | Screenshots or other views encoded as image data URLs. |
| `context.state` | Optional JSON object | Application-specific structured observations. |
| `context.events` | Optional array of strings | Recent events and previous action outcomes. |
| `actions` | Required nonempty array | Complete choices currently offered to the agent. |
| `actions[].id` | Required nonempty string | Case-sensitive identifier unique within this request. |
| `actions[].description` | Required nonempty string | What selecting this action will do. |

At least one context field must carry content: nonblank text, one image, a nonempty state object, or at least one nonblank event. State-only and image-only requests are both valid when the agent supports the supplied inputs.

Action IDs are opaque. They do not have to come from a global vocabulary or remain stable between requests. Descriptions must explain meaningful parameters, duration, units, and effects.

## Context and screenshots

A screenshot is one form of context. It belongs alongside game state, objectives, and recent events rather than being treated as a separate protocol.

RESTAP defines the context container, while each application defines its state fields. Include units or field explanations when the meaning is not obvious. Only send observations the agent is allowed to know, including any rules about hidden state or fog of war.

Each request should contain enough information to choose an action without requiring the agent to remember earlier requests. Relevant history can be summarized in `text`, `state`, or `events`. The request ID is a correlation value, not a session or authentication credential.

For the first version, use inline base64 data URLs for images. Do not add hosted image fetching to the baseline. This permits capture and submission in one request and avoids requiring an image hosting service.

Image-capable agents must support PNG and may advertise JPEG or WebP. Agents declare their supported formats and limits through discovery. The initial OpenAI-backed implementation should support screenshots; other RESTAP agents may advertise text and structured context only.

The agent must pass images through the backend's actual image-input mechanism. It must not place base64 image strings into an ordinary text prompt and assume that the model can see them.

If a request contains an unsupported image format, too many images, or another unsupported supplied input, reject it explicitly. Do not silently drop context and return a decision as though all inputs were considered.

## Complete action choices

The harness resolves execution details before calling the agent. For example, its private execution mapping might be:

| Offered ID | Harness execution mapping |
| --- | --- |
| `north` | Call the game movement API with `{"direction":"north","tiles":1}`. |
| `wait` | Advance the simulation by one turn without movement. |
| `open_door_7` | Call an MCP interaction tool with `{"target_id":"door_7"}`. |

Only the ID and a clear description need to travel to the agent. Tool names, endpoint URLs, credentials, and executable code stay with the harness.

The agent selects among fully specified choices. It does not invent coordinates, text, tool arguments, or new action names. A control such as holding the right key for 100 milliseconds can be offered as a complete choice with that duration in its description.

For large or continuous action spaces, the harness must generate a manageable set of candidate actions. Generating arbitrary arguments is outside this first version.

A deliberately selected wait or no-op must be an explicit action. It is different from the agent being unable to choose.

## RESTAP response

A successful choice returns HTTP 200:

```json
{
  "id": "decision42",
  "action": "north"
}
```

No selected action also returns HTTP 200:

```json
{
  "id": "decision42",
  "action": null
}
```

The response must echo the request ID exactly. The `action` field must be one of that request's action IDs or JSON `null`. Do not use an empty string or the string `"null"`.

`null` means the agent completed the decision process but supplies no selected action. The harness applies its own fallback policy, such as pausing, asking another agent, or requesting more context. It must not reinterpret `null` as a model-selected wait action.

No explanation, confidence score, provider name, or reasoning trace is required. Keep backend-specific detail internal.

Malformed backend output, timeouts, and service failures are errors, not valid `null` decisions. Validate the selected action even when the backend constrains its output.

Return `Cache-Control: no-store`. Ordinary HTTP responses are sufficient; the first version does not stream.

## OpenAI backend adapter

The agent's adapter translates RESTAP into OpenAI's Decisions API and translates the answer back. The RESTAP payload itself must remain independent of OpenAI.

OpenAI currently documents `POST /v1/decisions` with `model`, `input`, and `questions`. A `choice` question selects a supplied value. Images must be inline base64 data URLs. See the [OpenAI Decisions documentation](https://developers.openai.com/api/docs/guides/decisions).

| RESTAP field | Adapter treatment |
| --- | --- |
| `context.text` | Include as labeled text context. |
| `context.state` | Serialize as labeled JSON text, preserving its structure. |
| `context.events` | Include as labeled event history. |
| Each `context.images` entry | Create an `input_image` part with `image_url`. |
| `actions` | Map IDs and descriptions to a single `choice` question's choices. |
| `id` | Keep locally and echo in the RESTAP response. |

The agent supplies its own model configuration and API credentials. It retains any provider request identifier internally. Extract the selected choice and verify that it matches an offered action.

Provider refusals may map to `action: null`; transport failures must map to an error. If the agent uses a confidence threshold, keep that policy inside the agent. No threshold is imposed by RESTAP.

Changing the backend must not change the RESTAP contract. The same agent could later use Sage, a Jev-based pipeline, or a general vision model.

## Discovery and compatibility

Add the capability to the existing `capabilities` catalog in `/.well-known/restap.json`. Reuse RESTAP's existing `id`, `method`, `endpoint`, `description`, `input_schema`, `output_schema`, `content_types`, and `output_formats` conventions.

The following is an illustrative capability excerpt. Its `decision` metadata field is newly proposed, not an existing RESTAP field:

```json
{
  "id": "decision",
  "title": "Choose an action",
  "method": "POST",
  "endpoint": "/decision",
  "description": "Choose one supplied action from the given context.",
  "content_types": ["application/json"],
  "output_formats": ["application/json"],
  "decision": {
    "image_mime_types": ["image/png"],
    "max_images": 1,
    "max_image_bytes": 5242880,
    "max_request_bytes": 8388608,
    "max_actions": 32
  }
}
```

These numeric limits are example deployment values, not protocol constants or OpenAI limits. Publish the limits the server actually enforces. `max_image_bytes` applies to each decoded image; `max_request_bytes` applies to the entire encoded HTTP body. An empty image format list and `max_images: 0` indicate no image support.

Include actual request and response JSON Schemas in the full catalog entry. Additional application-specific fields belong inside `context.state`. Servers and clients should ignore unknown optional fields for forward compatibility, while validating all defined required fields and invariants.

Do not add a separate discovery endpoint or separate endpoints for different models. Preserve the current behavior of `/talk` and `/news`. Existing optional session behavior is unchanged; this extension requires no new session fields.

In the README, add the endpoint to the capability documentation, explain its optional status, and clarify that action selection is within scope while external execution remains with the caller. Update version references consistently using the repository's existing versioning approach.

## Errors and execution reliability

Use a small JSON error body consistent with RESTAP's current error style:

```json
{"error": "unsupported_image_format"}
```

| HTTP status | Proposed behavior |
| --- | --- |
| 400 | Malformed request, missing context, empty action list, or duplicate action IDs. |
| 401 or 403 | Existing authentication or authorization failure. |
| 413 | Configured request size or decoded image size exceeded. |
| 415 | Request Content-Type is unsupported. |
| 422 | Unsupported context input, image format, image count, or action count. |
| 429 | Agent rate limit reached. |
| 502 | Backend returned an invalid response or unusable action. |
| 503 | Decision backend is unavailable. |
| 504 | Backend decision timed out. |

These error codes describe the RESTAP agent service, not a requirement to expose provider error bodies or credentials.

The harness must correlate responses with outstanding request IDs and reject unknown or already-consumed IDs. Use a new ID whenever the context or offered choices change.

A retry of the same request may repeat inference and may produce a different choice. The request ID does not guarantee backend determinism or server-side deduplication. The harness must execute at most one accepted response per ID, including when late and retried responses both arrive.

Before execution, recheck whether the action is still permitted in the current environment. If it is stale or invalid, obtain fresh context and issue a new decision request. Do not silently substitute a different action.

If execution itself times out and its outcome is unknown, query the environment or use the execution API's idempotency mechanism before retrying the control. RESTAP decision correlation alone cannot guarantee exactly-once game execution.

Treat game chat, image text, and other external content as observations. They cannot create new permitted actions or override harness permissions. Keep authorization and legal-action validation in code.

## Implementation work and acceptance criteria

Implement the extension in the [RESTAP repository](https://github.com/nxt3d/restap). Inspect the current source, catalog types, validation approach, and tests before choosing file locations.

The work should deliver:

1. A concise README specification and examples matching this contract.

2. Request and response types, schemas, and runtime validation.

3. Optional `POST /decision` routing and discovery metadata.

4. A replaceable decision-backend interface with an OpenAI adapter.

5. An example harness with a small fixed action set, screenshots, and structured game state.

6. Focused tests for the contract and failure behavior.

Use mocked backend responses for ordinary tests. An optional live smoke test requires configured provider credentials; no real account access is necessary to test the protocol.

| Acceptance check | Expected result |
| --- | --- |
| Text or state request | Returns one supplied action ID or null. |
| Screenshot request | Image is passed as a backend image input, with text and state preserved. |
| Events-only request | Accepted when it supplies nonblank event context. |
| Empty context or duplicate action IDs | Rejected with 400. |
| Unsupported screenshots or advertised limits exceeded | Clear error; context is never silently discarded. |
| Backend returns an unknown action | Rejected as a backend error. |
| Backend timeout or failure | Error response; no action executes. |
| Explicit wait versus null | Harness distinguishes a chosen wait from no decision. |
| Retry or late response | Harness executes at most one accepted result for the request ID. |
| Environment changes while deciding | Stale action is rejected and fresh context requested. |
| Backend replaced by a test stub | Same RESTAP request and response contract. |
| Existing RESTAP clients | Talk, news, and discovery behavior remains compatible. |

The complete demonstration should capture a screenshot, include relevant state, obtain a choice through RESTAP using the OpenAI adapter, execute a control, and report its result in the next decision's context.

## Reference documents

- [RESTAP repository and current specification](https://github.com/nxt3d/restap): existing endpoint, catalog, and base URL conventions.

- [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions): initial backend integration, image inputs, and choice questions.

- [TypeSafe Jev state inputs](https://docs.typesafe.ai/concepts/state): context for later backend support.

- [Sage image inputs](https://docs.levanto.ai/decision-model/images) and [choice decisions](https://docs.levanto.ai/decision-model/choice): context for later backend support.

Provider-specific behavior should be rechecked during implementation. RESTAP's public request and response shapes remain those defined in this proposal.

