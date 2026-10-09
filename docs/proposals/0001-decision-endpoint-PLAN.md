# Proposal 0001: optional decision endpoint — review plan

Status: proposed; implementation and release await Prem's review and feedback.
Date: 2026-10-09. Owner: restap. Task: `plan-decision-extension`.
Baseline: local `main` at `5d7222692a0d1c53fbb03091b94de6c732cac2bc`.

The companion [memo](0001-decision-endpoint.md) is Prem's original text, copied byte-for-byte. This change contains only that memo and this plan. It does not amend the specification, implement the endpoint, bump a version, or add tests. The explicit proposals destination takes precedence over the general `output/` artifact convention for these two requested documents.

## 1. Repository findings

- `README.md` is the specification, headed `0.1.4-beta`. It defines fixed paths relative to an agent base URL, capability catalogs, optional talk SSE and sessions, and passive news. Its Non-Goals exclude tool invocation and orchestration; selection needs an explicit scope clarification.
- `src/types.ts` contains `RestapCatalog`, `Capability`, talk/news types, and discovery adverts. Schemas are optional `any` fields on `Capability`; there is no decision metadata or schema module.
- `src/server.ts` is the Express reference server, with a module-level app and catalog, global `express.json()`, inline capability schemas, and handwritten checks. There is no schema validator, backend abstraction, provider dependency, auth middleware, or rate limiter. The exported default app and test-aware listener guard are used by tests.
- `src/server.test.ts` uses Vitest/Supertest, including fresh module imports to toggle streaming. It covers discovery, talk, SSE negotiation, session echo/mint/rejection, news, echo/reverse, and health. `vitest.config.ts` runs in Node. `tsconfig.json` includes `src/**/*`, excludes tests from the production build, and permits JSON imports.
- Read all seven `examples/*.js`, `example-plugin/lib/client.js`, plugin documentation, and `test-server.sh`. Most examples print illustrative exchanges; `talk-stream.js` calls a server using `BASE_URL`. The shell suite targets a running server and checks basic endpoints; it is not sufficient contract validation. `npm start` runs the illustrative demo, while `npm run dev` starts the actual server.
- Version drift already exists: package/README `0.1.4-beta`; README catalog, reference catalog, and discovery/demo examples `restap_version: "1.0"`; health and lockfile root versions `0.1.0`. Tests assert the old discovery and health strings. Recent commits use patch beta increments for clarifications; there is no separate release policy file in the tracked inventory. `SessionsAdvert` also lacks the README's news `required` flag. Record these discrepancies; do not fold unrelated session behavior repairs into this extension.

## 2. Exact specification edit plan

Apply the following only after review, using the memo as the contract baseline.

| README location | Proposed edit |
| --- | --- |
| Header and RESTAP ERC-8004 service example | Set the approved beta version consistently; update the specification date at implementation/release time. Do not change other protocols' or example packages' versions. |
| Abstract, Goals, High Level Architecture | Describe discovery, conversation, passive news, and advertised capabilities accurately; add optional bounded action selection. Avoid implying that every agent must implement decisions. |
| Non-Goals | Add: “Selecting one caller-supplied, fully specified action is in scope through the optional `/decision` capability. Executing the selected action remains the caller's responsibility; RESTAP does not define tool invocation or execution orchestration.” Preserve existing exclusions and SSE presentational-event semantics. |
| After Minimal Endpoint Set | Add an **Optional standard capabilities** subsection listing `POST /decision`; explicitly keep it out of the minimum compliance requirements. Agents without it remain compliant. Clients discover support before use. |
| Advertising a RESTAP Agent | Add `{base}/decision` for agents advertising `decision`, including a nested-base example. Preserve the base URL itself as the advertised service endpoint. |
| Before Streaming /talk responses | Add **Decision selection (optional)**, with request/response tables, complete exchanges, context/image handling, action semantics, discovery, errors, and caller reliability rules below. Clarify that decision responses are complete JSON and only talk supports SSE. |
| The Catalog Document | Show a decision-enabled example entry containing the actual request/response JSON Schema objects and deployment metadata; label the entry optional. Include an example without this entry. |
| Capability Fields | Add capability-local `decision?: DecisionAdvert`; explain all five metadata fields and their units. Do not put decision metadata in top-level `protocols`, and do not add a discovery endpoint. |
| End to End Example Flow | Link the runnable harness and show observation → selection → caller validation/execution → next observation. |
| Security, Why RESTAP?, For AI Agents | Add caller-held execution permissions, bounded untrusted observations, and optional selection; preserve talk/news/session rules and avoid implying automatic execution. |

