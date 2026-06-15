#!/usr/bin/env node

/**
 * RESTAP Discovery Demo
 *
 * Demonstrates the discovery phase where a client fetches
 * the catalog from /.well-known/restap.json
 */

console.log('🔍 RESTAP Discovery Demo');
console.log('=========================\n');

const catalog = {
  restap_version: "1.0",
  provider: {
    name: "Acme Vision",
    contact: "support@acme.test"
  },
  packages: [
    {
      language: "javascript",
      registry: "npm",
      name: "@acme/restap",
      version: "^1.2.0",
      hash: {
        algo: "sha256",
        value: "0xabcdef1234567890",
        chain_proof: {
          chain: "Ethereum",
          registry: "ens",
          name: "acme.tools.eth",
          key: "pkg:@acme/restap@1.2.0:sha256",
          value: "0xabcdef1234567890"
        }
      }
    }
  ],
  capabilities: [
    {
      id: "image.upscale",
      title: "Upscale an image",
      method: "POST",
      endpoint: "/image/upscale",
      input_schema: "https://acme.test/schemas/image.upscale.input.json",
      output_schema: "https://acme.test/schemas/image.upscale.output.json"
    },
    {
      id: "image.describe",
      title: "Describe an image",
      method: "POST",
      endpoint: "/image/describe",
      input_schema: "https://acme.test/schemas/image.describe.input.json",
      output_schema: "https://acme.test/schemas/image.describe.output.json"
    }
  ]
};

console.log('Client: Discovering capabilities...');
console.log('GET /.well-known/restap.json\n');

console.log('Server Response:');
console.log(JSON.stringify(catalog, null, 2));

console.log('\n📋 Discovered capabilities:');
catalog.capabilities.forEach(cap => {
  console.log(`  • ${cap.title} (${cap.id})`);
});

console.log('\n📦 Available skill package:');
console.log(`  • ${catalog.packages[0].name}@${catalog.packages[0].version}`);
console.log(`  • Registry: ${catalog.packages[0].registry}`);

console.log('\n✅ Discovery complete!');