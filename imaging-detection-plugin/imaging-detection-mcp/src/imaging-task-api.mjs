import http from "node:http";
import https from "node:https";

import { LABEL_TO_TYPE, TYPE_MAP, getAiTaskConfig } from "./config.mjs";

export const TASK_STATUS = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Server-side bounded long-poll. Runs queryOnce() at least once, then keeps
// re-querying at pollIntervalMs until the task is no longer running or the wait
// budget (waitMs) is exhausted — whichever comes first. waitMs=0 => single check.
// `now` and `sleepFn` are injectable for testing.
export async function runBoundedPoll({
  queryOnce,
  waitMs = 0,
  pollIntervalMs = 5000,
  now = Date.now,
  sleepFn = sleep,
}) {
  const deadline = now() + Math.max(0, waitMs);

  for (;;) {
    const state = await queryOnce();
    if (state.status !== TASK_STATUS.RUNNING) return state;

    const remaining = deadline - now();
    if (remaining <= 0) return state;

    await sleepFn(Math.min(Math.max(1, pollIntervalMs), remaining));
  }
}

// AI Task API numeric status: 4 = success, 3 = failed, anything else = still running.
export function mapStatus(rawStatus) {
  if (rawStatus === 4) return TASK_STATUS.COMPLETED;
  if (rawStatus === 3) return TASK_STATUS.FAILED;
  return TASK_STATUS.RUNNING;
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function unique(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolveTypeConfig(type) {
  const typeConfig = TYPE_MAP.get(type);
  if (!typeConfig) {
    throw new Error(
      `暂不支持检测类型 ${type}，当前支持: ${[...TYPE_MAP.keys()].join(", ")}`,
    );
  }
  return typeConfig;
}

function requestJson(method, url, body, { requestTimeoutMs }) {
  const payload = body ? JSON.stringify(body) : undefined;
  const requestUrl = new URL(url);
  const transport = requestUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      requestUrl,
      {
        method,
        timeout: requestTimeoutMs,
        headers: {
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
          }
          if ((res.statusCode || 0) >= 400) {
            reject(
              new Error(`${method} ${url} failed with ${res.statusCode}: ${text}`),
            );
            return;
          }
          resolve(data);
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`${method} ${url} timed out after ${requestTimeoutMs}ms`));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// A task's result is keyed by algorithm label, so the type can be recovered from
// the result itself — no need for the caller to remember which type it created.
// Prefers a recognized label; otherwise falls back to the first available label.
export function resolveResultLabel(result) {
  const keys = Object.keys(result?.ai_result || {});
  if (keys.length === 0) {
    throw new Error("结果中没有任何算法标签，无法解析。");
  }
  const label = keys.find((key) => LABEL_TO_TYPE.has(key)) || keys[0];
  return { label, type: LABEL_TO_TYPE.get(label) || "" };
}

// Exported for unit testing: parses the AI Task API result for a given algorithm label.
export function extractDiagnostic(result, label) {
  const aiResult = result?.ai_result || {};
  const algorithmResult = aiResult[label];

  if (!algorithmResult) {
    throw new Error(
      `结果中没有算法标签 ${label}。可用标签: ${
        Object.keys(aiResult).join(", ") || "无"
      }`,
    );
  }

  const payload =
    algorithmResult.data && typeof algorithmResult.data === "object"
      ? algorithmResult.data
      : algorithmResult;

  const seriesList = Array.isArray(payload.seriesList) ? payload.seriesList : [];
  const findings = unique(seriesList.map((series) => series.imageFindings || ""));
  const conclusions = unique(seriesList.map((series) => series.conclusion || ""));
  const emergencies = unique(
    seriesList.flatMap((series) =>
      Array.isArray(series.emergency)
        ? series.emergency
            .filter((item) => item.hasEmergency)
            .map((item) =>
              stripTags(item.aiContents?.content || item.emergencyItem || ""),
            )
        : [],
    ),
  );

  return {
    viewUrl: algorithmResult.viewUrl || payload.viewUrl || "",
    findings,
    conclusions,
    emergencies,
  };
}

// Submit a new imaging task. Returns immediately with the task id; does not wait
// for the AI computation to finish. Poll with getImagingTask.
export async function createImagingTask({ type, storageUrl }) {
  const typeConfig = resolveTypeConfig(type);
  const config = getAiTaskConfig();

  const result = await requestJson(
    "POST",
    `${config.apiBase}/ai_task`,
    { url: storageUrl },
    config,
  );

  if (!result?.task_id) {
    throw new Error(`创建任务失败，响应中没有 task_id: ${JSON.stringify(result)}`);
  }

  return {
    type,
    label: typeConfig.label,
    taskId: String(result.task_id),
  };
}

// Query a task once by its (globally unique) taskId and return its current state.
// When completed, the detection type/label are recovered from the result itself and
// the structured diagnostic report and viewer url are included; when running/failed,
// a message is included.
export async function queryImagingTaskOnce({ taskId }, config = getAiTaskConfig()) {
  const result = await requestJson(
    "GET",
    `${config.apiBase}/ai_task/${encodeURIComponent(taskId)}`,
    undefined,
    config,
  );
  const status = mapStatus(result?.status);

  if (status === TASK_STATUS.RUNNING) {
    return {
      taskId,
      status,
      message: `任务仍在计算中（status=${result?.status ?? "未知"}），请用同一个 taskId 继续查询（可带 waitSeconds）。`,
    };
  }

  if (status === TASK_STATUS.FAILED) {
    return {
      taskId,
      status,
      message: `AI 计算失败: ${JSON.stringify(result)}`,
    };
  }

  const { label, type } = resolveResultLabel(result);
  const diagnostic = extractDiagnostic(result, label);
  return {
    taskId,
    type,
    label,
    status,
    report: {
      findings: diagnostic.findings,
      conclusions: diagnostic.conclusions,
      emergencies: diagnostic.emergencies,
    },
    viewUrl: diagnostic.viewUrl,
  };
}

// Query a task by taskId with optional server-side bounded long-poll. When waitMs
// is 0 this is a single query; when > 0 the call blocks server-side (polling the
// AI Task API every pollIntervalMs) until the task finishes or waitMs elapses,
// then returns the current state. Callers keep the taskId as a durable handle and
// re-invoke to resume waiting if the task is still running.
export async function getImagingTask({ taskId, waitMs = 0 }) {
  const config = getAiTaskConfig();
  return runBoundedPoll({
    queryOnce: () => queryImagingTaskOnce({ taskId }, config),
    waitMs,
    pollIntervalMs: config.pollIntervalMs,
  });
}
