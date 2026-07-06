import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { SERVER_INFO, TYPE_MAP, getAiTaskConfig } from "./config.mjs";
import {
  TASK_STATUS,
  createImagingTask,
  getImagingTask,
} from "./imaging-task-api.mjs";

const typeValues = [...TYPE_MAP.keys()];

function typeSchema() {
  return z
    .enum(typeValues)
    .describe(
      `影像检测类型，决定提取哪个算法标签。支持: ${typeValues.join(", ")}`,
    );
}

function toToolError(error) {
  return {
    content: [
      { type: "text", text: `错误: ${error?.message || String(error)}` },
    ],
    isError: true,
  };
}

function formatCreated(created) {
  return [
    "=== 已创建影像检测任务 ===",
    `检查类型: ${created.type} (${created.label})`,
    `任务 ID: ${created.taskId}`,
    "",
    `任务已提交，AI 计算需要一段时间。请使用 get_imaging_task 轮询：`,
    `{ "type": "${created.type}", "taskId": "${created.taskId}" }`,
  ].join("\n");
}

function formatTaskResult(result) {
  if (result.status === TASK_STATUS.RUNNING) {
    return `任务 ${result.taskId} 仍在计算中，请用同一个 taskId 再次调用 get_imaging_task（建议带 waitSeconds=30~60 以减少调用次数）。${
      result.message ? `\n${result.message}` : ""
    }`;
  }
  if (result.status === TASK_STATUS.FAILED) {
    return `任务 ${result.taskId} 计算失败。\n${result.message || ""}`;
  }

  const typeConfig = TYPE_MAP.get(result.type);
  const report = result.report || {};
  const lines = [
    "=== 诊断结果 ===",
    `检查: ${typeConfig?.displayName || result.type || result.label || "影像检测"}`,
  ];

  if (report.findings?.length) {
    lines.push("", "影像所见:");
    for (const finding of report.findings) lines.push(finding);
  }
  if (report.conclusions?.length) {
    lines.push("", "结论:");
    for (const conclusion of report.conclusions) lines.push(conclusion);
  }
  if (report.emergencies?.length) {
    lines.push("", "危急值:");
    for (const emergency of report.emergencies) lines.push(`- ${emergency}`);
  }
  if (result.viewUrl) {
    lines.push("", `查看地址: ${result.viewUrl}`);
  }

  return lines.join("\n");
}

export function buildMcpServer() {
  const server = new McpServer(SERVER_INFO);

  server.registerTool(
    "create_imaging_task",
    {
      title: "创建影像检测任务",
      description:
        "根据检测类型和 DICOM 7z 下载地址向 AI Task API 提交一个影像检测任务，立即返回 taskId，不等待计算完成。随后使用 get_imaging_task 轮询结果。",
      inputSchema: {
        type: typeSchema(),
        storageUrl: z
          .string()
          .url()
          .describe(
            "DICOM 7z 压缩包的完整可下载 URL。AI 服务必须能访问该地址，请不要使用 localhost 或 127.0.0.1。",
          ),
      },
      outputSchema: {
        type: z.string(),
        label: z.string(),
        taskId: z.string(),
        status: z.string(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
    },
    async (args) => {
      try {
        const created = await createImagingTask(args);
        const structured = { ...created, status: "submitted" };
        return {
          content: [{ type: "text", text: formatCreated(created) }],
          structuredContent: structured,
        };
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_imaging_task",
    {
      title: "查询影像检测任务",
      description:
        "根据 taskId 查询影像检测任务状态。taskId 全局唯一，无需再提供 type。支持服务端有界长轮询：传入 waitSeconds（推荐 30~60）后，本次调用会在服务端最多等待这么久，期间任务完成/失败则立即返回；否则返回 running，你再用同一个 taskId 继续调用即可。这样只需少量几次调用即可拿到结果，避免高频空轮询。完成返回结构化诊断报告和 viewer url（type/label 从结果自动识别）。",
      inputSchema: {
        taskId: z
          .string()
          .min(1)
          .describe("create_imaging_task 返回的任务 ID。"),
        waitSeconds: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "服务端有界长轮询的等待秒数。0 或省略表示只查询一次（省略时使用服务端默认值 AI_TASK_DEFAULT_WAIT_MS）；大于 0 则本次调用最多在服务端等待这么久，任务完成即提前返回。超过服务端上限（AI_TASK_MAX_WAIT_MS，默认 120 秒）会被截断。推荐 30~60。",
          ),
      },
      outputSchema: {
        taskId: z.string(),
        status: z.enum([
          TASK_STATUS.RUNNING,
          TASK_STATUS.COMPLETED,
          TASK_STATUS.FAILED,
        ]),
        type: z.string().optional(),
        label: z.string().optional(),
        message: z.string().optional(),
        report: z
          .object({
            findings: z.array(z.string()),
            conclusions: z.array(z.string()),
            emergencies: z.array(z.string()),
          })
          .optional(),
        viewUrl: z.string().optional(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async (args) => {
      try {
        const config = getAiTaskConfig();
        const maxWaitSeconds = Math.floor(config.maxWaitMs / 1000);
        const requestedSeconds =
          args.waitSeconds ?? Math.floor(config.defaultWaitMs / 1000);
        const waitSeconds = Math.min(
          Math.max(0, requestedSeconds),
          maxWaitSeconds,
        );

        const result = await getImagingTask({
          taskId: args.taskId,
          waitMs: waitSeconds * 1000,
        });
        return {
          content: [{ type: "text", text: formatTaskResult(result) }],
          structuredContent: result,
        };
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  return server;
}