### Request and response contract to specify

`POST {base}/decision`, `Content-Type: application/json`, complete JSON response. Required request fields are `id`, `context`, and `actions`.

| Field | Normative contract from memo |
| --- | --- |
| `id` | Nonempty string; caller-generated correlation for the exact observation and offered choices. Echo unchanged. No session semantics, authentication, entropy requirement, deduplication, or determinism guarantee. |
| `context` | Object; at least one known field must carry content. Unknown optional fields alone cannot satisfy this rule. |
| `context.text` | Optional string; nonblank text counts as content. |
| `context.images` | Optional array of inline base64 image data URLs; one valid image counts as content. No HTTP fetching. Image-capable agents support PNG; JPEG/WebP only when advertised. |
| `context.state` | Optional JSON object; at least one property counts as content. Preserve nested JSON values, arrays, nulls, booleans, and numbers. A top-level array/null is not an object for this field. |
| `context.events` | Optional string array; at least one nonblank event counts as content. |
| `actions` | Nonempty array of complete choices. Each has a nonempty string `id` and nonempty string `description`; IDs are unique by exact case-sensitive equality and opaque. No global vocabulary, executable payload, or argument generation. |

Empty optional fields can coexist with another meaningful context field; malformed defined fields must still be rejected. Ignore unknown optional properties without dropping any defined supplied context. Application-specific observations belong in `context.state`. Do not trim or normalize IDs. The memo says nonempty for IDs/descriptions but nonblank for text/events; whitespace handling is a review question below.

The only standard success fields are `id` and `action`: HTTP 200 `{"id":"decision42","action":"north"}` or `{"id":"decision42","action":null}`. `action` must equal an offered ID or JSON null. Empty string and string `"null"` are not substitutes for null; see the opaque-ID ambiguity below. Responses set `Cache-Control: no-store`; propose that header on decision errors too. No explanations, provider metadata, scores, streaming, callbacks, batches, tool calls, or new session fields. Explicit `wait` is a real action; null means a completed process with no selection, never timeout/failure.

The spec must require harness correlation with outstanding, unconsumed request IDs, current-state/legal-action revalidation before execution, a new ID on changed context/actions, and at-most-one accepted execution per ID. Same-request retries may repeat inference and return different choices. Late, stale, unknown-ID, and consumed-ID responses cannot execute. On an execution timeout with unknown outcome, reconcile with the environment or its idempotency facility before retrying. Decision IDs alone do not provide exactly-once execution.

### Discovery entry and metadata

Use `id: "decision"`, `title: "Choose an action"`, `method: "POST"`, `endpoint: "/decision"`, `description: "Choose one supplied action from the given context."`, and `content_types`/`output_formats` both `["application/json"]`. Attach the real `input_schema` and `output_schema` exported by the implementation, plus:

```json
{
  "decision": {
    "image_mime_types": ["image/png"],
    "max_images": 1,
    "max_image_bytes": 5242880,
    "max_request_bytes": 8388608,
    "max_actions": 32
  }
}
```

