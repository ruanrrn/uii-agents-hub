#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const client = new Client({
  name: "imaging-detection-stdio-smoke",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["bin/imaging-detection-mcp.mjs", "stdio"],
  cwd: rootDir,
  env: process.env,
  stderr: "pipe",
});

let stderr = "";
transport.stderr?.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  await client.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        server: client.getServerVersion(),
        tools: tools.tools.map((tool) => tool.name),
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.close().catch(() => {});
  if (stderr) process.stderr.write(stderr);
  throw error;
}
