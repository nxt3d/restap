# Proposal 0001: optional decision endpoint — review plan

Status: review decisions final; plan revised only. Implementation and release are not part of this task.
Date: 2026-10-09. Owner: restap. Original task: `plan-decision-extension`. Revision task: `revise-decision-plan-review`.
Baseline: local `main` at `5d7222692a0d1c53fbb03091b94de6c732cac2bc`.

The companion [memo](0001-decision-endpoint.md) is Prem's original text, copied byte-for-byte. This revision changes only this plan; the memo remains byte-for-byte unchanged. Decisions 1, 3, and 5 below amend the memo and take precedence for implementation. It does not amend the specification, implement the endpoint, bump a version, or add tests. The explicit proposals destination takes precedence over the general `output/` artifact convention for the requested plan revision.

## Review decisions (Prem, 2026-10-09)

1. **At least two actions:** reject fewer than two with 400 `too_few_actions`. No hidden abstention or boolean sentinel; null comes only from explicit provider refusal. The adapter can use all 255 provider choices. This amends the memo's nonempty-action rule.
2. **Version:** approve `0.2.0-beta` and align every current RESTAP version string: README header/service/catalog examples, package.json, package-lock root entries, server catalog/health, discovery/demo examples, and tests. Prefer a shared version constant; release notes must mention discovery changing from `1.0`.
3. **Action strings:** reject the literal action ID `"null"` and blank (whitespace-only) action IDs/descriptions with 400. This amends the memo's opaque/nonempty action strings.
4. **Context support:** every `/decision` agent MUST accept text, state, and events. Only images are optional; image support is advertised in discovery.
5. **Discovery Option D:** all five `decision` metadata fields are OPTIONAL; absence means not stated, with no fallback default or promise. Published fields must be accurate and enforced; agents SHOULD publish image support and still reject over-limit requests with 413/422. The reference server publishes PNG, 1 image, 5242880 decoded bytes/image, 8388608 encoded body bytes, and 32 actions. The two-action minimum is a protocol rule, not a setting. This amends the memo's discovery requirements.
6. **HTTP:** accept snake_case error codes, disabled endpoint 404, SSE-only Accept 406, malformed images 400, uncompressed bodies only (Content-Encoding rejected with 415), and provider rate/quota exhaustion 503; reserve 429 for the agent's own limit.
7. **Delivery:** use Ajv with shared schemas, native fetch for the OpenAI adapter (no SDK), off-by-default `RESTAP_DECISION=on` plus configured backend/model/key, and the small browser grid demo. No implementation or push in this revision.

## 1. Repository findings

- `README.md` is the specification, headed `0.1.4-beta`. It defines fixed paths relative to an agent base URL, capability catalogs, optional talk SSE and sessions, and passive news. Its Non-Goals exclude tool invocation and orchestration; selection needs an explicit scope clarification.
- `src/types.ts` contains `RestapCatalog`, `Capability`, talk/news types, and discovery adverts. Schemas are optional `any` fields on `Capability`; there is no decision metadata or schema module.
- `src/server.ts` is the Express reference server, with a module-level app and catalog, global `express.json()`, inline capability schemas, and handwritten checks. There is no schema validator, backend abstraction, provider dependency, auth middleware, or rate limiter. The exported default app and test-aware listener guard are used by tests.
- `src/server.test.ts` uses Vitest/Supertest, including fresh module imports to toggle streaming. It covers discovery, talk, SSE negotiation, session echo/mint/rejection, news, echo/reverse, and health. `vitest.config.ts` runs in Node. `tsconfig.json` includes `src/**/*`, excludes tests from the production build, and permits JSON imports.
- Read all seven `examples/*.js`, `example-plugin/lib/client.js`, plugin documentation, and `test-server.sh`. Most examples print illustrative exchanges; `talk-stream.js` calls a server using `BASE_URL`. The shell suite targets a running server and checks basic endpoints; it is not sufficient contract validation. `npm start` runs the illustrative demo, while `npm run dev` starts the actual server.
- Version drift already exists: package/README `0.1.4-beta`; README catalog, reference catalog, and discovery/demo examples `restap_version: "1.0"`; health and lockfile root versions `0.1.0`. Tests assert the old discovery and health strings. Recent commits use patch beta increments for clarifications; there is no separate release policy file in the tracked inventory. `SessionsAdvert` also lacks the README's news `required` flag. Record these discrepancies; do not fold unrelated session behavior repairs into this extension.