Propose these as reference deployment defaults, never protocol constants or claims about provider limits. Define `max_images` as a nonnegative integer, `max_actions` and `max_request_bytes` as positive integers, and `max_image_bytes` as a nonnegative integer, positive when images are supported. `max_image_bytes` counts each decoded image; `max_request_bytes` counts the encoded JSON HTTP body, including base64 overhead, not HTTP headers. All published limits must match enforcement and backend support. Propose requiring all five fields whenever the capability is advertised. No-image agents publish `image_mime_types: []`, `max_images: 0`, and `max_image_bytes: 0`; no-image requests remain valid. No new metadata fields are silently added to express text/state/events support; see review question 4.

### Error table

Preserve the memo's HTTP statuses and small `{"error":"code"}` shape. The exact snake-case codes below are proposed additions for review, except the memo's example `unsupported_image_format`.

| HTTP | Meaning | Proposed code(s) |
| --- | --- | --- |
| 400 | Invalid JSON/types, missing required fields, empty context/actions, duplicate IDs, malformed data URL/base64/image | `invalid_request`, `empty_context`, `duplicate_action_id`, `invalid_image` |
| 401 / 403 | Deployment authentication / authorization failure | Existing deployment codes; do not invent protocol authentication |
| 413 | Full encoded body or per-image decoded byte limit exceeded | `request_too_large`, `image_too_large` |
| 415 | Unsupported request Content-Type | `unsupported_media_type` |
| 422 | Unsupported supplied input/MIME, too many images/actions | `unsupported_context_input`, `unsupported_image_format`, `too_many_images`, `too_many_actions` |
| 429 | Agent's own rate limit reached | `rate_limited` |
| 502 | Invalid/missing backend answer, wrong type, unknown/unusable choice | `invalid_backend_response` |
| 503 | Backend unavailable, including transport/service/configuration failure | `decision_backend_unavailable` |
| 504 | Agent's backend deadline expires | `decision_timeout` |

Return no success-shaped action on errors; do not leak provider bodies or credentials. A provider authentication failure is an agent backend issue (503), not caller 401. Propose provider quota/rate exhaustion as 503; reserve 429 for agent rate limiting. Define single-failure fixtures and deterministic validation ordering rather than requiring all errors at once. Proposed additions needing approval: disabled route 404 and unacceptable response media 406 (e.g. SSE-only Accept); neither is in the memo's table. No auth/rate-limiter implementation is implied by documenting deployment statuses.

## 3. Version proposal

Recommend **`0.2.0-beta`**, pending Prem's explicit approval of this minor bump. This is a new optional standard capability with a public contract and discovery metadata, not a clarification; retain the beta suffix and avoid suggesting a stable 1.0 release. Existing beta patch history makes `0.1.5-beta` a defensible alternative if Prem prefers that policy. Do not infer a minor bump is already authorized. No major bump is proposed; any minor/major release needs Prem's approval.

After approval, align the README header/service/catalog examples, `package.json`, root entries in `package-lock.json`, `src/server.ts` catalog and health, `examples/discovery.js`, `examples/demo.js`, and corresponding version assertions in `src/server.test.ts`. Prefer a shared server version constant over repeated literals. Do not rewrite historical proposal baseline versions, independent plugin/package examples, MCP/A2A versions, or dependency versions. The `1.0` discovery correction is observable and may affect strict clients: explicitly approve it and record it in release notes, with capability-based detection recommended over version equality. Never describe this correction as byte-for-byte discovery compatibility.

## 4. Types, schemas, validation, and routing

Proposed implementation locations (none created by this planning change):

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Add recursive `JsonValue`/`JsonObject`, `DecisionContext`, `DecisionAction`, `DecisionRequest`, `DecisionResponse`, `DecisionAdvert`; optional `Capability.decision`. Keep provider types out of public types. |
| `src/decision/schemas.ts` | Export draft-07 request, response, and metadata JSON Schema objects. Parameterize advertised array/count limits from validated configuration. Reuse these exact objects in discovery and structural validation. |
| `src/decision/validation.ts` | Compile schemas with Ajv (new runtime dependency); validate unknown input without coercion, defaults, or deleting optional properties. Perform cross-field, byte, image, and request-dependent response checks. |
| `src/decision/backend.ts` | Provider-neutral interface, typed internal failure categories, cancellation contract. |
| `src/decision/openai.ts` | OpenAI Decisions translation and provider response/error validation, injected transport. |
| `src/decision/router.ts` | Decision-only negotiation, bounded parsing, validation, timeout, response/error handling. |
| `src/server.ts` | Wire optional backend/router and catalog entry from one configuration object; retain existing default app export and direct-run behavior. |

