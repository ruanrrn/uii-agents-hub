#!/usr/bin/env node
const serverUrl = process.env.MCP_SERVER_URL || "http://127.0.0.1:8970/mcp";
const apiKey = process.env.MCP_API_KEY || "";
const protocolVersion = process.env.MCP_PROTOCOL_VERSION || "2025-06-18";

let nextId = 1;
let sessionId = "";

function buildHeaders(extra = {}) {
  return {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    ...(sessionId ? { "MCP-Protocol-Version": protocolVersion } : {}),
    ...extra,
  };
}

async function post(method, params) {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method,
      ...(params === undefined ? {} : { params }),
    }),
  });

  const receivedSessionId = response.headers.get("mcp-session-id");
  if (receivedSessionId) sessionId = receivedSessionId;

  const payload = await readMcpPayload(response);
  if (!response.ok) {
    throw new Error(`${method} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload?.error) {
    throw new Error(`${method} failed: ${JSON.stringify(payload.error)}`);
  }
  return payload?.result;
}

async function notify(method, params) {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      ...(params === undefined ? {} : { params }),
    }),
  });

  if (!response.ok && response.status !== 202) {
    const payload = await readMcpPayload(response);
    throw new Error(`${method} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
}

async function readMcpPayload(response) {
  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean);
    if (dataLines.length === 0) return null;
    return JSON.parse(dataLines[dataLines.length - 1]);
  }

  return JSON.parse(text);
}

async function terminateSession() {
  if (!sessionId) return;
  const response = await fetch(serverUrl, {
    method: "DELETE",
    headers: {
      Accept: "application/json, text/event-stream",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      "Mcp-Session-Id": sessionId,
      "MCP-Protocol-Version": protocolVersion,
    },
  });
  if (!response.ok) {
    throw new Error(`DELETE session failed with HTTP ${response.status}`);
  }
}

const initializeResult = await post("initialize", {
  protocolVersion,
  capabilities: {},
  clientInfo: { name: "imaging-detection-smoke", version: "1.0.0" },
});

await notify("notifications/initialized");
const tools = await post("tools/list");
await terminateSession();

const toolNames = (tools?.tools || []).map((tool) => tool.name);
console.log(
  JSON.stringify(
    {
      ok: true,
      server: initializeResult?.serverInfo,
      protocolVersion: initializeResult?.protocolVersion,
      sessionId: sessionId ? "<received>" : "<none>",
      tools: toolNames,
    },
    null,
    2,
  ),
);
