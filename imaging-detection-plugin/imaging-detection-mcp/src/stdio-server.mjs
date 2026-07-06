import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { buildMcpServer } from "./mcp-server.mjs";

export async function startStdioServer() {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();

  transport.onerror = (error) => {
    process.stderr.write(`MCP stdio transport error: ${error.stack || error}\n`);
  };

  await server.connect(transport);
  process.stderr.write("imaging-detection MCP server listening on stdio\n");
}