Schema specifics: required keys, string `minLength: 1`, actions `minItems: 1`, typed optional arrays/objects, context `anyOf` for text matching non-whitespace, images `minItems: 1`, state `minProperties: 1`, or events `contains` a nonblank string. Allow additional properties for forward compatibility at standard object boundaries. Response schema requires a nonempty `id` and `action` of string or null; runtime checks constrain the string to offered IDs and compare the exact correlation ID. `uniqueItems` cannot enforce uniqueness by action ID, decoded bytes cannot be counted from a JSON string schema, and a static response schema cannot enumerate each request's choices: implement these explicitly and test schema/runtime agreement.

Validate data URL syntax and strict base64 before decoding; enforce byte ceilings before large allocation where possible, check the claimed MIME against content, and reject malformed images. No URL fetch, truncation, image dropping, or automatic conversion to text. Account for valid base64 padding and UTF-8 JSON byte length. For an initial implementation propose uncompressed request bodies only (`inflate: false`, unsupported encoding 415), so the advertised full-body limit has one meaning; this restriction requires review. Bound incoming chunked bodies, not only Content-Length.

Route integration: add a small `createApp(options)` injection seam while retaining `export default app`; keep job state per app instance. Default decision support off. Propose `RESTAP_DECISION=on` with configured backend/model/credentials for the direct-run server, and explicit backend injection for tests. A valid enabled configuration both mounts the route and appends the catalog entry. Off means no entry and 404. Fail an explicitly enabled but invalid configuration clearly at startup; do not advertise a capability that cannot be configured. A later provider outage returns 503 without pretending the configured capability disappeared.

Mount the decision router after CORS but **before** the existing global JSON parser, with its own limits and route-local parser error handler. The current generic parser must not reject screenshots first, and its limits/behavior on existing routes must remain unchanged. Route-local error handling must produce JSON 400/413/415 instead of Express HTML. Ensure disabled decision requests also bypass generic body parsing before their 404. Express 4 async handlers need explicit rejection forwarding/catching. Use an abortable deadline, cancel on disconnect, and reject a late completion even if a backend ignores cancellation; one request can write at most one terminal response. Do not store decisions in the jobs map, publish news, mint sessions, or execute actions.

## 5. Replaceable backend and OpenAI verification

Proposed internal shape:

```ts
interface DecisionBackend {
  decide(
    input: { context: DecisionContext; actions: readonly DecisionAction[] },
    options: { signal: AbortSignal }
  ): Promise<{ action: string | null }>;
}
```

Server-owned configuration supplies validated advertised limits consistent with backend abilities. Keep correlation IDs at the RESTAP boundary. A stub, Sage, Jev pipeline, or vision model can implement the same interface; replacing one must not change the wire contract. Provider credentials stay with the agent. Treat backend output as untrusted even when TypeScript or the provider constrains it; recheck action membership at the route boundary.

### Official documentation checked on 2026-10-09

