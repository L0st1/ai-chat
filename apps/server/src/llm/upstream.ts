type FetchResponse = Awaited<ReturnType<typeof fetch>>;

/**
 * 取消上游 fetch 的 body，尽快释放 TCP / 解析器资源。
 * 在 `AbortSignal` 触发或 handler `finally` 中调用均可。
 */
export async function cancelResponseBody(
  upstream: FetchResponse | null | undefined,
  reason = "client disconnected",
): Promise<void> {
  const body = upstream?.body;
  if (!body) {
    return;
  }
  try {
    await body.cancel(reason);
  } catch {
    /* ignore */
  }
}
