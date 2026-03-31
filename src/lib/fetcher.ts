export async function fetcher(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
