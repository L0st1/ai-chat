<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { useDark } from "@vueuse/core";
import MarkdownRender from "markstream-vue";
import { useChatSse } from "@/composables/useChatSse";
import type { ChatRow } from "@/types/chat";
import ThemeSwitch from "./components/ThemeSwitch.vue";

const isDark = useDark({ storageKey: "ai-chat-theme" });

const messages = ref<ChatRow[]>([]);
const draft = ref("");
const listEl = ref<HTMLElement | null>(null);
const draftInputRef = ref<HTMLTextAreaElement | null>(null);

/** 不支持 field-sizing: content 时用 scrollHeight 兜底 */
const legacyTextareaAutosize =
  typeof CSS === "undefined" || !CSS.supports("field-sizing", "content");

function adjustDraftHeight() {
  const el = draftInputRef.value;
  if (!el) return;
  el.style.height = "0px";
  const maxPx = parseFloat(getComputedStyle(el).maxHeight);
  const cap = Number.isFinite(maxPx) && maxPx > 0 ? maxPx : 160;
  el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
}

const { connect: connectSse, stopGeneration, isStreaming } = useChatSse();

/** Shiki 主题，经 code-block-props 下发给代码块 */
const codeBlockProps = {
  theme: { light: "vitesse-light", dark: "vitesse-dark" },
} as const;

