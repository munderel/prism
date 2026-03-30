export const fetcher = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => {
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    return r.json();
  });
