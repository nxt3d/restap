#!/usr/bin/env node

/**
 * REST-AP Protocol Demo
 *
 * This script demonstrates the basic REST-AP protocol flow:
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
    provider: {
      name: "Demo Provider",
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
        input_schema: "https://demo.example.com/schemas/text.summarize.input.json",
        output_schema: "https://demo.example.com/schemas/text.summarize.output.json"
      },
      {
        id: "image.describe",
        title: "Describe an image",
        method: "POST",
        endpoint: "/image/describe",
        input_schema: "https://demo.example.com/schemas/image.describe.input.json",
        output_schema: "https://demo.example.com/schemas/image.describe.output.json"
      }
    ]
  },

  talk: {
    reply: "Hello! I'm a REST-AP compatible AI agent. I can help you with text summarization and image description tasks."
  }
};

console.log('🚀 REST-AP Protocol Demo');
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
console.log('   Body: {"text": "REST-AP is a protocol for AI agents...", "max_length": 100}\n');

console.log('   Response:');
console.log(JSON.stringify({
  summary: "REST-AP provides a minimal protocol for AI agents to discover capabilities, install skills, and perform operations using REST semantics.",
  word_count: 85
}, null, 2));

console.log('\n✅ Demo completed!');
console.log('\nTo run individual demos:');
console.log('  npm run demo:discovery');
console.log('  npm run demo:talk');
console.log('  npm run demo:capabilities');
console.log('  npm run demo:verification');