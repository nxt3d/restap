# **REST‑AP: REST Agent Protocol**

**Author:** Prem Makeig @nxt3d
**Version:** 0.1.0-beta
**Date:** 11/8/2025

## **Abstract**

REST-AP is a protocol for AI agents to expose their capabilities via standard HTTP endpoints. Instead of building custom APIs for each agent, REST-AP provides a uniform interface that makes any AI agent discoverable and usable by other systems. Agents implement three core endpoints: discovery, conversation, and task execution.

## **Goals**

* Enable AI agents to expose their capabilities via simple HTTP endpoints.

* Provide a standard way for agents to advertise their capabilities for discovery.

* Enable other agents, applications, and humans to interact with AI agents reliably.

* Support optional skill packages that help clients effectively use agent capabilities.

## **Non‑Goals**

* Defining a new transport. Use HTTP and HTTPS.

* Replacing existing auth methods. Use whatever works for your use case.

## **Key Concepts and Terms**

**Capabilities as Endpoints**. In REST‑AP, a capability maps directly to a concrete HTTP endpoint. Each capability specifies the HTTP method, endpoint path, input/output schemas, and other metadata needed for proper API interaction.

* **AI Agent**. An AI system that implements REST-AP endpoints to expose its capabilities.

* **Client**. Any agent, application, or human that discovers and interacts with AI agents.  
    
* **Capability**. A declared operation with input/output description. For example, image.upscale.

* **Skill**. A package following the Claude Code Skills standard that teaches clients how to effectively interact with AI agent endpoints. Skills use the exact same `SKILL.md` format as Claude Code Skills.

* **Catalog**. A JSON document listing available capabilities and their endpoints.

## **High Level Architecture**

REST-AP defines how AI agents expose their capabilities through standard HTTP endpoints.

1. **Discovery**. Agents publish their capabilities via `/.well-known/restap.json` for clients to discover.

2. **Talk**. Agents implement `POST /talk` for conversational interaction and capability guidance.

3. **Execute**. Agents implement capability endpoints that clients can call directly.

4. **Monitor**. Agents implement `GET /news` for clients to check on long-running operations.

### **Minimal Endpoint Set**

* `GET /.well-known/restap.json`
* `POST /talk`
* `GET /news`

## **The Catalog Document**

```json
{
  "restap_version": "1.0",
  "agent": {
    "name": "Text Analysis Agent",
    "description": "AI agent specialized in text processing and analysis",
    "contact": "agent@example.com"
  },
  "capabilities": [
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
  ]
}
```

**Note**: Use the recommended format for advertising your package. Name and type are required fields, plus any additional metadata that helps clients understand and use your package effectively. Include download/installation information so clients know how to obtain the package.

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

The input/output schemas use standard JSON Schema format to provide precise API contracts for clients.

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

**Scenario**. A text analysis AI agent that implements REST-AP endpoints.

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

3. **Use a capability**

   `POST /text/echo`

   ```json
   {"text": "Hello World"}
   ```

   Response:

   ```json
   {"job_id": "job_1", "original_text": "Hello World", "echoed_text": "Hello World"}
   ```

4. **Check for updates**

   `GET /news`

   Returns any completed jobs or status updates.

   Response:

   ```json
   {"items": [{"type": "job.completed", "job_id": "job_1"}]}
   ```

7. **Client local function or CLI command acme news-updated()** The client may expose:

## **Security**

* Use HTTPS for all requests
* Implement appropriate rate limiting
* Validate input data on both client and server

## **Why REST-AP?**

REST-AP provides a standard way for AI agents to expose their capabilities:

* **Publish** capabilities automatically via `/.well-known/restap.json`
* **Enable conversations** through the `/talk` endpoint
* **Handle task execution** via capability-specific endpoints
* **Report progress** on operations via the `/news` endpoint

Unlike plain REST APIs, REST-AP standardizes how AI agents present themselves to the world.

## **Simple Polling**

Instead of complex push notifications, REST-AP uses simple polling with the `/news` endpoint. Clients can check for updates without maintaining persistent connections.

## **For AI Agents**

REST-AP enables AI agents to expose their capabilities in a standardized way:

1. **Publish capabilities** via `/.well-known/restap.json` for easy discovery
2. **Handle conversations** through the `/talk` endpoint
3. **Execute tasks** via capability-specific endpoints
4. **Report progress** on long-running operations via `/news`

Any REST-AP compliant agent can be immediately discovered and used by other systems.

## **REST-AP + Packages = Complete AI Agent Ecosystem**

REST-AP enables AI agents to expose their capabilities, while packages provide different integration approaches:

1. **Agent Implementation**: REST-AP defines how agents expose capabilities via HTTP endpoints
2. **Package Types**: Different package types (`claude-plugin`, `npm-package`, etc.) for various integration needs
3. **Enhanced Tooling**: Full SDKs, CLI tools, and monitoring for agent developers

This combination creates a complete ecosystem where AI agents can easily expose their capabilities and clients can choose the most appropriate integration method.  