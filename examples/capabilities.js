#!/usr/bin/env node

/**
 * REST-AP Capabilities Demo
 *
 * Demonstrates how to use specific capabilities from the catalog
 */

console.log('⚡ REST-AP Capabilities Demo');
console.log('===========================\n');

// Example capability usage
const capabilities = [
  {
    id: "image.upscale",
    title: "Upscale an image",
    method: "POST",
    endpoint: "/image/upscale",
    example: {
      request: {
        image_url: "https://example.com/image.jpg",
        factor: 2,
        format: "png"
      },
      response: {
        job_id: "job_123",
        status: "processing",
        estimated_time: "30s"
      }
    }
  },
  {
    id: "text.summarize",
    title: "Summarize text",
    method: "POST",
    endpoint: "/text/summarize",
    example: {
      request: {
        text: "REST-AP is a protocol for building AI agents that provides a minimal bootstrap-and-package model for discovering capabilities, installing language-native skills, establishing sessions, and accessing free or paid operations using plain REST semantics.",
        max_length: 50,
        style: "concise"
      },
      response: {
        summary: "REST-AP provides a minimal protocol for AI agents to discover capabilities, install skills, establish sessions, and perform operations using REST semantics.",
        word_count: 28,
        compression_ratio: 0.45
      }
    }
  }
];

capabilities.forEach((cap, index) => {
  console.log(`${index + 1}. ${cap.title} (${cap.id})`);
  console.log(`   Method: ${cap.method}`);
  console.log(`   Endpoint: ${cap.endpoint}\n`);

  console.log('   Example Request:');
  console.log(`   ${cap.method} ${cap.endpoint}`);
  console.log('   Body:', JSON.stringify(cap.example.request, null, 2));

  console.log('\n   Example Response:');
  console.log(JSON.stringify(cap.example.response, null, 2));

  console.log('\n' + '='.repeat(60) + '\n');
});

console.log('✅ Capabilities demo complete!');
console.log('\nEach capability:');
console.log('• Maps directly to an HTTP endpoint');
console.log('• Has defined input/output schemas');
console.log('• Supports both sync and async operations');
console.log('• Can be free or require payment');
console.log('• May support sessions for state management');