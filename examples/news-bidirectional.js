#!/usr/bin/env node

/**
 * RESTAP /news Endpoint Demo
 *
 * Demonstrates /news as a single bidirectional endpoint:
 * - GET /news: Read updates (no processing)
 * - POST /news: Write messages/replies (no processing)
 *
 * Key Point: /news never triggers agent processing, unlike /talk
 */

console.log('📰 RESTAP /news Endpoint Demo');
console.log('==================================\n');
console.log('Key Concept: /news is a SINGLE endpoint for reading and writing.');
console.log('Unlike /talk, /news NEVER triggers agent processing.\n');
console.log('='.repeat(60) + '\n');

// Example 1: Polling for updates (GET /news)
console.log('1. Polling for Updates (GET /news)\n');

console.log('GET /news?since=0');
console.log('\nResponse:');
const pollingResponse = {
  items: [
    {
      type: "job.completed",
      timestamp: 1703012345000,
      job_id: "job_1",
      query_id: "job_1",
      data: {
        query_id: "job_1",
        result: {
          original_text: "Hello World",
          echoed_text: "Hello World"
        }
      }
    },
    {
      type: "job.completed",
      timestamp: 1703012350000,
      job_id: "job_2",
      query_id: "job_2",
      data: {
        query_id: "job_2",
        result: {
          original_text: "abc",
          reversed_text: "cba"
        }
      }
    }
  ],
  timestamp: 1703012355000
};
console.log(JSON.stringify(pollingResponse, null, 2));

console.log('\n' + '='.repeat(60) + '\n');

// Example 2: Receiving replies (POST /news)
console.log('2. Receiving Replies from Other Agents (POST /news)\n');

const replyExamples = [
  {
    scenario: "Agent B sends reply to Agent A",
    request: {
      type: "reply",
      from: "agent-b",
      in_reply_to: "query_123",
      message: "Here's the best practice for buttons: Use clear labels, proper contrast, and adequate spacing."
    },
    response: {
      status: "received",
      news_id: "news_1",
      message: "Message stored successfully"
    }
  },
  {
    scenario: "Agent C sends notification",
    request: {
      type: "notification",
      from: "agent-c",
      message: "Your task has been completed successfully."
    },
    response: {
      status: "received",
      news_id: "news_2",
      message: "Message stored successfully"
    }
  }
];

replyExamples.forEach((example, index) => {
  console.log(`Example ${index + 1}: ${example.scenario}`);
  console.log('POST /news');
  console.log('Body:', JSON.stringify(example.request, null, 2));
  console.log('\nResponse:');
  console.log(JSON.stringify(example.response, null, 2));
  console.log('\n' + '='.repeat(60) + '\n');
});

// Example 3: Complete agent-to-agent flow
console.log('3. Complete Agent-to-Agent Communication Flow\n');

console.log('Step 1: Agent A sends message to Agent B');
console.log('POST http://agent-b.example.com/talk');
console.log('Body:', JSON.stringify({
  message: "What are best practices for buttons?",
  from: "agent-a"
}, null, 2));
console.log('\nResponse:');
console.log(JSON.stringify({
  query_id: "query_123",
  status: "processing"
}, null, 2));

console.log('\nStep 2: Agent B processes and sends reply directly to Agent A');
console.log('POST http://agent-a.example.com/news');
console.log('Body:', JSON.stringify({
  type: "reply",
  from: "agent-b",
  in_reply_to: "query_123",
  message: "Best practices: Use clear labels, proper contrast, adequate spacing."
}, null, 2));
console.log('\nResponse:');
console.log(JSON.stringify({
  status: "received",
  news_id: "news_1",
  message: "Message stored successfully"
}, null, 2));

console.log('\nStep 3: Agent A polls for the reply');
console.log('GET http://agent-a.example.com/news?since=0');
console.log('\nResponse:');
console.log(JSON.stringify({
  items: [{
    type: "reply",
    timestamp: 1703012400000,
    from: "agent-b",
    in_reply_to: "query_123",
    message: "Best practices: Use clear labels, proper contrast, adequate spacing."
  }],
  timestamp: 1703012405000
}, null, 2));

console.log('\n✅ /news endpoint demo complete!');
console.log('\nKey Points:');
console.log('• /news is a SINGLE bidirectional endpoint (GET for reading, POST for writing)');
console.log('• GET /news: Read updates (no processing triggered, free to poll)');
console.log('• POST /news: Write messages/replies (no processing triggered, prevents loops)');
console.log('• Unlike /talk, /news NEVER triggers agent processing');
console.log('• This design enables safe bidirectional agent-to-agent communication');
console.log('• Clear attribution with in_reply_to linking responses to queries');