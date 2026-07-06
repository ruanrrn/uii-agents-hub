---
name: ich-detection-skill
description: "Use when the user asks to run an ICH / stroke / brain hemorrhage imaging analysis — e.g. '给张三做一次卒中影像分析（ich）检查', '对脑出血影像做ich检测', '帮我分析这个脑卒中CT', '脑出血影像分析'. Covers installing/verifying the imaging-detection MCP dependency, normalizing user input (remote 7z URL or local .7z file), submitting via create_imaging_task, polling via get_imaging_task, and presenting the diagnostic report (findings, conclusions, emergencies) plus viewer URL. Supports stdio MCP (default) and optional HTTP MCP access."
---

# ICH Detection Skill

对 DICOM 影像做**卒中 / 脑出血（ICH）** AI 检测。将用户输入归一化为 `{ type: "ich", storageUrl }`，通过 `imaging-detection-mcp` 的两个工具完成分析并展示诊断报告。

> **按需加载**：本 SKILL.md 只包含核心流程。安装配置、工具详情、错误排查等参考文档放在 `references/` 下，需要时用 `read_file` 加载。

## 检测类型

| 用户措辞 | MCP type | AI Task label |
| --- | --- | --- |
| `ICH`、`ich`、`脑卒中`、`卒中`、`脑出血`、`颅内出血` | `ich` | `CT_BRAIN` |

如果用户意图不明确或同时提到肋骨，询问用户确认是 ICH 还是 RIB。

## 前置检查

开始分析前，确认两个 MCP 工具可用：`create_imaging_task` 和 `get_imaging_task`。

如果任一工具缺失，**不要继续分析**，改为执行首次安装引导。加载 `references/mcp-setup.md` 获取完整安装与配置步骤。

快速检查清单：
1. Node.js 18+
2. `imaging-detection-mcp` 已全局安装（`imaging-detection-mcp --help` 可用）
3. MCP client 已配置（默认 stdio）
4. 两个工具在 MCP 工具列表中可见

## 输入通道

### 通道 A：远程 7z URL

用户提供了一个可下载的 DICOM `.7z` URL。

校验：
- 协议为 `http://` 或 `https://`
- 不是 `localhost` 或 `127.0.0.1`
- 路径或用户说明指向 `.7z` 文件

直接使用该 URL 作为 `storageUrl`。如果 URL 是内网地址，提醒用户 AI Task API 所在网络必须能访问。

### 通道 B：本地 7z 文件

用户提供了本地文件路径。使用内置脚本临时发布为可访问 URL：

```powershell
node scripts/serve-dicom-7z.mjs "<path-to-file.7z>" --public-host "<intranet-ip>" --port 18080 --ttl 3600
```

脚本会校验文件、验证 7z magic bytes、在随机 token 路径下暴露该文件、输出 JSON（含 `url`），TTL 到期自动退出。

使用输出的 `url` 作为 `storageUrl`。

注意：
- 优先使用用户提供的 `--public-host`（内网 IP）
- 不要用 `localhost` / `127.0.0.1` 作为分析 URL
- 确保端口防火墙放行、AI Task API 网络可达
- 分析期间保持文件服务存活，结束后关闭或等 TTL 过期

## 分析流程

1. 确认 `create_imaging_task` 和 `get_imaging_task` 可用。缺失则走首次安装引导（`references/mcp-setup.md`）。
2. 识别输入通道（远程 URL 或本地文件）。
3. 归一化检测类型为 `ich`。
4. 生成有效的远程 `storageUrl`：
   - 通道 A：校验提供的 URL。
   - 通道 B：运行 `scripts/serve-dicom-7z.mjs`，使用输出的 `url`。
5. 调用 `create_imaging_task`：
   ```json
   { "type": "ich", "storageUrl": "<storageUrl>" }
   ```
6. 保存返回的 `taskId`，告知用户任务已提交（可能耗时数分钟）。
7. 调用 `get_imaging_task`：
   ```json
   { "taskId": "<taskId>", "waitSeconds": 30 }
   ```
8. 如果状态为 `running`，重复调用 `get_imaging_task`（`waitSeconds: 30~60`）。不要重复提交任务。
9. 如果状态为 `failed`，展示错误信息并停止。
10. 如果状态为 `completed`，展示：findings、conclusions、emergencies、viewer URL。
11. 尝试用浏览器打开 viewer URL；失败则清晰提供链接。

## 工具详情

`create_imaging_task` 和 `get_imaging_task` 的完整字段说明、返回结构、长轮询策略，见 `references/mcp-tools.md`。

## 可选端到端测试

仅在用户明确要求验证时使用：

```json
{
  "type": "ich",
  "storageUrl": "https://cdn.jsdelivr.net/gh/ruanrrn/UII-Agent-Suite@main/stroke-imaging-analysis/imaging-data/ich/%E5%BC%A0%E4%B8%89.7z"
}
```

运行前告知用户这会真实调用 AI Task API。

## 错误引导

给出最小修正：
- 缺少检测类型 → 询问 ICH 还是 RIB
- 缺少 URL/文件 → 索要远程 `.7z` URL 或本地 `.7z` 路径
- URL 是 `localhost`/`127.0.0.1` → 解释 AI Task API 无法访问 loopback
- 本地文件非 `.7z` → 索要 DICOM `.7z` 文件
- MCP 工具缺失 → 走首次安装引导（`references/mcp-setup.md`）
- 任务一直 `running` → 保持 `taskId`，继续 `get_imaging_task`，不要重复创建
- AI 分析失败 → 展示错误，给出非敏感上下文（`type`、`storageUrl`、`taskId`）

完整错误排查见 `references/error-guidance.md`。

## 响应格式

任务创建后、完成前：

```text
影像检测任务已创建

检查类型: ICH
任务 ID: <taskId>

正在等待 AI 计算结果...
```

分析完成：

```text
影像分析完成

检查类型: ICH
任务 ID: <taskId>

影像所见:
...

结论:
...

危急值:
...

Viewer:
<viewer url>
```

无危急值时显示 `危急值: 未返回`。
