#!/usr/bin/env node

/**
 * Hello World Deploy Script (Node.js)
 *
 * This is a simple example deploy script that demonstrates:
 * - Basic script structure
 * - Environment variable access
 * - Console output that gets captured by the deploy service
 */

console.log('='.repeat(60));
console.log('🚀 Hello World Deploy Script');
console.log('='.repeat(60));
console.log('');

console.log('📦 Project Directory:', process.cwd());
console.log('🕒 Timestamp:', new Date().toISOString());
console.log('🖥️  Platform:', process.platform);
console.log('📍 Node Version:', process.version);
console.log('');

console.log('✅ Deploy script executed successfully!');
console.log('');
console.log('This is where you would typically:');
console.log('  - Build your application');
console.log('  - Run tests');
console.log('  - Upload artifacts');
console.log('  - Deploy to servers');
console.log('  - Send notifications');
console.log('');

console.log('='.repeat(60));
console.log('✨ Deployment Complete!');
console.log('='.repeat(60));

// Exit with success code
process.exit(0);
