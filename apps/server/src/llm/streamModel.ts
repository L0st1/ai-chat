import type { Message } from "@ai-chat/shared";
import type { Response as ExpressResponse } from "express";
import { fetch } from "undici";
import { formatErrorCause } from "../formatError.js";
import { getLlmProxyDispatcher } from "./proxyAgent.js";
import { cancelResponseBody } from "./upstream.js";

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

/** OpenAI 兼容接口需 POST `/v1/chat/completions`；若只配了 base（如 `.../v1`）则补全路径 */
function resolveChatCompletionsUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

/** 写入一条 SSE `message` 事件（单帧 `data` 行） */
export function writeSseData(res: ExpressResponse, data: string) {
  res.write(`data: ${data}\n\n`);
}

/** 解析 OpenAI 兼容的 text/event-stream 行，产出文本增量 */
async function* decodeUpstreamAsTextDeltas(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const rawLine of block.split("\n")) {
          const line = rawLine.replace(/\r$/, "");
          if (!line.startsWith("data: ")) {
            continue;
          }
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            return;
          }
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string | null } }>;
            };
            const t = json.choices?.[0]?.delta?.content;
            if (typeof t === "string" && t.length > 0) {
              yield t;
            }
          } catch {
            /* 非 JSON 行跳过 */
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 非 2xx 时读取 JSON/text，优先 OpenAI 风格 `error.message` */
async function readUpstreamErrorDetail(upstream: FetchResponse): Promise<string> {
  try {
    const raw = await upstream.text();
    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }
    try {
      const j = JSON.parse(trimmed) as {
        error?: { message?: string; code?: string };
        message?: string;
      };
      const msg = j.error?.message ?? j.message;
      if (typeof msg === "string" && msg.length > 0) {
        const code = j.error?.code;
        return code ? `${msg} (${code})` : msg;
      }
    } catch {
      /* 非 JSON，用原文 */
    }
    return trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}…` : trimmed;
  } catch {
    return "";
  }
}

/**
 * 将大模型流式结果转发到 Express 响应。
 *
 * **中断**：`signal` 来自路由里 `req.on("close")` / `aborted` 绑定的 `AbortController`。
 * 环境变量见 `apps/server/.env`（由入口 `import "dotenv/config"` 加载）。
 */
export async function pipeModelStreamToSse(
  messages: Message[],
  res: ExpressResponse,
  signal: AbortSignal,
): Promise<void> {
  let upstream: FetchResponse | undefined;
  try {
    const url = process.env.LLM_API_URL;
    const key = process.env.LLM_API_KEY;
    if (!url || !key) {
      throw new Error("missing LLM_API_URL or LLM_API_KEY in environment");
    }

    const endpoint = resolveChatCompletionsUrl(url);
    const dispatcher = getLlmProxyDispatcher();

    try {
      upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL,
          messages: messages.slice(-(process.env.LLM_MESSAGES_MAX_LENGTH ?? 10)), // 只保留最近10条
          stream: true,
          max_tokens: process.env.LLM_MAX_TOKENS ?? 500, // 最大token数
        }),
        signal,
        ...(dispatcher ? { dispatcher } : {}),
      });
    } catch (err) {
      throw new Error(`upstream fetch failed: ${formatErrorCause(err)}`);
    }
    if (!upstream.ok) {
      const detail = upstream.body ? await readUpstreamErrorDetail(upstream) : "";
      const hint =
        !detail && (upstream.status === 402 || upstream.status === 403)
          ? " (402/403 通常表示点数、订阅或 API Key 权限；请检查服务商账户与模型名)"
          : "";
      throw new Error(
        detail ? `LLM error ${upstream.status}: ${detail}` : `LLM error: ${upstream.status}${hint}`,
      );
    }
    if (!upstream.body) {
      throw new Error(`LLM error: ${upstream.status} (no response body)`);
    }
    for await (const text of decodeUpstreamAsTextDeltas(upstream.body)) {
      if (signal.aborted) {
        return;
      }
      writeSseData(res, JSON.stringify({ delta: text }));
    }
  } finally {
    await cancelResponseBody(upstream);
  }

  if (signal.aborted) {
    return;
  }

  writeSseData(res, "[DONE]");
  res.end();
}