## 2. Exact specification edit plan

Apply the following during the separately authorized implementation, using the memo as amended by the final review decisions above.

| README location | Proposed edit |
| --- | --- |
| Header and RESTAP ERC-8004 service example | Set `0.2.0-beta` consistently; update the specification date at implementation/release time. Do not change other protocols' or example packages' versions. |
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

| Field | Normative contract after review |
| --- | --- |
| `id` | Nonempty string; caller-generated correlation for the exact observation and offered choices. Echo unchanged. No session semantics, authentication, entropy requirement, deduplication, or determinism guarantee. |
| `context` | Object; at least one known field must carry content. Unknown optional fields alone cannot satisfy this rule. |
| `context.text` | Optional string; nonblank text counts as content. |
| `context.images` | Optional array of inline base64 image data URLs; one valid image counts as content. No HTTP fetching. Image-capable agents support PNG; JPEG/WebP only when advertised. |
| `context.state` | Optional JSON object; at least one property counts as content. Preserve nested JSON values, arrays, nulls, booleans, and numbers. A top-level array/null is not an object for this field. |
| `context.events` | Optional string array; at least one nonblank event counts as content. |
| `actions` | Array of at least two complete choices. Each has a nonblank string `id` and nonblank string `description`; the exact ID `"null"` is forbidden; IDs are unique by exact case-sensitive equality and opaque. No global vocabulary, executable payload, or argument generation. |

Empty optional fields can coexist with another meaningful context field; malformed defined fields must still be rejected. Ignore unknown optional properties without dropping any defined supplied context. Application-specific observations belong in `context.state`. Do not trim or normalize IDs. Reject whitespace-only action IDs/descriptions and the literal action ID `"null"` with 400 `invalid_request`. Every decision agent MUST support text, state, and events individually and together; these fields are optional per request, not optional agent capabilities. Only image support is optional.

The only standard success fields are `id` and `action`: HTTP 200 `{"id":"decision42","action":"north"}` or `{"id":"decision42","action":null}`. `action` must equal an offered ID or JSON null. Empty string and string `"null"` are forbidden action values, including as offered action IDs. Responses set `Cache-Control: no-store`; set that header on decision errors too. No explanations, provider metadata, scores, streaming, callbacks, batches, tool calls, or new session fields. Explicit `wait` is a real action; null comes only from an explicit provider refusal, never a hidden abstention option, confidence threshold, timeout, or failure.

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

These are reference deployment defaults, not protocol constants or claims about provider limits. All five `decision` metadata fields are OPTIONAL, including independently of one another; `DecisionAdvert` has no required fields. An omitted field means **not stated**, never a fallback default, unlimited capacity, or a support promise. The entire optional metadata object may be omitted. Agents SHOULD publish image support through `image_mime_types`; omission does not promise or deny support.

When published, define `max_images` as a nonnegative integer, `max_actions` as an integer at least 2, `max_request_bytes` as a positive integer, and `max_image_bytes` as a nonnegative integer, positive when images are supported. `max_image_bytes` counts each decoded image; `max_request_bytes` counts the encoded JSON HTTP body, including base64 overhead, not HTTP headers. Every published value must be accurate and enforced consistently with backend support. Unpublished limits may still be enforced: over-limit requests return 413/422. Do not infer missing metadata from another field.

