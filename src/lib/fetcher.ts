export async function fetcher(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error || body?.message || '';
    } catch { /* ignore parse errors */ }
    throw new Error(detail ? `API error ${response.status}: ${detail}` : `API error: ${response.status}`);
  }
  return response.json();
}

/** Fetcher that bypasses browser HTTP cache. Use after mutations. */
export async function freshFetcher(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
