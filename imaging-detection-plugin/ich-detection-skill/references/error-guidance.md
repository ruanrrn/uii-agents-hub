# 错误引导

本文档供 Agent 在遇到错误时按需加载。原则：给出最小修正。

## 输入类错误

| 场景 | 处理 |
| --- | --- |
| 缺少检测类型 | 询问用户选择 ICH 或 RIB |
| 不支持的类型 | 解释当前仅支持 ICH 和 RIB |
| 缺少 URL/文件 | 索要远程 `.7z` URL 或本地 `.7z` 路径 |
| URL 是 `localhost` 或 `127.0.0.1` | 解释 AI Task API 无法访问用户 loopback 地址 |
| 本地文件不是 `.7z` | 索要 DICOM `.7z` 文件 |
| 本地文件 7z magic 校验失败 | 索要有效的 7z 文件 |
| 文件服务 URL 不可达 | 索要可达的内网 IP、开放端口或远程存储 URL |

## MCP 类错误

| 场景 | 处理 |
| --- | --- |
| MCP server 缺失或卡在 `Waiting for server to respond to initialize request` | 先在新终端验证 `imaging-detection-mcp --help` 可用。不可用则引导 `npm install -g imaging-detection-mcp --registry https://nexus.uihcloud.cn/repository/npm-group/`。然后配置用户级 stdio MCP：`command: "imaging-detection-mcp"`，`args: ["stdio"]`。如需 `npx`，使用显式包+bin 形式（macOS/Linux `npx`，Windows `npx.cmd`，兜底 `cmd /c npx`）。避免简写 `npx -y imaging-detection-mcp stdio`；源码安装仅作兜底。 |
| MCP 工具缺失 | 引导首次安装（`references/mcp-setup.md`），默认 stdio，验证 `create_imaging_task` 和 `get_imaging_task` 出现在工具列表 |
| stdio 缺少 AI 软件 API URL | 索要并提供默认 `http://10.9.54.49:30979/api/common` |
| HTTP 请求但 URL/key 缺失 | 索要 HTTP 端点和 bearer API key |
| HTTP `401` | 请用户验证 bearer key |

## 任务类错误

| 场景 | 处理 |
| --- | --- |
| 任务一直 `running` | 保持 `taskId`，继续 `get_imaging_task`（`waitSeconds: 30`~`60`），不要创建重复任务 |
| AI 分析失败 | 展示 `create_imaging_task` 或 `get_imaging_task` 的错误信息及相关非敏感上下文（`type`、`storageUrl`、`taskId`），不要暴露密钥 |
