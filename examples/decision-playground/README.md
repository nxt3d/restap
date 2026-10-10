# Cockpit Trainer

A local RESTAP decision playground with 18 fictional light-twin cockpit scenarios. These are simplified recognition exercises, not real flight procedures.

## Run

From the repository root, with Node 18+:

```sh
npm ci
node examples/decision-playground/server.js
```

Open **http://localhost:5180/**. Set `PORT` to choose another port. No build step is needed for the playground.

The server uses trimmed `OPENAI_API_KEY` first, then falls back to `/Users/nxt3d/projects/idchain-restap/openAI_API_Key.txt`. It reads credentials only at startup; mocked tests never read that file. With no key, startup warns and decisions return `decision_backend_unavailable`. The key stays server-side, is sent only to OpenAI, and is redacted from diagnostics if the provider echoes it. The server binds to loopback and checks Host and Origin.

## What it shows

Choose Images only, State only, or Both, optionally enable the pilot role, and select a seed and scenario order. **Step** runs one decision; **Play all scenarios** runs up to 21 calls with a configurable result hold. **Pause** stops after the current decision. **New run** restarts the scenarios while retaining session results.

Each request offers six actions and at most one cockpit screenshot. The simulation waits for inference, then advances five simulated seconds. Instruments animate the outcome, a banner grades the action, and step markers show progress through follow-up checklists. Errors do not advance or grade a scenario: playback stops and controls wait through a 500 ms exponential cooldown, capped at five seconds. A successful decision resets the backoff; there are no automatic retries.

The exchange panel shows **POST /decision**, HTTP status, browser latency, and the RESTAP request and response. History retains each step. Image data is shortened only for display; Copy and Export JSON preserve full payloads. Expand **Backend (OpenAI Decisions)** for provider diagnostics. Confidence and probability bars appear only when the backend supplies valid scores. Results compare accuracy, resolved scenarios, dangerous actions, false alarms, latency, reported cost, confidence, and errors across input modes.

The small **Discovery** link opens `GET /.well-known/restap.json`, advertising the `decision` capability, its endpoint, supported image MIME types, `max_images: 1`, `max_actions: 6`, and optional confidence/probability support.

## Diagnostic endpoint

`POST /decision` accepts `{id, context: {text, images, state, events}, actions: [{id, description}, ...]}`. It retains a playground-specific wrapper around the RESTAP result:

```json
{
  "restap": {"id": "example", "action": "monitor", "confidence": 0.9},
  "openai_request": {"model": "gpt-6-luna", "input": [], "questions": []},
  "openai_response": {"answers": []},
  "latency_ms": 155,
  "error": null
}
```

Provider objects above are abbreviated examples. The adapter sends one choice question to OpenAI Decisions and accepts only an offered choice or explicit refusal (`action: null`). Valid scores pass through without normalization; missing or invalid scores are omitted. Errors retain the diagnostic wrapper and appropriate HTTP status, never a null decision. Provider failures map to 503, invalid answers to 502, and the 30-second deadline to 504.

Local validation permits two to six actions, one PNG/JPEG/WebP image up to 5 MiB decoded, and an 8 MiB JSON body. It checks IDs, typed and meaningful context, canonical base64, and image signatures; full image decoding is left to the provider. Discovery describes this local diagnostic adapter, whose response wrapper is distinct from a bare RESTAP response.

## Verify

```sh
npm run test:run
npm run build
```

Ordinary tests use mocked transport and need no key. For an opt-in live smoke test, start the server with a key and press **Step** on the home page. The optional `cockpit-compare.js` CLI retains a full comparison runner; it requires explicit `--live`, `OPENAI_API_KEY`, `--canvas-module` pointing to an installed canvas implementation, and `--output` pointing to a result file.