The reference server publishes all five fields from validated configuration, with the values above. A no-image agent can explicitly publish `image_mime_types: []`, `max_images: 0`, and `max_image_bytes: 0`; these publications must be truthful but are not mandatory fields. Text/state/events support is mandatory without additional support metadata. The two-action minimum is a fixed protocol invariant, never configurable or inferred from `max_actions`.

### Error table

Use the reviewed HTTP statuses and the memo's small `{"error":"code"}` shape. Use the accepted snake_case codes below; `too_few_actions` is the proposed specific code for the newly required minimum.

| HTTP | Meaning | Proposed code(s) |
| --- | --- | --- |
| 400 | Invalid JSON/types, missing required fields, blank/forbidden action strings, empty context, fewer than two actions, duplicate IDs, malformed data URL/base64/image | `invalid_request`, `empty_context`, `too_few_actions`, `duplicate_action_id`, `invalid_image` |
| 401 / 403 | Deployment authentication / authorization failure | Existing deployment codes; do not invent protocol authentication |
| 404 | Decision endpoint disabled | `not_found` |
| 406 | Accept excludes JSON (including SSE-only) | `not_acceptable` |
| 413 | Full encoded body or per-image decoded byte limit exceeded | `request_too_large`, `image_too_large` |
| 415 | Unsupported request Content-Type or Content-Encoding | `unsupported_media_type`, `unsupported_content_encoding` |
| 422 | Unsupported image input/MIME, too many images/actions | `unsupported_context_input`, `unsupported_image_format`, `too_many_images`, `too_many_actions` |
| 429 | Agent's own rate limit reached | `rate_limited` |
| 502 | Invalid/missing backend answer, wrong type, unknown/unusable choice | `invalid_backend_response` |
| 503 | Backend unavailable, including transport/service/configuration failure or provider rate/quota exhaustion | `decision_backend_unavailable` |
| 504 | Agent's backend deadline expires | `decision_timeout` |

Return no success-shaped action on errors; do not leak provider bodies or credentials. A provider authentication failure is an agent backend issue (503), not caller 401. Map provider quota/rate exhaustion to 503; reserve 429 for agent rate limiting. Define single-failure fixtures and deterministic validation ordering rather than requiring all errors at once. Disabled route 404 and unacceptable response media 406 (e.g. SSE-only Accept) are approved additions to the memo. Text/state/events support cannot be rejected as an unsupported capability. No auth/rate-limiter implementation is implied by documenting deployment statuses.

## 3. Approved version and alignment

Prem approved **`0.2.0-beta`** for the implementation release. Align EVERY current RESTAP version string to it: README header/service/catalog examples, `package.json`, both root version entries in `package-lock.json`, `src/server.ts` catalog and health, `examples/discovery.js`, `examples/demo.js`, and corresponding version assertions in `src/server.test.ts`. Prefer a shared version constant sourced from package metadata for server catalog/health and other consumers where practical; verify remaining examples and tests agree.

Retain historical baseline observations in this plan and do not change unrelated dependency or other protocols' versions. Release notes must explicitly mention the observable discovery `restap_version` change from `1.0` to `0.2.0-beta`, which may affect strict clients; recommend capability-based detection over version equality. Do not claim byte-for-byte discovery compatibility. This planning revision records the approved alignment without editing any release/version files.

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

Schema specifics: required keys, correlation ID `minLength: 1`, action IDs/descriptions `minLength: 1` plus a non-whitespace pattern, action ID `not: { const: "null" }`, actions `minItems: 2`, typed optional arrays/objects, context `anyOf` for text matching non-whitespace, images `minItems: 1`, state `minProperties: 1`, or events `contains` a nonblank string. Allow additional properties for forward compatibility at standard object boundaries. Metadata schema makes all five fields optional without schema defaults; validate every supplied value and consistency with configuration. Response schema requires a nonempty `id` and `action` of nonblank string excluding `"null"`, or JSON null; runtime checks constrain the string to offered IDs and compare the exact correlation ID. `uniqueItems` cannot enforce uniqueness by action ID, decoded bytes cannot be counted from a JSON string schema, and a static response schema cannot enumerate each request's choices: implement these explicitly and test schema/runtime agreement.

