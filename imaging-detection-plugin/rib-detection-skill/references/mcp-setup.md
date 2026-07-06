# MCP 安装与配置

本文档供 Agent 在首次安装、首次使用或 MCP 工具缺失时按需加载。

## 已知依赖与测试数据

npm 包：

```text
Package: imaging-detection-mcp
Registry: https://nexus.uihcloud.cn/repository/npm-group/
Source: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-mcp
```

在全局/用户级 MCP scope 安装配置，不要作为项目级 MCP 放入当前 workspace。

## 默认安装方式：全局 npm 安装 + stdio

```bash
npm install -g imaging-detection-mcp --registry https://nexus.uihcloud.cn/repository/npm-group/
```

安装后在新终端验证 CLI 可用：

```bash
imaging-detection-mcp --help
```

MCP client 配置（全局/用户级）：

```json
{
  "mcpServers": {
    "imaging-detection": {
      "command": "imaging-detection-mcp",
      "args": ["stdio"],
      "env": {
        "AI_TASK_API_BASE": "http://10.9.54.49:30979/api/common"
      }
    }
  }
}
```

## npx 方式（当 client 要求时）

不要使用简写 `npx -y imaging-detection-mcp stdio`，某些 npm/Windows 组合无法解析包 bin。

macOS/Linux：

```json
{
  "mcpServers": {
    "imaging-detection": {
      "command": "npx",
      "args": ["-y", "-p", "imaging-detection-mcp", "imaging-detection-mcp", "stdio"],
      "env": {
        "AI_TASK_API_BASE": "http://10.9.54.49:30979/api/common"
      }
    }
  }
}
```

Windows：

```json
{
  "mcpServers": {
    "imaging-detection": {
      "command": "npx.cmd",
      "args": ["-y", "-p", "imaging-detection-mcp", "imaging-detection-mcp", "stdio"],
      "env": {
        "AI_TASK_API_BASE": "http://10.9.54.49:30979/api/common"
      }
    }
  }
}
```

如果 Windows MCP client 无法解析 `npx.cmd`，使用 `command: "cmd"` + `args: ["/c", "npx", "-y", "-p", "imaging-detection-mcp", "imaging-detection-mcp", "stdio"]`。

## 从源码安装（兜底）

```bash
git clone https://github.com/ruanrrn/UII-Agent-Suite.git
cd UII-Agent-Suite/imaging-detection-mcp
npm install
npm install -g .
```

## 首次安装 / 首次使用检查清单

1. Node.js 可用且版本 18+。
2. 最新 `imaging-detection-mcp` 已全局安装，`imaging-detection-mcp --help` 在新终端可用。不可用则引导 `npm install -g imaging-detection-mcp --registry https://nexus.uihcloud.cn/repository/npm-group/`；源码安装仅作兜底。
3. MCP client 已在全局/用户级配置（默认 stdio）。
4. MCP client 重载后，`create_imaging_task` 和 `get_imaging_task` 均在工具列表中可见。
5. stdio 模式下 AI 软件 API 地址已知，默认 `http://10.9.54.49:30979/api/common`。
6. HTTP 模式下用户已提供 MCP HTTP URL 和 bearer API key。

在两个工具都可用之前，不要运行影像分析。

## stdio 规则

- 不要索要 HTTP 地址或 API key。
- 使用用户的 AI 软件 API 地址，或用户接受上述默认值。
- 配置写入 MCP client 的全局/用户级设置。对于 VS Code/Copilot MCP，写入用户级 MCP 设置；不要创建或更新 `.vscode/mcp.json`，除非用户明确要求项目级。
- 优先全局 `npm install -g`，然后直接运行 `imaging-detection-mcp stdio`。
- 如果必须用 `npx`，使用显式 `-p imaging-detection-mcp imaging-detection-mcp stdio` 形式。
- 配置后请用户重载/重启 MCP client，验证两个工具可用。

## 可选：HTTP 接入

仅在用户要求 HTTP/远程/内网接入时使用。

需要：
- MCP HTTP 端点，例如 `http://10.5.178.21:8970/mcp`
- bearer API key

MCP client 配置示例：

```json
{
  "mcpServers": {
    "imaging-detection": {
      "type": "http",
      "url": "http://10.5.178.21:8970/mcp",
      "headers": {
        "Authorization": "Bearer replace-with-a-long-random-key"
      }
    }
  }
}
```

HTTP 规则：
- 将示例 `url` 替换为用户提供的端点。
- 将 `replace-with-a-long-random-key` 替换为用户提供的 key。
- 配置在全局/用户级 scope。
- 不要存储、回显、记录或将 bearer key 写入文件，除非用户明确要求更新 MCP 配置。
- HTTP 鉴权失败返回 `401` 时，停止并请用户验证 bearer key。
- 配置后重载/重启 MCP client，验证两个工具可用。
