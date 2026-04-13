# AI Chat（Vue3 + SSE + Streaming Markdown）

一个面向 **AI 流式对话** 的 Web 应用骨架：前端 Vue3（Vite + UnoCSS）+ 后端 Express（SSE）+ Monorepo（pnpm workspace），并使用 **markstream-vue** 做 **Markdown 流式渲染**（含代码高亮）。

## 项目结构（Monorepo）

```
apps/
  web/        # Vue 3 + Vite + UnoCSS（Chat UI）
  server/     # Node.js + Express（SSE：/api/chat-stream）
packages/
  shared/     # 前后端共享类型
```

## 快速开始

### 环境要求

- Node.js **>= 20** （开发版本为v22）
- pnpm（根 `package.json` 已声明 `packageManager`）

### 安装依赖

```bash
pnpm install
```

### 启动（前后端同时）

```bash
pnpm dev
```

或分别启动：

```bash
pnpm dev:server
pnpm dev:web
```

前端默认：`http://localhost:5173`  
后端默认：`http://localhost:3000`

## 功能点与实现方案（已落地）

### 1) 聊天基础 UI（ChatGPT 风格）

- **消息列表**：区分 `user` / `assistant`，气泡左右分布
- **输入框 + 发送按钮**：`Enter` 发送，`Shift+Enter` 换行
- **发送逻辑**：发送后先插入一条 `user` 消息，再插入一条空的 `assistant` 消息用于流式填充

实现位置：
- `apps/web/src/App.vue`

### 2) UnoCSS 基础样式

- 前端通过 `virtual:uno.css` 注入
- 主要用原子类实现布局与气泡样式

实现位置：
- `apps/web/uno.config.ts`
- `apps/web/vite.config.ts`（UnoCSS Vite 插件）
- `apps/web/src/main.ts`

### 3) assistant 消息使用 markstream-vue 渲染（Markdown + 代码高亮）

要求与实现：
- **Markdown 渲染**：assistant 的 `content` 用 `<MarkdownRender :content="...">`
- **代码高亮**：安装并对齐 peer：`shiki@3` + `stream-markdown`
- **流式稳定**：内容逐步 append，每次更新都会触发重新渲染；通过 markstream-vue 的批渲染参数降低卡顿/闪烁

关键配置（示例）：
- `:max-live-nodes="0"`：聊天更偏「流式批渲染」模式
- `:render-batch-size / :render-batch-delay`：降低单次 flush 压力
- `:final="..."`：流结束后收敛未闭合结构（如 code fence）

实现位置：
- `apps/web/src/App.vue`
- `apps/web/src/main.ts`（引入 `markstream-vue/index.css`）

### 4) 前端 SSE（EventSource）流式接收 + 增量 append（不整段替换）

要求与实现：
- `EventSource` 连接：`/api/chat-stream`
- `onmessage`：解析服务端 `data`，将增量 **append** 到当前 assistant：`assistant.content += chunk`
- `onerror`：关闭连接并收尾
- **实例管理**：单实例、可重连、清理监听避免泄漏

实现位置：
- `apps/web/src/composables/useChatSse.ts`

支持的服务端 `data`（前端解析策略）：
- 纯文本：直接当增量
- JSON：优先读取 `delta/content/text/chunk`
- 结束：`[DONE]` / `[END]` / `{"done": true}`

### 5) “停止生成”

要求与实现：
- 生成中显示 **停止生成** 按钮
- 点击后执行 `eventSource.close()`（封装在 `stopGeneration()`）
- 防重复点击：幂等 finalize
- 防泄漏：`onmessage/onerror` 置空 + `onUnmounted` 自动 stop

实现位置：
- `apps/web/src/composables/useChatSse.ts`
- `apps/web/src/App.vue`（按钮与 UI 状态）

### 6) 多轮对话（上下文 messages）

