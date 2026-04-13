import type { Message } from "@ai-chat/shared";
import type { Express, Request, Response } from "express";
import { formatErrorCause } from "./formatError.js";
import { pipeModelStreamToSse } from "./llm/streamModel.js";

function parseMessagesQuery(raw: unknown): Message[] | null {
  if (typeof raw !== "string" || raw.trim() === "") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const out: Message[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const o = item as Record<string, unknown>;
    const role = o.role;
    const content = o.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return null;
    }
    out.push({ role, content });
  }
  return out;
}

function setSseHeaders(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "AbortError")
  );
}

export function registerChatStreamRoute(app: Express) {
  app.get("/api/chat-stream", (req: Request, res: Response) => {
    const messages = parseMessagesQuery(req.query.messages);
    if (!messages) {
      res.status(400).json({ error: "invalid or missing messages (JSON array query param)" });
      return;
    }
    if (messages.length === 0) {
      res.status(400).json({ error: "messages must be non-empty" });
      return;
    }

    const ac = new AbortController();

    /** 浏览器关闭页签、停止 EventSource、代理断开等 → 中止上游大模型请求，节省 token */
    const stopAiStream = () => {
      ac.abort();
    };

    req.on("close", stopAiStream);
    req.on("aborted", stopAiStream);

    setSseHeaders(res);
    res.status(200);

    void (async () => {
      try {
        await pipeModelStreamToSse(messages, res, ac.signal);
      } catch (err) {
        if (ac.signal.aborted || isAbortError(err)) {
          return;
        }
        if (!res.headersSent) {
          res.status(500).json({ error: formatErrorCause(err) });
          return;
        }
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          } catch {
            /* ignore */
          }
        }
      } finally {
        req.off("close", stopAiStream);
        req.off("aborted", stopAiStream);
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.end();
          } catch {
            /* ignore */
          }
        }
      }
    })();
  });
}
