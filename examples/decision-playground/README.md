# Decision Playground

A local diagnostic preview, ahead of the full `/decision` implementation. Uses the repository's Express dependency and Node's native fetch; no build step or new dependencies.

```sh
cd /Users/nxt3d/projects/rest-ap/restap-extension-decision
node examples/decision-playground/server.js
```

Open **http://localhost:5180**. Set `PORT` to override 5180. Requires Node 18+ and the repository's installed dependencies (`npm ci` if needed).

At startup the server uses trimmed `OPENAI_API_KEY` first, then falls back to the trimmed contents of `/Users/nxt3d/projects/idchain-restap/openAI_API_Key.txt`. If neither supplies a key, startup warns and decisions return `decision_backend_unavailable`. The credential stays in server memory, is never logged or returned, and is sent only as the Authorization header to OpenAI. No key is needed for mocked tests. The server binds to loopback, checks Host/Origin, and serves only the page and `POST /decide`.

## Try it

- **Breakout** defaults to **Real-time**, with **Paused** available beside it. Both modes offer 0.5x/1x speed, a total decision budget (1–500 since Reset), Stop and Reset. Stop immediately halts simulation and discards any pending reply; controls remain locked until that one request settles.
- **Real-time** renders with `requestAnimationFrame` and advances fixed 60 Hz simulation steps at the selected speed, regardless of display refresh rate. It never waits for inference. Catch-up is capped at 100 ms per animation callback after suspension. Eight paddle-center zones plus stay are complete choices; the paddle approaches its clamped target at up to 4 px/simulation frame and holds there. Stay captures the paddle's current position when applied.
- **INPUT MODE** (real-time only): **State only** sends full game data in `context.state` (ball x/y/vx/vy, paddle position/width, field dimensions, all remaining brick rectangles, score, lives, frame, speed and target), with only the objective in `context.text` and no images. **Images only** omits state and events entirely; text contains only the objective and image frame labels, with no numeric game positions. **State + images** sends both. The same fixed action choices apply to every mode.
- Images defaults to 2 and supports 1–4 recent decision snapshots, oldest first. Frame labels identify their age relative to the current image. Missing history at run/life start is padded with the earliest available image and explicitly labeled; no previous-life image is reused. One request is outstanding at a time. Interval sets the minimum time between request starts; zero starts the next immediately after the previous completes. No same-snapshot retries.
- The live session table accumulates completed decisions, browser latency, estimated input cost per known-usage decision, decisions per active second, stale rate, and tracking quality for each input mode/image count/speed. Tracking is paddle contacts divided by downward crossings at paddle height (including misses), with the raw denominator shown; no crossings displays “—”. Discarded replies still count in latency/cost/rate; unknown usage is explicitly counted. Results remain in tab memory across Stop and Reset; reloading clears them. Paused/grid/manual decisions do not contaminate this table.
- **Reliability:** max snapshot age defaults to 750 ms and uses monotonic wall time, independent of game speed. Replies at or beyond the deadline are stale. Every ID is consumed at most once, including discarded replies. Wrong IDs, unoffered actions, replies after Stop/game end or across a life loss are rejected. Refusals retain the current target while fresh decisions continue. Errors wait 500 ms, then 1000 ms before a fresh request; three consecutive errors pause auto-play with a backend/key diagnostic. Success resets backoff. Errors are counted separately from decisions in live stats and the comparison table, and excluded from decision latency, throughput and per-decision input cost; the game never silently substitutes an action. Reaching the decision budget stops the run.
- The six-snapshot strip shows frame at capture/return, choice, image count, apply/discard status, browser round-trip latency and age at apply/discard. Summary shows the last decision’s image count, target, completed decisions per active second, average browser latency, stale/total discarded counts, and the tab's running input cost. Discarded calls still count toward cost and budget. The provider diagnostics separately show server latency.
- **Paused** retains left/right/stay and K (1–120 frames); simulation freezes during inference, then animates exactly K frames (unless stopped/terminal). Step decision runs one block. Refusal/errors advance no frames.
- The observation panel shows the exact screenshot sent, including when inspecting history. Input cost uses `usage.input_tokens × $0.10 / 1,000,000`, at Prem's supplied rate. Per-decision estimates and the tab's running input total exclude output charges. Missing usage is explicitly unknown. Resetting a game does not erase accumulated costs.

- Choose the **text** preset and press **Decide** for a support-routing choice.
- Choose **grid** for an editable single decision; optionally upload an image. **Auto-play** supplies the canvas PNG plus fresh state and prior outcomes each turn, executes the returned move and stops on exit, enemy collision, refusal, error, Stop, or the selected turn limit (1–50). The enemy is stationary. Reset starts a new world. Stop discards a pending move, although the provider call may finish.
- The **refusal / null probe** asks for an unsafe choice without executing it. Refusal is model-dependent, not guaranteed. Only an explicit provider refusal maps to null; no sentinel choice or confidence threshold is added.
- History holds the last 50 runs in tab memory. Click a run to inspect it. Images are abbreviated in both displayed requests; full data URLs go to the provider. No hidden model reasoning is exposed.

## Diagnostic endpoint

`POST /decide` accepts `{id, context: {text, images, state, events}, actions: [{id, description}, ...]}`. Success wraps the RESTAP result:

```json
{
  "restap": {"id": "example", "action": "billing"},
  "openai_request": {"model": "gpt-6-luna", "input": [], "questions": []},
  "openai_response": {"answers": []},
  "latency_ms": 155,
  "error": null
}
```

The provider objects above are abbreviated examples. Actual responses include the sent JSON body (only image URLs shortened) and raw parsed provider response. Any accidental credential echo is redacted. `latency_ms` measures server-side validation, provider request and response processing, excluding browser/network rendering overhead. Errors carry the corresponding HTTP status, a RESTAP `{error: "snake_case_code"}` object, and the same diagnostic fields. Provider HTTP errors retain their response for local inspection and map to 503; invalid answers map to 502; a 30-second deadline maps to 504. Errors never become null decisions.

Validation includes two to 255 actions, nonblank IDs/descriptions, forbidden literal `"null"` action ID, case-sensitive unique IDs, typed context fields, and meaningful context. Local limits: 8 MiB JSON body, up to four PNG/JPEG/WebP images (playground limit only; protocol unchanged), 5 MiB decoded image. Image validation checks canonical base64 and format signatures; full decoding is left to the provider. This small preview does not implement production discovery, authentication, full image decoding, or stages 2–5.

## Provider format and tests

Verified October 9, 2026 against [OpenAI's Decisions guide](https://developers.openai.com/api/docs/guides/decisions) and [TypeScript API reference](https://developers.openai.com/api/reference/typescript/resources/decisions/methods/create): `POST https://api.openai.com/v1/decisions`, model `gpt-6-luna`, `input` messages with `input_text` / `input_image`, and one named `choice` question with `{value, description}` options. Read `answers[0]` and check its name/type; only an offered string choice or explicit refusal is accepted.

```sh
npm run test:run
```

All ordinary tests inject a mocked transport and never read the key file or call OpenAI. To opt into a live test, start the server with a key and use Decide or Auto-play.

Optional backend `confidence` and complete `probabilities` are preserved in the RESTAP response and displayed as confidence plus probability bars in the result, run history, and real-time snapshot strip. Missing or invalid scores and partial distributions are omitted; refusal has neither field. Scores never select or replace an action. Mapping follows the [official Decisions API reference](https://developers.openai.com/api/reference/resources/decisions/methods/create): `confidence` and `probabilities: [{value, probability}]`.