The [official Decisions guide](https://developers.openai.com/api/docs/guides/decisions) confirms dedicated `POST /v1/decisions`, `model`/`input`/`questions`, named choice questions, image parts, and refusal answers. It identifies public beta with `gpt-6-luna` and JavaScript SDK 7.30.0 or later. Those are implementation facts to recheck before coding, not RESTAP requirements.

The fetched [TypeScript create reference, Markdown version](https://developers.openai.com/api/reference/typescript/resources/decisions/methods/create.md) specifies **2–255 unique choices**, values of **string or boolean**, up to **128 images**, `input_image.image_url`, and an `answers` array with a named `choice` or `refusal`. It allows inline data URLs **and public HTTP(S) URLs**, unlike the memo's provider description. HTML/search views of the Python/CLI docs and the TypeScript resource overview also showed inline-only language, while the fetched [Python create Markdown](https://developers.openai.com/api/reference/python/resources/decisions/methods/create.md) allowed URLs. This documentation inconsistency is unresolved; RESTAP deliberately remains inline-only regardless. No live API call or account availability check was performed.

### Adapter design and differences needing review

- Serialize text, state JSON, and events into separately labeled text context; preserve all supplied values. Put each screenshot in an actual image part, not base64 prompt text. Put selection instructions in one named choice question. Treat observations as evidence, never execution authority.
- Map each RESTAP action ID to a provider choice value with its description. Extract the single expected answer by validated name/type; reject missing, multiple, mismatched, or malformed answers. Drop provider confidence/usage from the public response.
- **Memo gap:** a one-action request is valid RESTAP but cannot map directly to a one-choice provider question. Literal null is not a documented choice value. Proposed adapter policy, requiring approval: append a typed boolean `false` choice meaning “no selection,” mapped internally to RESTAP null. All caller IDs remain strings, so even `"false"` cannot collide. This preserves one named choice question and supports singleton actions without bypassing inference. Cap RESTAP choices at 254 for this adapter (default 32), leaving room for abstention. Do not reserve a caller string ID or return a boolean on the wire. An alternative is a singleton predicate path with a separate threshold policy; do not choose it silently.
- Map explicit provider refusal to null as allowed by the memo; propose no confidence threshold by default. The abstention sentinel is an intentional backend policy, not an additional caller action or an automatic wait. Timeouts, malformed answers, and transport errors are never null.
- Prefer Node's existing native `fetch` initially, injected for mocks, with the verified HTTP payload; this avoids a new OpenAI SDK requirement and fits the repo's Node >=18 baseline. If using the SDK instead, verify its engine requirement and use a Decisions-capable version. Neither approach may silently raise the runtime minimum. Add Ajv for shared schema validation independently of this choice.
- Keep provider errors sanitized, bound response reading, and disable hidden automatic retries initially. Apply a configurable deadline (propose 30 seconds), abort fetch on cancellation, and test deadline precedence. Log only operational metadata; no API keys, image bodies, private context, or reasoning traces. Provider request identifiers may remain internal.

## 6. Example harness

Propose `examples/decision/` with a small paused grid environment, a browser canvas renderer, and a RESTAP-only harness. Use a fixed vocabulary `north`, `south`, `east`, `west`, `wait`; offer the currently legal subset with complete one-tile/one-turn descriptions. Keep execution functions in a private local map. State includes visible grid/position, turn/revision, objective, and units; events carry the preceding control's result. The harness must never require OpenAI credentials or provider-specific payloads.

Capture the rendered board with canvas `toDataURL('image/png')` for each observation, include structured state and objective in the same request, and keep an illustrative screenshot asset for README documentation. This is a real current-state render, not an unrelated stock image. Use a dev-only static host/runner and `BASE_URL` configuration; discovery is appended to the full base path, not resolved in a way that discards nested paths. Add a runnable demo command and instructions distinguishing mock and live agent modes.

Separate the harness's correlation/execution logic into an importable module (proposed `examples/decision/harness.js`) and test it under Vitest without a browser. Track immutable request snapshots, pending/consumed IDs, deadlines, and world revision. Atomically consume an accepted ID before executing; null pauses by default while wait advances a turn. Check legality against the current environment, discard stale results, and request fresh context. Handle duplicate/late responses and unknown execution outcomes explicitly. Demonstrate at least two observations so the second contains the first action's outcome. Save generated screenshots/transcripts under `output/decision-demo/` during implementation verification; do not generate the harness or a screenshot in this planning-only change.

## 7. Acceptance tests: one row for each memo row

All ordinary tests use injected stubs or mocked provider HTTP. No credentials/network are required. Proposed suites: `src/decision/validation.test.ts`, `src/decision/router.test.ts`, `src/decision/openai.test.ts`, `examples/decision/harness.test.js`, plus regression additions to `src/server.test.ts`.

| # | Memo acceptance check (same order) | Focused test and expected result |
| --- | --- | --- |
| 1 | Text or state request | Parameterize text-only/state-only and mixed inputs; stub offered action and null. Assert 200, exact id/action, JSON, no-store. Include singleton actions and nested state preservation. |
| 2 | Screenshot request | Real small PNG fixture with text/state/events; capture mock provider request and assert image part plus preserved text/JSON/events. Also accept image-only; no base64 text substitution. |
| 3 | Events-only request | Nonblank event accepted with 200; blank-only events fail context validation. Mixed blank/nonblank events preserve content. |
| 4 | Empty context or duplicate action IDs | Empty/missing context, empty actions, duplicate ID with differing descriptions → 400 and zero backend calls. Case-distinct IDs remain distinct. |
| 5 | Unsupported screenshots or advertised limits exceeded | Table-driven unsupported MIME/no-image backend/count/action ceilings → 422; full-body/decoded-byte ceilings → 413; malformed images → 400. Test exact boundaries, multibyte body, base64 overhead, chunked requests, advertised values, and no backend call/context loss. |
| 6 | Backend returns an unknown action | Unknown string, missing action, unexpected type/name, malformed JSON/answer array → 502, never 200/null; validate after stub replacement too. Test string `"false"` versus boolean sentinel mapping. |
| 7 | Backend timeout or failure | Fake timers/deferred backend/failing HTTP → 504 or 503; bad upstream response → 502. Assert abort, one terminal response, zero harness executions; no provider body leakage. |
| 8 | Explicit wait versus null | Stub wait executes exactly one no-op turn; stub null pauses with no control execution. Explicit refusal and approved abstention policy produce null; malformed output cannot. |
| 9 | Retry or late response | Deliver duplicate and reordered responses with different choices for one id; only first accepted response executes. Unknown, expired, consumed IDs never execute. Unknown execution outcome is reconciled before any control retry. |
| 10 | Environment changes while deciding | Advance revision/change legality before deferred answer resolves; old answer cannot execute, new context/actions get a fresh id, next events describe outcome. |
| 11 | Backend replaced by a test stub | Run the same HTTP fixtures against two injected backend implementations and mocked OpenAI adapter. Same request/response/error invariants and correct enabled discovery. |
| 12 | Existing RESTAP clients | Run legacy suites with decisions off/on, streaming off/on; assert legacy talk/news contracts and old-client capability selection. Disabled decision omitted/404, enabled schemas/metadata valid, unknown optional catalog fields safely ignored. |

Additional cases: all required-field/type errors, defined-but-empty versus unknown context, unknown optional properties, ID exact echo and case sensitivity, all error statuses at the applicable deployment boundary, Content-Type with charset, Accept absent/wildcard/JSON/SSE-only, parser HTML-to-JSON conversion, request cancellation, and schema examples validated with the same schema. Test that decision calls never add news, execute controls, or create sessions. Check the proposed singleton/abstention resolution against mocked real provider shapes.

Backward compatibility specifically includes talk's JSON defaults, SSE sequence, 406/fallback behavior, session mint/echo/invalid-ID errors; news GET filtering and POST storage acknowledgement without conversational reply or streaming; unchanged echo/reverse; existing packages/protocols/catalog fields; default server startup without provider credentials. Discovery may add an entry only when enabled, and existing clients must find by id instead of requiring a fixed count. Version string changes are the explicit exception described in section 3. Preserve existing session-scoped-news specification requirements without adding them to the demo as unrelated work.

Future verification commands: `npm run test:run`, `npm run build`, then `test-server.sh` against an isolated local reference server (off/on), and the mock browser demo. Do not aim the shell suite at the manager or another live agent. Browser verification checks a captured board, structured state, a control, and next-turn outcome. Existing example-plugin module-format issues, if encountered, should be reported separately rather than repaired in this extension.

Optional live smoke: an explicit opt-in command outside the default suite, with server-side credentials and model configured. Capture a real board PNG, submit it with state through RESTAP to the OpenAI adapter, validate and execute an offered action, and send the next observation. Check invariants, never a predetermined model choice or latency SLA. A refusal is protocol-valid but does not complete the demonstration's action-execution criterion; report it as inconclusive. Skip cleanly when credentials are absent, bound turns/cost/time, and retain only redacted artifacts. No live test is run for this plan.

## 8. Questions for Prem and proposed resolutions

1. **Version and discovery drift:** approve `0.2.0-beta` and alignment of legacy `1.0`/`0.1.0` literals, or prefer `0.1.5-beta` / separate discovery-version policy? Minor/major approval is explicitly required. Recommendation: aligned 0.2 beta with migration note.
2. **Singleton actions and null:** approve the internal boolean abstention option (and 254-action adapter ceiling), refusal → null, and no default confidence threshold? This expands the memo's direct choice mapping but leaves RESTAP unchanged. Rejecting singleton RESTAP requests or adding a caller-visible sentinel would contradict the memo.
3. **Opaque IDs:** may an offered action literally have id `"null"`? The memo allows opaque nonempty IDs but also says not to use the string `"null"`. Recommend forbidding its use as an absence marker, while permitting it when it is an actually offered action; Prem must clarify before normative text. Also confirm nonempty IDs/descriptions retain whitespace semantics rather than silently imposing nonblank validation.
4. **Supported non-image context:** the memo permits rejection of unsupported inputs but its metadata only advertises image support. Recommend text/state/events support mandatory for decision agents, leaving images optional; alternatively design an explicit support advert. This is a proposed clarification, not an assumed existing requirement.
5. **Discovery requirements/defaults:** require all five metadata fields and schemas for a decision entry? Approve PNG-only, 1 image, 5 MiB decoded image, 8 MiB encoded request, 32 actions as configurable demo defaults, with no-image byte limit zero? These remain deployment settings.
6. **HTTP details:** approve the proposed snake-case codes, 404 disabled, 406 incompatible Accept, strict malformed-image 400, uncompressed-body baseline, and provider rate exhaustion → 503? The memo does not settle these details; do not treat them as approved amendments.
7. **Delivery choices:** approve Ajv as the shared schema validator, native fetch for the adapter, off-by-default opt-in configuration, and the small browser grid demonstration? A real game/MCP execution integration remains outside this first implementation.

No disagreement with the memo's fundamental separation: the agent selects and the caller executes. The material contract gaps are the singleton backend mapping, discovery support expressiveness, and opaque `"null"` ID interpretation. Resolve these before implementation, not by changing Prem's memo.

## 9. Proposed order and size

| Order | Work after approval | Estimate |
| --- | --- | --- |
| 1 | Resolve questions; finalize README contract/version policy and examples | 0.5–1 day |
| 2 | Types, shared schemas, semantic validation and boundary tests | 1–1.5 days |
| 3 | Backend seam, route/parser/deadline integration, conditional discovery | 1 day |
| 4 | OpenAI adapter, provider mapping/error/refusal tests | 0.5–1 day |
| 5 | Grid harness, capture/state loop, stale/retry/execution tests | 1–1.5 days |
| 6 | Compatibility matrix, build, documentation/demo review, optional live smoke | 0.5–1 day |

Total: roughly **4.5–7 engineering days** after decisions, excluding review wait or provider-access delays; medium-sized extension, approximately 12–18 implementation/test/example files plus README/package/version edits, around 1,000–1,600 lines including tests and harness. A larger game integration or new deployment auth/rate limiting would be separately scoped. Keep implementation commits reviewable by stage, with tests accompanying each stage. Do not push, merge, release, or implement as part of this planning task.
