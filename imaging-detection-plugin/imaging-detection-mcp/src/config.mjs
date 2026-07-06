export const SERVER_INFO = { name: "imaging-detection", version: "1.0.0" };

export const TYPE_MAP = new Map([
  ["ich", { label: "CT_BRAIN", displayName: "卒中影像分析（ICH）" }],
  ["rib", { label: "CT_RIB", displayName: "肋骨骨折" }],
]);

// Reverse lookup: algorithm label -> detection type. Used to identify a task's
// type from its result when only a taskId is provided.
export const LABEL_TO_TYPE = new Map(
  [...TYPE_MAP].map(([type, config]) => [config.label, type]),
);

export function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function booleanFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function csvFromEnv(name) {
  return (process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizePath(pathname) {
  if (!pathname.startsWith("/")) return `/${pathname}`;
  return pathname;
}

export function getAiTaskConfig() {
  return {
    apiBase: (
      process.env.AI_TASK_API_BASE || "http://10.9.54.49:30979/api/common"
    ).replace(/\/$/, ""),
    pollIntervalMs: numberFromEnv("AI_TASK_POLL_INTERVAL_MS", 5000),
    timeoutMs: numberFromEnv("AI_TASK_TIMEOUT_MS", 600000),
    requestTimeoutMs: numberFromEnv("AI_TASK_REQUEST_TIMEOUT_MS", 30000),
    // Server-side bounded long-poll for get_imaging_task: a single query call may
    // block server-side up to maxWaitMs, returning early when the task finishes.
    // defaultWaitMs applies when the caller omits waitSeconds (0 = single check).
    maxWaitMs: numberFromEnv("AI_TASK_MAX_WAIT_MS", 120000),
    defaultWaitMs: numberFromEnv("AI_TASK_DEFAULT_WAIT_MS", 0),
  };
}

export function getHttpConfig() {
  return {
    host: process.env.HOST || "0.0.0.0",
    port: numberFromEnv("PORT", 8970),
    mcpPath: normalizePath(process.env.MCP_PATH || "/mcp"),
    sessionMode: (process.env.MCP_SESSION_MODE || "stateful").toLowerCase(),
    enableJsonResponse: booleanFromEnv("MCP_ENABLE_JSON_RESPONSE", false),
    apiKey: process.env.MCP_API_KEY || "",
    bodyLimitBytes: numberFromEnv("MCP_BODY_LIMIT_BYTES", 1024 * 1024),
    sessionIdleMs: numberFromEnv("MCP_SESSION_IDLE_MS", 30 * 60 * 1000),
    sessionSweepMs: numberFromEnv("MCP_SESSION_SWEEP_MS", 60 * 1000),
    allowedHosts: csvFromEnv("MCP_ALLOWED_HOSTS"),
    allowedOrigins: csvFromEnv("MCP_ALLOWED_ORIGINS"),
    corsAllowOrigin: process.env.MCP_CORS_ALLOW_ORIGIN || "",
  };
}