function scrollToBottom() {
  const el = listEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

watch(
  messages,
  () => {
    nextTick(() => scrollToBottom());
  },
  { deep: true },
);

if (legacyTextareaAutosize) {
  watch(draft, () => nextTick(adjustDraftHeight));
  onMounted(() => nextTick(adjustDraftHeight));
}

function currentAssistant(): ChatRow | undefined {
  const last = messages.value.at(-1);
  return last?.role === "assistant" ? last : undefined;
}

function finishAssistantStream() {
  const a = currentAssistant();
  if (a) {
    a.loading = false;
  }
}

/** 当前条是否为「正在进行的」助手流（用于 final / 流式优化） */
function isActiveAssistantStream(index: number, msg: ChatRow) {
  return (
    msg.role === "assistant" &&
    index === messages.value.length - 1 &&
    isStreaming.value
  );
}

function send() {
  const text = draft.value.trim();
  if (!text) return;

  stopGeneration();

  messages.value.push({
    role: "user",
    content: text,
  });

  messages.value.push({
    role: "assistant",
    content: "",
    loading: true,
  });

  draft.value = "";
  nextTick(() => scrollToBottom());

  connectSse({
    messages: messages.value,
    onAppend(chunk) {
      const a = currentAssistant();
      if (!a) return;
      a.content += chunk;
      if (chunk) {
        a.loading = false;
      }
    },
    onClosed() {
      finishAssistantStream();
    },
  });
}
</script>

<template>
  <div
    class="mx-auto flex h-dvh max-w-3xl flex-col border-x border-neutral-200/90 bg-white dark:border-neutral-800/80 dark:bg-neutral-950"
  >
    <header
      class="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800"
    >
      <span class="text-sm font-medium tracking-tight text-neutral-900 dark:text-neutral-100">新对话</span>
      <div class="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span class="truncate text-xs text-neutral-500 max-sm:hidden">
          SSE · /api/chat-stream
        </span>
        <button
          v-if="isStreaming"
          type="button"
          class="shrink-0 rounded-lg border border-neutral-300 bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-900 transition hover:bg-neutral-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          @click="stopGeneration"
        >
          停止生成
        </button>
        <ThemeSwitch></ThemeSwitch>
      </div>
    </header>

    <main
      ref="listEl"
      class="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
    >
      <div
        v-if="messages.length === 0"
        class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
      >
        <p class="text-lg font-medium text-neutral-800 dark:text-neutral-200">开始对话</p>
        <p class="max-w-sm text-sm text-neutral-500 leading-relaxed">
          在下方输入消息并发送。助手回复由 markstream-vue 渲染 Markdown 与代码高亮。
        </p>
      </div>

      <ul v-else class="flex flex-col gap-5">
        <li
          v-for="(msg, index) in messages"
          :key="index"
          class="flex w-full"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[min(100%,36rem)] min-w-0 select-text rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm"
            :class="
              msg.role === 'user'
                ? 'bg-neutral-200 text-neutral-900 rounded-br-md dark:bg-neutral-700 dark:text-neutral-50'
                : 'border border-neutral-200 bg-neutral-50 text-neutral-900 rounded-bl-md dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100'
            "
          >
            <template v-if="msg.role === 'assistant'">
              <span
                v-if="msg.loading && !msg.content"
                class="inline-flex items-center gap-1.5 text-neutral-500 dark:text-neutral-500"
              >
                <span class="inline-flex gap-1">
                  <span
                    class="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500 [animation-delay:-0.2s]"
                  />
                  <span
                    class="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500 [animation-delay:-0.1s]"
                  />
                  <span
                    class="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500"
                  />
                </span>
                <span class="text-xs">等待流式内容</span>
              </span>
              <div
                v-if="msg.content"
                class="w-full min-w-0 text-neutral-900 dark:text-neutral-100"
              >
                <MarkdownRender
                  :custom-id="`chat-${index}`"
                  :content="msg.content"
                  :final="!isActiveAssistantStream(index, msg)"
                  :is-dark="isDark"
                  :max-live-nodes="0"
                  :initial-render-batch-size="24"
                  :render-batch-size="16"
                  :render-batch-delay="8"
                  :typewriter="false"
                  :code-block-props="codeBlockProps"
                />
              </div>
            </template>
            <template v-else>
              <span class="whitespace-pre-wrap break-words">{{ msg.content }}</span>
            </template>
          </div>
        </li>
      </ul>
    </main>

    <footer
      class="shrink-0 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/95"
    >
      <div
        class="flex items-end gap-2 rounded-2xl border border-neutral-300 bg-neutral-100/80 px-3 py-2 shadow-inner focus-within:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/80 dark:focus-within:border-neutral-500"
      >
        <textarea
          ref="draftInputRef"
          v-model="draft"
          rows="1"
          placeholder="输入消息…"
          class="chat-draft-input max-h-40 min-h-10 w-full resize-none overflow-y-auto border-0 bg-transparent py-2 text-sm text-neutral-900 placeholder:text-neutral-500 outline-none dark:text-neutral-100 dark:placeholder:text-neutral-600"
          @keydown.enter.exact.prevent="send"
        />
        <button
          type="button"
          class="shrink-0 rounded-xl bg-neutral-900 px-3.5 py-2 text-sm font-medium text-neutral-50 transition enabled:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:enabled:hover:bg-white"
          :disabled="!draft.trim()"
          @click="send"
        >
          发送
        </button>
      </div>
    </footer>
  </div>
</template>

<style>
/* 优先 intrinsic 高度；不支持时由 adjustDraftHeight 兜底 */
@supports (field-sizing: content) {
  .chat-draft-input {
    field-sizing: content;
  }
}

/* 消息列表滚动条：细轨道 + 圆角滑块，随 html.dark 切换颜色 */
.chat-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgb(163 163 163) transparent;
}

html.dark .chat-scroll {
  scrollbar-color: rgb(82 82 82) transparent;
}

.chat-scroll::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.chat-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.chat-scroll::-webkit-scrollbar-thumb {
  background-color: rgb(163 163 163);
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: content-box;
}

html.dark .chat-scroll::-webkit-scrollbar-thumb {
  background-color: rgb(82 82 82);
}

.chat-scroll::-webkit-scrollbar-thumb:hover {
  background-color: rgb(115 115 115);
}

html.dark .chat-scroll::-webkit-scrollbar-thumb:hover {
  background-color: rgb(115 115 115);
}
</style>
