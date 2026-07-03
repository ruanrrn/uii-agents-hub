#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

process.on("uncaughtException", (error) => {
  console.error(`Error: ${error.message || String(error)}`);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error(`Error: ${error?.message || String(error)}`);
  process.exit(1);
});

const DEFAULT_PORT = 18080;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_TTL_SECONDS = 3600;
const SEVEN_Z_MAGIC = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.file) {
  printUsage(args.help ? 0 : 1);
}

const filePath = path.resolve(args.file);
const host = args.host || process.env.DICOM_FILE_SERVER_HOST || DEFAULT_HOST;
const port = Number(args.port || process.env.DICOM_FILE_SERVER_PORT || DEFAULT_PORT);
const ttlSeconds = Number(args.ttl || process.env.DICOM_FILE_SERVER_TTL_SECONDS || DEFAULT_TTL_SECONDS);
const publicHost =
  args.publicHost || process.env.DICOM_FILE_SERVER_PUBLIC_HOST || detectPublicHost();
const token = args.token || randomBytes(18).toString("hex");
const fileName = path.basename(filePath);

await validateArchive(filePath, { testArchive: Boolean(args.testArchive) });

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const expectedPath = `/files/${token}/${encodeURIComponent(fileName)}`;

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(res, 200, { status: "ok", file: fileName, expiresAt });
    return;
  }

  if (!["GET", "HEAD"].includes(req.method || "")) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }

  if (requestUrl.pathname !== expectedPath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": "application/x-7z-compressed",
    "Content-Length": stat.size,
    "Content-Disposition": buildContentDisposition(fileName),
    "Cache-Control": "no-store",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
});

const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${publicHost}:${actualPort}/files/${token}/${encodeURIComponent(fileName)}`;
  const healthUrl = `http://${publicHost}:${actualPort}/health`;

  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        healthUrl,
        host,
        publicHost,
        port: actualPort,
        file: filePath,
        expiresAt,
      },
      null,
      2,
    ),
  );

  if (!args.publicHost && !process.env.DICOM_FILE_SERVER_PUBLIC_HOST) {
    console.error(
      "Warning: publicHost was auto-detected. Verify the AI Task API can access this URL from its network.",
    );
  }
});

server.on("error", (error) => {
  console.error(`File server failed: ${error.message}`);
  process.exit(1);
});

setTimeout(() => {
  server.close(() => process.exit(0));
}, ttlSeconds * 1000).unref();

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--host") parsed.host = argv[++i];
    else if (arg === "--port") parsed.port = argv[++i];
    else if (arg === "--public-host") parsed.publicHost = argv[++i];
    else if (arg === "--ttl") parsed.ttl = argv[++i];
    else if (arg === "--token") parsed.token = argv[++i];
    else if (arg === "--test-archive") parsed.testArchive = true;
    else if (!parsed.file) parsed.file = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function printUsage(exitCode) {
  const usage = [
    "Usage:",
    "  node scripts/serve-dicom-7z.mjs <dicom.7z> --public-host <intranet-ip> [--port 18080] [--ttl 3600]",
    "",
    "Options:",
    "  --host <host>             Bind host. Default: 0.0.0.0",
    "  --port <port>             Bind port. Use 0 for a random port. Default: 18080",
    "  --public-host <host>      Host/IP used in the generated URL. Must be reachable by AI Task API.",
    "  --ttl <seconds>           Server lifetime. Default: 3600",
    "  --test-archive            Also run 7z/7za integrity test when available.",
  ].join("\n");
  console.error(usage);
  process.exit(exitCode);
}

async function validateArchive(targetPath, { testArchive }) {
  const stat = await fs.promises.stat(targetPath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`File not found: ${targetPath}`);
  }
  if (stat.size < SEVEN_Z_MAGIC.length) {
    throw new Error(`File is too small to be a valid 7z archive: ${targetPath}`);
  }
  if (path.extname(targetPath).toLowerCase() !== ".7z") {
    throw new Error(`Expected a .7z file: ${targetPath}`);
  }

  const fd = await fs.promises.open(targetPath, "r");
  try {
    const buffer = Buffer.alloc(SEVEN_Z_MAGIC.length);
    await fd.read(buffer, 0, buffer.length, 0);
    if (!buffer.equals(SEVEN_Z_MAGIC)) {
      throw new Error(`File magic bytes do not match 7z format: ${targetPath}`);
    }
  } finally {
    await fd.close();
  }

  if (testArchive) {
    await runSevenZipTest(targetPath);
  }
}

function runSevenZipTest(targetPath) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "7z.exe" : "7z";
    const child = spawn(command, ["t", targetPath], { stdio: "ignore" });

    child.on("error", () => {
      const fallback = process.platform === "win32" ? "7za.exe" : "7za";
      const fallbackChild = spawn(fallback, ["t", targetPath], { stdio: "ignore" });
      fallbackChild.on("error", () => resolve());
      fallbackChild.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`7z archive integrity test failed with exit code ${code}`));
      });
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`7z archive integrity test failed with exit code ${code}`));
    });
  });
}

function detectPublicHost() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }
  return "127.0.0.1";
}

function buildContentDisposition(name) {
  const asciiFallback = String(name)
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
