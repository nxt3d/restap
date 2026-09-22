// RESTAP Protocol Types

export interface RestapCatalog {
  restap_version: string;
  agent: {
    name: string;
    description?: string;
    contact: string;
  };
  packages?: Package[];
  capabilities: Capability[];
  // Optional: advertise availability of related protocol endpoints (MCP, A2A, etc.).
  // RESTAP does not define these protocols; this only signals where to find them.
  protocols?: Protocols;
}

// Advertises whether related protocol endpoints are available alongside RESTAP.
// RESTAP does NOT define tool invocation, task orchestration, or agent-to-agent
// delegation. Those belong to MCP, A2A, or other advertised integrations.
export interface Protocols {
  mcp?: ProtocolAdvert;
  a2a?: ProtocolAdvert;
  // Other protocols may be advertised with the same shape.
  [key: string]: ProtocolAdvert | undefined;
}

export interface ProtocolAdvert {
  available: boolean;
  endpoint?: string;
}

// Package interface is intentionally flexible. Only name and type are required.
// All other fields should follow the standards of the specified package type
// (Claude plugin format for claude-plugin, npm metadata for npm-package, etc.)
export interface Package {
  name: string;        // Required: Human-readable package name
  type: string;        // Required: Package type (claude-plugin, npm-package, etc.)
  // All other fields are optional and should follow relevant standards
  [key: string]: any;
}

export interface Capability {
  id: string;
  title: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  description?: string;
  input_schema?: any; // JSON Schema for request body
  output_schema?: any; // JSON Schema for response
  content_types?: string[]; // Accepted content types
  output_formats?: string[]; // Response formats the capability can produce (e.g. ["application/json", "text/event-stream"])
  streaming?: StreamingAdvert; // Optional: advertise SSE streaming support for this capability
  sessions?: SessionsAdvert; // Optional: advertise session-continuity support (currently only /talk)
  parameters?: Parameter[]; // Query/path parameters
  pricing?: {
    free_calls?: number;
    cost_per_call?: number;
    currency?: string;
  };
  payment?: PaymentAdvert; // Optional: advertise a payment protocol that settles this capability
}

// Advertises optional SSE streaming for a capability (currently only /talk).
export interface StreamingAdvert {
  supported: boolean;
  transport: 'sse';
  events: string[];
}

// Advertises optional session continuity for a capability (currently only /talk).
// A server with supported:false is stateless and ignores session_id; continuity
// is simply not guaranteed. There is no session-management API.
export interface SessionsAdvert {
  supported: boolean;
}

// Advertises that a capability is settled over a payment protocol RESTAP does
// not define -- exactly as `security` points at auth schemes RESTAP does not
// define. This says only WHICH protocol and WHAT it costs, so a client can
// decide whether to pay before spending a request to find out.
//
// This is the machine-payable price; `Capability.pricing` above is the
// human-readable one. A capability MAY advertise both, and they SHOULD agree.
// `pricing` alone cannot carry a payable quote: `cost_per_call` is a JSON
// number, and a smallest-unit on-chain amount does not survive one.
export interface PaymentAdvert {
  // The payment protocol, e.g. "x402". Not defined by RESTAP.
  protocol: string;
  // Price per call in the asset's smallest unit, as a decimal STRING so no
  // precision is lost (e.g. "10000" = 0.01 USDC at 6 decimals).
  amount: string;
  // What is being paid, and where it lives. `network` SHOULD be a CAIP-2 chain
  // id (e.g. "eip155:8453") and `asset` the identifier the protocol expects --
  // for an EVM token, its contract address.
  asset?: string;
  network?: string;
  // Where to pay, when the protocol needs a destination distinct from the
  // capability's own endpoint.
  recipient?: string;
  // Protocol-specific fields. Open for the same reason `Package` is: RESTAP
  // should not have to change to describe a protocol it does not define.
  [key: string]: any;
}

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  location: 'query' | 'path' | 'header';
}

export interface TalkRequest {
  message: string;
  // Opaque conversation-continuity token. A client MAY include it to continue
  // a thread. If omitted, the server MAY mint one and return it. Not auth.
  session_id?: string;
}

export interface TalkResponse {
  reply: string;
  // The session_id the client should echo on the next turn to continue the
  // thread. A server that mints sessions MUST return it here (and, when
  // streaming, in message.start and done).
  session_id?: string;
  suggested_actions?: string[];
}

// SSE events for streaming POST /talk responses (Accept: text/event-stream).
//
// REQUIRED for basic compatibility:
//   message.start  - begins an assistant message (carries an id)
//   message.delta  - a partial text chunk (carries the text delta)
//   message.end    - assistant message complete (carries the id)
//   error          - an in-stream error (carries a message)
//   done           - stream finished (terminal, no payload)
//
// OPTIONAL (MUST NOT be required for basic compatibility). These are
// presentational hints only, NOT a tool-invocation protocol:
//   status, tool.start, tool.delta, tool.end, artifact
//
// Each event is sent on the wire as an SSE frame:
//   event: <type>
//   data: <JSON-encoded payload below>

export interface TalkStreamMessageStart {
  event: 'message.start';
  id: string;
  session_id?: string;
}

export interface TalkStreamMessageDelta {
  event: 'message.delta';
  id: string;
  text: string; // partial text chunk to append
}

export interface TalkStreamMessageEnd {
  event: 'message.end';
  id: string;
}

export interface TalkStreamError {
  event: 'error';
  message: string;
}

export interface TalkStreamDone {
  event: 'done'; // terminal event; stream ends after this
  session_id?: string; // included so the client can continue the thread
}

// --- Optional events (presentational hints only) ---

export interface TalkStreamStatus {
  event: 'status';
  message: string;
}

export interface TalkStreamToolStart {
  event: 'tool.start';
  id: string;
  name?: string;
}

export interface TalkStreamToolDelta {
  event: 'tool.delta';
  id: string;
  text?: string;
}

export interface TalkStreamToolEnd {
  event: 'tool.end';
  id: string;
}

export interface TalkStreamArtifact {
  event: 'artifact';
  id?: string;
  mime_type?: string;
  data?: any;
}

export type TalkStreamRequiredEvent =
  | TalkStreamMessageStart
  | TalkStreamMessageDelta
  | TalkStreamMessageEnd
  | TalkStreamError
  | TalkStreamDone;

export type TalkStreamOptionalEvent =
  | TalkStreamStatus
  | TalkStreamToolStart
  | TalkStreamToolDelta
  | TalkStreamToolEnd
  | TalkStreamArtifact;

export type TalkStreamEvent = TalkStreamRequiredEvent | TalkStreamOptionalEvent;

export interface NewsResponse {
  items: NewsItem[];
  timestamp?: number;
}

export interface NewsItem {
  type: string;
  timestamp?: number;
  job_id?: string;
  query_id?: string;
  message?: string;
  data?: {
    query_id?: string;
    result?: any;
  };
  from?: string;
  in_reply_to?: string;
  // Optional correlation token tying this item to a /talk session. Purely a
  // correlation hint; /news remains passive and never triggers processing.
  session_id?: string;
}

export interface NewsPostRequest {
  type: string;
  from?: string;
  in_reply_to?: string;
  message?: string;
  data?: any;
  // Optional correlation token tying this message to a /talk session.
  // Does not change /news behavior: still passive, never triggers processing.
  session_id?: string;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
}