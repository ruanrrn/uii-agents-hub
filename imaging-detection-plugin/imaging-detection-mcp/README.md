# Imaging Detection MCP Server

An MCP server for imaging detection. It exposes two tools:

- `create_imaging_task` — submits a DICOM 7z URL to an AI Task API and returns a `taskId` immediately, without waiting for the AI computation.
- `get_imaging_task` — checks a task's state (`running` / `completed` / `failed`); when complete it returns a structured diagnostic report plus a viewer URL. Supports an optional server-side bounded long-poll via `waitSeconds`.

The AI computation can take minutes. Splitting create from get lets the client poll on its own cadence instead of holding a single tool call open, which avoids client-side request timeouts. To cut down on the number of round trips, `get_imaging_task` also accepts `waitSeconds`: the call blocks server-side for up to that long (capped by `AI_TASK_MAX_WAIT_MS`), returning early as soon as the task finishes. A handful of `waitSeconds=30~60` calls then replaces dozens of tight polls, while keeping the `taskId` as a durable, resumable handle.

This package supports both MCP transports:

- **stdio** for local MCP clients that spawn the server process.
- **Streamable HTTP** for intranet or remote MCP clients.

## Requirements

- Node.js 18+
- Network access from this server to the AI Task API
- A DICOM 7z URL that the AI Task API can access

## Installation

Install globally for stdio MCP clients:

```bash
npm install -g @rayruan/imaging-detection-mcp
```

Then configure your MCP client to run the global `imaging-detection-mcp` command.

For local development from source:

```bash
npm install
```

One-off npm-style usage is also supported:

```bash
npx @rayruan/imaging-detection-mcp
```

## Tools

### `create_imaging_task`

Submit a task. Returns immediately with a `taskId`; does not wait for the AI computation.

Input:

```json
{
  "type": "ich",
  "storageUrl": "http://10.9.54.21:8001/ich/example.7z"
}
```

Fields:

| Field        | Required | Description                                                                                                       |
| ------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `type`       | Yes      | Detection type. Supported values: `ich`, `rib`.                                                                   |
| `storageUrl` | Yes      | Full downloadable DICOM 7z URL. The AI Task API must be able to access it. Do not use `localhost` or `127.0.0.1`. |

Structured output:

```json
{
  "type": "ich",
  "label": "CT_BRAIN",
  "taskId": "a1b2c3d4",
  "status": "submitted"
}
```

### `get_imaging_task`

Query a task by its `taskId`. The `taskId` is globally unique, so `type` is not required — the detection type and algorithm label are recovered from the result.

Input:

```json
{
  "taskId": "a1b2c3d4",
  "waitSeconds": 60
}
```

Fields:

| Field         | Required | Description                                                                                                                                                                                                                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `taskId`      | Yes      | The `taskId` returned by `create_imaging_task`.                                                                                                                                                                                                                                      |
| `waitSeconds` | No       | Server-side bounded long-poll budget. `0` or omitted = a single check (omitted uses `AI_TASK_DEFAULT_WAIT_MS`); `> 0` blocks server-side up to that many seconds, returning early when the task finishes. Clamped to `AI_TASK_MAX_WAIT_MS` (default `120` s). Recommended `30`–`60`. |

Structured output depends on `status`:

- `running` — still computing (long-poll budget elapsed before it finished); call again with the same `taskId`.

  ```json
  { "taskId": "a1b2c3d4", "status": "running", "message": "..." }
  ```

- `failed` — computation failed.

  ```json
  { "taskId": "a1b2c3d4", "status": "failed", "message": "..." }
  ```

- `completed` — report ready (`type`/`label` identified from the result).

  ```json
  {
    "taskId": "a1b2c3d4",
    "type": "ich",
    "label": "CT_BRAIN",
    "status": "completed",
    "report": {
      "findings": ["..."],
      "conclusions": ["..."],
      "emergencies": ["..."]
    },
    "viewUrl": "http://10.9.54.100:30979/index?StudyUID=..."
  }
  ```

Typical flow: call `create_imaging_task` once, then call `get_imaging_task` with the returned `taskId` and `waitSeconds` (e.g. `60`), repeating while `status` is `running` until it is `completed` or `failed`.

## Detection Type Mapping

| `type` | AI Task API label | Description                   |
| ------ | ----------------- | ----------------------------- |
| `ich`  | `CT_BRAIN`        | Stroke / ICH imaging analysis |
| `rib`  | `CT_RIB`          | Rib fracture analysis         |

To add a new detection type, update `TYPE_MAP` in `src/config.mjs`.

## stdio Usage

Start stdio transport:

```bash
imaging-detection-mcp
```

Equivalent:

```bash
imaging-detection-mcp stdio
npm run start:stdio
node bin/imaging-detection-mcp.mjs
node bin/imaging-detection-mcp.mjs stdio
```

MCP client configuration example:

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

stdio does not use `MCP_API_KEY`, because the MCP client launches the process locally. Use normal OS/file permissions to control who can run it. For VS Code/Copilot MCP, add this server to the user-level/global MCP configuration when you want it available across workspaces.

