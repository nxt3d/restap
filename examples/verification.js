#!/usr/bin/env node

/**
 * RESTAP Skill Package Verification Demo
 *
 * Demonstrates on-chain verification of skill packages
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

console.log('🔐 RESTAP Skill Package Verification Demo');
console.log('==========================================\n');

// Simulate package verification process
const packageInfo = {
  name: "@acme/restap",
  version: "1.2.0",
  registry: "npm",
  ensName: "acme.tools.eth",
  key: "pkg:@acme/restap@1.2.0:sha256"
};

// Mock on-chain data (normally fetched from ENS)
const onChainData = {
  "pkg:@acme/restap@1.2.0:sha256": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
};

// Simulate downloading and hashing a package
console.log('📦 Verifying skill package integrity...\n');

// Simulate package tarball content (normally downloaded from npm)
const mockPackageContent = `{
  "name": "@acme/restap",
  "version": "1.2.0",
  "main": "index.js",
  "scripts": {
    "talk": "node talk.js",
    "upscale": "node upscale.js"
  }
}`;

// Calculate local hash
const localHash = createHash('sha256')
  .update(mockPackageContent)
  .digest('hex');

const expectedHash = onChainData[packageInfo.key].replace('0x', '');

console.log('Package:', packageInfo.name + '@' + packageInfo.version);
console.log('Registry:', packageInfo.registry);
console.log('ENS Name:', packageInfo.ensName);
console.log('Verification Key:', packageInfo.key);
console.log('');

console.log('🔍 Verification Steps:');
console.log('1. Download package tarball from npm registry');
console.log('2. Calculate SHA-256 hash of tarball');
console.log('3. Fetch expected hash from ENS record');
console.log('4. Compare local hash with on-chain hash');
console.log('');

console.log('📊 Hash Comparison:');
console.log('Local Hash:   ', '0x' + localHash);
console.log('On-Chain Hash:', onChainData[packageInfo.key]);

const hashesMatch = localHash === expectedHash;
console.log('Match:', hashesMatch ? '✅ YES' : '❌ NO');

if (hashesMatch) {
  console.log('\n✅ Package verification successful!');
  console.log('The skill package can be safely installed and used.');
} else {
  console.log('\n❌ Package verification failed!');
  console.log('The package may have been tampered with. Installation aborted.');
}

console.log('\n🔒 Security Benefits:');
console.log('• Ensures package integrity before installation');
console.log('• Trust-minimized verification using blockchain');
console.log('• Protection against supply chain attacks');
console.log('• Independent of package registry security');