Validate data URL syntax and strict base64 before decoding; enforce byte ceilings before large allocation where possible, check the claimed MIME against content, and reject malformed images. No URL fetch, truncation, image dropping, or automatic conversion to text. Account for valid base64 padding and UTF-8 JSON byte length. Accept only uncompressed request bodies initially (`inflate: false`); reject a supplied Content-Encoding with 415 `unsupported_content_encoding`, so the full-body limit has one meaning. Bound incoming chunked bodies, not only Content-Length.

Route integration: add a small `createApp(options)` injection seam while retaining `export default app`; keep job state per app instance. Default decision support off. Require `RESTAP_DECISION=on` with configured backend/model/key for the direct-run server, and explicit backend injection for tests. A valid enabled configuration both mounts the route and appends the catalog entry. Off means no entry and 404. Fail an explicitly enabled but invalid configuration clearly at startup; do not advertise a capability that cannot be configured. A later provider outage returns 503 without pretending the configured capability disappeared.

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

### Adapter design after review

- Serialize text, state JSON, and events into separately labeled text context; preserve all supplied values. Put each screenshot in an actual image part, not base64 prompt text. Put selection instructions in one named choice question. Treat observations as evidence, never execution authority.
- Map each RESTAP action ID to a provider choice value with its description. Extract the single expected answer by validated name/type; reject missing, multiple, mismatched, or malformed answers. Drop provider confidence/usage from the public response.
- Require at least two actions at the RESTAP boundary, returning 400 `too_few_actions` before calling the provider. Map exactly the caller's choices: no hidden abstention choice, boolean sentinel, singleton shortcut, or reserved provider slot. The adapter can use the provider's full 255-choice limit; the reference deployment still enforces its advertised 32-action ceiling. Validate configuration against backend capacity.
- Map only an explicit provider refusal to null. No confidence-threshold abstention policy. A boolean answer (including `false`) is invalid; the offered string `"false"` remains a valid opaque ID. Timeouts, malformed answers, and transport errors are never null.
- Use Node's existing native `fetch`, injected for mocks, with the verified HTTP payload and no OpenAI SDK dependency. Preserve the repo's Node >=18 baseline. Add Ajv for shared schema validation.
- Keep provider errors sanitized, bound response reading, and disable hidden automatic retries initially. Apply a configurable deadline (propose 30 seconds), abort fetch on cancellation, and test deadline precedence. Log only operational metadata; no API keys, image bodies, private context, or reasoning traces. Provider request identifiers may remain internal.

## 6. Example harness

Propose `examples/decision/` with a small paused grid environment, a browser canvas renderer, and a RESTAP-only harness. Use a fixed vocabulary `north`, `south`, `east`, `west`, `wait`; offer the currently legal subset with complete one-tile/one-turn descriptions. Submit only when there are at least two legal choices; pause or end the demo otherwise, without inventing a hidden alternative. Keep execution functions in a private local map. State includes visible grid/position, turn/revision, objective, and units; events carry the preceding control's result. The harness must never require OpenAI credentials or provider-specific payloads.

Capture the rendered board with canvas `toDataURL('image/png')` for each observation, include structured state and objective in the same request, and keep an illustrative screenshot asset for README documentation. This is a real current-state render, not an unrelated stock image. Use a dev-only static host/runner and `BASE_URL` configuration; discovery is appended to the full base path, not resolved in a way that discards nested paths. Add a runnable demo command and instructions distinguishing mock and live agent modes.

