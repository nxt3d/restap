# Text Tools Claude Plugin

A complete Claude Code plugin demonstrating REST-AP integration. This plugin provides text processing capabilities by connecting Claude to a REST-AP compliant AI agent.

## 🚀 Quick Start

### Prerequisites
- [Claude Code](https://code.claude.com/) installed
- Node.js (for running the REST-AP server)

### 1. Start the REST-AP Agent Server

First, start the REST-AP demo agent that the plugin will connect to:

```bash
# In the main project directory
cd ../  # Go to rest-ap project root
npm install
npm run dev
```

The server will start on `http://localhost:3000` and display:
```
🤖 REST-AP Demo Agent running on http://localhost:3000
📋 Discovery endpoint: http://localhost:3000/.well-known/restap.json
💬 Talk endpoint: http://localhost:3000/talk
📰 News endpoint: http://localhost:3000/news
❤️ Health check: http://localhost:3000/health
```

### 2. Load the Plugin in Claude

Open a new terminal and start Claude with the plugin:

```bash
# Load the plugin for testing
claude --plugin-dir ./example-plugin
```

### 3. Test the Integration

In Claude, try these commands:

```bash
# Check what skills are available
What skills are available?

# Ask about agent capabilities
What can you do?

# Test text processing
Please echo this text: "Hello from Claude!"

# Try reverse operation
Please reverse this text: "Claude is awesome"
```

## 📋 What This Plugin Does

### Skills Provided
- **`text-agent-client`**: Teaches Claude how to properly interact with REST-AP text processing agents

### Capabilities Enabled
- **Text Echo**: Send text to agent and get it echoed back
- **Text Reverse**: Send text and get it reversed
- **Agent Discovery**: Automatically find agent capabilities
- **Error Handling**: Proper error handling for network issues
- **Async Monitoring**: Track long-running operations

## 🏗️ Plugin Architecture

```
example-plugin/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── skills/
│   └── text-agent-skill/
│       └── SKILL.md        # Claude skill definition
├── lib/
│   └── client.js           # REST-AP client library
├── docs/
│   └── README.md           # This file
└── package.json            # NPM package info
```

## 🔧 Manual Installation (Alternative)

If you prefer to install manually:

```bash
# Copy skill to Claude's personal skills directory
cp skills/text-agent-skill/SKILL.md ~/.claude/skills/
cp -r lib/ ~/.claude/skills/text-agent-skill/

# Restart Claude to load the skill
```

## 🎯 Skill Behavior

The `text-agent-client` skill teaches Claude:

1. **How to discover** agent capabilities via `/.well-known/restap.json`
2. **How to communicate** using the `/talk` endpoint for guidance
3. **How to execute** operations on `/text/echo` and `/text/reverse` endpoints
4. **How to handle** JSON request/response formats
5. **How to monitor** operations via the `/news` endpoint

### Example Skill Usage

When you ask Claude: *"Please echo 'Hello World'"*

The skill automatically:
1. Checks agent capabilities
2. Formats the request: `POST /text/echo {"text": "Hello World"}`
3. Sends to the agent
4. Parses the response
5. Presents results to you

## 🧪 Testing the Integration

### Server Tests
```bash
# Test server is running
curl http://localhost:3000/health

# Check agent capabilities
curl http://localhost:3000/.well-known/restap.json

# Test talk endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"message":"What can you do?"}' \
  http://localhost:3000/talk
```

### Claude Plugin Tests
```bash
# Start Claude with plugin
claude --plugin-dir ./example-plugin

# In Claude, test:
What skills are available?
What packages does the agent offer?
Please echo "test message"
```

## 🔄 Development Workflow

1. **Modify Server**: Edit `../src/server.ts` for agent behavior
2. **Update Skills**: Edit `skills/text-agent-skill/SKILL.md` for guidance
3. **Test Integration**: Restart both server and Claude
4. **Iterate**: Refine based on real usage

## 📚 REST-AP Protocol Overview

This plugin demonstrates the complete REST-AP workflow:

1. **Discovery** → Agent advertises capabilities
2. **Communication** → Claude talks to agent for guidance
3. **Execution** → Claude calls agent endpoints
4. **Monitoring** → Track async operations

## 🤝 Contributing

- Report issues with the REST-AP server or Claude integration
- Suggest improvements to the skill definitions
- Test with different Claude Code versions

## 📄 License

MIT - See main project LICENSE file.