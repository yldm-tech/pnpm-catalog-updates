#!/usr/bin/env node

import path from 'path';
import url, { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import and run the CLI
const modulePath = url.pathToFileURL(path.join(__dirname, '..', 'dist', 'index.js')).href;
const { main } = await import(modulePath);

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
