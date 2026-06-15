#!/usr/bin/env node

/**
 * RESTAP Talk Demo
 *
 * Demonstrates the /talk endpoint for general conversation
 * and command dispatching
 */

console.log('💬 RESTAP Talk Demo');
console.log('===================\n');

// Simulate a conversation flow
const conversation = [
  {
    request: {
      message: "Hello, what capabilities do you have?"
    },
    response: {
      reply: "Hello! I can help you with image processing tasks including upscaling and description. I also support text analysis. What would you like to do?"
    }
  },
  {
    request: {
      message: "Please upscale this image: https://example.com/image.jpg with factor 2"
    },
    response: {
      reply: "I'll upscale your image with a factor of 2. The job has been queued.",
      job_id: "job_12345",
      status: "processing"
    }
  },
  {
    request: {
      message: "What's the status of job_12345?"
    },
    response: {
      reply: "Job job_12345 is still processing. You can check /news for updates or I'll notify you when it's complete.",
      job_id: "job_12345",
      status: "processing"
    }
  }
];

conversation.forEach((exchange, index) => {
  console.log(`Exchange ${index + 1}:`);
  console.log('POST /talk');
  console.log('Body:', JSON.stringify(exchange.request, null, 2));
  console.log('\nResponse:');
  console.log(JSON.stringify(exchange.response, null, 2));
  console.log('\n' + '='.repeat(50) + '\n');
});

console.log('✅ Talk demo complete!');
console.log('\nThe /talk endpoint enables:');
console.log('• General conversation with the AI agent');
console.log('• Command dispatching and task initiation');
console.log('• Status queries for ongoing operations');
console.log('• Natural language interface to capabilities');