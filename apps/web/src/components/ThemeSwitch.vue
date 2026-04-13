<template>
  <button
    type="button"
    class="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-none p-0 text-neutral-800 outline-none transition focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:text-neutral-100 dark:focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-neutral-950 border-none"
    :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
    :title="isDark ? '切换为浅色模式' : '切换为深色模式'"
    @click="toggleDark()"
  >
    <span
      aria-hidden="true"
      class="theme-border-gradient pointer-events-none absolute z-0 rounded-none"
    />
    <span
      class="absolute inset-[2px] z-10 flex items-center justify-center rounded-none bg-neutral-100 transition group-hover:bg-neutral-200 dark:bg-neutral-800 dark:group-hover:bg-neutral-700"
    >
      <!-- sun: show in dark mode → switch to light -->
      <svg
        v-if="isDark"
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <!-- moon: show in light mode → switch to dark -->
      <svg
        v-else
        class="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </span>
  </button>
</template>

<script setup lang="ts">
import { useDark, useToggle } from "@vueuse/core";

const isDark = useDark({ storageKey: "ai-chat-theme" });
const toggleDark = useToggle(isDark);
</script>

<style scoped>
/*
 * 方形描边：用放大的水平线性渐变绕中心顺时针旋转（非 conic，避免出现「圆形色轮」感）。
 * 外层 overflow-hidden + 内层 inset 露出约 2px 方环。
 */
.theme-border-gradient {
  left: 50%;
  top: 50%;
  width: 220%;
  height: 220%;
  transform: translate(-50%, -50%) rotate(0deg);
  transform-origin: center center;
  background: linear-gradient(
    90deg,
    #f472b6,
    #a78bfa,
    #60a5fa,
    #34d399,
    #fbbf24,
    #fb7185,
    #f472b6
  );
  animation: theme-border-spin 5s linear infinite;
}

@keyframes theme-border-spin {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}
</style>
