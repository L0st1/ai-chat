import { computed, onUnmounted, readonly, shallowRef } from "vue";
import type { Message } from "@ai-chat/shared";
import {
  buildMessagesForApi,
  DEFAULT_MAX_CONTEXT_MESSAGES,
} from "@/utils/chatContext";

const CHAT_STREAM_PATH = "/api/chat-stream";

export type ChatSseHandlers = {
  /** 将服务端增量追加到当前 assistant，勿整段替换 */
  onAppend: (chunk: string) => void;
  /** 流结束、错误、用户停止或连接被关闭时调用（应幂等） */
  onClosed: () => void;
};

export type ChatStreamConnectOptions = ChatSseHandlers & {
  /** 前端维护的完整列表；会去掉末尾占位 assistant 并截断后再编码进 URL */
  messages: readonly Message[];
  /** 覆盖默认的上下文条数上限；`0` 表示不截断 */
  maxContextMessages?: number;
};

function parseSsePayload(data: string): { type: "append"; chunk: string } | { type: "done" } {
  const trimmed = data.trim();
  if (trimmed === "[DONE]" || trimmed === "[END]") {
    return { type: "done" };
  }

  try {
    const obj = JSON.parse(data) as Record<string, unknown>;
    const keys = ["delta", "content", "text", "chunk"] as const;
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.length > 0) {
        return { type: "append", chunk: v };
      }
    }
    if (typeof obj.done === "boolean" && obj.done) {
      return { type: "done" };
    }
  } catch {
    // 非 JSON，按纯文本增量处理
  }

  return { type: "append", chunk: data };
}

function buildStreamUrl(options: ChatStreamConnectOptions): string {
  const cap =
    options.maxContextMessages === 0
      ? 0
      : (options.maxContextMessages ?? DEFAULT_MAX_CONTEXT_MESSAGES);
  const payload = buildMessagesForApi(options.messages, cap);
  const q = encodeURIComponent(JSON.stringify(payload));
  return `${CHAT_STREAM_PATH}?messages=${q}`;
}

/**
 * 管理 EventSource（/api/chat-stream）：携带完整多轮 messages；onmessage 增量追加。
 */
export function useChatSse() {
  const eventSource = shallowRef<EventSource | null>(null);
  let finalizeCurrent: (() => void) | null = null;

  function detachEventSource(es: EventSource) {
    es.onmessage = null;
    es.onerror = null;
  }

  function disconnectRaw() {
    const es = eventSource.value;
    if (!es) return;
    detachEventSource(es);
    eventSource.value = null;
    es.close();
  }

  function stopGeneration() {
    if (finalizeCurrent) {
      finalizeCurrent();
      return;
    }
    disconnectRaw();
  }

  function connect(options: ChatStreamConnectOptions) {
    stopGeneration();

    const { onAppend, onClosed } = options;

    let finished = false;
    const url = buildStreamUrl(options);
    const es = new EventSource(url);
    eventSource.value = es;

    const finish = () => {
      if (finished) return;
      finished = true;

      detachEventSource(es);
      if (eventSource.value === es) {
        eventSource.value = null;
      }
      es.close();

      finalizeCurrent = null;
      onClosed();
    };

    finalizeCurrent = finish;

    es.onmessage = (ev: MessageEvent<string>) => {
      const parsed = parseSsePayload(ev.data);
      if (parsed.type === "done") {
        finish();
        return;
      }
      if (parsed.chunk.length > 0) {
        onAppend(parsed.chunk);
      }
    };

    es.onerror = () => {
      finish();
    };
  }

  onUnmounted(stopGeneration);

  const isStreaming = computed(() => eventSource.value !== null);

  return {
    eventSource: readonly(eventSource),
    isStreaming,
    connect,
    stopGeneration,
  };
}
