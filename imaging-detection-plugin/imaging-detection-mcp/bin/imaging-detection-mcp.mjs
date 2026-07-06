#!/usr/bin/env node
import { startHttpServer } from "../src/http-server.mjs";
import { startStdioServer } from "../src/stdio-server.mjs";

const args = process.argv.slice(2);
const command = parseCommand(args);

if (command === "help") {
  printHelp();
  process.exit(0);
}

if (command === "http") {
  startHttpServer();
} else if (command === "stdio") {
  await startStdioServer();
} else {
  process.stderr.write(`Unknown command: ${command}\n\n`);
  printHelp();
  process.exit(1);
}

function parseCommand(argv) {
  const first = argv[0];

  if (!first) return process.env.MCP_TRANSPORT || "stdio";
  if (first === "--help" || first === "-h" || first === "help") return "help";
  if (first === "stdio" || first === "--stdio") return "stdio";
  if (first === "http" || first === "server" || first === "--http") return "http";
  if (first === "--transport") return argv[1] || "stdio";
  if (first.startsWith("--transport=")) return first.slice("--transport=".length);

  return first;
}

function printHelp() {
  process.stdout.write(`imaging-detection-mcp

Usage:
  imaging-detection-mcp                 Start stdio transport (default)
  imaging-detection-mcp stdio           Start stdio transport
  imaging-detection-mcp http            Start Streamable HTTP server
  imaging-detection-mcp --transport=http

HTTP environment:
  HOST=0.0.0.0
  PORT=8970
  MCP_PATH=/mcp
  MCP_API_KEY=<optional-bearer-key>

AI Task API environment:
  AI_TASK_API_BASE=http://10.9.54.49:30979/api/common
  AI_TASK_POLL_INTERVAL_MS=5000
  AI_TASK_TIMEOUT_MS=600000
  AI_TASK_REQUEST_TIMEOUT_MS=30000
`);
}
