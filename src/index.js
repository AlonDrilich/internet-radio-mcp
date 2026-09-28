#!/usr/bin/env node
// @ts-check
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { SERVER_NAME, SERVER_VERSION, createServer } from './server.js';

const arg = process.argv[2];
if (arg === '--version' || arg === '-v') {
  process.stdout.write(`${SERVER_VERSION}\n`);
  process.exit(0);
}
if (arg === '--help' || arg === '-h') {
  process.stdout.write(
    `${SERVER_NAME} ${SERVER_VERSION}\n` +
      'MCP server (stdio) for internet radio, using the public-domain Radio Browser directory.\n' +
      'Run it from an MCP client, e.g.: claude mcp add internet-radio -- npx -y github:AlonDrilich/internet-radio-mcp\n' +
      'Env: RADIO_BROWSER_MIRRORS (comma-separated base URLs), RADIO_BROWSER_TIMEOUT_MS (default 8000).\n'
  );
  process.exit(0);
}

// stdout is the JSON-RPC channel: log to stderr only.
const handle = serveStdio(() => createServer(), {
  onerror: error => console.error(`[${SERVER_NAME}] ${error.message}`)
});
console.error(`${SERVER_NAME} ${SERVER_VERSION} running on stdio`);

const shutdown = () => {
  void handle.close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
