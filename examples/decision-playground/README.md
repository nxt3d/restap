# Decision Playground

A local diagnostic preview, ahead of the full `/decision` implementation. Uses the repository's Express dependency and Node's native fetch; no build step or new dependencies.

```sh
cd /Users/nxt3d/projects/rest-ap/restap-extension-decision
node examples/decision-playground/server.js
```

Open **http://localhost:5180**. Set `PORT` to override 5180. Requires Node 18+ and the repository's installed dependencies (`npm ci` if needed).

The server reads `OPENAI_API_KEY` at startup, or falls back to `/Users/nxt3d/projects/idchain-restap/openAI_API_Key.txt`. The credential stays in server memory, is never logged or returned, and is sent only as the Authorization header to OpenAI. No key is needed for mocked tests. The server binds to loopback, checks Host/Origin, and serves only the page and `POST /decide`.

## Try it

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

Validation includes two to 255 actions, nonblank IDs/descriptions, forbidden literal `"null"` action ID, case-sensitive unique IDs, typed context fields, and meaningful context. Local limits: 8 MiB JSON body, one PNG/JPEG/WebP image, 5 MiB decoded image. Image validation checks canonical base64 and format signatures; full decoding is left to the provider. This small preview does not implement production discovery, authentication, full image decoding, or stages 2–5.

## Provider format and tests

Verified October 9, 2026 against [OpenAI's Decisions guide](https://developers.openai.com/api/docs/guides/decisions) and [TypeScript API reference](https://developers.openai.com/api/reference/typescript/resources/decisions/methods/create): `POST https://api.openai.com/v1/decisions`, model `gpt-6-luna`, `input` messages with `input_text` / `input_image`, and one named `choice` question with `{value, description}` options. Read `answers[0]` and check its name/type; only an offered string choice or explicit refusal is accepted.

```sh
npm run test:run
```

All ordinary tests inject a mocked transport and never read the key file or call OpenAI. To opt into a live test, start the server with a key and use Decide or Auto-play.
