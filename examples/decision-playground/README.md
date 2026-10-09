# Decision Playground

A local diagnostic preview, ahead of the full `/decision` implementation. Uses the repository's Express dependency and Node's native fetch; no build step or new dependencies.

```sh
cd /Users/nxt3d/projects/rest-ap/restap-extension-decision
node examples/decision-playground/server.js
```

Open **http://localhost:5180**. Set `PORT` to override 5180. Requires Node 18+ and the repository's installed dependencies (`npm ci` if needed).

At startup the server uses trimmed `OPENAI_API_KEY` first, then falls back to the trimmed contents of `/Users/nxt3d/projects/idchain-restap/openAI_API_Key.txt`. If neither supplies a key, startup warns and decisions return `decision_backend_unavailable`. The credential stays in server memory, is never logged or returned, and is sent only as the Authorization header to OpenAI. No key is needed for mocked tests. The server binds to loopback, checks Host/Origin, and serves the page, its physics module, `GET /config` and `POST /decide`.

## Try it

- **Breakout** defaults to **Real-time**, with **Paused** available beside it. Both modes offer 0.5x/1x speed, a total decision budget (1–500 since Reset), Stop and Reset. Stop immediately halts simulation and discards any pending reply; controls remain locked until that one request settles.
- **Real-time** renders with `requestAnimationFrame` and advances fixed 60 Hz simulation steps at the selected speed, regardless of display refresh rate. It never waits for inference. Catch-up is capped at 100 ms per animation callback after suspension. Eight paddle-center zones plus stay are complete choices; the paddle approaches its clamped target at up to 4 px/simulation frame and holds there. Stay captures the paddle's current position when applied.
- **INPUT MODE** (both play modes): **State only** sends full game data in `context.state` (ball x/y/vx/vy, paddle position/width, field dimensions, all remaining brick rectangles, score, game ID, terminal flag and frame; real-time also includes speed and target), with only the objective in `context.text` and no images. **Images only** omits state and events entirely; text contains only the objective and image frame labels, with no numeric current game positions. A may add static physics constants. **State + images** sends both. The same fixed action choices apply to every mode.
- Images defaults to 2 and supports 1–4 recent decision snapshots, oldest first. Frame labels identify their age relative to the current image. Missing history at game start is padded with the earliest available image and explicitly labeled; no previous-game image is reused. One request is outstanding at a time. Interval sets the minimum time between request starts; zero starts the next immediately after the previous completes. No same-snapshot retries.
- **One miss ends a game:** “Game over: missed the ball” appears on the canvas and in the log. No lives or respawn. Physics stops immediately and an outstanding reply is discarded before any next game starts.
- **Seeded launches:** every game centers the paddle and launches from its center, just above it, at the normal speed and a seeded angle in 30–150° above horizontal. The visible uint32 Seed is editable. **Same seeds** (default on) replays the identical sequence from game 1 on Reset and configuration changes; unchecked chooses a fresh seed. **New seed** always selects a new sequence. Changing input/play mode, image count, K, speed, any tuning setting, controller, max age or interval resets the game and decision budget to avoid mixing configurations within a game. It retains comparison results and game-end log markers.
- **Auto-restart** (default off) plays up to the **Games budget** (default 10; includes the current game). The decision budget is shared across all games since Reset; neither budget resets automatically. Stop cancels the series, including when a terminal game's reply is pending. Step never auto-restarts.
- The session table groups by play mode, input mode, images, paused K, speed, seed set, all seven tuning flags, selected/effective zones, controller, max age and interval. It reports completed games, average decisions survived, average bricks cleared and average simulation seconds alive (frame / 60, excluding paused inference), plus average latency, estimated input cost per known-usage reply, stale percentage and errors. A real-time decision is survived if its valid action is applied while alive; paused mode counts it only after surviving its full K frames. Interrupted games are excluded from survival averages. Latency/cost/stale include discarded end-of-game replies. Unknown usage is counted explicitly. Results and game-end log markers survive Reset; reloading clears them. Grid/manual calls do not enter this table.
- **Reliability:** max snapshot age defaults to 750 ms and uses monotonic wall time, independent of game speed. Replies at or beyond the deadline are stale. Every ID is consumed at most once, including discarded replies. Wrong IDs, unoffered actions, replies after Stop/game end or from a previous game are rejected. Refusals retain the current target while fresh decisions continue. Errors wait 500 ms, then 1000 ms before a fresh request; three consecutive errors pause auto-play with a backend/key diagnostic. Success resets backoff. Errors are counted separately from decisions in live stats and the comparison table, and excluded from decision latency, throughput and per-decision input cost; the game never silently substitutes an action. Reaching the decision budget stops the run.
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

