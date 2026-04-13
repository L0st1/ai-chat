import type { Message } from "@ai-chat/shared";

/** 默认最多携带最近若干条，防止 query 过长与 token 爆炸（可在调用处覆盖） */
export const DEFAULT_MAX_CONTEXT_MESSAGES = 10;

/**
 * 由当前 `messages` 构造请求体：
 * - 去掉最后一条「占位中的 assistant」（流式尚未结束的那条）；
 * - 只保留 `role` + `content`；
 * - 可选只保留末尾 `maxMessages` 条。
 *
 * @param maxMessages 大于 0 时只保留末尾 `maxMessages` 条；为 `0` 时不按条数截断（仍去掉占位 assistant）
 */
export function buildMessagesForApi(
  messages: readonly Message[],
  maxMessages: number = DEFAULT_MAX_CONTEXT_MESSAGES,
): Message[] {
  if (messages.length === 0) {
    return [];
  }

  const last = messages[messages.length - 1]!;
  const withoutPendingAssistant =
    last.role === "assistant" && last.content.trim() === ""
      ? messages.slice(0, -1)
      : messages;

  const api: Message[] = withoutPendingAssistant.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (maxMessages > 0 && api.length > maxMessages) {
    return api.slice(-maxMessages);
  }
  return api;
}
