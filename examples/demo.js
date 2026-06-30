#!/usr/bin/env node

/**
 * RESTAP Protocol Demo
 *
 * This script demonstrates the basic RESTAP protocol flow:
 * 1. Discovery - Fetch the catalog from /.well-known/restap.json
 * 2. Talk - Send a message to /talk endpoint
 * 3. Capabilities - Use specific capabilities from the catalog
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock server responses for demonstration
const mockResponses = {
  catalog: {
    restap_version: "1.0",
    agent: {
      name: "Demo Agent",
      description: "AI agent for text and image tasks",
      contact: "demo@example.com"
    },
    packages: [
      {
        language: "javascript",
        registry: "npm",
        name: "@demo/restap",
        version: "^1.0.0"
      }
    ],
    capabilities: [
      {
        id: "text.summarize",
        title: "Summarize text",
        method: "POST",
        endpoint: "/text/summarize",
        input_schema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text to summarize" }
          },
          required: ["text"]
        },
        output_schema: {
          type: "object",
          properties: {
            summary: { type: "string" }
          }
        }
      },
      {
        id: "image.describe",
        title: "Describe an image",
        method: "POST",
        endpoint: "/image/describe",
        input_schema: {
          type: "object",
          properties: {
            image_url: { type: "string", description: "URL of the image to describe" }
          },
          required: ["image_url"]
        },
        output_schema: {
          type: "object",
          properties: {
            description: { type: "string" }
          }
        }
      }
    ]
  },

  talk: {
    reply: "Hello! I'm a RESTAP compatible AI agent. I can help you with text summarization and image description tasks."
  }
};

console.log('🚀 RESTAP Protocol Demo');
console.log('========================\n');

// 1. Discovery
console.log('1. 📋 Discovery - Fetching catalog from /.well-known/restap.json');
console.log('   GET https://api.example.com/.well-known/restap.json\n');

console.log('   Response:');
console.log(JSON.stringify(mockResponses.catalog, null, 2));
console.log('\n');

// 2. Talk
console.log('2. 💬 Talk - Sending message to /talk endpoint');
console.log('   POST https://api.example.com/talk');
console.log('   Body: {"message": "Hello, what can you do?"}\n');

console.log('   Response:');
console.log(JSON.stringify(mockResponses.talk, null, 2));
console.log('\n');

// 3. Capabilities
console.log('3. ⚡ Capabilities - Available operations:');
mockResponses.catalog.capabilities.forEach((cap, index) => {
  console.log(`   ${index + 1}. ${cap.title} (${cap.method} ${cap.endpoint})`);
});
console.log('\n');

// 4. Example capability usage
console.log('4. 📝 Example: Using text.summarize capability');
console.log('   POST https://api.example.com/text/summarize');
console.log('   Body: {"text": "RESTAP is a protocol for AI agents...", "max_length": 100}\n');

console.log('   Response:');
console.log(JSON.stringify({
  summary: "RESTAP provides a minimal protocol for AI agents to discover capabilities, install skills, and perform operations using REST semantics.",
  word_count: 85
}, null, 2));

console.log('\n✅ Demo completed!');
console.log('\nTo run individual demos:');
console.log('  npm run demo:discovery');
console.log('  npm run demo:talk');
console.log('  npm run demo:capabilities');
console.log('  npm run demo:verification');