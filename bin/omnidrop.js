#!/usr/bin/env node

/**
 * OmniDrop CLI Runner
 * Starts the OmniDrop daemon and opens the AirDrop Radar UI
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const shouldOpen = !args.includes('--no-open');
const portIndex = args.indexOf('--port');
const customPort = portIndex !== -1 ? args[portIndex + 1] : (process.env.PORT || '53317');

console.log('📡 Starting OmniDrop P2P Engine...');

// Start the server process
const serverPath = path.join(__dirname, '..', 'server.js');
const env = { ...process.env, PORT: customPort };
const serverProcess = spawn(process.execPath, [serverPath], { env, stdio: 'inherit' });

serverProcess.on('error', (err) => {
  console.error('Failed to start OmniDrop server:', err);
  process.exit(1);
});

// Auto-open browser after a short delay
if (shouldOpen) {
  setTimeout(() => {
    const url = `http://localhost:${customPort}`;
    let openCmd = '';
    if (process.platform === 'darwin') openCmd = `open "${url}"`;
    else if (process.platform === 'win32') openCmd = `start "" "${url}"`;
    else openCmd = `xdg-open "${url}"`;

    if (openCmd) {
      exec(openCmd, (err) => {
        if (!err) console.log(`✨ Opened AirDrop Radar UI in your default browser: ${url}`);
      });
    }
  }, 1000);
}

process.on('SIGINT', () => {
  serverProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  serverProcess.kill('SIGTERM');
  process.exit(0);
});

