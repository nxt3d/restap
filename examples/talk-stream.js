#!/usr/bin/env node

/**
 * REST-AP Streaming Talk Demo
 *
 * Demonstrates consuming a streaming `POST /talk` response over Server-Sent
 * Events (SSE) by sending `Accept: text/event-stream`.
 *
 * Streaming is OPTIONAL. A server that does not support it stays fully
 * compliant by returning `application/json`. This client requests SSE but
 * tolerates a JSON fallback (`Accept: text/event-stream, application/json`).
 *
 * Run a server first (e.g. `npm run dev`), then:
 *   node examples/talk-stream.js
 *
 * Override the target with BASE_URL, e.g.:
 *   BASE_URL=http://localhost:3000 node examples/talk-stream.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

console.log('💬 REST-AP Streaming Talk Demo (SSE)');
console.log('====================================\n');

// Minimal SSE frame parser: splits a buffer on blank lines and extracts the
// `event:` name and concatenated `data:` lines for each complete frame.
function parseSseFrames(buffer) {
  const frames = [];
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);

    let event = 'message';
    const dataLines = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }
    frames.push({ event, data: dataLines.join('\n') });
  }
  return { frames, rest };
}

async function main() {
  console.log(`POST ${BASE_URL}/talk`);
  console.log('Accept: text/event-stream, application/json');
  console.log("Body: { message: 'Tell me about your capabilities' }\n");

  let res;
  try {
    res = await fetch(`${BASE_URL}/talk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Prefer streaming, but accept a complete JSON response as fallback.
        Accept: 'text/event-stream, application/json',
      },
      body: JSON.stringify({ message: 'Tell me about your capabilities' }),
    });
  } catch (err) {
    console.error(`❌ Could not reach ${BASE_URL}. Is the server running? (npm run dev)`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }

  const contentType = res.headers.get('content-type') || '';

  // JSON fallback path: the server does not stream.
  if (contentType.includes('application/json')) {
    const body = await res.json();
    console.log('↩️  Server returned a complete JSON response (no streaming):\n');
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  if (!contentType.includes('text/event-stream')) {
    console.error(`❌ Unexpected Content-Type: ${contentType} (status ${res.status})`);
    if (res.status === 406) {
      console.error('   Server requires Accept: application/json (streaming unsupported).');
    }
    process.exit(1);
  }

  // Streaming path: consume the SSE body and print deltas as they arrive.
  console.log('📡 Streaming SSE response:\n');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assembled = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const { frames, rest } = parseSseFrames(buffer);
    buffer = rest;

    for (const frame of frames) {
      let payload = {};
      try {
        payload = frame.data ? JSON.parse(frame.data) : {};
      } catch {
        // Ignore non-JSON keep-alive comments.
      }

      switch (frame.event) {
        case 'message.start':
          console.log(`[message.start] id=${payload.id}`);
          break;
        case 'message.delta':
          assembled += payload.text || '';
          process.stdout.write(payload.text || '');
          break;
        case 'message.end':
          console.log(`\n[message.end] id=${payload.id}`);
          break;
        case 'error':
          console.error(`\n[error] ${payload.message}`);
          break;
        case 'done':
          console.log('[done] stream finished');
          break;
        default:
          // Optional presentational events (status, tool.*, artifact) are hints
          // only and safe to ignore for basic compatibility.
          console.log(`[${frame.event}] ${frame.data}`);
      }
    }
  }

  console.log('\n✅ Assembled reply:');
  console.log(assembled);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
