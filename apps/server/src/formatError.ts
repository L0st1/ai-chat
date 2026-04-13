/**
 * Node `fetch` often throws `TypeError: fetch failed` with the real reason on `error.cause`
 * (e.g. `ETIMEDOUT`, `ENOTFOUND`). Surface that chain for API responses and logs.
 */
export function formatErrorCause(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    const prefix = code ? `${err.message} [${code}]` : err.message;
    if (err.cause !== undefined) {
      return `${prefix} | ${formatErrorCause(err.cause)}`;
    }
    return prefix;
  }
  return String(err);
}