## Streamable HTTP Usage

Start HTTP transport:

```bash
imaging-detection-mcp http
```

Equivalent:

```bash
imaging-detection-mcp-http
npm run start:http
node bin/imaging-detection-mcp.mjs http
node bin/imaging-detection-mcp-http.mjs
node server.mjs
```

Default endpoints:

- MCP endpoint: `http://0.0.0.0:8970/mcp`
- Health check: `http://127.0.0.1:8970/health`

For intranet publishing, set a bearer key:

```powershell
$env:HOST="0.0.0.0"
$env:PORT="8970"
$env:MCP_PATH="/mcp"
$env:MCP_API_KEY="replace-with-a-long-random-key"
$env:AI_TASK_API_BASE="http://10.9.54.49:30979/api/common"
npm run start:http
```

HTTP MCP client configuration example:

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

The HTTP server accepts either:

- `Authorization: Bearer <key>`
- `X-Api-Key: <key>`

If `MCP_API_KEY` is unset, HTTP authentication is disabled. That is only recommended for local development.

## CLI

```bash
imaging-detection-mcp                 # stdio transport by default
imaging-detection-mcp stdio           # stdio transport
imaging-detection-mcp http            # Streamable HTTP transport
imaging-detection-mcp --transport=http
imaging-detection-mcp-http            # Streamable HTTP transport
```

## Environment Variables

| Variable                     | Default                              | Applies to | Description                                                                                   |
| ---------------------------- | ------------------------------------ | ---------- | --------------------------------------------------------------------------------------------- |
| `AI_TASK_API_BASE`           | `http://10.9.54.49:30979/api/common` | both       | AI Task API base URL.                                                                         |
| `AI_TASK_POLL_INTERVAL_MS`   | `5000`                               | both       | AI task polling interval (also used as the server-side long-poll interval).                   |
| `AI_TASK_TIMEOUT_MS`         | `600000`                             | both       | Total AI task timeout.                                                                        |
| `AI_TASK_REQUEST_TIMEOUT_MS` | `30000`                              | both       | Per-request AI Task API timeout.                                                              |
| `AI_TASK_MAX_WAIT_MS`        | `120000`                             | both       | Upper bound on `get_imaging_task`'s server-side long-poll (`waitSeconds` is clamped to this). |
| `AI_TASK_DEFAULT_WAIT_MS`    | `0`                                  | both       | Server-side long-poll used when the caller omits `waitSeconds` (`0` = single check).          |
| `HOST`                       | `0.0.0.0`                            | HTTP       | HTTP bind host.                                                                               |
| `PORT`                       | `8970`                               | HTTP       | HTTP bind port.                                                                               |
| `MCP_PATH`                   | `/mcp`                               | HTTP       | MCP endpoint path.                                                                            |
| `MCP_API_KEY`                | empty                                | HTTP       | Enables bearer/API-key authentication when set.                                               |
| `MCP_SESSION_MODE`           | `stateful`                           | HTTP       | `stateful` uses `Mcp-Session-Id`; `stateless` creates a temporary instance per request.       |
| `MCP_ENABLE_JSON_RESPONSE`   | `false`                              | HTTP       | Return JSON responses instead of SSE streams.                                                 |
| `MCP_BODY_LIMIT_BYTES`       | `1048576`                            | HTTP       | MCP request body size limit.                                                                  |
| `MCP_SESSION_IDLE_MS`        | `1800000`                            | HTTP       | Idle timeout for stateful sessions; idle sessions are evicted. `0` disables reaping.          |
| `MCP_SESSION_SWEEP_MS`       | `60000`                              | HTTP       | How often the idle-session reaper runs.                                                       |
| `MCP_ALLOWED_HOSTS`          | empty                                | HTTP       | Optional comma-separated allowed Host values.                                                 |
| `MCP_ALLOWED_ORIGINS`        | empty                                | HTTP       | Optional comma-separated allowed Origin values.                                               |
| `MCP_CORS_ALLOW_ORIGIN`      | empty                                | HTTP       | Optional browser CORS allow-list.                                                             |

## Validation

Syntax check:

```bash
npm run check
```

stdio smoke test:

```bash
npm run smoke:stdio
```

HTTP smoke test:

```powershell
$env:MCP_API_KEY="smoke-key"
$env:PORT="8971"
npm run start:http

# In another terminal:
$env:MCP_API_KEY="smoke-key"
$env:MCP_SERVER_URL="http://127.0.0.1:8971/mcp"
npm run smoke:http
```

Unit tests (offline, no AI Task API needed):

```bash
npm test
```

`smoke` tests only initialize MCP and list tools. They do not call `create_imaging_task`, so they do not submit an AI task.

## Security Notes

- Do not commit real `MCP_API_KEY` values.
- Use a long random key when publishing the HTTP transport on an intranet.
- Prefer `stdio` for local-only clients.
- Use `MCP_ALLOWED_HOSTS` / `MCP_ALLOWED_ORIGINS` when the HTTP endpoint is exposed beyond a trusted subnet.
- `storageUrl` must not contain secrets unless the AI Task API is authorized to access them.
