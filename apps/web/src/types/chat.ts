import type { Message } from "@ai-chat/shared";

/** 气泡 UI 在共享 Message 上扩展流式状态 */
export type ChatRow = Message & {
  loading?: boolean;
};