Optional backend `confidence` and complete `probabilities` are preserved in the RESTAP response and displayed as confidence plus probability bars in the result, run history, and real-time snapshot strip. Missing or invalid scores and partial distributions are omitted; refusal has neither field. The adapter never selects or replaces an action from scores. The optional Breakout G caller policy uses probabilities to select its own paddle target, while displaying the unchanged model decision. Mapping follows the [official Decisions API reference](https://developers.openai.com/api/reference/resources/decisions/methods/create): `confidence` and `probabilities: [{value, probability}]`.

## Independent Breakout tuning

All seven checkboxes default **off** and are retained in each comparison group.
Changing one resets the seeded episode, retaining prior groups in tab memory.

- **A — Instructions:** explains downward-positive y, paddle y=330, radius/contact height, normal/dash paddle speed, launch ball speed and changing velocity, wall bounces, 150–500 ms expected decision latency, and early upward-ball pre-positioning. Paused instructions accurately state that inference freezes simulation.
- **B — Derived facts:** state adds ball directions, fractional estimated frames to paddle contact (via the top wall when rising), and normal/dash travel frames to every clamped zone target. No landing x or recommended action is added. The wall-only estimate ignores future brick collisions and is null for stationary vertical motion or a downward ball that already passed contact height.
- **C — Dash:** adds `dash-to-zone-k` at 12 px/frame alongside normal 4 px/frame zones and stay. Both approach a target without overshoot and hold until replaced. The model chooses urgency. The table counts dash selections / valid offered selections, including late discarded selections. Perfect has no model selections.
- **D — Precision:** an independent on/off checkbox and 8/12/16 selector. Off always means eight zones. C+D16 offers 33 actions. Playground `GET /config` publishes `max_actions: 255` (the already-enforced capacity); this exceeds 33 without changing protocol limits or defaults.
- **E — Assist baseline:** state additionally includes `predictedLandingX`, numeric `predictedLandingZone` (1-based), and an explicit assist label. Prediction unfolds the flight then mirrors x through both walls; brick collisions may invalidate it. Neither B nor E adds state, events, or inferred coordinates to images-only requests.

**Perfect controller** bypasses all API calls and recomputes the predicted zone each physics frame. It uses the same 4 px/frame paddle limit, or 12 with C enabled, and D's effective zone count. It operates continuously even if Paused is selected; K/model decision budgets do not apply. Stop, game budget and auto-restart still apply. It reports N/A for model decisions and $0 API cost. This is an ideal-information baseline, not proof that every episode is winnable. Its wall-only projection and zone discretization are still approximations.

- **F — Safe-position defense:** adds `center` (normal speed) and, with C, `dash-center` (12 px/frame), returning to the field center and holding. The objective explains defensive waiting near center or the middle of the plausible landing range while the ball travels away, then committing to the predicted landing zone on descent. F replaces A's competing upward-flight strategy when both are on.
- **G — Probability-weighted safest target:** caller policy only, with no protocol changes. The spec says `action` is the decision; this demo chooses its own target from the probability-weighted median of nominal zone centers, minimizing expected absolute travel under those weights. Normal/dash versions contribute to the same position; `stay` maps to the current paddle center at application time and `center`/`dash-center` to the field center. Non-positional/unoffered actions are ignored. An exactly-half tie uses the lower median; the resulting paddle position is clamped at walls. Missing probabilities or zero usable mass falls back to the chosen action. The model action still determines normal/dash speed. The screen and log show both the model action and G's applied target, including fallback status in the log. Stale, refused or invalid decisions do not apply either policy. This distribution over actions is a caller interpretation of landing uncertainty, not a calibrated landing forecast.

Paused mode keeps left/right/stay when C, D, F and G are off; any of these enables target-zone actions held for the next K frames. B and E are still independent of this action selection.

## Bounded seeded live smoke comparison

`compare.js --live --output /absolute/path/outside/repo/results.json` requires
`OPENAI_API_KEY` explicitly set in the environment. Importing it and ordinary
mocked tests never load credentials. It exercises the local adapter against
OpenAI with five games per configuration, one on each seed 1–5: baseline, F, G,
F+G, F+G+E (assist), and F+G+C (dash). All other toggles are off.

The harness uses state only, 1x physics, a zero request-start interval and a
750 ms stale threshold. Games and calls run sequentially, sleeping 2000 ms
between games; configuration order rotates by seed. Each game has the same
13-call cap (390 maximum live attempts, below the 400-call budget). No retries
or extra live reference runs consume additional calls.

Shared 60 Hz physics advances through measured adapter round-trip latency.
This is a live-provider simulation test, not a browser rendering benchmark.
Episodes stop immediately at the call cap with `budgetLimited` and `censored`
flags; there is no held-action tail. A 60-second simulation horizon also marks
survivors censored. Time alive for censored games is an observed lower bound,
not a completed survival time. Raw per-game model choices, G targets, policy
sources, errors, and latencies are saved incrementally. Summaries report mean
bricks/time alive and mean, median, and p90 latency (nearest-rank percentiles
pooled across attempts, including stale and terminal replies). Interpret
latency and call-cap differences alongside any apparent gameplay improvement.