Separate the harness's correlation/execution logic into an importable module (proposed `examples/decision/harness.js`) and test it under Vitest without a browser. Track immutable request snapshots, pending/consumed IDs, deadlines, and world revision. Atomically consume an accepted ID before executing; null pauses by default while wait advances a turn. Check legality against the current environment, discard stale results, and request fresh context. Handle duplicate/late responses and unknown execution outcomes explicitly. Demonstrate at least two observations so the second contains the first action's outcome. Save generated screenshots/transcripts under `output/decision-demo/` during implementation verification; do not generate the harness or a screenshot in this planning-only change.

## 7. Acceptance tests: one row for each memo row

All ordinary tests use injected stubs or mocked provider HTTP. No credentials/network are required. Proposed suites: `src/decision/validation.test.ts`, `src/decision/router.test.ts`, `src/decision/openai.test.ts`, `examples/decision/harness.test.js`, plus regression additions to `src/server.test.ts`.

| # | Memo acceptance check (same order) | Focused test and expected result |
| --- | --- | --- |
| 1 | Text or state request | Parameterize text-only/state-only and mixed inputs; stub offered action and null. Assert 200, exact id/action, JSON, no-store. Use at least two actions and verify nested state preservation; every agent accepts text/state/events. |
| 2 | Screenshot request | Real small PNG fixture with text/state/events; capture mock provider request and assert image part plus preserved text/JSON/events. Also accept image-only; no base64 text substitution. |
| 3 | Events-only request | Nonblank event accepted with 200; blank-only events fail context validation. Mixed blank/nonblank events preserve content. |
| 4 | Empty context or duplicate action IDs | Empty/missing context, zero/one actions → 400 `too_few_actions`; blank IDs/descriptions, literal `"null"` ID, duplicate ID with differing descriptions → 400 and zero backend calls. Case-distinct IDs remain distinct. |
| 5 | Unsupported screenshots or advertised limits exceeded | Table-driven unsupported MIME/no-image backend/count/action ceilings → 422; full-body/decoded-byte ceilings → 413; malformed images → 400. Test exact boundaries, multibyte body, base64 overhead, chunked requests, advertised values, and no backend call/context loss. |
| 6 | Backend returns an unknown action | Unknown string, missing action, unexpected type/name, malformed JSON/answer array → 502, never 200/null; validate after stub replacement too. Test offered string `"false"` remains valid and boolean `false` is rejected; assert no sentinel is sent. |
| 7 | Backend timeout or failure | Fake timers/deferred backend/failing HTTP → 504 or 503; bad upstream response → 502. Assert abort, one terminal response, zero harness executions; no provider body leakage. |
| 8 | Explicit wait versus null | Stub wait executes exactly one no-op turn; stub null pauses with no control execution. Only explicit provider refusal produces null; malformed output cannot. |
| 9 | Retry or late response | Deliver duplicate and reordered responses with different choices for one id; only first accepted response executes. Unknown, expired, consumed IDs never execute. Unknown execution outcome is reconciled before any control retry. |
| 10 | Environment changes while deciding | Advance revision/change legality before deferred answer resolves; old answer cannot execute, new context/actions get a fresh id, next events describe outcome. |
| 11 | Backend replaced by a test stub | Run the same HTTP fixtures against two injected backend implementations and mocked OpenAI adapter. Same request/response/error invariants and correct enabled discovery. |
| 12 | Existing RESTAP clients | Run legacy suites with decisions off/on, streaming off/on; assert legacy talk/news contracts and old-client capability selection. Disabled decision omitted/404, enabled schemas/metadata valid, unknown optional catalog fields safely ignored. |