要求与实现：
- 前端维护 `messages` 数组（包含历史）
- 每次请求携带 **完整 messages**
- 后端直接透传给 AI API

实现细节：
- 前端将 `messages` 编码到 URL query：`/api/chat-stream?messages=<json>`
- 自动去掉末尾「占位中的 assistant」（content 为空的那条）

实现位置：
- `apps/web/src/utils/chatContext.ts`
- `apps/web/src/composables/useChatSse.ts`
- `apps/server/src/chat-stream.ts`

### 7) 上下文截断（可选优化，已实现默认策略）

目的：
- 防止 token 过长
- 防止 query 过大

实现：
- 默认只保留最近 **10** 条（可在 connect 时传 `maxContextMessages` 覆盖；`0` 表示不截断）

实现位置：
- `apps/web/src/utils/chatContext.ts`

### 8) 后端 SSE 接口（Express）

接口：
- `GET /api/chat-stream`

要求与实现：
- SSE 响应头：
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- 按 chunk 转发：
  - `res.write(\`data: xxx\n\n\`)`
- 结束：
  - `res.end()`

实现位置：
- `apps/server/src/chat-stream.ts`

### 9) 后端中断（节省 token 成本）

要求与实现：
- 监听请求关闭：
  - `req.on("close", ...)`
  - `req.on("aborted", ...)`
- 客户端关闭 SSE / 点停止 → `AbortController.abort()` → 终止上游模型请求
- `finally` 中 cancel 上游 body，释放资源

实现位置：
- `apps/server/src/chat-stream.ts`
- `apps/server/src/llm/upstream.ts`

### 10) 调用大模型 API（stream: true）并透传（已实现 OpenAI 兼容 SSE 解析）

实现策略：
- 通过环境变量提供：
  - `LLM_API_URL`（支持填写 base，如 `.../v1`，内部会补全到 `/chat/completions`）
  - `LLM_API_KEY`
  - `LLM_MODEL`
- 使用 `undici` 的 `fetch`，请求体包含：
  - `messages`
  - `stream: true`
- 上游返回 `text/event-stream`：逐行解析 `data:`，从 OpenAI 风格 `choices[0].delta.content` 提取增量
- 对前端转发：
  - `data: {"delta":"..."}\n\n`
- 完成后：
  - `data: [DONE]\n\n` + `res.end()`

实现位置：
- `apps/server/src/llm/streamModel.ts`

### 11) Vite 代理（解决跨域）

目的：
- 浏览器访问同源 `/api/...`，由 Vite 代理到后端 `http://localhost:3000`

实现位置：
- `apps/web/vite.config.ts`：
  - `server.proxy["/api"] -> http://localhost:3000`

## 共享类型（packages/shared）

共享类型：

```ts
export type Message = {
  role: "user" | "assistant";
  content: string;
};
```

依赖引用：
- `apps/web`：`"@ai-chat/shared": "workspace:*"`
- `apps/server`：`"@ai-chat/shared": "workspace:*"`

实现位置：
- `packages/shared/src/index.ts`

前端 UI 扩展（仅 UI 字段不进入 API）：
- `apps/web/src/types/chat.ts`：`ChatRow = Message & { loading?: boolean }`

## 环境变量（后端 process.env 写在哪）

在 **`apps/server/.env`** 写入（本地开发推荐）。入口 `apps/server/src/index.ts` 已 `import "dotenv/config"`，会自动加载同目录 `.env`。

模板文件：
- `apps/server/.env.example`

## 请求格式（前端 → 后端）

前端使用 EventSource 连接：

- `GET /api/chat-stream?messages=<urlencoded JSON array>`

其中 `messages` 为 `Message[]`（`packages/shared`）。

## 常用命令

- `pnpm dev`：同时启动前端与后端
- `pnpm dev:web`：仅前端
- `pnpm dev:server`：仅后端
- `pnpm typecheck`：全仓 TS 类型检查
- `pnpm build`：构建

