/**
 * Throw an Error carrying the server's error detail for a non-OK response.
 * Reads `body.error` / `body.message` (the shape our API routes return via
 * Zod / authz failures) and folds it into the message so SWR error toasts show
 * the real reason instead of a bare status code. Never throws while parsing.
 */
async function throwApiError(response: Response): Promise<never> {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error || body?.message || '';
  } catch { /* ignore parse errors */ }
  throw new Error(detail ? `API error ${response.status}: ${detail}` : `API error: ${response.status}`);
}

export async function fetcher(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) await throwApiError(response);
  return response.json();
}

/** Fetcher that bypasses browser HTTP cache. Use after mutations. */
export async function freshFetcher(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok) await throwApiError(response);
  return response.json();
}