Additional cases: all required-field/type errors, defined-but-empty versus unknown context, unknown optional properties, ID exact echo and case sensitivity, all error statuses at the applicable deployment boundary, Content-Type with charset, Accept absent/wildcard/JSON/SSE-only, parser HTML-to-JSON conversion, request cancellation, and schema examples validated with the same schema. Test that decision calls never add news, execute controls, or create sessions. Test provider payloads with 2 and 255 caller choices (the latter using appropriately configured limits), no extra choice, and 256 rejected as over-limit; reference defaults reject 33. Test all metadata fields omitted and each independently present, with no injected defaults or inferred promises, and accurate enforcement of every published field. Verify mandatory text/state/events support with images disabled. Cover Content-Encoding → 415 and provider rate/quota exhaustion → 503 separately from agent rate limiting → 429. Assert all current RESTAP version strings align to `0.2.0-beta`, including README/service/catalog examples, package/lock roots, server health/catalog, discovery/demo examples, and test assertions; check release notes mention the discovery change from `1.0`.

Backward compatibility specifically includes talk's JSON defaults, SSE sequence, 406/fallback behavior, session mint/echo/invalid-ID errors; news GET filtering and POST storage acknowledgement without conversational reply or streaming; unchanged echo/reverse; existing packages/protocols/catalog fields; default server startup without provider credentials. Discovery may add an entry only when enabled, and existing clients must find by id instead of requiring a fixed count. Version string changes are the explicit exception described in section 3. Preserve existing session-scoped-news specification requirements without adding them to the demo as unrelated work.

Future verification commands: `npm run test:run`, `npm run build`, then `test-server.sh` against an isolated local reference server (off/on), and the mock browser demo. Do not aim the shell suite at the manager or another live agent. Browser verification checks a captured board, structured state, a control, and next-turn outcome. Existing example-plugin module-format issues, if encountered, should be reported separately rather than repaired in this extension.

Optional live smoke: an explicit opt-in command outside the default suite, with server-side credentials and model configured. Capture a real board PNG, submit it with state through RESTAP to the OpenAI adapter, validate and execute an offered action, and send the next observation. Check invariants, never a predetermined model choice or latency SLA. A refusal is protocol-valid but does not complete the demonstration's action-execution criterion; report it as inconclusive. Skip cleanly when credentials are absent, bound turns/cost/time, and retain only redacted artifacts. No live test is run for this plan.

## 8. Review questions — resolved

All seven questions are resolved by Prem's final decisions in the review section above: (1) `0.2.0-beta` and complete version alignment; (2) two-action minimum, full 255-choice adapter capacity, refusal-only null and no sentinel; (3) forbidden `"null"` action ID and nonblank action strings; (4) mandatory text/state/events support; (5) Option D optional metadata with no implicit defaults, accurate published limits, and all five reference values; (6) accepted HTTP/error rules; (7) Ajv, native fetch, explicit opt-in, and browser grid demo.

Decisions **1, 3, and 5** amend Prem's original memo; this plan records those amendments while leaving `0001-decision-endpoint.md` unchanged. There are no remaining approval questions for this plan. Provider documentation details must still be rechecked when implementation is authorized. The agent selects and the caller executes; no implementation, release, or push is authorized by this plan-revision task.

## 9. Proposed order and size

| Order | Work after approval | Estimate |
| --- | --- | --- |
| 1 | Apply resolved decisions to README contract, approved version alignment, release notes, and examples | 0.5–1 day |
| 2 | Types, shared schemas, semantic validation and boundary tests | 1–1.5 days |
| 3 | Backend seam, route/parser/deadline integration, conditional discovery | 1 day |
| 4 | OpenAI adapter, provider mapping/error/refusal tests | 0.5–1 day |
| 5 | Grid harness, capture/state loop, stale/retry/execution tests | 1–1.5 days |
| 6 | Compatibility matrix, build, documentation/demo review, optional live smoke | 0.5–1 day |

Total: roughly **4.5–7 engineering days** for a separately authorized implementation, excluding provider-access delays; medium-sized extension, approximately 12–18 implementation/test/example files plus README/package/version edits, around 1,000–1,600 lines including tests and harness. A larger game integration or new deployment auth/rate limiting would be separately scoped. Keep implementation commits reviewable by stage, with tests accompanying each stage. Do not push, merge, release, or implement as part of this planning task.
