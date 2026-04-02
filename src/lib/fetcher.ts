export async function fetcher(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

/** Fetcher that bypasses browser HTTP cache. Use after mutations. */
export async function freshFetcher(url: string): Promise<unknown> {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}_t=${Date.now()}`, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
