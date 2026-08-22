export type ResilientFetchOptions = RequestInit & {
  timeoutMs?: number;
  attempts?: number;
  retryStatuses?: readonly number[];
};

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504] as const;

export async function resilientFetch(url: string, options: ResilientFetchOptions = {}) {
  const { timeoutMs = 8_000, attempts = 2, retryStatuses = DEFAULT_RETRY_STATUSES, ...request } = options;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 4) throw new Error("Invalid retry attempt count");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new Error("Invalid request timeout");
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...request, signal: AbortSignal.timeout(timeoutMs) });
      if (!retryStatuses.includes(response.status) || attempt === attempts) return response;
      lastError = new Error(`Provider temporarily unavailable (${response.status})`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 100));
  }
  throw lastError;
}
