import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { SERVER_INFO, getHttpConfig } from "./config.mjs";
import { buildMcpServer } from "./mcp-server.mjs";

const sessions = new Map();

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function getSessionId(req) {
  return getHeader(req, "mcp-session-id").trim();
}

function isInitializeBody(body) {
  return Array.isArray(body)
    ? body.some((message) => isInitializeRequest(message))
    : isInitializeRequest(body);
}

function extractApiKey(req) {
  const auth = getHeader(req, "authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (match) return match[1].trim();
  }
  return getHeader(req, "x-api-key").trim();
}

function keyMatches(provided, expected) {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(body);
}

function sendMcpError(res, statusCode, code, message) {
  sendJson(res, statusCode, {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function ensureAuthorized(req, res, config) {
  if (!config.apiKey) return true;

  const provided = extractApiKey(req);
  if (provided && keyMatches(provided, config.apiKey)) return true;

  sendJson(
    res,
    401,
    {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message:
          "Unauthorized: 缺少或错误的 API key，请使用 Authorization: Bearer <key> 或 X-Api-Key。",
      },
      id: null,
    },
    { "WWW-Authenticate": "Bearer" },
  );
  return false;
}

function applyCors(req, res, config) {
  if (!config.corsAllowOrigin) return;

  const origin = getHeader(req, "origin");
  const allowOrigin =
    config.corsAllowOrigin === "*"
      ? "*"
      : config.corsAllowOrigin
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .includes(origin)
        ? origin
        : "";

  if (!allowOrigin) return;

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version, X-Api-Key",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}

function readBody(req, config) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > config.bodyLimitBytes) {
        reject(new Error(`Request body too large: limit is ${config.bodyLimitBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function buildTransportOptions(config, { stateful }) {
  const useHeaderProtection =
    config.allowedHosts.length > 0 || config.allowedOrigins.length > 0;

  return {
    sessionIdGenerator: stateful ? randomUUID : undefined,
    enableJsonResponse: config.enableJsonResponse,
    ...(useHeaderProtection
      ? {
          allowedHosts:
            config.allowedHosts.length > 0 ? config.allowedHosts : undefined,
          allowedOrigins:
            config.allowedOrigins.length > 0 ? config.allowedOrigins : undefined,
          enableDnsRebindingProtection: true,
        }
      : {}),
  };
}

function createMcpSession(config) {
  const server = buildMcpServer();
  let sessionId;
  const transport = new StreamableHTTPServerTransport({
    ...buildTransportOptions(config, { stateful: true }),
    onsessioninitialized: (id) => {
      sessionId = id;
      sessions.set(id, {
        server,
        transport,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
      });
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
    },
  });

  transport.onerror = (error) => {
    process.stderr.write(`MCP HTTP transport error: ${error.stack || error}\n`);
  };
  transport.onclose = () => {
    if (sessionId) sessions.delete(sessionId);
    server.close();
  };

  return { server, transport };
}

async function handleStatelessMcp(req, res, body, config) {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport(
    buildTransportOptions(config, { stateful: false }),
  );

  transport.onerror = (error) => {
    process.stderr.write(`MCP HTTP transport error: ${error.stack || error}\n`);
  };

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

async function handleStatefulMcp(req, res, body, config) {
  let session = null;
  const sessionId = getSessionId(req);

  if (sessionId) {
    session = sessions.get(sessionId);
    if (!session) {
      sendMcpError(res, 404, -32001, "Session not found");
      return;
    }
    session.lastActivityAt = Date.now();
  } else if (req.method === "POST" && isInitializeBody(body)) {
    session = createMcpSession(config);
    await session.server.connect(session.transport);
  } else {
    sendMcpError(res, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
    return;
  }

  await session.transport.handleRequest(req, res, body);
}

async function handleMcp(req, res, config) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!ensureAuthorized(req, res, config)) return;

  let body;
  if (req.method === "POST") {
    try {
      body = await readBody(req, config);
    } catch (error) {
      sendMcpError(
        res,
        error.message?.includes("too large") ? 413 : 400,
        -32700,
        error.message?.includes("too large")
          ? error.message
          : "Parse error: 请求体不是合法 JSON。",
      );
      return;
    }
  }

  try {
    if (config.sessionMode === "stateless") {
      await handleStatelessMcp(req, res, body, config);
    } else {
      await handleStatefulMcp(req, res, body, config);
    }
  } catch (error) {
    process.stderr.write(`MCP HTTP request error: ${error.stack || error}\n`);
    if (!res.headersSent) {
      sendMcpError(res, 500, -32603, "Internal server error.");
    }
  }
}

async function closeSession(sessionId, session) {
  sessions.delete(sessionId);
  try {
    await session.transport.close();
  } catch {
    // ignore
  }
  try {
    await session.server.close();
  } catch {
    // ignore
  }
}

// Periodically evict sessions that have been idle longer than sessionIdleMs so a
// client that connects and disappears does not leak server/transport instances.
function startSessionReaper(config) {
  if (!config.sessionIdleMs || config.sessionIdleMs <= 0) return null;

  const sweepMs = Math.max(
    1000,
    Math.min(config.sessionSweepMs || 60_000, config.sessionIdleMs),
  );

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions) {
      if (now - session.lastActivityAt > config.sessionIdleMs) {
        void closeSession(sessionId, session);
      }
    }
  }, sweepMs);

  timer.unref?.();
  return timer;
}

export function createHttpServer(config = getHttpConfig()) {
  return http.createServer(async (req, res) => {
    applyCors(req, res, config);

    const pathname = (req.url || "/").split("?")[0];

    if (req.method === "GET" && (pathname === "/" || pathname === "/health")) {
      sendJson(res, 200, {
        status: "ok",
        server: SERVER_INFO,
        mcpPath: config.mcpPath,
        sessionMode: config.sessionMode,
        activeSessions: sessions.size,
      });
      return;
    }

    if (pathname !== config.mcpPath) {
      sendMcpError(res, 404, -32601, `Not found: ${pathname}`);
      return;
    }

    await handleMcp(req, res, config);
  });
}

export function startHttpServer(config = getHttpConfig()) {
  const httpServer = createHttpServer(config);
  const sessionReaper = startSessionReaper(config);

  async function shutdown(signal) {
    process.stderr.write(`Received ${signal}, shutting down...\n`);
    if (sessionReaper) clearInterval(sessionReaper);
    httpServer.close();
    for (const [sessionId, session] of sessions) {
      await closeSession(sessionId, session);
    }
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  httpServer.listen(config.port, config.host, () => {
    process.stderr.write(
      `imaging-detection MCP server listening on http://${config.host}:${config.port}${config.mcpPath}\n`,
    );
    process.stderr.write(
      `Transport: Streamable HTTP, sessionMode=${config.sessionMode}\n`,
    );
    process.stderr.write(
      config.apiKey
        ? "API key auth: enabled (MCP_API_KEY)\n"
        : "API key auth: disabled (set MCP_API_KEY before publishing HTTP)\n",
    );
  });

  return httpServer;
}
